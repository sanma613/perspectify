import { Hono } from 'hono'
import { db, endpoints, users, getPlanLimits, isUnlimited } from '@perspectify/db'
import { and, eq, count } from 'drizzle-orm'
import { encrypt } from '../lib/encryption'
import { createWebhookToken } from '../lib/webhook-token'

export const endpointsRoutes = new Hono()

interface CreateEndpointBody {
  name?: string
  destination?: string
  secret?: string
}

// POST /endpoints
endpointsRoutes.post('/', async (c) => {
  let body: CreateEndpointBody

  try {
    body = await c.req.json<CreateEndpointBody>()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const userId = c.get('user').id
  const name = body.name?.trim()
  const destination = body.destination?.trim()
  const secret = body.secret?.trim()

  if (!name || !destination || !secret) {
    return c.json({ error: 'name, destination and secret are required' }, 400)
  }

  const [user] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
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
  const encryptedSecret = encrypt(secret)

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
      token,
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
    token,
  })
})
