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
    WHEN 'post' THEN 'feed_post'
    WHEN 'feed post' THEN 'feed_post'
    WHEN 'feed-post' THEN 'feed_post'
    WHEN 'feed_posts' THEN 'feed_post'
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
  CHECK (target_type IN ('group', 'studio', 'gig', 'profile', 'product', 'playlist', 'feed_post'));

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

  IF v_target_type NOT IN ('group', 'studio', 'gig', 'profile', 'product', 'playlist', 'feed_post') THEN
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
  ELSIF v_target_type = 'playlist' THEN
    SELECT EXISTS (SELECT 1 FROM public.playlists WHERE id = NEW.target_id) INTO v_target_exists;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.feed_posts WHERE id = NEW.target_id) INTO v_target_exists;
  END IF;

  IF NOT v_target_exists THEN
    RAISE EXCEPTION 'Cannot report missing target: % %', v_target_type, NEW.target_id
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_reports_for_deleted_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_types text[];
  v_entity_label text;
  v_set_clauses text[] := ARRAY['status = ''dismissed'''];
  v_sql text;
  v_note text;
  v_has_column boolean;
BEGIN
  IF to_regclass('public.reports') IS NULL THEN
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'groups' THEN
    v_target_types := ARRAY['group'];
    v_entity_label := 'group';
  ELSIF TG_TABLE_NAME = 'gigs' THEN
    v_target_types := ARRAY['gig'];
    v_entity_label := 'gig';
  ELSIF TG_TABLE_NAME = 'studios' THEN
    v_target_types := ARRAY['studio', 'venue'];
    v_entity_label := 'studio';
  ELSIF TG_TABLE_NAME = 'products' THEN
    v_target_types := ARRAY['product'];
    v_entity_label := 'marketplace item';
  ELSIF TG_TABLE_NAME = 'playlists' THEN
    v_target_types := ARRAY['playlist', 'music'];
    v_entity_label := 'playlist';
  ELSIF TG_TABLE_NAME = 'feed_posts' THEN
    v_target_types := ARRAY['feed_post', 'post', 'feed post', 'feed-post', 'feed_posts'];
    v_entity_label := 'feed post';
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    v_target_types := ARRAY['profile', 'user', 'artist'];
    v_entity_label := 'profile';
  ELSE
    RETURN OLD;
  END IF;

  v_note := format(
    'Auto-dismissed because %s %s was deleted.',
    v_entity_label,
    OLD.id::text
  );

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'reviewed_by'
  ) INTO v_has_column;
  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'reviewed_by = NULL'::text);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'reviewed_at'
  ) INTO v_has_column;
  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'reviewed_at = timezone(''utc'', now())'::text);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'moderation_action'
  ) INTO v_has_column;
  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'moderation_action = ''none'''::text);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'moderation_notes'
  ) INTO v_has_column;
  IF v_has_column THEN
    v_set_clauses := array_append(
      v_set_clauses,
      'moderation_notes = CASE WHEN moderation_notes IS NULL OR btrim(moderation_notes) = '''' THEN $3 ELSE moderation_notes || E''\n'' || $3 END'::text
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'escalation_status'
  ) INTO v_has_column;
  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'escalation_status = ''none'''::text);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'escalated_at'
  ) INTO v_has_column;
  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'escalated_at = NULL'::text);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'escalation_reason'
  ) INTO v_has_column;
  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'escalation_reason = NULL'::text);
  END IF;

  v_sql :=
    'UPDATE public.reports SET ' || array_to_string(v_set_clauses, ', ') ||
    ' WHERE target_id = $1::uuid' ||
    '   AND lower(target_type) = ANY($2::text[])' ||
    '   AND lower(coalesce(status, ''pending'')) = ''pending''';

  EXECUTE v_sql USING OLD.id, v_target_types, v_note;

  RETURN OLD;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.feed_posts') IS NOT NULL AND to_regclass('public.reports') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_reports_cleanup_on_feed_post_delete ON public.feed_posts';
    EXECUTE 'CREATE TRIGGER trg_reports_cleanup_on_feed_post_delete AFTER DELETE ON public.feed_posts FOR EACH ROW EXECUTE FUNCTION public.dismiss_reports_for_deleted_target()';
  END IF;
END;
$$;
