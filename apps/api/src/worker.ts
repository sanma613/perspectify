import { db, events, deliveries, eventAttempts, endpoints, users, PLANS, getPlanLimits, type PlanId } from '@perspectify/db'
import { getQueue, JOBS, type DeliverEventPayload } from '@perspectify/queue'
import { and, eq, inArray, lt } from 'drizzle-orm'
import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const appUrl = process.env.APP_URL ?? process.env.WEB_URL ?? 'http://localhost:3000'
const fromEmail = process.env.RESEND_FROM_EMAIL ?? ''

export async function startWorker() {
  const boss = await getQueue()

  await boss.work<DeliverEventPayload>(JOBS.DELIVER_EVENT, async (job) => {
    await deliverEvent(job.data.eventId)
  })

  await boss.schedule('cleanup-events', '0 0 * * *', {})
  await boss.schedule('failure-alerts', '*/5 * * * *', {})
  await boss.schedule('retention-alerts', '0 9 * * *', {})

  await boss.work('cleanup-events', async () => {
    for (const [planId, limits] of Object.entries(PLANS) as Array<[PlanId, (typeof PLANS)[PlanId]]>) {
      const now = new Date()
      const cutoff = new Date(now.getTime() - limits.retentionDays * 24 * 60 * 60 * 1000)

      const planEvents = await db
        .select({ id: events.id })
        .from(events)
        .innerJoin(endpoints, eq(events.endpointId, endpoints.id))
        .innerJoin(users, eq(endpoints.userId, users.id))
        .where(and(eq(users.plan, planId), lt(events.receivedAt, cutoff)))

      const eventIds = planEvents.map((eventRow) => eventRow.id)
      if (eventIds.length === 0) {
        console.log(
          `[cleanup-events] plan=${planId} deletedEvents=0 cutoff=${cutoff.toISOString()} now=${now.toISOString()}`
        )
        continue
      }

      await db.transaction(async (tx) => {
        await tx
          .delete(eventAttempts)
          .where(inArray(eventAttempts.eventId, eventIds))

        await tx
          .delete(deliveries)
          .where(inArray(deliveries.eventId, eventIds))

        await tx
          .delete(events)
          .where(inArray(events.id, eventIds))
      })

      console.log(
        `[cleanup-events] plan=${planId} deletedEvents=${eventIds.length} cutoff=${cutoff.toISOString()} now=${now.toISOString()}`
      )
    }
  })

  await boss.work('failure-alerts', async () => {
    if (!resend || !fromEmail) {
      console.log('[failure-alerts] skipped: missing RESEND_API_KEY or RESEND_FROM_EMAIL')
      return
    }

    const rows = await db
      .select({
        eventId: events.id,
        eventType: events.type,
        attempts: events.attempts,
        lastError: events.lastError,
        destination: endpoints.destination,
        userEmail: users.email,
      })
      .from(events)
      .innerJoin(endpoints, eq(events.endpointId, endpoints.id))
      .innerJoin(users, eq(endpoints.userId, users.id))
      .where(and(eq(users.plan, 'starter'), eq(events.status, 'FAILED'), eq(events.failureAlertSent, false)))

    const sentEventIds: string[] = []

    for (const row of rows) {
      const limits = getPlanLimits('starter')
      if (!limits.alertsEnabled || !row.userEmail) continue

      const subject = `⚠️ Webhook delivery failed — ${row.eventType}`
      const dashboardLink = `${appUrl}/dashboard/events`
      const html = [
        '<h2>Webhook delivery failed</h2>',
        `<p><strong>Event type:</strong> ${escapeHtml(row.eventType)}</p>`,
        `<p><strong>Destination URL:</strong> ${escapeHtml(row.destination)}</p>`,
        `<p><strong>Attempts:</strong> ${row.attempts}</p>`,
        `<p><strong>Last error:</strong> ${escapeHtml(row.lastError ?? 'Unknown error')}</p>`,
        `<p><a href="${dashboardLink}">Open dashboard</a></p>`,
      ].join('')

      const { error } = await resend.emails.send(
        {
          from: fromEmail,
          to: [row.userEmail],
          subject,
          html,
        },
        {
          idempotencyKey: `failure-alert/${row.eventId}`,
        }
      )

      if (error) {
        console.log(
          `[failure-alerts] email_error event=${row.eventId} user=${maskEmail(row.userEmail)} code=${error.name}`
        )
        continue
      }

      sentEventIds.push(row.eventId)
    }

    if (sentEventIds.length > 0) {
      await db
        .update(events)
        .set({ failureAlertSent: true })
        .where(inArray(events.id, sentEventIds))
    }

    console.log(`[failure-alerts] scanned=${rows.length} sent=${sentEventIds.length}`)
  })

  await boss.work('retention-alerts', async () => {
    if (!resend || !fromEmail) {
      console.log('[retention-alerts] skipped: missing RESEND_API_KEY or RESEND_FROM_EMAIL')
      return
    }

    const now = Date.now()
    const candidatesByUser = new Map<string, {
      email: string
      items: Array<{ id: string; type: string; status: string; receivedAt: Date }>
    }>()

    for (const [planId, limits] of Object.entries(PLANS) as Array<[PlanId, (typeof PLANS)[PlanId]]>) {
      if (!limits.retentionAlerts) continue

      const daysUntilDeletionWarning = Math.max(limits.retentionDays - 2, 0)
      const cutoff = new Date(now - daysUntilDeletionWarning * 24 * 60 * 60 * 1000)

      const rows = await db
        .select({
          eventId: events.id,
          eventType: events.type,
          eventStatus: events.status,
          eventReceivedAt: events.receivedAt,
          userId: users.id,
          userEmail: users.email,
        })
        .from(events)
        .innerJoin(endpoints, eq(events.endpointId, endpoints.id))
        .innerJoin(users, eq(endpoints.userId, users.id))
        .where(
          and(
            eq(users.plan, planId),
            eq(events.retentionAlertSent, false),
            lt(events.receivedAt, cutoff)
          )
        )

      for (const row of rows) {
        if (row.eventStatus === 'DELIVERED') continue
        if (!row.userEmail) continue

        const existing = candidatesByUser.get(row.userId)
        if (!existing) {
          candidatesByUser.set(row.userId, {
            email: row.userEmail,
            items: [{
              id: row.eventId,
              type: row.eventType,
              status: row.eventStatus,
              receivedAt: row.eventReceivedAt,
            }],
          })
          continue
        }

        existing.items.push({
          id: row.eventId,
          type: row.eventType,
          status: row.eventStatus,
          receivedAt: row.eventReceivedAt,
        })
      }
    }

    let sentDigests = 0

    for (const [userId, digest] of candidatesByUser.entries()) {
      const dashboardLink = `${appUrl}/dashboard/events`
      const subject = `📋 ${digest.items.length} webhook events will be deleted in 2 days`
      const list = digest.items
        .map((item) => {
          const replayLink = `${dashboardLink}`
          return `<li><strong>${escapeHtml(item.type)}</strong> — ${item.receivedAt.toISOString().slice(0, 10)} — ${escapeHtml(item.status)} — <a href="${replayLink}">Replay</a></li>`
        })
        .join('')

      const html = [
        '<h2>Upcoming retention cleanup</h2>',
        '<p>The following webhook events are scheduled for deletion in 2 days:</p>',
        `<ul>${list}</ul>`,
        `<p><a href="${dashboardLink}">Open dashboard</a></p>`,
      ].join('')

      const { error } = await resend.emails.send(
        {
          from: fromEmail,
          to: [digest.email],
          subject,
          html,
        },
        {
          idempotencyKey: `retention-alert/${userId}/${new Date().toISOString().slice(0, 10)}`,
        }
      )

      if (error) {
        console.log(`[retention-alerts] email_error user=${maskEmail(digest.email)} code=${error.name}`)
        continue
      }

      sentDigests += 1
      await db
        .update(events)
        .set({ retentionAlertSent: true })
        .where(inArray(events.id, digest.items.map((item) => item.id)))
    }

    console.log(`[retention-alerts] users=${candidatesByUser.size} sent=${sentDigests}`)
  })

  console.log('Worker started — listening for delivery jobs')
}

