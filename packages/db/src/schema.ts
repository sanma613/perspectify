import { pgTable, text, integer, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ── Enums ─────────────────────────────────────────────────
export const planEnum = pgEnum('plan', ['free', 'starter', 'growth', 'pro'])

export const eventStatusEnum = pgEnum('event_status', [
  'PENDING',    // recibido, esperando entrega
  'DELIVERING', // worker procesando
  'DELIVERED',  // entregado con éxito
  'FAILED',     // agotó todos los reintentos
])

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'SUCCESS',
  'FAILED',
])

// ── Users ─────────────────────────────────────────────────
// Supabase Auth maneja la autenticación — esta tabla extiende el perfil
export const users = pgTable('users', {
  id:        text('id').primaryKey(),
  email:     text('email').notNull().unique(),
  plan:      planEnum('plan').default('free').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Endpoints ─────────────────────────────────────────────
// Cada endpoint = URL única que el cliente pone en Stripe
export const endpoints = pgTable('endpoints', {
  id:          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:      text('user_id').notNull().references(() => users.id),
  name:        text('name').notNull(),              // ej: "Stripe → Make producción"
  token:       text('token').notNull().unique(),    // token en /webhook/:token
  destination: text('destination').notNull(),       // URL real (Zapier/Make)
  secret:      text('secret').notNull(),            // Stripe webhook secret (HMAC)
  createdAt:   timestamp('created_at').defaultNow().notNull(),
})

// ── Events ────────────────────────────────────────────────
// Cada webhook recibido de Stripe
export const events = pgTable('events', {
  id:          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  endpointId:  text('endpoint_id').notNull().references(() => endpoints.id),
  stripeId:    text('stripe_id').notNull().unique(), // idempotencia
  type:        text('type').notNull(),               // payment_intent.succeeded etc
  payload:     jsonb('payload').notNull(),           // body completo del webhook
  status:      eventStatusEnum('status').default('PENDING').notNull(),
  attempts:    integer('attempts').default(0).notNull(),
  lastError:   text('last_error'),
  receivedAt:  timestamp('received_at').defaultNow().notNull(),
  deliveredAt: timestamp('delivered_at'),
})

// ── Deliveries ────────────────────────────────────────────
// Cada intento de entrega al destino del cliente
export const deliveries = pgTable('deliveries', {
  id:          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId:     text('event_id').notNull().references(() => events.id),
  attempt:     integer('attempt').notNull(),
  status:      deliveryStatusEnum('status').notNull(),
  statusCode:  integer('status_code'),
  error:       text('error'),
  attemptedAt: timestamp('attempted_at').defaultNow().notNull(),
})

// ── Relations ─────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  endpoints: many(endpoints),
}))

export const endpointsRelations = relations(endpoints, ({ one, many }) => ({
  user:   one(users, { fields: [endpoints.userId], references: [users.id] }),
  events: many(events),
}))

export const eventsRelations = relations(events, ({ one, many }) => ({
  endpoint:   one(endpoints, { fields: [events.endpointId], references: [endpoints.id] }),
  deliveries: many(deliveries),
}))

export const deliveriesRelations = relations(deliveries, ({ one }) => ({
  event: one(events, { fields: [deliveries.eventId], references: [events.id] }),
}))
