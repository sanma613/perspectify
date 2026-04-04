ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "ingestion_latency_ms" integer,
  ADD COLUMN IF NOT EXISTS "signature_valid" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "stripe_generated_at" timestamp;

ALTER TABLE "event_attempts"
  ADD COLUMN IF NOT EXISTS "duration_ms" integer,
  ADD COLUMN IF NOT EXISTS "attempt_started_at" timestamp,
  ADD COLUMN IF NOT EXISTS "response_received_at" timestamp,
  ADD COLUMN IF NOT EXISTS "request_headers" jsonb,
  ADD COLUMN IF NOT EXISTS "response_headers" jsonb,
  ADD COLUMN IF NOT EXISTS "failure_category" text;
