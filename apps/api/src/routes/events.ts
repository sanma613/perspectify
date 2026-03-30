import { Hono } from 'hono'
import { db, events, deliveries, endpoints, users, getPlanLimits } from '@perspectify/db'
import { enqueueDelivery } from '@perspectify/queue'
import { and, desc, eq, inArray } from 'drizzle-orm'

export const eventsRoutes = new Hono()

// GET /events?endpointId=xxx
eventsRoutes.get('/', async (c) => {
  const userId = c.get('user').id
  const endpointId = c.req.query('endpointId')

  if (endpointId) {
    const [ownedEndpoint] = await db
      .select({ id: endpoints.id })
      .from(endpoints)
      .where(and(eq(endpoints.id, endpointId), eq(endpoints.userId, userId)))
      .limit(1)

    if (!ownedEndpoint) {
      return c.json({ error: 'Endpoint not found' }, 404)
    }

    const rows = await db.query.events.findMany({
      where: eq(events.endpointId, endpointId),
      orderBy: desc(events.receivedAt),
      limit: 100,
      with: {
        deliveries: { orderBy: desc(deliveries.attemptedAt) },
      },
    })

    return c.json(rows)
  }

  const userEndpoints = await db
    .select({ id: endpoints.id })
    .from(endpoints)
    .where(eq(endpoints.userId, userId))

  if (userEndpoints.length === 0) {
    return c.json([])
  }

  const endpointIds = userEndpoints.map((endpoint) => endpoint.id)

  const rows = await db.query.events.findMany({
    where: inArray(events.endpointId, endpointIds),
    orderBy: desc(events.receivedAt),
    limit: 100,
    with: {
      deliveries: { orderBy: desc(deliveries.attemptedAt) },
    },
  })

  return c.json(rows)
})

// POST /events/:id/replay — botón Rescue
eventsRoutes.post('/:eventId/replay', async (c) => {
  const userId = c.get('user').id
  const eventId = c.req.param('eventId')

  const [event] = await db
    .select()
    .from(events)
    .innerJoin(endpoints, eq(events.endpointId, endpoints.id))
    .innerJoin(users, eq(endpoints.userId, users.id))
    .where(and(eq(events.id, eventId), eq(users.id, userId)))
    .limit(1)

  if (!event) return c.json({ error: 'Event not found' }, 404)

  const limits = getPlanLimits(event.users.plan)
  if (limits.maxReplays !== -1 && event.events.replayCount >= limits.maxReplays) {
    return c.json({ error: 'replay_limit_reached', limit: limits.maxReplays }, 403)
  }

  if (event.events.status === 'DELIVERED') return c.json({ error: 'Event already delivered successfully' }, 409)
  if (event.events.status === 'DELIVERING') return c.json({ error: 'Already delivering' }, 409)

  await enqueueDelivery(eventId, event.users.plan)

  await db
    .update(events)
    .set({
      status: 'PENDING',
      lastError: null,
      replayCount: event.events.replayCount + 1,
    })
    .where(eq(events.id, eventId))

  return c.json({ replayed: true })
})
