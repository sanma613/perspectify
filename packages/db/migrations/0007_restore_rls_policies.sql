-- Restore and enforce RLS + per-user policies for app tables.
-- This migration is idempotent and safe to re-run.

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "users_select_own" ON "users"';
    EXECUTE 'CREATE POLICY "users_select_own" ON "users" FOR SELECT USING ("id" = auth.uid()::text)';

    EXECUTE 'DROP POLICY IF EXISTS "users_update_own" ON "users"';
    EXECUTE 'CREATE POLICY "users_update_own" ON "users" FOR UPDATE USING ("id" = auth.uid()::text) WITH CHECK ("id" = auth.uid()::text)';

    EXECUTE 'DROP POLICY IF EXISTS "users_insert_own" ON "users"';
    EXECUTE 'CREATE POLICY "users_insert_own" ON "users" FOR INSERT WITH CHECK ("id" = auth.uid()::text)';
  END IF;

  IF to_regclass('public.endpoints') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "endpoints" ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "endpoints_select_own" ON "endpoints"';
    EXECUTE 'CREATE POLICY "endpoints_select_own" ON "endpoints" FOR SELECT USING ("user_id" = auth.uid()::text)';

    EXECUTE 'DROP POLICY IF EXISTS "endpoints_insert_own" ON "endpoints"';
    EXECUTE 'CREATE POLICY "endpoints_insert_own" ON "endpoints" FOR INSERT WITH CHECK ("user_id" = auth.uid()::text)';

    EXECUTE 'DROP POLICY IF EXISTS "endpoints_update_own" ON "endpoints"';
    EXECUTE 'CREATE POLICY "endpoints_update_own" ON "endpoints" FOR UPDATE USING ("user_id" = auth.uid()::text) WITH CHECK ("user_id" = auth.uid()::text)';

    EXECUTE 'DROP POLICY IF EXISTS "endpoints_delete_own" ON "endpoints"';
    EXECUTE 'CREATE POLICY "endpoints_delete_own" ON "endpoints" FOR DELETE USING ("user_id" = auth.uid()::text)';
  END IF;

  IF to_regclass('public.events') IS NOT NULL AND to_regclass('public.endpoints') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "events" ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "events_select_own" ON "events"';
    EXECUTE 'CREATE POLICY "events_select_own" ON "events" FOR SELECT USING (EXISTS (SELECT 1 FROM "endpoints" e WHERE e."id" = "events"."endpoint_id" AND e."user_id" = auth.uid()::text))';
  END IF;

  IF to_regclass('public.deliveries') IS NOT NULL AND to_regclass('public.events') IS NOT NULL AND to_regclass('public.endpoints') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "deliveries" ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "deliveries_select_own" ON "deliveries"';
    EXECUTE 'CREATE POLICY "deliveries_select_own" ON "deliveries" FOR SELECT USING (EXISTS (SELECT 1 FROM "events" ev JOIN "endpoints" ep ON ep."id" = ev."endpoint_id" WHERE ev."id" = "deliveries"."event_id" AND ep."user_id" = auth.uid()::text))';
  END IF;

  IF to_regclass('public.event_attempts') IS NOT NULL AND to_regclass('public.events') IS NOT NULL AND to_regclass('public.endpoints') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE "event_attempts" ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "event_attempts_select_own" ON "event_attempts"';
    EXECUTE 'CREATE POLICY "event_attempts_select_own" ON "event_attempts" FOR SELECT USING (EXISTS (SELECT 1 FROM "events" ev JOIN "endpoints" ep ON ep."id" = ev."endpoint_id" WHERE ev."id" = "event_attempts"."event_id" AND ep."user_id" = auth.uid()::text))';
  END IF;
END
$$;
