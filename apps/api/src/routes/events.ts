import { Hono } from 'hono'
import { db, events, eventAttempts, endpoints, users, getPlanLimits, isUnlimited } from '@perspectify/db'
import { enqueueDelivery } from '@perspectify/queue'
import { and, count, desc, eq, inArray, lt, or, sql } from 'drizzle-orm'

export const eventsRoutes = new Hono()

// GET /events
eventsRoutes.get('/', async (c) => {
  const userId = c.get('user').id
  const [user] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  const limits = getPlanLimits(user.plan)
  const fallbackLimit = limits.maxEventsPerMonth
  const limitParam = c.req.query('limit')
  const endpointId = c.req.query('endpointId')
  const endpointIdsParam = c.req.query('endpointIds')
  const countOnly = c.req.query('count') === 'true'
  const needsRescue = c.req.query('needsRescue') === '1'
  const cursorReceivedAt = c.req.query('cursorReceivedAt')
  const cursorId = c.req.query('cursorId')

  const parsedLimit = Number.parseInt(limitParam ?? `${fallbackLimit}`, 10)
  const limit = Number.isNaN(parsedLimit) ? fallbackLimit : Math.max(1, Math.min(parsedLimit, fallbackLimit))

  const requestedEndpointIds = endpointId
    ? [endpointId]
    : endpointIdsParam
      ? endpointIdsParam
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : []

  const userEndpoints = await db
    .select({ id: endpoints.id })
    .from(endpoints)
    .where(eq(endpoints.userId, userId))

  if (userEndpoints.length === 0) {
    return c.json({ items: [], hasMore: false, nextCursor: null, totalCount: 0 })
  }

  const ownedEndpointIds = new Set(userEndpoints.map((endpoint) => endpoint.id))

  if (requestedEndpointIds.some((id) => !ownedEndpointIds.has(id))) {
    return c.json({ error: 'Endpoint not found' }, 404)
  }

  const activeEndpointIds =
    requestedEndpointIds.length > 0 ? requestedEndpointIds : Array.from(ownedEndpointIds)

  const filters = [inArray(events.endpointId, activeEndpointIds)]

  if (needsRescue) {
    filters.push(sql`(${events.status} = 'FAILED' OR ${events.lastAttemptStatus} >= 400)`)
  }

  const whereBase = and(...filters)

  if (countOnly) {
    const [countRow] = await db.select({ total: count() }).from(events).where(whereBase)
    return c.json({ count: countRow?.total ?? 0 })
  }

  const withCursor =
    cursorReceivedAt && cursorId
      ? and(
          whereBase,
          or(
            lt(events.receivedAt, new Date(cursorReceivedAt)),
            and(eq(events.receivedAt, new Date(cursorReceivedAt)), lt(events.id, cursorId))
          )
        )
      : whereBase

  const [countRow] = await db.select({ total: count() }).from(events).where(whereBase)

  const rows = await db.query.events.findMany({
    where: withCursor,
    orderBy: [desc(events.receivedAt), desc(events.id)],
    limit: limit + 1,
    columns: {
      id: true,
      endpointId: true,
      stripeId: true,
      type: true,
      payload: true,
      payloadSize: true,
      sourceHeaders: true,
      destinationUrl: true,
      providerName: true,
      status: true,
      attempts: true,
      replayCount: true,
      lastAttemptStatus: true,
      lastError: true,
      receivedAt: true,
      deliveredAt: true,
    },
    with: {
      endpoint: { columns: { name: true } },
      eventAttempts: {
        columns: {
          id: true,
          eventId: true,
          attempt: true,
          status: true,
          responseBody: true,
          error: true,
          createdAt: true,
        },
        orderBy: desc(eventAttempts.createdAt),
      },
    },
  })

  const hasMore = rows.length > limit
  const items = rows.slice(0, limit).map(({ endpoint, ...event }) => ({
    ...event,
    endpointName: endpoint?.name ?? null,
  }))

  const last = items.at(-1)
  const nextCursor = hasMore && last
    ? {
        cursorReceivedAt: new Date(last.receivedAt).toISOString(),
        cursorId: last.id,
      }
    : null

  return c.json({
    items,
    hasMore,
    nextCursor,
    totalCount: countRow?.total ?? 0,
  })
})

// POST /events/:id/replay — botón Rescue
eventsRoutes.post('/:eventId/replay', async (c) => {
  const userId = c.get('user').id
  const eventId = c.req.param('eventId')

  const [event] = await db
    .select({
      event: {
        id: events.id,
        status: events.status,
        replayCount: events.replayCount,
      },
      endpoint: {
        userId: endpoints.userId,
      },
      user: {
        id: users.id,
        plan: users.plan,
      },
    })
    .from(events)
    .innerJoin(endpoints, eq(events.endpointId, endpoints.id))
    .innerJoin(users, eq(endpoints.userId, users.id))
    .where(and(eq(events.id, eventId), eq(users.id, userId)))
    .limit(1)

  if (!event) return c.json({ error: 'Event not found' }, 404)

  const limits = getPlanLimits(event.user.plan)

  if (event.event.status === 'DELIVERING') return c.json({ error: 'Already delivering' }, 409)

  if (!limits.replayEnabled) {
    return c.json({ error: 'replay_disabled' }, 403)
  }

  if (!isUnlimited(limits.maxReplays)) {
    if (event.event.replayCount >= limits.maxReplays) {
      return c.json({ error: 'replay_limit_reached', limit: limits.maxReplays }, 403)
    }
  }

  await enqueueDelivery(eventId, event.user.plan)

  await db
    .update(events)
    .set({
      status: 'PENDING',
      lastError: null,
      lastAttemptStatus: null,
      replayCount: event.event.replayCount + 1,
    })
    .where(eq(events.id, eventId))

  return c.json({ replayed: true })
})

// POST /events/replay-all — paid plans only bulk rescue
eventsRoutes.post('/replay-all', async (c) => {
  const userId = c.get('user').id

  const [user] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) return c.json({ error: 'User not found' }, 404)
  const limits = getPlanLimits(user.plan)

  if (!limits.replayEnabled || user.plan === 'free') {
    return c.json(
      {
        error: 'upgrade_required_for_bulk_rescue',
        message: 'Bulk Rescue is available on Starter.',
      },
      403
    )
  }

  const userEndpoints = await db
    .select({ id: endpoints.id })
    .from(endpoints)
    .where(eq(endpoints.userId, userId))

  if (userEndpoints.length === 0) {
    return c.json({ replayed: 0 })
  }

  const endpointIds = userEndpoints.map((endpoint) => endpoint.id)
  const failedEvents = await db.query.events.findMany({
    where: and(inArray(events.endpointId, endpointIds), eq(events.status, 'FAILED')),
    orderBy: desc(events.receivedAt),
    limit: isUnlimited(limits.maxEventsPerMonth) ? undefined : limits.maxEventsPerMonth,
    columns: {
      id: true,
      replayCount: true,
    },
  })

  let replayed = 0
  for (const row of failedEvents) {
    await enqueueDelivery(row.id, user.plan)
    await db
      .update(events)
      .set({
        status: 'PENDING',
        lastError: null,
        lastAttemptStatus: null,
        replayCount: row.replayCount + 1,
      })
      .where(eq(events.id, row.id))
    replayed += 1
  }

  return c.json({ replayed })
})
