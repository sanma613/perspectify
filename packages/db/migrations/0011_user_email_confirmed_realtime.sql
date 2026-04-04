ALTER TABLE "public"."users" 
  DROP COLUMN IF EXISTS "created_at" CASCADE,
  ADD COLUMN IF NOT EXISTS "email_confirmed_at" timestamp;

UPDATE "public"."users" AS u
SET
  "email" = COALESCE(au."email", u."email"),
  "email_confirmed_at" = au."email_confirmed_at"
FROM "auth"."users" AS au
WHERE au."id"::text = u."id"
  AND (
    u."email" IS DISTINCT FROM COALESCE(au."email", u."email")
    OR u."email_confirmed_at" IS DISTINCT FROM au."email_confirmed_at"
  );

CREATE OR REPLACE FUNCTION public.sync_public_user_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.users (id, email, email_confirmed_at)
  VALUES (NEW.id::text, COALESCE(NEW.email, ''), NEW.email_confirmed_at)
  ON CONFLICT (id)
  DO UPDATE SET
    email = EXCLUDED.email,
    email_confirmed_at = EXCLUDED.email_confirmed_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_synced ON auth.users;
CREATE TRIGGER on_auth_user_synced
AFTER INSERT OR UPDATE OF email, email_confirmed_at ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_public_user_from_auth();

CREATE OR REPLACE FUNCTION public.handle_user_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  DELETE FROM public.users WHERE id = OLD.id::text;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
AFTER DELETE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_user_delete();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  END IF;
END
$$;