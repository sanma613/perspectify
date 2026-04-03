-- Enable a dedicated SELECT policy for Supabase Realtime event subscriptions.
-- This policy remains scoped to events owned by the authenticated user.

DO $$
BEGIN
  IF to_regclass('public.events') IS NOT NULL AND to_regclass('public.endpoints') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "events" ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "realtime_events_own" ON "events"';
    EXECUTE 'CREATE POLICY "realtime_events_own" ON "events" FOR SELECT USING ("endpoint_id" IN (SELECT "id" FROM "endpoints" WHERE "user_id" = auth.uid()::text))';
  END IF;
END
$$;
