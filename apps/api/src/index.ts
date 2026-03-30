import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db, events } from '@perspectify/db'
import { webhookRoutes } from './routes/webhook'
import { eventsRoutes } from './routes/events'
import { endpointsRoutes } from './routes/endpoints'
import { authMiddleware } from './middleware/auth'
import { startWorker } from './worker'

const app = new Hono()

app.use('*', async (c, next) => {
  const startedAt = Date.now()
  await next()

  const safePath = c.req.path.startsWith('/webhook/')
    ? '/webhook/[redacted-token]'
    : c.req.path

  const rawAuth = c.req.header('authorization')
  const rawStripeSig = c.req.header('stripe-signature')

  const redactedHeaders = {
    ...(rawAuth ? { authorization: '[REDACTED]' } : {}),
    ...(rawStripeSig ? { 'stripe-signature': '[REDACTED]' } : {}),
  }

  console.log(JSON.stringify({
    method: c.req.method,
    path: safePath,
    status: c.res.status,
    durationMs: Date.now() - startedAt,
    headers: redactedHeaders,
  }))
})

app.use('*', cors({ origin: process.env.WEB_URL ?? 'http://localhost:3000' }))

// Health — valida API y conectividad de base de datos
app.get('/health', async (c) => {
  try {
    // Query mínima para mantener activa la conexión y verificar DB.
    await db.select({ id: events.id }).from(events).limit(1)
    return c.json({ ok: true, db: true, ts: Date.now() })
  } catch {
    return c.json({ ok: false, db: false, ts: Date.now() }, 503)
  }
})

// Rutas
app.route('/webhook', webhookRoutes)

// Todo lo demás requiere JWT válido
app.use('*', authMiddleware)

app.route('/events', eventsRoutes)
app.route('/endpoints', endpointsRoutes)

// Arrancar worker de entrega
await startWorker()

const port = Number(process.env.PORT ?? 3001)
console.log(`API running on port ${port}`)

export default {
  port,
  fetch: app.fetch,
}
