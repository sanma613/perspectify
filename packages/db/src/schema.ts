import { pgTable, text, integer, timestamp, jsonb, pgEnum, index, boolean, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ── Enums ─────────────────────────────────────────────────
export const planEnum = pgEnum('plan', ['free', 'starter'])

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
  emailConfirmedAt: timestamp('email_confirmed_at'),
  plan:      planEnum('plan').default('free').notNull(),
  onboardingCompleted: boolean('onboarding_completed').default(false).notNull(),
  freeReplaysUsed: integer('free_replays_used').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ── Endpoints ─────────────────────────────────────────────
// Cada endpoint = URL única que el cliente pone en Stripe
export const endpoints = pgTable('endpoints', {
  id:          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:      text('user_id').notNull().references(() => users.id),
  name:        text('name').notNull(),              // ej: "Stripe → Make producción"
  tokenHash:   text('token_hash').notNull().unique(),
  tokenPrefix: text('token_prefix').notNull().unique(), // identificador corto para UI/soporte
  tokenRotatedAt: timestamp('token_rotated_at').defaultNow().notNull(),
  destination: text('destination').notNull(),       // URL real (Zapier/Make)
  secret:      text('secret').notNull(),            // Stripe webhook secret (HMAC)
  createdAt:   timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  endpointsUserNameUniqueIdx: uniqueIndex('endpoints_user_name_unique').on(table.userId, table.name),
  endpointsUserDestinationUniqueIdx: uniqueIndex('endpoints_user_destination_unique').on(table.userId, table.destination),
}))

// ── Events ────────────────────────────────────────────────
// Cada webhook recibido de Stripe
export const events = pgTable('events', {
  id:          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  endpointId:  text('endpoint_id').notNull().references(() => endpoints.id),
  stripeId:    text('stripe_id').notNull().unique(), // idempotencia
  type:        text('type').notNull(),               // payment_intent.succeeded etc
  payload:     jsonb('payload').notNull(),           // body completo del webhook
  payloadSize: integer('payload_size'),
  sourceHeaders: jsonb('source_headers'),
  destinationUrl: text('destination_url'),
  providerName: text('provider_name'),
  ingestionLatencyMs: integer('ingestion_latency_ms'),
  signatureValid: boolean('signature_valid').default(true).notNull(),
  stripeGeneratedAt: timestamp('stripe_generated_at'),
  status:      eventStatusEnum('status').default('PENDING').notNull(),
  attempts:    integer('attempts').default(0).notNull(),
  replayCount: integer('replay_count').default(0).notNull(),
  lastAttemptStatus: integer('last_attempt_status'),
  lastError:   text('last_error'),
  failureAlertSent: boolean('failure_alert_sent').default(false).notNull(),
  retentionAlertSent: boolean('retention_alert_sent').default(false).notNull(),
  receivedAt:  timestamp('received_at').defaultNow().notNull(),
  deliveredAt: timestamp('delivered_at'),
}, (table) => ({
  eventsEndpointReceivedAtIdx: index('events_endpoint_received_at_idx').on(table.endpointId, table.receivedAt),
  eventsStatusFailureAlertIdx: index('events_status_failure_alert_idx').on(table.status, table.failureAlertSent),
  eventsStatusRetentionAlertIdx: index('events_status_retention_alert_idx').on(table.status, table.retentionAlertSent),
}))

// ── Deliveries ────────────────────────────────────────────
// Cada intento de entrega al destino del cliente
export const deliveries = pgTable('deliveries', {
  id:          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId:     text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  attempt:     integer('attempt').notNull(),
  status:      deliveryStatusEnum('status').notNull(),
  statusCode:  integer('status_code'),
  error:       text('error'),
  attemptedAt: timestamp('attempted_at').defaultNow().notNull(),
})

// ── Event Attempts ───────────────────────────────────────
// Historial detallado de intentos (estado HTTP + body)
export const eventAttempts = pgTable('event_attempts', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId:      text('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  attempt:      integer('attempt').notNull(),
  status:       integer('status'),
  durationMs:   integer('duration_ms'),
  attemptStartedAt: timestamp('attempt_started_at'),
  responseReceivedAt: timestamp('response_received_at'),
  requestHeaders: jsonb('request_headers'),
  responseHeaders: jsonb('response_headers'),
  responseBody: text('response_body'),
  failureCategory: text('failure_category'),
  error:        text('error'),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
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
  eventAttempts: many(eventAttempts),
}))

export const deliveriesRelations = relations(deliveries, ({ one }) => ({
  event: one(events, { fields: [deliveries.eventId], references: [events.id] }),
}))

export const eventAttemptsRelations = relations(eventAttempts, ({ one }) => ({
  event: one(events, { fields: [eventAttempts.eventId], references: [events.id] }),
}))
