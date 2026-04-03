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
  destination?: string
  secret?: string
}

const ENDPOINTS_USER_NAME_UNIQUE = 'endpoints_user_name_unique'
const ENDPOINTS_USER_DESTINATION_UNIQUE = 'endpoints_user_destination_unique'
const SECRET_PREFIX = 'whsec_'
const MIN_SECRET_SUFFIX_LENGTH = 13

function isUniqueViolation(error: unknown): error is { code: string; constraint?: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  )
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
  const secret = body.secret?.trim() ?? ''

  if (!name || !destination) {
    return c.json({ error: 'name and destination are required' }, 400)
  }

  try {
    const parsed = new URL(destination)
    if (parsed.protocol !== 'https:') {
      throw new Error('invalid protocol')
    }
  } catch {
    return c.json({ error: 'destination must be a valid https URL' }, 400)
  }

  if (secret.length > 0) {
    if (!secret.startsWith(SECRET_PREFIX)) {
      return c.json({ error: 'invalid_secret', message: 'Secret must start with whsec_' }, 400)
    }

    if (secret.slice(SECRET_PREFIX.length).length < MIN_SECRET_SUFFIX_LENGTH) {
      return c.json(
        {
          error: 'invalid_secret',
          message: 'Secret must include at least 13 characters after whsec_',
        },
        400
      )
    }
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
  const encryptedSecret = encrypt(secret)

  let endpoint: {
    id: string
    userId: string
    name: string
    destination: string
    tokenPrefix: string
    createdAt: Date
  }

  try {
    ;[endpoint] = await db
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
  } catch (error) {
    if (isUniqueViolation(error)) {
      if (error.constraint === ENDPOINTS_USER_NAME_UNIQUE) {
        return c.json(
          {
            error: 'conflict',
            field: 'name',
            message: 'An endpoint with this name already exists',
          },
          409
        )
      }

      if (error.constraint === ENDPOINTS_USER_DESTINATION_UNIQUE) {
        return c.json(
          {
            error: 'conflict',
            field: 'destination',
            message: 'An endpoint with this destination already exists',
          },
          409
        )
      }
    }

    throw error
  }

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
    destination?: string
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

  if (typeof body.destination === 'string') {
    const trimmedDestination = body.destination.trim()

    if (trimmedDestination !== ownedEndpoint.destination) {
      try {
        const parsed = new URL(trimmedDestination)
        if (parsed.protocol !== 'https:') {
          throw new Error('invalid protocol')
        }
      } catch {
        return c.json(
          {
            error: 'invalid_destination',
            message: 'destination must be a valid https URL',
          },
          400
        )
      }

      const conflict = await db
        .select({ id: endpoints.id })
        .from(endpoints)
        .where(
          and(
            eq(endpoints.userId, userId),
            eq(endpoints.destination, trimmedDestination),
            ne(endpoints.id, endpointId)
          )
        )
        .limit(1)

      if (conflict.length > 0) {
        return c.json(
          {
            error: 'conflict',
            field: 'destination',
            message: 'An endpoint with this destination already exists',
          },
          409
        )
      }

      updates.destination = trimmedDestination
      changed = true
    }
  }

  if (typeof body.secret === 'string') {
    const nextSecret = body.secret.trim()

    if (nextSecret.length > 0) {
      if (!nextSecret.startsWith(SECRET_PREFIX)) {
        return c.json(
          {
            error: 'invalid_secret',
            message: 'Secret must start with whsec_',
          },
          400
        )
      }

      if (nextSecret.slice(SECRET_PREFIX.length).length < MIN_SECRET_SUFFIX_LENGTH) {
        return c.json(
          {
            error: 'invalid_secret',
            message: 'Secret must include at least 13 characters after whsec_',
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
