ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "free_replays_used" integer DEFAULT 0 NOT NULL;

ALTER TABLE "events"
ADD COLUMN IF NOT EXISTS "payload_size" integer,
ADD COLUMN IF NOT EXISTS "source_headers" jsonb,
ADD COLUMN IF NOT EXISTS "destination_url" text,
ADD COLUMN IF NOT EXISTS "provider_name" text,
ADD COLUMN IF NOT EXISTS "last_attempt_status" integer;

CREATE TABLE IF NOT EXISTS "event_attempts" (
  "id" text PRIMARY KEY NOT NULL,
  "event_id" text NOT NULL,
  "attempt" integer NOT NULL,
  "status" integer,
  "response_body" text,
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "event_attempts"
ADD CONSTRAINT "event_attempts_event_id_events_id_fk"
FOREIGN KEY ("event_id") REFERENCES "public"."events"("id")
ON DELETE no action ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "event_attempts_event_id_idx" ON "event_attempts" ("event_id");
CREATE INDEX IF NOT EXISTS "event_attempts_event_id_created_at_idx" ON "event_attempts" ("event_id", "created_at");
