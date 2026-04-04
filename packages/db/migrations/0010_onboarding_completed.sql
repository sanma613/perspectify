ALTER TABLE "users"
ADD COLUMN "onboarding_completed" boolean DEFAULT false NOT NULL;

UPDATE "users" AS u
SET "onboarding_completed" = true
WHERE EXISTS (
  SELECT 1
  FROM "endpoints" AS e
  WHERE e."user_id" = u."id"
);
