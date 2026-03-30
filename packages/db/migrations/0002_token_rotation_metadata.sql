ALTER TABLE "endpoints"
ADD COLUMN IF NOT EXISTS "token_rotated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "endpoints_token_rotated_at_idx" ON "endpoints" ("token_rotated_at");
