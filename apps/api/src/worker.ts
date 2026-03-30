import { db, events, deliveries, endpoints, users, PLANS, getPlanLimits, type PlanId } from '@perspectify/db'
import { getQueue, JOBS, type DeliverEventPayload } from '@perspectify/queue'
import { and, eq, inArray, lt } from 'drizzle-orm'

export async function startWorker() {
  const boss = await getQueue()

  await boss.work<DeliverEventPayload>(JOBS.DELIVER_EVENT, async (job) => {
    await deliverEvent(job.data.eventId)
  })

  await boss.schedule('cleanup-events', '0 3 * * *', {})
  await boss.work('cleanup-events', async () => {
    for (const [planId, limits] of Object.entries(PLANS) as Array<[PlanId, (typeof PLANS)[PlanId]]>) {
      const cutoff = new Date(Date.now() - limits.retentionDays * 24 * 60 * 60 * 1000)

      const planEvents = await db
        .select({ id: events.id })
        .from(events)
        .innerJoin(endpoints, eq(events.endpointId, endpoints.id))
        .innerJoin(users, eq(endpoints.userId, users.id))
        .where(and(eq(users.plan, planId), lt(events.receivedAt, cutoff)))

      const eventIds = planEvents.map((eventRow) => eventRow.id)
      if (eventIds.length === 0) {
        console.log(`[cleanup-events] plan=${planId} deletedEvents=0 cutoff=${cutoff.toISOString()}`)
        continue
      }

      await db
        .delete(deliveries)
        .where(inArray(deliveries.eventId, eventIds))

      await db
        .delete(events)
        .where(inArray(events.id, eventIds))

      console.log(
        `[cleanup-events] plan=${planId} deletedEvents=${eventIds.length} cutoff=${cutoff.toISOString()}`
      )
    }
  })

  console.log('Worker started — listening for delivery jobs')
}

async function deliverEvent(eventId: string) {
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    with: { endpoint: true },
  })

  if (!event || event.status === 'DELIVERED') return

  const [owner] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, event.endpoint.userId))
    .limit(1)

  const maxRetries = getPlanLimits(owner?.plan ?? 'free').maxRetries

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
      .set({ status: 'DELIVERED', deliveredAt: new Date(), })
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
        status:    attemptNumber >= maxRetries ? 'FAILED' : 'PENDING',
        lastError: error,
      })
      .where(eq(events.id, eventId))

    // Re-lanzar para que pg-boss aplique el backoff
    throw err
  }
}
