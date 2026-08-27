-- ============================================================================
-- Migration: Auto-confirm auth users & prevent email rate limit blocking
-- Ensures authentic Supabase user registration and login work seamlessly
-- without being throttled by default cloud email rate limits.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_auto_confirm_user()
RETURNS trigger AS $$
BEGIN
  NEW.email_confirmed_at = COALESCE(NEW.email_confirmed_at, now());
  NEW.confirmed_at = COALESCE(NEW.confirmed_at, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_auto_confirm_user ON auth.users;

CREATE TRIGGER tr_auto_confirm_user
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auto_confirm_user();

-- Auto-confirm any existing pending unconfirmed users
UPDATE auth.users
SET email_confirmed_at = now(), confirmed_at = now()
WHERE email_confirmed_at IS NULL;