async function deliverEvent(eventId: string) {
  const [event] = await db
    .select({
      id: events.id,
      status: events.status,
      attempts: events.attempts,
      type: events.type,
      payload: events.payload,
      endpointDestination: endpoints.destination,
      endpointUserId: endpoints.userId,
    })
    .from(events)
    .innerJoin(endpoints, eq(events.endpointId, endpoints.id))
    .where(eq(events.id, eventId))
    .limit(1)

  if (!event || event.status === 'DELIVERED') return

  const [owner] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, event.endpointUserId))
    .limit(1)

  const planLimits = getPlanLimits(owner?.plan ?? 'free')
  const maxRetries = planLimits.maxRetries
  const requestTimeoutMs = planLimits.maxRetries * 2_000

  // Marcar como en proceso
  await db
    .update(events)
    .set({ status: 'DELIVERING', attempts: event.attempts + 1 })
    .where(eq(events.id, eventId))

  const attemptNumber = event.attempts + 1

  try {
    const res = await fetch(event.endpointDestination, {
      method:  'POST',
      headers: {
        'Content-Type':           'application/json',
        'X-Perspectify-Event':    event.type,
        'X-Perspectify-Event-Id': event.id,
      },
      body:   JSON.stringify(event.payload),
      signal: AbortSignal.timeout(requestTimeoutMs),
    })

    const responseBody = await res.text()

    if (!res.ok) {
      const error = new Error(`Destination returned ${res.status}`) as Error & {
        status?: number
        responseBody?: string
      }
      error.status = res.status
      error.responseBody = responseBody
      throw error
    }

    // Éxito — marcar entregado y registrar delivery
    await db.insert(deliveries).values({
      eventId,
      attempt:    attemptNumber,
      status:     'SUCCESS',
      statusCode: res.status,
    })

    await db.insert(eventAttempts).values({
      eventId,
      attempt: attemptNumber,
      status: res.status,
      responseBody: responseBody || null,
    })

    await db
      .update(events)
      .set({ status: 'DELIVERED', deliveredAt: new Date(), lastAttemptStatus: res.status, lastError: null })
      .where(eq(events.id, eventId))

  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error'
    const status = typeof (err as { status?: number }).status === 'number' ? Number((err as { status?: number }).status) : 520
    const responseBody =
      typeof (err as { responseBody?: string }).responseBody === 'string'
        ? (err as { responseBody?: string }).responseBody ?? null
        : null

    await db.insert(deliveries).values({
      eventId,
      attempt: attemptNumber,
      status:  'FAILED',
      error,
    })

    await db.insert(eventAttempts).values({
      eventId,
      attempt: attemptNumber,
      status,
      responseBody,
      error: responseBody || error,
    })

    await db
      .update(events)
      .set({
        status:    attemptNumber >= maxRetries ? 'FAILED' : 'PENDING',
        lastAttemptStatus: status,
        lastError: responseBody || error,
      })
      .where(eq(events.id, eventId))

    // Re-lanzar para que pg-boss aplique el backoff
    throw err
  }
}

function maskEmail(email: string): string {
  const [name, domain] = email.split('@')
  if (!name || !domain) return '[redacted-email]'
  return `${name.slice(0, 2)}***@${domain}`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
