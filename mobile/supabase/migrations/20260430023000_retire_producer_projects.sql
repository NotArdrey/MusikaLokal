BEGIN;

DROP VIEW IF EXISTS public.producer_matches_with_summary CASCADE;
DROP VIEW IF EXISTS public.producer_projects_with_summary CASCADE;

ALTER TABLE IF EXISTS public.feed_posts
  DROP COLUMN IF EXISTS linked_project_id;

ALTER TABLE IF EXISTS public.conversations
  DROP COLUMN IF EXISTS producer_project_id;

ALTER TABLE IF EXISTS public.favorites
  DROP CONSTRAINT IF EXISTS favorites_project_id_fkey;

DROP INDEX IF EXISTS public.idx_favorites_project_id;

ALTER TABLE IF EXISTS public.favorites
  DROP CONSTRAINT IF EXISTS fav_one_target;

ALTER TABLE IF EXISTS public.favorites
  DROP COLUMN IF EXISTS project_id;

ALTER TABLE IF EXISTS public.favorites
  ADD CONSTRAINT fav_one_target CHECK (
    ((group_id IS NOT NULL)::integer +
     (studio_id IS NOT NULL)::integer +
     (gig_id IS NOT NULL)::integer +
     (profile_id IS NOT NULL)::integer) = 1
  );

DELETE FROM public.reports
WHERE lower(btrim(coalesce(target_type, ''))) IN ('project', 'producer project', 'producer_project');

CREATE OR REPLACE FUNCTION public.normalize_report_target_type(raw_target_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(btrim(coalesce(raw_target_type, '')))
    WHEN 'venue' THEN 'studio'
    WHEN 'artist' THEN 'profile'
    WHEN 'user' THEN 'profile'
    WHEN 'producer project' THEN 'project'
    WHEN 'producer_project' THEN 'project'
    WHEN 'music' THEN 'playlist'
    ELSE lower(btrim(coalesce(raw_target_type, '')))
  END;
$$;

UPDATE public.reports
SET target_type = public.normalize_report_target_type(target_type)
WHERE target_type IS DISTINCT FROM public.normalize_report_target_type(target_type);

ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_target_type_check;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN ('group', 'studio', 'gig', 'profile', 'product', 'playlist'));

CREATE OR REPLACE FUNCTION public.validate_report_target_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_target_type text;
  v_target_exists boolean := false;
BEGIN
  v_target_type := public.normalize_report_target_type(NEW.target_type);

  IF v_target_type NOT IN ('group', 'studio', 'gig', 'profile', 'product', 'playlist') THEN
    RAISE EXCEPTION 'Invalid report target_type: %', NEW.target_type
      USING ERRCODE = '23514';
  END IF;

  NEW.target_type := v_target_type;
  NEW.reason := btrim(coalesce(NEW.reason, ''));

  IF NEW.reason = '' THEN
    RAISE EXCEPTION 'Report reason is required.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.target_id IS NULL THEN
    RAISE EXCEPTION 'Report target_id is required.'
      USING ERRCODE = '23502';
  END IF;

  IF v_target_type = 'group' THEN
    SELECT EXISTS (SELECT 1 FROM public.groups WHERE id = NEW.target_id) INTO v_target_exists;
  ELSIF v_target_type = 'studio' THEN
    SELECT EXISTS (SELECT 1 FROM public.studios WHERE id = NEW.target_id) INTO v_target_exists;
  ELSIF v_target_type = 'gig' THEN
    SELECT EXISTS (SELECT 1 FROM public.gigs WHERE id = NEW.target_id) INTO v_target_exists;
  ELSIF v_target_type = 'profile' THEN
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.target_id) INTO v_target_exists;
  ELSIF v_target_type = 'product' THEN
    SELECT EXISTS (SELECT 1 FROM public.products WHERE id = NEW.target_id) INTO v_target_exists;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.playlists WHERE id = NEW.target_id) INTO v_target_exists;
  END IF;

  IF NOT v_target_exists THEN
    RAISE EXCEPTION 'Cannot report missing target: % %', v_target_type, NEW.target_id
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.increment_role_filled_slot(uuid);

DROP TABLE IF EXISTS public.producer_match_activity_events CASCADE;
DROP TABLE IF EXISTS public.producer_talent_invites CASCADE;
DROP TABLE IF EXISTS public.producer_project_applications CASCADE;
DROP TABLE IF EXISTS public.producer_project_roles CASCADE;
DROP TABLE IF EXISTS public.saved_talent CASCADE;
DROP TABLE IF EXISTS public.producer_projects CASCADE;

COMMIT;
