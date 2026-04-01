DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan') THEN
		IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_new') THEN
			CREATE TYPE "plan_new" AS ENUM ('free', 'starter');
		END IF;

		ALTER TABLE "users" ALTER COLUMN "plan" DROP DEFAULT;
		UPDATE "users" SET "plan" = 'starter' WHERE "plan"::text NOT IN ('free', 'starter');

		ALTER TABLE "users"
			ALTER COLUMN "plan" TYPE "plan_new"
			USING (
				CASE
					WHEN "plan"::text = 'free' THEN 'free'::"plan_new"
					ELSE 'starter'::"plan_new"
				END
			);

		DROP TYPE "plan";
		ALTER TYPE "plan_new" RENAME TO "plan";
		ALTER TABLE "users" ALTER COLUMN "plan" SET DEFAULT 'free';
	END IF;
END $$;

ALTER TABLE "events"
	ADD COLUMN IF NOT EXISTS "failure_alert_sent" boolean DEFAULT false NOT NULL,
	ADD COLUMN IF NOT EXISTS "retention_alert_sent" boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS "events_endpoint_received_at_idx" ON "events" ("endpoint_id", "received_at");
CREATE INDEX IF NOT EXISTS "events_status_failure_alert_idx" ON "events" ("status", "failure_alert_sent");
CREATE INDEX IF NOT EXISTS "events_status_retention_alert_idx" ON "events" ("status", "retention_alert_sent");