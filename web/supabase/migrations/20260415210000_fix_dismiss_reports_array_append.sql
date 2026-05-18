-- Fix dismiss_reports_for_deleted_target: use array_append instead of || for text[] literals.
-- The || operator with an untyped string literal is resolved as text[] || text[], causing
-- Postgres to parse 'reviewed_by = NULL' as an array literal → error 22P02.
-- This makes the DELETE trigger crash and rolls back the entire studio/gig delete.

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
    v_set_clauses := array_append(v_set_clauses, 'reviewed_by = NULL'::text);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'reviewed_at'
  ) INTO v_has_column;

  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'reviewed_at = timezone(''utc'', now())'::text);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'moderation_action'
  ) INTO v_has_column;

  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'moderation_action = ''none'''::text);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'moderation_notes'
  ) INTO v_has_column;

  IF v_has_column THEN
    v_set_clauses := array_append(
      v_set_clauses,
      'moderation_notes = CASE WHEN moderation_notes IS NULL OR btrim(moderation_notes) = '''' THEN $3 ELSE moderation_notes || E''\n'' || $3 END'::text
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'escalation_status'
  ) INTO v_has_column;

  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'escalation_status = ''none'''::text);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'escalated_at'
  ) INTO v_has_column;

  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'escalated_at = NULL'::text);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'escalation_reason'
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
