CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint

ALTER TABLE "endpoints"
ADD COLUMN IF NOT EXISTS "token_hash" text,
ADD COLUMN IF NOT EXISTS "token_prefix" text;--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'endpoints'
      AND column_name = 'token'
  ) THEN
    UPDATE "endpoints"
    SET
      "token_hash" = encode(digest("token", 'sha256'), 'hex'),
      "token_prefix" = substring(encode(digest("token", 'sha256'), 'hex') from 1 for 16)
    WHERE ("token_hash" IS NULL OR "token_prefix" IS NULL)
      AND "token" IS NOT NULL;
  END IF;
END $$;--> statement-breakpoint

ALTER TABLE "endpoints"
ALTER COLUMN "token_hash" SET NOT NULL,
ALTER COLUMN "token_prefix" SET NOT NULL;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'endpoints_token_hash_unique'
  ) THEN
    ALTER TABLE "endpoints"
    ADD CONSTRAINT "endpoints_token_hash_unique" UNIQUE("token_hash");
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'endpoints_token_prefix_unique'
  ) THEN
    ALTER TABLE "endpoints"
    ADD CONSTRAINT "endpoints_token_prefix_unique" UNIQUE("token_prefix");
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'endpoints_token_hash_format_check'
  ) THEN
    ALTER TABLE "endpoints"
    ADD CONSTRAINT "endpoints_token_hash_format_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
  END IF;
END $$;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'endpoints_token_prefix_format_check'
  ) THEN
    ALTER TABLE "endpoints"
    ADD CONSTRAINT "endpoints_token_prefix_format_check" CHECK ("token_prefix" ~ '^[0-9a-f]{16}$');
  END IF;
END $$;--> statement-breakpoint

ALTER TABLE "endpoints"
DROP CONSTRAINT IF EXISTS "endpoints_token_unique";--> statement-breakpoint

ALTER TABLE "endpoints"
DROP COLUMN IF EXISTS "token";
