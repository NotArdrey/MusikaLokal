-- Catch up the missing producer communication schema changes on projects
-- where 20260420140000_producer_comms_completion.sql was not applied.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS producer_project_id uuid REFERENCES public.producer_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_producer_project ON public.conversations (producer_project_id) WHERE producer_project_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.increment_role_filled_slot(p_role_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_filled integer;
  v_max integer;
BEGIN
  SELECT filled_slots, max_slots INTO v_filled, v_max
  FROM public.producer_project_roles
  WHERE id = p_role_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role not found';
  END IF;

  IF v_filled >= v_max THEN
    RAISE EXCEPTION 'Role is already fully filled (% / %)', v_filled, v_max;
  END IF;

  UPDATE public.producer_project_roles
  SET filled_slots = filled_slots + 1
  WHERE id = p_role_id
  RETURNING filled_slots INTO v_filled;

  RETURN v_filled;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expire_stale_invites()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.producer_talent_invites
  SET status = 'expired', updated_at = now()
  WHERE status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

