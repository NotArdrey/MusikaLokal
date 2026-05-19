BEGIN;

-- Audit attribution must survive profile deletion. Keep these values as
-- historical identifiers instead of live foreign keys.
ALTER TABLE public.audit_events
  DROP CONSTRAINT IF EXISTS audit_events_actor_user_id_fkey,
  DROP CONSTRAINT IF EXISTS audit_events_target_user_id_fkey;

COMMENT ON COLUMN public.audit_events.actor_user_id IS
  'Historical actor profile id. Intentionally not a foreign key so profile deletion cannot erase audit attribution.';
COMMENT ON COLUMN public.audit_events.target_user_id IS
  'Historical target profile id. Intentionally not a foreign key so profile deletion cannot erase audit attribution.';

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

REVOKE ALL ON FUNCTION public.admin_audit_feed(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_audit_feed(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_audit_feed(integer, integer) TO service_role;

COMMIT;
