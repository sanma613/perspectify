import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { webhookRoutes } from './routes/webhook'
import { eventsRoutes } from './routes/events'
import { startWorker } from './worker'

const app = new Hono()

app.use('*', logger())
app.use('*', cors({ origin: process.env.WEB_URL ?? 'http://localhost:3000' }))

// Health — usado por el cron de Render para mantener vivo el servidor
app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }))

// Rutas
app.route('/webhook', webhookRoutes)
app.route('/events', eventsRoutes)

// Arrancar worker de entrega
await startWorker()

const port = Number(process.env.PORT ?? 3001)
console.log(`API running on port ${port}`)

export default {
  port,
  fetch: app.fetch,
}
