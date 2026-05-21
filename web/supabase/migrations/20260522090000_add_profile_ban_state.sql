-- Keep account-ban state on profiles so logged-in clients can react in realtime.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_until timestamp with time zone,
  ADD COLUMN IF NOT EXISTS ban_reason text,
  ADD COLUMN IF NOT EXISTS ban_action text,
  ADD COLUMN IF NOT EXISTS banned_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS banned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ban_lifted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS ban_lifted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_ban_action_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_ban_action_check
      CHECK (
        ban_action IS NULL OR ban_action IN (
          'ban_1_day',
          'ban_7_days',
          'ban_30_days',
          'ban_permanent',
          'lift_ban',
          'manual_unban',
          'auth_ban_imported'
        )
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_profiles_active_ban
  ON public.profiles(is_banned, banned_until)
  WHERE is_banned = true;

UPDATE public.profiles p
SET
  is_banned = true,
  banned_until = u.banned_until,
  ban_reason = COALESCE(p.ban_reason, 'Existing auth ban'),
  ban_action = COALESCE(p.ban_action, 'auth_ban_imported'),
  banned_at = COALESCE(p.banned_at, u.updated_at, timezone('utc'::text, now()))
FROM auth.users u
WHERE u.id = p.id
  AND u.banned_until IS NOT NULL
  AND u.banned_until > timezone('utc'::text, now());

CREATE OR REPLACE FUNCTION public.prevent_profile_ban_field_self_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_request_role text := COALESCE(current_setting('request.jwt.claim.role', true), auth.role(), '');
BEGIN
  IF v_request_role = 'service_role' OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned
    OR NEW.banned_until IS DISTINCT FROM OLD.banned_until
    OR NEW.ban_reason IS DISTINCT FROM OLD.ban_reason
    OR NEW.ban_action IS DISTINCT FROM OLD.ban_action
    OR NEW.banned_at IS DISTINCT FROM OLD.banned_at
    OR NEW.banned_by IS DISTINCT FROM OLD.banned_by
    OR NEW.ban_lifted_at IS DISTINCT FROM OLD.ban_lifted_at
    OR NEW.ban_lifted_by IS DISTINCT FROM OLD.ban_lifted_by THEN
    RAISE EXCEPTION 'Only admins can change account ban fields' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_profile_ban_field_self_edit ON public.profiles;
CREATE TRIGGER trg_prevent_profile_ban_field_self_edit
  BEFORE UPDATE OF is_banned, banned_until, ban_reason, ban_action, banned_at, banned_by, ban_lifted_at, ban_lifted_by
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_ban_field_self_edit();

COMMENT ON COLUMN public.profiles.is_banned IS
  'Client-visible account ban flag mirrored from admin moderation actions.';
COMMENT ON COLUMN public.profiles.banned_until IS
  'When a temporary account ban expires. NULL with is_banned=true means permanent.';
COMMENT ON COLUMN public.profiles.ban_reason IS
  'Short admin-facing reason or source for the active/last ban.';
