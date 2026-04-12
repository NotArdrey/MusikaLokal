BEGIN;

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

  IF TG_TABLE_NAME = 'gigs' THEN
    v_target_types := ARRAY['gig'];
    v_entity_label := 'gig';
  ELSIF TG_TABLE_NAME = 'studios' THEN
    v_target_types := ARRAY['studio', 'venue'];
    v_entity_label := 'studio';
  ELSE
    RETURN OLD;
  END IF;

  v_note := format(
    'Auto-dismissed because %s %s was deleted.',
    v_entity_label,
    OLD.id::text
  );

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'reviewed_by'
  ) INTO v_has_column;

  IF v_has_column THEN
    v_set_clauses := v_set_clauses || 'reviewed_by = NULL';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'reviewed_at'
  ) INTO v_has_column;

  IF v_has_column THEN
    v_set_clauses := v_set_clauses || 'reviewed_at = timezone(''utc'', now())';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'moderation_action'
  ) INTO v_has_column;

  IF v_has_column THEN
    v_set_clauses := v_set_clauses || 'moderation_action = ''none''';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'moderation_notes'
  ) INTO v_has_column;

  IF v_has_column THEN
    v_set_clauses := v_set_clauses || 'moderation_notes = CASE WHEN moderation_notes IS NULL OR btrim(moderation_notes) = '''' THEN $3 ELSE moderation_notes || E''\n'' || $3 END';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'escalation_status'
  ) INTO v_has_column;

  IF v_has_column THEN
    v_set_clauses := v_set_clauses || 'escalation_status = ''none''';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'escalated_at'
  ) INTO v_has_column;

  IF v_has_column THEN
    v_set_clauses := v_set_clauses || 'escalated_at = NULL';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'escalation_reason'
  ) INTO v_has_column;

  IF v_has_column THEN
    v_set_clauses := v_set_clauses || 'escalation_reason = NULL';
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
  IF to_regclass('public.gigs') IS NOT NULL AND to_regclass('public.reports') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_reports_cleanup_on_gig_delete ON public.gigs';
    EXECUTE 'CREATE TRIGGER trg_reports_cleanup_on_gig_delete AFTER DELETE ON public.gigs FOR EACH ROW EXECUTE FUNCTION public.dismiss_reports_for_deleted_target()';
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.studios') IS NOT NULL AND to_regclass('public.reports') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_reports_cleanup_on_studio_delete ON public.studios';
    EXECUTE 'CREATE TRIGGER trg_reports_cleanup_on_studio_delete AFTER DELETE ON public.studios FOR EACH ROW EXECUTE FUNCTION public.dismiss_reports_for_deleted_target()';
  END IF;
END;
$$;

COMMIT;
