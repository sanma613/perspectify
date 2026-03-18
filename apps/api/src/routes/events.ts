import { Hono } from 'hono'
import { db, events, deliveries } from '@perspectify/db'
import { enqueueDelivery } from '@perspectify/queue'
import { eq, desc } from 'drizzle-orm'

export const eventsRoutes = new Hono()

// GET /events?endpointId=xxx
eventsRoutes.get('/', async (c) => {
  const endpointId = c.req.query('endpointId')
  if (!endpointId) return c.json({ error: 'endpointId required' }, 400)

  const rows = await db.query.events.findMany({
    where: eq(events.endpointId, endpointId),
    orderBy: desc(events.receivedAt),
    limit: 100,
    with: {
      deliveries: { orderBy: desc(deliveries.attemptedAt) },
    },
  })

  return c.json(rows)
})

// POST /events/:id/replay — botón Rescue
eventsRoutes.post('/:id/replay', async (c) => {
  const id = c.req.param('id')

  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, id))
    .limit(1)

  if (!event) return c.json({ error: 'Event not found' }, 404)
  if (event.status === 'DELIVERING') return c.json({ error: 'Already delivering' }, 409)

  await db
    .update(events)
    .set({ status: 'PENDING', lastError: null })
    .where(eq(events.id, id))

  await enqueueDelivery(id)

  return c.json({ replayed: true })
})
