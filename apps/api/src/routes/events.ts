import { Hono } from 'hono'
import { db, events, eventAttempts, endpoints, users, getPlanLimits, isUnlimited } from '@perspectify/db'
import { enqueueDelivery } from '@perspectify/queue'
import { and, asc, count, desc, eq, exists, gte, inArray, lt, or, sql } from 'drizzle-orm'

export const eventsRoutes = new Hono()

type BulkRescueResult =
  | { rescued: number }
  | {
      errorBody: { error: string; message?: string }
      errorStatus: 403 | 404
    }

type SingleReplayResult =
  | { replayed: true }
  | {
      errorBody: { error: string; limit?: number }
      errorStatus: 403 | 404 | 409
    }

async function bulkRescueAll(userId: string): Promise<BulkRescueResult> {
  const [user] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) {
    return {
      errorBody: { error: 'User not found' },
      errorStatus: 404,
    }
  }

  const limits = getPlanLimits(user.plan)

  if (!limits.replayEnabled || user.plan === 'free') {
    return {
      errorBody: {
        error: 'upgrade_required_for_bulk_rescue',
        message: 'Bulk Rescue is available on Starter.',
      },
      errorStatus: 403,
    }
  }

  const userEndpoints = await db
    .select({ id: endpoints.id })
    .from(endpoints)
    .where(eq(endpoints.userId, userId))

  if (userEndpoints.length === 0) {
    return { rescued: 0 }
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

  let rescued = 0
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
    rescued += 1
  }

  return { rescued }
}

