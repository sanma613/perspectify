import { Hono } from 'hono'
import { db, endpoints, events, users, getPlanLimits, isUnlimited } from '@perspectify/db'
import { and, eq, count } from 'drizzle-orm'
import { encrypt } from '../lib/encryption'
import { createWebhookToken } from '../lib/webhook-token'

export const endpointsRoutes = new Hono()

interface CreateEndpointBody {
  name?: string
  destination?: string
  secret?: string
}

interface UpdateEndpointBody {
  name?: string
  destination?: string
  secret?: string
}

// GET /endpoints
endpointsRoutes.get('/', async (c) => {
  const userId = c.get('user').id

  const rows = await db.query.endpoints.findMany({
    where: eq(endpoints.userId, userId),
    orderBy: (fields, { desc }) => [desc(fields.createdAt)],
    columns: {
      id: true,
      userId: true,
      name: true,
      destination: true,
      tokenPrefix: true,
      tokenRotatedAt: true,
      createdAt: true,
    },
  })

  return c.json(rows)
})

// POST /endpoints
endpointsRoutes.post('/', async (c) => {
  let body: CreateEndpointBody

  try {
    body = await c.req.json<CreateEndpointBody>()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const authUser = c.get('user')
  const userId = authUser.id
  const name = body.name?.trim()
  const destination = body.destination?.trim()
  const secret = body.secret?.trim()

  if (!name || !destination) {
    return c.json({ error: 'name and destination are required' }, 400)
  }

  let [user] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) {
    await db
      .insert(users)
      .values({
        id: userId,
        email: authUser.email ?? '',
      })
      .onConflictDoNothing()

    ;[user] = await db
      .select({ plan: users.plan })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user) {
      return c.json({ error: 'Could not initialize user account' }, 500)
    }
  }

  const limits = getPlanLimits(user.plan)
  if (!isUnlimited(limits.maxEndpoints)) {
    const [{ total }] = await db
      .select({ total: count() })
      .from(endpoints)
      .where(eq(endpoints.userId, userId))

    if (total >= limits.maxEndpoints) {
      return c.json({ error: 'Plan endpoint limit reached' }, 403)
    }
  }

  const { token, tokenHash, tokenPrefix } = createWebhookToken()
  const encryptedSecret = encrypt(secret ?? '')

  const [endpoint] = await db
    .insert(endpoints)
    .values({
      userId,
      name,
      destination,
      tokenHash,
      tokenPrefix,
      secret: encryptedSecret,
    })
    .returning({
      id: endpoints.id,
      userId: endpoints.userId,
      name: endpoints.name,
      destination: endpoints.destination,
      tokenPrefix: endpoints.tokenPrefix,
      createdAt: endpoints.createdAt,
    })

  return c.json(
    {
      id: endpoint.id,
      userId: endpoint.userId,
      name: endpoint.name,
      destination: endpoint.destination,
      tokenPrefix: endpoint.tokenPrefix,
      createdAt: endpoint.createdAt,
      tokenHash,
    },
    201
  )
})

// POST /endpoints/:id/rotate-token
endpointsRoutes.post('/:id/rotate-token', async (c) => {
  const userId = c.get('user').id
  const endpointId = c.req.param('id')

  const [ownedEndpoint] = await db
    .select({ id: endpoints.id })
    .from(endpoints)
    .where(and(eq(endpoints.id, endpointId), eq(endpoints.userId, userId)))
    .limit(1)

  if (!ownedEndpoint) {
    return c.json({ error: 'Endpoint not found' }, 404)
  }

  const { token, tokenHash, tokenPrefix } = createWebhookToken()

  const [updated] = await db
    .update(endpoints)
    .set({ tokenHash, tokenPrefix, tokenRotatedAt: new Date() })
    .where(eq(endpoints.id, endpointId))
    .returning({
      id: endpoints.id,
      tokenPrefix: endpoints.tokenPrefix,
      tokenRotatedAt: endpoints.tokenRotatedAt,
    })

  return c.json({
    id: updated.id,
    tokenPrefix: updated.tokenPrefix,
    tokenRotatedAt: updated.tokenRotatedAt,
    tokenHash,
  })
})

// PATCH /endpoints/:id
endpointsRoutes.patch('/:id', async (c) => {
  let body: UpdateEndpointBody

  try {
    body = await c.req.json<UpdateEndpointBody>()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const userId = c.get('user').id
  const endpointId = c.req.param('id')

  const [ownedEndpoint] = await db
    .select({ id: endpoints.id })
    .from(endpoints)
    .where(and(eq(endpoints.id, endpointId), eq(endpoints.userId, userId)))
    .limit(1)

  if (!ownedEndpoint) {
    return c.json({ error: 'Endpoint not found' }, 404)
  }

  const updates: {
    name?: string
    destination?: string
    secret?: string
  } = {}

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) {
      return c.json({ error: 'name cannot be empty' }, 400)
    }
    updates.name = name
  }

  if (typeof body.destination === 'string') {
    const destination = body.destination.trim()
    if (!destination) {
      return c.json({ error: 'destination cannot be empty' }, 400)
    }
    updates.destination = destination
  }

  if (typeof body.secret === 'string') {
    const secret = body.secret.trim()
    if (!secret) {
      return c.json({ error: 'secret cannot be empty' }, 400)
    }
    updates.secret = encrypt(secret)
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400)
  }

  const [updated] = await db
    .update(endpoints)
    .set(updates)
    .where(and(eq(endpoints.id, endpointId), eq(endpoints.userId, userId)))
    .returning({
      id: endpoints.id,
      userId: endpoints.userId,
      name: endpoints.name,
      destination: endpoints.destination,
      tokenPrefix: endpoints.tokenPrefix,
      tokenRotatedAt: endpoints.tokenRotatedAt,
      createdAt: endpoints.createdAt,
    })

  return c.json(updated)
})

// DELETE /endpoints/:id
endpointsRoutes.delete('/:id', async (c) => {
  const userId = c.get('user').id
  const endpointId = c.req.param('id')

  const [ownedEndpoint] = await db
    .select({ id: endpoints.id })
    .from(endpoints)
    .where(and(eq(endpoints.id, endpointId), eq(endpoints.userId, userId)))
    .limit(1)

  if (!ownedEndpoint) {
    return c.json({ error: 'Endpoint not found' }, 404)
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(events)
    .where(eq(events.endpointId, endpointId))

  if (total > 0) {
    return c.json(
      { error: 'Cannot delete endpoint with events. Keep it for audit history.' },
      409
    )
  }

  await db
    .delete(endpoints)
    .where(and(eq(endpoints.id, endpointId), eq(endpoints.userId, userId)))

  return c.json({ deleted: true })
})
