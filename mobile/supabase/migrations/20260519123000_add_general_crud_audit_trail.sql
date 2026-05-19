BEGIN;

-- General CRUD audit trail.
-- This is intentionally additive: existing CRUD tables, RLS policies, and
-- fetch queries are left untouched. The trigger is non-blocking so audit
-- failures do not roll back normal user actions.

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  actor_user_id uuid,
  target_user_id uuid,
  actor_role text,
  action text NOT NULL CHECK (length(btrim(action)) > 0),
  entity_schema text NOT NULL DEFAULT 'public',
  entity_table text NOT NULL CHECK (length(btrim(entity_table)) > 0),
  entity_id text NOT NULL CHECK (length(btrim(entity_id)) > 0),
  entity_label text,
  source text NOT NULL DEFAULT 'database',
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.audit_events
  DROP CONSTRAINT IF EXISTS audit_events_actor_user_id_fkey,
  DROP CONSTRAINT IF EXISTS audit_events_target_user_id_fkey;

CREATE TABLE IF NOT EXISTS public.audit_event_changes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_event_id uuid NOT NULL REFERENCES public.audit_events(id) ON DELETE CASCADE,
  column_name text NOT NULL CHECK (length(btrim(column_name)) > 0),
  old_value text,
  new_value text
);

CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at
  ON public.audit_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_entity
  ON public.audit_events (entity_table, entity_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor
  ON public.audit_events (actor_user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_target
  ON public.audit_events (target_user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_action
  ON public.audit_events (action, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_event_changes_event
  ON public.audit_event_changes (audit_event_id);

COMMENT ON TABLE public.audit_events IS
  'Append-only audit event header for CRUD and business actions across MusikaLokal.';
COMMENT ON TABLE public.audit_event_changes IS
  'One row per changed column for normalized audit details.';
COMMENT ON COLUMN public.audit_events.metadata IS
  'Small contextual payload for historical audit evidence. Registered as a controlled 3NF exception.';
COMMENT ON COLUMN public.audit_events.actor_user_id IS
  'Historical actor profile id. Intentionally not a foreign key so profile deletion cannot erase audit attribution.';
COMMENT ON COLUMN public.audit_events.target_user_id IS
  'Historical target profile id. Intentionally not a foreign key so profile deletion cannot erase audit attribution.';

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_event_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read audit events" ON public.audit_events;
CREATE POLICY "Admins can read audit events"
ON public.audit_events
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can read audit event changes" ON public.audit_event_changes;
CREATE POLICY "Admins can read audit event changes"
ON public.audit_event_changes
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

REVOKE ALL ON TABLE public.audit_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.audit_event_changes FROM anon, authenticated;
GRANT SELECT ON TABLE public.audit_events TO authenticated;
GRANT SELECT ON TABLE public.audit_event_changes TO authenticated;
GRANT ALL ON TABLE public.audit_events TO service_role;
GRANT ALL ON TABLE public.audit_event_changes TO service_role;

INSERT INTO public.normalization_exceptions (table_name, column_name, rationale)
VALUES
  ('audit_events', 'metadata', 'Small immutable context payload retained for forensic and admin audit display. Detailed column changes are normalized in audit_event_changes.')
ON CONFLICT (table_name, column_name) DO UPDATE
SET rationale = EXCLUDED.rationale,
    approved_at = now();

CREATE OR REPLACE FUNCTION public.audit_redact_row(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  key text;
  key_lc text;
  value jsonb;
  text_value text;
BEGIN
  IF p_row IS NULL THEN
    RETURN NULL;
  END IF;

  FOR key, value IN SELECT * FROM jsonb_each(p_row) LOOP
    key_lc := lower(key);

    IF key_lc = ANY (ARRAY[
      'password',
      'password_hash',
      'access_token',
      'refresh_token',
      'token',
      'secret',
      'authorization',
      'didit_session_id',
      'address_verification_session_id',
      'document_fingerprint',
      'front_image_path',
      'back_image_path',
      'selfie_image_path',
      'business_permit_url',
      'contract_url',
      'proof_url',
      'payment_intent_id',
      'checkout_session_id',
      'refund_id',
      'account_number',
      'account_name',
      'bank_name',
      'payout_account_number',
      'payout_account_name',
      'payout_bank_name',
      'claim_metadata',
      'metadata',
      'moderation_metadata',
      'safety_metadata'
    ])
    OR key_lc LIKE '%password%'
    OR key_lc LIKE '%token%'
    OR key_lc LIKE '%secret%'
    OR key_lc LIKE '%fingerprint%'
    OR key_lc LIKE '%document%'
    OR key_lc LIKE '%session_id%'
    OR key_lc LIKE '%account_number%'
    OR key_lc LIKE '%payment_intent%'
    OR key_lc LIKE '%checkout_session%'
    OR key_lc LIKE '%refund_id%'
    OR key_lc LIKE '%storage_path%'
    OR key_lc LIKE '%image_path%'
    OR key_lc LIKE '%media_url%'
    OR key_lc LIKE '%audio_url%'
    OR key_lc LIKE '%video_url%'
    OR key_lc LIKE '%avatar_url%'
    OR key_lc LIKE '%cover_image_url%'
    OR key_lc LIKE '%attachment_url%' THEN
      result := result || jsonb_build_object(key, '[redacted]');
    ELSIF jsonb_typeof(value) = 'string' THEN
      text_value := value #>> '{}';
      IF length(text_value) > 4000 THEN
        result := result || jsonb_build_object(key, left(text_value, 4000) || '...[truncated]');
      ELSE
        result := result || jsonb_build_object(key, value);
      END IF;
    ELSE
      result := result || jsonb_build_object(key, value);
    END IF;
  END LOOP;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_text_value(p_value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  result text;
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(p_value) = 'string' THEN
    result := p_value #>> '{}';
  ELSE
    result := p_value::text;
  END IF;

  RETURN left(result, 4000);
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_row_id(p_row jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  key text;
  value text;
BEGIN
  IF p_row IS NULL THEN
    RETURN md5('null');
  END IF;

  FOREACH key IN ARRAY ARRAY[
    'id',
    'event_key',
    'order_number',
    'booking_id',
    'request_id',
    'user_id',
    'profile_id',
    'group_id',
    'studio_id',
    'gig_id',
    'product_id',
    'playlist_id',
    'conversation_id',
    'message_id',
    'order_id'
  ] LOOP
    value := nullif(btrim(p_row ->> key), '');
    IF value IS NOT NULL THEN
      RETURN value;
    END IF;
  END LOOP;

  RETURN md5(p_row::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_entity_label(p_table text, p_row jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  key text;
  value text;
BEGIN
  IF p_row IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH key IN ARRAY ARRAY[
    'name',
    'title',
    'full_name',
    'order_number',
    'subject',
    'recipient_email',
    'email',
    'message',
    'content',
    'booking_id',
    'id'
  ] LOOP
    value := nullif(btrim(p_row ->> key), '');
    IF value IS NOT NULL THEN
      RETURN left(value, 180);
    END IF;
  END LOOP;

  RETURN p_table || ':' || public.audit_row_id(p_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_uuid_from_row(p_row jsonb, p_keys text[])
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  key text;
  value text;
BEGIN
  IF p_row IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH key IN ARRAY p_keys LOOP
    value := nullif(btrim(p_row ->> key), '');
    IF value IS NOT NULL THEN
      BEGIN
        RETURN value::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        NULL;
      END;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_current_actor_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public, auth
AS $$
DECLARE
  configured_actor text;
  jwt_actor text;
BEGIN
  configured_actor := nullif(current_setting('app.audit.actor_user_id', true), '');
  IF configured_actor IS NOT NULL THEN
    BEGIN
      RETURN configured_actor::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
  END IF;

  BEGIN
    RETURN auth.uid();
  EXCEPTION WHEN others THEN
    NULL;
  END;

  jwt_actor := nullif(current_setting('request.jwt.claim.sub', true), '');
  IF jwt_actor IS NOT NULL THEN
    BEGIN
      RETURN jwt_actor::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_current_actor_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  configured_role text;
  jwt_role text;
BEGIN
  configured_role := nullif(current_setting('app.audit.actor_role', true), '');
  IF configured_role IS NOT NULL THEN
    RETURN configured_role;
  END IF;

  jwt_role := nullif(current_setting('request.jwt.claim.role', true), '');
  IF jwt_role IS NOT NULL THEN
    RETURN jwt_role;
  END IF;

  RETURN current_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_current_source()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  configured_source text;
  jwt_role text;
BEGIN
  configured_source := nullif(current_setting('app.audit.source', true), '');
  IF configured_source IS NOT NULL THEN
    RETURN configured_source;
  END IF;

  jwt_role := nullif(current_setting('request.jwt.claim.role', true), '');
  IF jwt_role = 'service_role' THEN
    RETURN 'service_role';
  END IF;

  IF nullif(current_setting('request.method', true), '') IS NOT NULL THEN
    RETURN 'client';
  END IF;

  RETURN 'database';
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_semantic_action(
  p_table text,
  p_old jsonb,
  p_new jsonb,
  p_operation text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  next_value text;
BEGIN
  IF p_operation = 'INSERT' THEN
    RETURN 'create';
  ELSIF p_operation = 'DELETE' THEN
    RETURN 'delete';
  END IF;

  IF p_old ? 'payment_status'
    AND p_new ? 'payment_status'
    AND (p_old ->> 'payment_status') IS DISTINCT FROM (p_new ->> 'payment_status') THEN
    next_value := lower(coalesce(p_new ->> 'payment_status', 'unknown'));
    IF next_value = 'partial' THEN
      RETURN 'payment_partial';
    END IF;
    RETURN 'payment_' || replace(next_value, ' ', '_');
  END IF;

  IF p_old ? 'permit_status'
    AND p_new ? 'permit_status'
    AND (p_old ->> 'permit_status') IS DISTINCT FROM (p_new ->> 'permit_status') THEN
    RETURN replace(lower(coalesce(p_new ->> 'permit_status', 'update')), ' ', '_');
  END IF;

  IF p_old ? 'verification_status'
    AND p_new ? 'verification_status'
    AND (p_old ->> 'verification_status') IS DISTINCT FROM (p_new ->> 'verification_status') THEN
    RETURN 'verification_' || replace(lower(coalesce(p_new ->> 'verification_status', 'update')), ' ', '_');
  END IF;

  IF p_old ? 'status'
    AND p_new ? 'status'
    AND (p_old ->> 'status') IS DISTINCT FROM (p_new ->> 'status') THEN
    RETURN replace(lower(coalesce(p_new ->> 'status', 'update')), ' ', '_');
  END IF;

  IF p_old ? 'is_hidden'
    AND p_new ? 'is_hidden'
    AND (p_old ->> 'is_hidden') IS DISTINCT FROM (p_new ->> 'is_hidden') THEN
    IF coalesce((p_new ->> 'is_hidden')::boolean, false) THEN
      RETURN 'hide';
    END IF;
    RETURN 'restore';
  END IF;

  IF p_old ? 'read'
    AND p_new ? 'read'
    AND (p_old ->> 'read') IS DISTINCT FROM (p_new ->> 'read') THEN
    IF coalesce((p_new ->> 'read')::boolean, false) THEN
      RETURN 'read';
    END IF;
    RETURN 'unread';
  END IF;

  RETURN 'update';
END;
$$;

CREATE OR REPLACE FUNCTION public.set_audit_context(
  p_actor_user_id uuid DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_actor_role text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_actor_user_id IS NOT NULL THEN
    PERFORM set_config('app.audit.actor_user_id', p_actor_user_id::text, true);
  END IF;

  IF nullif(btrim(coalesce(p_source, '')), '') IS NOT NULL THEN
    PERFORM set_config('app.audit.source', btrim(p_source), true);
  END IF;

  IF nullif(btrim(coalesce(p_actor_role, '')), '') IS NOT NULL THEN
    PERFORM set_config('app.audit.actor_role', btrim(p_actor_role), true);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_capture_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  old_row jsonb;
  new_row jsonb;
  active_row jsonb;
  event_id uuid;
  actor_id uuid;
  target_id uuid;
  field_name text;
  old_value jsonb;
  new_value jsonb;
BEGIN
  IF current_setting('app.audit.disabled', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_SCHEMA <> 'public'
    OR TG_TABLE_NAME = ANY (ARRAY[
      'audit_events',
      'audit_event_changes',
      'permit_audit_log',
      'studio_deletion_audit',
      'gig_deletion_audit',
      'group_deletion_audit'
    ]) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  BEGIN
    old_row := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN public.audit_redact_row(to_jsonb(OLD)) ELSE NULL END;
    new_row := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN public.audit_redact_row(to_jsonb(NEW)) ELSE NULL END;

    IF TG_OP = 'UPDATE' AND old_row = new_row THEN
      RETURN NEW;
    END IF;

    active_row := coalesce(new_row, old_row, '{}'::jsonb);
    actor_id := public.audit_current_actor_id();
    IF TG_TABLE_NAME = 'profiles' THEN
      target_id := public.audit_uuid_from_row(active_row, ARRAY['id']);
    ELSE
      target_id := public.audit_uuid_from_row(active_row, ARRAY[
        'user_id',
        'profile_id',
        'owner_id',
        'organizer_id',
        'author_id',
        'creator_id',
        'seller_id',
        'buyer_id',
        'reporter_id',
        'sender_id',
        'receiver_id',
        'applicant_id',
        'submitted_by_user_id',
        'managed_profile_id',
        'uploader_id',
        'follower_id',
        'followed_id',
        'target_user_id',
        'penalized_user_id',
        'beneficiary_user_id',
        'processed_by',
        'reviewed_by',
        'resolved_by_user_id'
      ]);
    END IF;

    IF actor_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = actor_id) THEN
      actor_id := NULL;
    END IF;

    IF target_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = target_id) THEN
      target_id := NULL;
    END IF;

    INSERT INTO public.audit_events (
      actor_user_id,
      target_user_id,
      actor_role,
      action,
      entity_schema,
      entity_table,
      entity_id,
      entity_label,
      source,
      request_id,
      metadata
    )
    VALUES (
      actor_id,
      target_id,
      public.audit_current_actor_role(),
      public.audit_semantic_action(TG_TABLE_NAME, old_row, new_row, TG_OP),
      TG_TABLE_SCHEMA,
      TG_TABLE_NAME,
      public.audit_row_id(active_row),
      public.audit_entity_label(TG_TABLE_NAME, active_row),
      public.audit_current_source(),
      nullif(current_setting('request.request_id', true), ''),
      jsonb_build_object('operation', TG_OP)
    )
    RETURNING id INTO event_id;

    IF TG_OP = 'UPDATE' THEN
      FOR field_name IN
        SELECT key FROM jsonb_object_keys(coalesce(old_row, '{}'::jsonb)) AS old_keys(key)
        UNION
        SELECT key FROM jsonb_object_keys(coalesce(new_row, '{}'::jsonb)) AS new_keys(key)
      LOOP
        old_value := old_row -> field_name;
        new_value := new_row -> field_name;

        IF old_value IS DISTINCT FROM new_value THEN
          INSERT INTO public.audit_event_changes (audit_event_id, column_name, old_value, new_value)
          VALUES (
            event_id,
            field_name,
            public.audit_text_value(old_value),
            public.audit_text_value(new_value)
          );
        END IF;
      END LOOP;
    ELSIF TG_OP = 'INSERT' THEN
      FOR field_name, new_value IN SELECT * FROM jsonb_each(coalesce(new_row, '{}'::jsonb)) LOOP
        INSERT INTO public.audit_event_changes (audit_event_id, column_name, old_value, new_value)
        VALUES (event_id, field_name, NULL, public.audit_text_value(new_value));
      END LOOP;
    ELSIF TG_OP = 'DELETE' THEN
      FOR field_name, old_value IN SELECT * FROM jsonb_each(coalesce(old_row, '{}'::jsonb)) LOOP
        INSERT INTO public.audit_event_changes (audit_event_id, column_name, old_value, new_value)
        VALUES (event_id, field_name, public.audit_text_value(old_value), NULL);
      END LOOP;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'audit_capture_row_change failed for %.% %: %',
      TG_TABLE_SCHEMA,
      TG_TABLE_NAME,
      TG_OP,
      SQLERRM;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_audit_feed(
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id text,
  entity_type text,
  action text,
  performer_name text,
  entity_name text,
  rejection_reason text,
  admin_notes text,
  amount numeric,
  refund_amount numeric,
  payment_status text,
  booking_status text,
  booking_id text,
  reference text,
  source text,
  changed_fields_count integer,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH audit_change_summary AS (
    SELECT
      audit_event_id,
      count(*)::integer AS changed_fields_count,
      string_agg(column_name, ', ' ORDER BY column_name) FILTER (WHERE column_name IS NOT NULL) AS changed_fields
    FROM public.audit_event_changes
    GROUP BY audit_event_id
  ),
  unified AS (
    SELECT
      ae.id::text AS id,
      ae.entity_table::text AS entity_type,
      ae.action::text AS action,
      coalesce(actor.full_name, actor.email, ae.actor_user_id::text, ae.actor_role, 'System')::text AS performer_name,
      coalesce(ae.entity_label, ae.entity_table || ':' || ae.entity_id)::text AS entity_name,
      NULL::text AS rejection_reason,
      concat_ws(
        ' | ',
        'Source: ' || ae.source,
        CASE
          WHEN acs.changed_fields IS NOT NULL AND acs.changed_fields <> ''
            THEN 'Changed: ' || left(acs.changed_fields, 500)
          ELSE NULL
        END
      )::text AS admin_notes,
      NULL::numeric AS amount,
      NULL::numeric AS refund_amount,
      CASE WHEN ae.action LIKE 'payment_%' THEN replace(ae.action, 'payment_', '') ELSE NULL END::text AS payment_status,
      NULL::text AS booking_status,
      CASE WHEN ae.entity_table = 'studio_bookings' THEN ae.entity_id ELSE NULL END::text AS booking_id,
      ae.entity_id::text AS reference,
      ae.source::text AS source,
      coalesce(acs.changed_fields_count, 0)::integer AS changed_fields_count,
      ae.occurred_at AS created_at
    FROM public.audit_events ae
    LEFT JOIN public.profiles actor ON actor.id = ae.actor_user_id
    LEFT JOIN audit_change_summary acs ON acs.audit_event_id = ae.id

    UNION ALL

    SELECT
      'permit-' || pal.id::text AS id,
      pal.entity_type::text AS entity_type,
      pal.action::text AS action,
      coalesce(actor.full_name, actor.email, 'System')::text AS performer_name,
      coalesce(
        pal.metadata ->> 'entity_name',
        pal.entity_type || ':' || pal.entity_id::text
      )::text AS entity_name,
      coalesce(pal.rejection_reason, pal.reason)::text AS rejection_reason,
      coalesce(pal.admin_notes, pal.notes)::text AS admin_notes,
      NULL::numeric AS amount,
      NULL::numeric AS refund_amount,
      NULL::text AS payment_status,
      NULL::text AS booking_status,
      NULL::text AS booking_id,
      pal.entity_id::text AS reference,
      'permit-management'::text AS source,
      0::integer AS changed_fields_count,
      pal.created_at AS created_at
    FROM public.permit_audit_log pal
    LEFT JOIN public.profiles actor ON actor.id = pal.performed_by

    UNION ALL

    SELECT
      'studio-delete-' || sda.id::text AS id,
      'studio'::text AS entity_type,
      'delete'::text AS action,
      coalesce(actor.full_name, actor.email, 'System')::text AS performer_name,
      coalesce(sda.studio_snapshot ->> 'name', 'Studio ' || sda.studio_id::text)::text AS entity_name,
      sda.reason::text AS rejection_reason,
      'Existing studio deletion audit'::text AS admin_notes,
      NULL::numeric,
      NULL::numeric,
      NULL::text,
      NULL::text,
      NULL::text,
      sda.studio_id::text,
      'safe-delete-rpc'::text,
      0::integer,
      sda.deleted_at
    FROM public.studio_deletion_audit sda
    LEFT JOIN public.profiles actor ON actor.id = sda.deleted_by

    UNION ALL

    SELECT
      'gig-delete-' || gda.id::text AS id,
      'gig'::text AS entity_type,
      'delete'::text AS action,
      coalesce(actor.full_name, actor.email, 'System')::text AS performer_name,
      coalesce(gda.gig_snapshot ->> 'name', 'Gig ' || gda.gig_id::text)::text AS entity_name,
      gda.reason::text AS rejection_reason,
      'Existing gig deletion audit'::text AS admin_notes,
      NULL::numeric,
      NULL::numeric,
      NULL::text,
      NULL::text,
      NULL::text,
      gda.gig_id::text,
      'safe-delete-rpc'::text,
      0::integer,
      gda.deleted_at
    FROM public.gig_deletion_audit gda
    LEFT JOIN public.profiles actor ON actor.id = gda.deleted_by

    UNION ALL

    SELECT
      'group-delete-' || gda.id::text AS id,
      'group'::text AS entity_type,
      'delete'::text AS action,
      coalesce(actor.full_name, actor.email, 'System')::text AS performer_name,
      coalesce(gda.group_snapshot ->> 'name', 'Group ' || gda.group_id::text)::text AS entity_name,
      gda.reason::text AS rejection_reason,
      'Existing group deletion audit'::text AS admin_notes,
      NULL::numeric,
      NULL::numeric,
      NULL::text,
      NULL::text,
      NULL::text,
      gda.group_id::text,
      'safe-delete-rpc'::text,
      0::integer,
      gda.deleted_at
    FROM public.group_deletion_audit gda
    LEFT JOIN public.profiles actor ON actor.id = gda.deleted_by
  )
  SELECT *
  FROM unified
  WHERE public.is_admin(auth.uid())
  ORDER BY created_at DESC
  LIMIT greatest(1, least(500, coalesce(p_limit, 200)))
  OFFSET greatest(0, coalesce(p_offset, 0));
$$;

REVOKE ALL ON FUNCTION public.audit_redact_row(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_text_value(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_row_id(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_entity_label(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_uuid_from_row(jsonb, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_current_actor_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_current_actor_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_current_source() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_semantic_action(text, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_capture_row_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_audit_context(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_audit_context(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_audit_feed(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_audit_feed(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_audit_feed(integer, integer) TO service_role;

DO $$
DECLARE
  table_record record;
BEGIN
  FOR table_record IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> ALL (ARRAY[
        'audit_events',
        'audit_event_changes',
        'permit_audit_log',
        'studio_deletion_audit',
        'gig_deletion_audit',
        'group_deletion_audit'
      ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON public.%I',
      'audit_capture_' || table_record.tablename,
      table_record.tablename
    );

    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_capture_row_change()',
      'audit_capture_' || table_record.tablename,
      table_record.tablename
    );
  END LOOP;
END;
$$;

COMMIT;
