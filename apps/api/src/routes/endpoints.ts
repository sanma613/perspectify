import { Hono } from 'hono'
import { db, endpoints, eventAttempts, events, deliveries, users, getPlanLimits, isUnlimited } from '@perspectify/db'
import { and, eq, count, inArray, or, ne } from 'drizzle-orm'
import { decrypt, encrypt } from '../lib/encryption'
import { createWebhookToken } from '../lib/webhook-token'

export const endpointsRoutes = new Hono()

interface CreateEndpointBody {
  name?: string
  destination?: string
  secret?: string
}

interface UpdateEndpointBody {
  name?: string
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

  const existing = await db
    .select({ id: endpoints.id, name: endpoints.name })
    .from(endpoints)
    .where(
      and(
        eq(endpoints.userId, userId),
        or(eq(endpoints.name, name), eq(endpoints.destination, destination))
      )
    )
    .limit(1)

  if (existing.length > 0) {
    const conflict = existing[0].name === name ? 'name' : 'destination'
    return c.json(
      {
        error: 'conflict',
        field: conflict,
        message:
          conflict === 'name'
            ? 'An endpoint with this name already exists'
            : 'An endpoint with this destination already exists',
      },
      409
    )
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
    .select({
      id: endpoints.id,
      name: endpoints.name,
      destination: endpoints.destination,
      secret: endpoints.secret,
      token_prefix: endpoints.tokenPrefix,
      created_at: endpoints.createdAt,
    })
    .from(endpoints)
    .where(and(eq(endpoints.id, endpointId), eq(endpoints.userId, userId)))
    .limit(1)

  if (!ownedEndpoint) {
    return c.json({ error: 'Endpoint not found' }, 404)
  }

  const updates: {
    name?: string
    secret?: string
  } = {}

  let changed = false

  if (typeof body.name === 'string') {
    const trimmedName = body.name.trim()

    if (trimmedName !== ownedEndpoint.name) {
      const conflict = await db
        .select({ id: endpoints.id })
        .from(endpoints)
        .where(
          and(
            eq(endpoints.userId, userId),
            eq(endpoints.name, trimmedName),
            ne(endpoints.id, endpointId)
          )
        )
        .limit(1)

      if (conflict.length > 0) {
        return c.json(
          {
            error: 'conflict',
            field: 'name',
            message: 'An endpoint with this name already exists',
          },
          409
        )
      }

      updates.name = trimmedName
      changed = true
    }
  }

  if (typeof body.secret === 'string') {
    const nextSecret = body.secret.trim()

    if (nextSecret.length > 0) {
      if (!nextSecret.startsWith('whsec_')) {
        return c.json(
          {
            error: 'invalid_secret',
            message: 'Secret must start with whsec_',
          },
          400
        )
      }

      let currentSecret: string | null = null
      try {
        currentSecret = decrypt(ownedEndpoint.secret)
      } catch {
        // Legacy/malformed payloads should be replaceable without failing the update request.
        currentSecret = null
      }

      if (currentSecret !== nextSecret) {
        updates.secret = encrypt(nextSecret)
        changed = true
      }
    }
  }

  if (!changed) {
    return c.json({ changed: false })
  }

  const [updated] = await db
    .update(endpoints)
    .set(updates)
    .where(and(eq(endpoints.id, endpointId), eq(endpoints.userId, userId)))
    .returning({
      id: endpoints.id,
      name: endpoints.name,
      destination: endpoints.destination,
      token_prefix: endpoints.tokenPrefix,
      created_at: endpoints.createdAt,
    })

  return c.json({ changed: true, endpoint: updated })
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

  const eventIds = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.endpointId, endpointId))

  const ids = eventIds.map((eventRow) => eventRow.id)

  await db.transaction(async (tx) => {
    if (ids.length > 0) {
      await tx.delete(eventAttempts).where(inArray(eventAttempts.eventId, ids))
      await tx.delete(deliveries).where(inArray(deliveries.eventId, ids))
      await tx.delete(events).where(inArray(events.id, ids))
    }

    await tx
      .delete(endpoints)
      .where(and(eq(endpoints.id, endpointId), eq(endpoints.userId, userId)))
  })

  return c.json({ deleted: true, eventsDeleted: ids.length })
})
