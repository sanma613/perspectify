import { db, events, deliveries, endpoints } from '@perspectify/db'
import { getQueue, JOBS, type DeliverEventPayload } from '@perspectify/queue'
import { eq } from 'drizzle-orm'

export async function startWorker() {
  const queue = await getQueue()

  await queue.work<DeliverEventPayload>(JOBS.DELIVER_EVENT, async (job) => {
    await deliverEvent(job.data.eventId)
  })

  console.log('Worker started — listening for delivery jobs')
}

async function deliverEvent(eventId: string) {
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    with: { endpoint: true },
  })

  if (!event || event.status === 'DELIVERED') return

  // Marcar como en proceso
  await db
    .update(events)
    .set({ status: 'DELIVERING', attempts: event.attempts + 1 })
    .where(eq(events.id, eventId))

  const attemptNumber = event.attempts + 1

  try {
    const res = await fetch(event.endpoint.destination, {
      method:  'POST',
      headers: {
        'Content-Type':           'application/json',
        'X-Perspectify-Event':    event.type,
        'X-Perspectify-Event-Id': event.id,
      },
      body:   JSON.stringify(event.payload),
      signal: AbortSignal.timeout(10_000), // 10s timeout
    })

    if (!res.ok) throw new Error(`Destination returned ${res.status}`)

    // Éxito — marcar entregado y registrar delivery
    await db.insert(deliveries).values({
      eventId,
      attempt:    attemptNumber,
      status:     'SUCCESS',
      statusCode: res.status,
    })

    await db
      .update(events)
      .set({ status: 'DELIVERED', deliveredAt: new Date() })
      .where(eq(events.id, eventId))

  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'

    await db.insert(deliveries).values({
      eventId,
      attempt: attemptNumber,
      status:  'FAILED',
      error,
    })

    await db
      .update(events)
      .set({
        status:    attemptNumber >= 7 ? 'FAILED' : 'PENDING',
        lastError: error,
      })
      .where(eq(events.id, eventId))

    // Re-lanzar para que pg-boss aplique el backoff
    throw err
  }
}
