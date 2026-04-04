import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db, events } from '@perspectify/db'
import { webhookRoutes } from './routes/webhook'
import { eventsRoutes } from './routes/events'
import { endpointsRoutes } from './routes/endpoints'
import { meRoutes } from './routes/me'
import { publicAuthRoutes } from './routes/public-auth'
import { authMiddleware } from './middleware/auth'
import { startWorker } from './worker'

const app = new Hono()

const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS !== 'false'

function normalizeOrigin(value?: string | null): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function parseOrigins(value?: string): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((entry) => normalizeOrigin(entry.trim()))
    .filter((entry): entry is string => Boolean(entry))
}

const allowedOrigins = new Set([
  ...parseOrigins(process.env.WEB_URL),
  ...parseOrigins(process.env.APP_URL),
  ...parseOrigins(process.env.CORS_ORIGINS),
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://[::1]:3000',
])

function isAllowedOrigin(origin: string): boolean {
  const normalizedOrigin = normalizeOrigin(origin)
  if (!normalizedOrigin) return false
  if (allowedOrigins.has(normalizedOrigin)) return true

  if (!allowVercelPreviews) return false

  try {
    const hostname = new URL(normalizedOrigin).hostname
    return hostname.endsWith('.vercel.app')
  } catch {
    return false
  }
}

app.use('*', async (c, next) => {
  const startedAt = Date.now()
  await next()

  const safePath = c.req.path.startsWith('/webhook/')
    ? '/webhook/[redacted-token-hash]'
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

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return '*'
      return isAllowedOrigin(origin) ? origin : null
    },
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })
)

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
app.route('/auth', publicAuthRoutes)

// Todo lo demás requiere JWT válido
app.use('*', authMiddleware)

app.route('/me', meRoutes)
app.route('/events', eventsRoutes)
app.route('/endpoints', endpointsRoutes)

// Arrancar worker en segundo plano para no tumbar API si falla DNS/DB temporalmente.
void startWorkerWithRetry()

const port = Number(process.env.PORT ?? 3001)
console.log(`API running on port ${port}`)

export default {
  port,
  fetch: app.fetch,
}

async function startWorkerWithRetry() {
  const retryMs = Number(process.env.WORKER_RETRY_MS ?? 15_000)

  while (true) {
    try {
      await startWorker()
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      console.error(
        `[worker] start failed: ${message}. Retrying in ${Math.round(retryMs / 1000)}s.`
      )
      await Bun.sleep(retryMs)
    }
  }
}
