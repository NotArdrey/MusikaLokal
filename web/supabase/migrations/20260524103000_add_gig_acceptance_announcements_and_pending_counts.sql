BEGIN;
-- Track whether an accepted gig participant wants to publish an acceptance announcement.
ALTER TABLE public.gig_applications
  ADD COLUMN IF NOT EXISTS acceptance_announcement_status text NOT NULL DEFAULT 'not_available',
  ADD COLUMN IF NOT EXISTS acceptance_announcement_prompted_at timestamptz,
  ADD COLUMN IF NOT EXISTS acceptance_announcement_dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS acceptance_announcement_posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS acceptance_announcement_post_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gig_applications_acceptance_announcement_status_check'
      AND conrelid = 'public.gig_applications'::regclass
  ) THEN
    ALTER TABLE public.gig_applications
      ADD CONSTRAINT gig_applications_acceptance_announcement_status_check
      CHECK (
        acceptance_announcement_status = ANY (
          ARRAY[
            'not_available'::text,
            'available'::text,
            'dismissed'::text,
            'posted'::text
          ]
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gig_applications_acceptance_announcement_post_id_fkey'
      AND conrelid = 'public.gig_applications'::regclass
  ) THEN
    ALTER TABLE public.gig_applications
      ADD CONSTRAINT gig_applications_acceptance_announcement_post_id_fkey
      FOREIGN KEY (acceptance_announcement_post_id)
      REFERENCES public.feed_posts(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gig_applications_acceptance_announcement_applicant
  ON public.gig_applications (applicant_id, updated_at DESC)
  WHERE acceptance_announcement_status = 'available'
    AND status = ANY (ARRAY['accepted'::text, 'approved'::text]);

CREATE INDEX IF NOT EXISTS idx_gig_applications_acceptance_announcement_submitter
  ON public.gig_applications (submitted_by_user_id, updated_at DESC)
  WHERE submitted_by_user_id IS NOT NULL
    AND acceptance_announcement_status = 'available'
    AND status = ANY (ARRAY['accepted'::text, 'approved'::text]);

COMMENT ON COLUMN public.gig_applications.acceptance_announcement_status IS
  'Participant-controlled publication state for accepted gig announcement posts.';
COMMENT ON COLUMN public.gig_applications.acceptance_announcement_post_id IS
  'Feed post created when the accepted participant publishes their acceptance announcement.';

CREATE OR REPLACE FUNCTION public.accept_gig_application_safely(
  p_application_id uuid,
  p_actor_user_id uuid,
  p_new_status text DEFAULT 'accepted'::text
)
RETURNS public.gig_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app public.gig_applications%ROWTYPE;
  v_gig record;
  v_slot_type text;
  v_total_needed integer := 0;
  v_slot_needed integer := 0;
  v_total_filled integer := 0;
  v_slot_filled integer := 0;
BEGIN
  IF p_new_status NOT IN ('accepted', 'approved') THEN
    RAISE EXCEPTION 'Unsupported accepted status: %', p_new_status USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_app
  FROM public.gig_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT id, organizer_id, status
  INTO v_gig
  FROM public.gigs
  WHERE id = v_app.gig_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gig not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_gig.organizer_id IS DISTINCT FROM p_actor_user_id
     AND NOT COALESCE(public.staff_can_manage_gig_applications(p_actor_user_id, v_app.gig_id), false) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_app.leader_approval_status = 'pending' THEN
    RAISE EXCEPTION 'Application is still awaiting group leader approval' USING ERRCODE = 'P0001';
  END IF;

  IF v_app.status = p_new_status THEN
    IF v_app.acceptance_announcement_status = 'not_available' THEN
      UPDATE public.gig_applications
      SET acceptance_announcement_status = 'available',
          acceptance_announcement_prompted_at = COALESCE(acceptance_announcement_prompted_at, timezone('utc', now())),
          acceptance_announcement_dismissed_at = NULL,
          updated_at = timezone('utc', now())
      WHERE id = v_app.id
      RETURNING * INTO v_app;
    END IF;

    RETURN v_app;
  END IF;

  IF v_app.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending applications can be accepted' USING ERRCODE = 'P0001';
  END IF;

  v_slot_type := COALESCE(v_app.slot_type, CASE WHEN v_app.group_id IS NULL THEN 'solo' ELSE 'band' END);

  SELECT COALESCE((gr.requirement_value #>> '{}')::integer, 0)
  INTO v_total_needed
  FROM public.gig_requirements gr
  WHERE gr.gig_id = v_app.gig_id
    AND gr.requirement_key = 'total_slots_needed';

  SELECT COALESCE((gr.requirement_value -> v_slot_type ->> 'needed')::integer, 0)
  INTO v_slot_needed
  FROM public.gig_requirements gr
  WHERE gr.gig_id = v_app.gig_id
    AND gr.requirement_key = 'slots';

  SELECT count(*)
  INTO v_total_filled
  FROM public.gig_applications ga
  WHERE ga.gig_id = v_app.gig_id
    AND ga.id <> v_app.id
    AND ga.status = ANY (ARRAY['accepted'::text, 'approved'::text]);

  SELECT count(*)
  INTO v_slot_filled
  FROM public.gig_applications ga
  WHERE ga.gig_id = v_app.gig_id
    AND ga.id <> v_app.id
    AND COALESCE(ga.slot_type, CASE WHEN ga.group_id IS NULL THEN 'solo' ELSE 'band' END) = v_slot_type
    AND ga.status = ANY (ARRAY['accepted'::text, 'approved'::text]);

  IF v_total_needed > 0 AND v_total_filled >= v_total_needed THEN
    RAISE EXCEPTION 'All performer slots for this gig have been filled.' USING ERRCODE = 'P0001';
  END IF;

  IF v_slot_needed <= 0 THEN
    RAISE EXCEPTION 'This gig does not have an available % slot.', v_slot_type USING ERRCODE = 'P0001';
  END IF;

  IF v_slot_filled >= v_slot_needed THEN
    RAISE EXCEPTION 'All % slots have been filled. Try a different slot type.', v_slot_type USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.gig_applications
  SET status = p_new_status,
      acceptance_announcement_status = CASE
        WHEN acceptance_announcement_status = 'posted' THEN 'posted'
        ELSE 'available'
      END,
      acceptance_announcement_prompted_at = CASE
        WHEN acceptance_announcement_status = 'posted' THEN acceptance_announcement_prompted_at
        ELSE COALESCE(acceptance_announcement_prompted_at, timezone('utc', now()))
      END,
      acceptance_announcement_dismissed_at = CASE
        WHEN acceptance_announcement_status = 'posted' THEN acceptance_announcement_dismissed_at
        ELSE NULL
      END,
      updated_at = timezone('utc', now())
  WHERE id = v_app.id
  RETURNING * INTO v_app;

  RETURN v_app;
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_gig_application_safely(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_gig_application_safely(uuid, uuid, text) TO service_role;

CREATE OR REPLACE VIEW public.gigs_with_stats AS
 SELECT g.id,
    g.organizer_id,
    g.name,
    g.location,
    g.budget,
    g.description,
    g.event_date,
    glp.requirements,
    glp.images,
    glp.documents,
    g.status,
    g.latitude,
    g.longitude,
    g.created_at,
    g.embedding,
    g.rate,
    g.contract_url,
    g.business_permit_url,
    COALESCE(gap.availability, '[]'::jsonb) AS availability,
    g.address_verification_status,
    g.address_verification_session_id,
    g.address_verified_at,
    g.verified_address,
    g.address_verification_completed_at,
    COALESCE(avg(r.rating), 0::numeric) AS rating,
    count(r.id) AS review_count,
    g.permit_status,
    g.permit_rejection_reason,
    g.permit_admin_notes,
    g.permit_reviewed_by,
    g.permit_reviewed_at,
    g.permit_resubmissions_used,
    g.total_slots_filled,
    COALESCE(pending_apps.pending_applicant_count, 0)::integer AS pending_applicant_count
   FROM public.gigs g
     LEFT JOIN public.reviews r ON r.gig_id = g.id
     LEFT JOIN public.gigs_legacy_projection glp ON glp.id = g.id
     LEFT JOIN public.gigs_availability_projection gap ON gap.gig_id = g.id
     LEFT JOIN (
       SELECT ga.gig_id,
          count(*)::integer AS pending_applicant_count
         FROM public.gig_applications ga
        WHERE ga.status = 'pending'::text
          AND (
            ga.leader_approval_status IS NULL
            OR ga.leader_approval_status = 'approved'::text
          )
        GROUP BY ga.gig_id
     ) pending_apps ON pending_apps.gig_id = g.id
  GROUP BY g.id, g.organizer_id, g.name, g.location, g.budget, g.description, g.event_date,
    glp.requirements, glp.images, glp.documents, g.status, g.latitude, g.longitude,
    g.created_at, g.embedding, g.rate, g.contract_url, g.business_permit_url,
    gap.availability, g.address_verification_status, g.address_verification_session_id,
    g.address_verified_at, g.verified_address, g.address_verification_completed_at,
    g.permit_status, g.permit_rejection_reason, g.permit_admin_notes, g.permit_reviewed_by,
    g.permit_reviewed_at, g.permit_resubmissions_used, g.total_slots_filled,
    pending_apps.pending_applicant_count;
;
COMMIT;