async function replaySingleEvent(userId: string, eventId: string): Promise<SingleReplayResult> {
  const [event] = await db
    .select({
      event: {
        id: events.id,
        status: events.status,
        replayCount: events.replayCount,
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

  if (!event) {
    return {
      errorBody: { error: 'Event not found' },
      errorStatus: 404,
    }
  }

  const limits = getPlanLimits(event.user.plan)

  if (event.event.status === 'DELIVERING') {
    return {
      errorBody: { error: 'Already delivering' },
      errorStatus: 409,
    }
  }

  if (!limits.replayEnabled) {
    return {
      errorBody: { error: 'replay_disabled' },
      errorStatus: 403,
    }
  }

  if (!isUnlimited(limits.maxReplays) && event.event.replayCount >= limits.maxReplays) {
    return {
      errorBody: { error: 'replay_limit_reached', limit: limits.maxReplays },
      errorStatus: 403,
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

  return { replayed: true }
}

// GET /events/stats
// Dashboard-only aggregate endpoint.
eventsRoutes.get('/stats', async (c) => {
  const userId = c.get('user').id
  const monthStart = sql`date_trunc('month', now())`

  const userEndpoints = await db
    .select({ id: endpoints.id })
    .from(endpoints)
    .where(eq(endpoints.userId, userId))

  if (userEndpoints.length === 0) {
    return c.json({
      eventsThisMonth: 0,
      delivered: 0,
      failed: 0,
      pending: 0,
      avgResponseMs: null,
      failedRecent: [],
      recentDelivered: [],
    })
  }

  const endpointIds = userEndpoints.map((endpoint) => endpoint.id)

  const [countsRows, avgRows, failedRecent, recentDelivered] = await Promise.all([
    db
      .select({
        eventsThisMonth: count(),
        delivered: sql<number>`count(*) filter (where ${events.status} = 'DELIVERED')`,
        failed: sql<number>`count(*) filter (where ${events.status} = 'FAILED')`,
        pending: sql<number>`count(*) filter (where ${events.status} in ('PENDING', 'DELIVERING'))`,
      })
      .from(events)
      .where(and(inArray(events.endpointId, endpointIds), gte(events.receivedAt, monthStart))),
    db
      .select({
        avgResponseMs: sql<number | null>`avg(${eventAttempts.durationMs})`,
      })
      .from(eventAttempts)
      .innerJoin(events, eq(eventAttempts.eventId, events.id))
      .where(and(inArray(events.endpointId, endpointIds), gte(events.receivedAt, monthStart))),
    db.query.events.findMany({
      where: and(inArray(events.endpointId, endpointIds), eq(events.status, 'FAILED')),
      orderBy: [desc(events.receivedAt), desc(events.id)],
      limit: 5,
      columns: {
        id: true,
        endpointId: true,
        stripeId: true,
        type: true,
        status: true,
        attempts: true,
        replayCount: true,
        lastAttemptStatus: true,
        lastError: true,
        receivedAt: true,
        ingestionLatencyMs: true,
        stripeGeneratedAt: true,
      },
      with: {
        endpoint: { columns: { name: true } },
        eventAttempts: {
          orderBy: desc(eventAttempts.attempt),
          limit: 1,
          columns: {
            id: true,
            attempt: true,
            status: true,
            durationMs: true,
            failureCategory: true,
            attemptStartedAt: true,
            responseReceivedAt: true,
            error: true,
            responseBody: true,
          },
        },
      },
    }),
    db.query.events.findMany({
      where: and(inArray(events.endpointId, endpointIds), eq(events.status, 'DELIVERED')),
      orderBy: [desc(events.receivedAt), desc(events.id)],
      limit: 10,
      columns: {
        id: true,
        endpointId: true,
        stripeId: true,
        type: true,
        status: true,
        attempts: true,
        replayCount: true,
        lastAttemptStatus: true,
        lastError: true,
        receivedAt: true,
        ingestionLatencyMs: true,
        stripeGeneratedAt: true,
      },
      with: {
        endpoint: { columns: { name: true } },
        eventAttempts: {
          orderBy: desc(eventAttempts.attempt),
          limit: 1,
          columns: {
            id: true,
            attempt: true,
            status: true,
            durationMs: true,
            failureCategory: true,
            attemptStartedAt: true,
            responseReceivedAt: true,
            error: true,
            responseBody: true,
          },
        },
      },
    }),
  ])

  const counts = countsRows[0] ?? {
    eventsThisMonth: 0,
    delivered: 0,
    failed: 0,
    pending: 0,
  }

  return c.json({
    eventsThisMonth: counts.eventsThisMonth ?? 0,
    delivered: Number(counts.delivered ?? 0),
    failed: Number(counts.failed ?? 0),
    pending: Number(counts.pending ?? 0),
    avgResponseMs: avgRows[0]?.avgResponseMs ? Number(avgRows[0].avgResponseMs) : null,
    failedRecent: failedRecent.map(({ endpoint, ...event }) => ({
      ...event,
      endpointName: endpoint?.name ?? null,
      latestAttempt: event.eventAttempts[0] ?? null,
    })),
    recentDelivered: recentDelivered.map(({ endpoint, ...event }) => ({
      ...event,
      endpointName: endpoint?.name ?? null,
      latestAttempt: event.eventAttempts[0] ?? null,
    })),
  })
})

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
      payloadSize: true,
      destinationUrl: true,
      providerName: true,
      status: true,
      attempts: true,
      replayCount: true,
      lastAttemptStatus: true,
      lastError: true,
      receivedAt: true,
      deliveredAt: true,
      ingestionLatencyMs: true,
      stripeGeneratedAt: true,
      signatureValid: true,
    },
    with: {
      endpoint: { columns: { name: true } },
      eventAttempts: {
        columns: {
          id: true,
          attempt: true,
          status: true,
          durationMs: true,
          failureCategory: true,
          createdAt: true,
        },
        orderBy: desc(eventAttempts.attempt),
        limit: 1,
      },
    },
  })

  const hasMore = rows.length > limit
  const items = rows.slice(0, limit).map(({ endpoint, ...event }) => ({
    ...event,
    endpointName: endpoint?.name ?? null,
    failureCategory: event.eventAttempts[0]?.failureCategory ?? null,
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

// GET /events/:eventId/attempts
eventsRoutes.get('/:eventId/attempts', async (c) => {
  const userId = c.get('user').id
  const eventId = c.req.param('eventId')

  const [ownedEvent] = await db
    .select({ id: events.id })
    .from(events)
    .innerJoin(endpoints, eq(events.endpointId, endpoints.id))
    .where(and(eq(events.id, eventId), eq(endpoints.userId, userId)))
    .limit(1)

  if (!ownedEvent) {
    return c.json({ error: 'Event not found' }, 404)
  }

  const attempts = await db.query.eventAttempts.findMany({
    where: eq(eventAttempts.eventId, eventId),
    orderBy: asc(eventAttempts.attempt),
    columns: {
      id: true,
      eventId: true,
      attempt: true,
      status: true,
      durationMs: true,
      attemptStartedAt: true,
      responseReceivedAt: true,
      requestHeaders: true,
      responseHeaders: true,
      responseBody: true,
      failureCategory: true,
      error: true,
      createdAt: true,
    },
  })

  return c.json({ items: attempts })
})

// GET /events/:eventId
eventsRoutes.get('/:eventId', async (c) => {
  const userId = c.get('user').id
  const eventId = c.req.param('eventId')

  const event = await db.query.events.findFirst({
    where: and(
      eq(events.id, eventId),
      exists(
        db
          .select({ id: endpoints.id })
          .from(endpoints)
          .where(and(eq(endpoints.id, events.endpointId), eq(endpoints.userId, userId)))
      )
    ),
    with: {
      endpoint: {
        columns: {
          name: true,
          destination: true,
          tokenPrefix: true,
        },
      },
      eventAttempts: {
        orderBy: asc(eventAttempts.attempt),
      },
    },
  })

  if (!event) {
    return c.json({ error: 'Event not found' }, 404)
  }

  return c.json(event)
})

// POST /events/:id/replay
eventsRoutes.post('/:eventId/replay', async (c) => {
  const userId = c.get('user').id
  const eventId = c.req.param('eventId')

  const result = await replaySingleEvent(userId, eventId)
  if ('errorBody' in result) {
    return c.json(result.errorBody, result.errorStatus)
  }

  return c.json(result)
})

// POST /events/:id/rescue
eventsRoutes.post('/:eventId/rescue', async (c) => {
  const userId = c.get('user').id
  const eventId = c.req.param('eventId')

  const result = await replaySingleEvent(userId, eventId)
  if ('errorBody' in result) {
    return c.json(result.errorBody, result.errorStatus)
  }

  return c.json({ rescued: true })
})

// POST /events/rescue-all
eventsRoutes.post('/rescue-all', async (c) => {
  const userId = c.get('user').id
  const result = await bulkRescueAll(userId)

  if ('errorBody' in result) {
    return c.json(result.errorBody, result.errorStatus)
  }

  return c.json({ rescued: result.rescued })
})
