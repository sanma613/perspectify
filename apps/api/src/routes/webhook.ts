import { Hono } from 'hono'
import { db, endpoints, events, users, getPlanLimits, isUnlimited } from '@perspectify/db'
import { enqueueDelivery } from '@perspectify/queue'
import { eq, and, gte, count } from 'drizzle-orm'
import { verifyStripeSignature } from '../lib/verify-signature'
import { decrypt } from '../lib/encryption'
import { hashWebhookToken } from '../lib/webhook-token'

export const webhookRoutes = new Hono()

// POST /webhook/:token
webhookRoutes.post('/:token', async (c) => {
  const token = c.req.param('token')
  const tokenHash = hashWebhookToken(token)
  const signature = c.req.header('stripe-signature') ?? ''
  const rawBody = await c.req.text()

  // 1. Buscar endpoint por hash de token
  const [endpoint] = await db
    .select()
    .from(endpoints)
    .where(eq(endpoints.tokenHash, tokenHash))
    .limit(1)

  if (!endpoint) return c.json({ error: 'Endpoint not found' }, 404)

  let endpointSecret: string
  try {
    endpointSecret = decrypt(endpoint.secret)
  } catch {
    return c.json({ error: 'Invalid endpoint secret configuration' }, 500)
  }

  // 2. Verificar firma HMAC — sin dependencia de stripe
  const { valid, event: stripeEvent, error } = verifyStripeSignature(
    rawBody,
    signature,
    endpointSecret
  )

  if (!valid || !stripeEvent) {
    return c.json({ error: error ?? 'Invalid signature' }, 400)
  }

  const parsed = stripeEvent as { id: string; type: string }

  // 3. Idempotencia
  const [existing] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.stripeId, parsed.id))
    .limit(1)

  if (existing) return c.json({ received: true, duplicate: true })

  // 4. Verificar límite del plan — patrón sin ifs dispersos
  const [user] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, endpoint.userId))
    .limit(1)

  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  const limits = getPlanLimits(user.plan)

  if (!isUnlimited(limits.maxEventsPerMonth)) {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const [{ total }] = await db
      .select({ total: count() })
      .from(events)
      .where(
        and(
          eq(events.endpointId, endpoint.id),
          gte(events.receivedAt, startOfMonth)
        )
      )

    if (total >= limits.maxEventsPerMonth) {
      // Respondemos 200 para que Stripe no reintente
      // El usuario verá en el dashboard que alcanzó el límite
      return c.json({ received: true, dropped: true, reason: 'plan_limit_reached' })
    }
  }

  // 5. Persistir
  const [event] = await db
    .insert(events)
    .values({
      endpointId: endpoint.id,
      stripeId:   parsed.id,
      type:       parsed.type,
      payload:    stripeEvent as object,
      status:     'PENDING',
    })
    .returning()

  // 6. Encolar
  await enqueueDelivery(event.id, user.plan)

  return c.json({ received: true })
})
