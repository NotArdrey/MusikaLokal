-- Production safety hardening for gig applications, studio bookings, and exposed 3NF tables.

ALTER TABLE public.gig_applications
  ADD COLUMN IF NOT EXISTS performer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.gig_applications.performer_snapshot IS
  'Immutable-ish display snapshot of the selected production roster performer at application time.';

CREATE OR REPLACE FUNCTION public.build_production_roster_snapshot(p_roster_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_snapshot jsonb;
BEGIN
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'roster_id', ptr.id,
    'team_id', ptr.team_id,
    'entity_kind', ptr.entity_kind,
    'profile_id', ptr.profile_id,
    'group_id', ptr.group_id,
    'display_name', COALESCE(p.full_name, g.name, 'Selected performer'),
    'avatar_url', p.avatar_url,
    'group_type', g.group_type,
    'group_genre', g.genre,
    'captured_at', timezone('utc', now())
  ))
  INTO v_snapshot
  FROM public.production_team_roster ptr
  LEFT JOIN public.profiles p ON p.id = ptr.profile_id
  LEFT JOIN public.groups g ON g.id = ptr.group_id
  WHERE ptr.id = p_roster_id;

  RETURN COALESCE(v_snapshot, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_gig_application_performer_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.production_roster_id IS NOT NULL
    AND (
      TG_OP = 'INSERT'
      OR NEW.production_roster_id IS DISTINCT FROM OLD.production_roster_id
      OR NEW.performer_snapshot IS NULL
      OR NEW.performer_snapshot = '{}'::jsonb
    )
  THEN
    NEW.performer_snapshot := public.build_production_roster_snapshot(NEW.production_roster_id);
  END IF;

  IF NEW.performer_snapshot IS NULL THEN
    NEW.performer_snapshot := '{}'::jsonb;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gig_application_performer_snapshot ON public.gig_applications;
CREATE TRIGGER trg_gig_application_performer_snapshot
  BEFORE INSERT OR UPDATE OF production_roster_id, performer_snapshot
  ON public.gig_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_gig_application_performer_snapshot();

UPDATE public.gig_applications ga
SET performer_snapshot = public.build_production_roster_snapshot(ga.production_roster_id)
WHERE ga.production_roster_id IS NOT NULL
  AND (ga.performer_snapshot IS NULL OR ga.performer_snapshot = '{}'::jsonb);

DROP INDEX IF EXISTS public.idx_gig_applications_unique_active_group_application;
DROP INDEX IF EXISTS public.idx_gig_applications_unique_direct_applicant;
DROP INDEX IF EXISTS public.idx_gig_applications_unique_group;
DROP INDEX IF EXISTS public.idx_gig_applications_unique_production_team;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gig_applications_unique_active_direct_applicant
  ON public.gig_applications (gig_id, applicant_id)
  WHERE group_id IS NULL
    AND production_team_id IS NULL
    AND status = ANY (ARRAY['pending'::text, 'accepted'::text, 'approved'::text]);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gig_applications_unique_active_group_application
  ON public.gig_applications (gig_id, group_id)
  WHERE group_id IS NOT NULL
    AND production_team_id IS NULL
    AND status = ANY (ARRAY['pending'::text, 'accepted'::text, 'approved'::text]);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gig_applications_unique_active_production_team
  ON public.gig_applications (gig_id, production_team_id)
  WHERE production_team_id IS NOT NULL
    AND status = ANY (ARRAY['pending'::text, 'accepted'::text, 'approved'::text]);

CREATE OR REPLACE FUNCTION public.prevent_repeated_gig_application_cancellations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cancelled_count integer := 0;
BEGIN
  IF TG_OP <> 'INSERT' OR NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  IF NEW.production_team_id IS NOT NULL THEN
    SELECT count(*)
    INTO v_cancelled_count
    FROM public.gig_applications ga
    WHERE ga.gig_id = NEW.gig_id
      AND ga.production_team_id = NEW.production_team_id
      AND ga.status = 'cancelled'
      AND ga.updated_at >= timezone('utc', now()) - interval '30 days';
  ELSIF NEW.group_id IS NOT NULL THEN
    SELECT count(*)
    INTO v_cancelled_count
    FROM public.gig_applications ga
    WHERE ga.gig_id = NEW.gig_id
      AND ga.group_id = NEW.group_id
      AND ga.production_team_id IS NULL
      AND ga.status = 'cancelled'
      AND ga.updated_at >= timezone('utc', now()) - interval '30 days';
  ELSE
    SELECT count(*)
    INTO v_cancelled_count
    FROM public.gig_applications ga
    WHERE ga.gig_id = NEW.gig_id
      AND ga.applicant_id = NEW.applicant_id
      AND ga.group_id IS NULL
      AND ga.production_team_id IS NULL
      AND ga.status = 'cancelled'
      AND ga.updated_at >= timezone('utc', now()) - interval '30 days';
  END IF;

  IF v_cancelled_count >= 3 THEN
    RAISE EXCEPTION 'Maximum attempts reached for this gig.'
      USING ERRCODE = 'P0001',
            HINT = 'This applicant entity cancelled applications to this gig 3 times in the last 30 days.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_repeated_gig_application_cancellations ON public.gig_applications;
CREATE TRIGGER trg_prevent_repeated_gig_application_cancellations
  BEFORE INSERT ON public.gig_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_repeated_gig_application_cancellations();

CREATE OR REPLACE FUNCTION public.accept_gig_application_safely(
  p_application_id uuid,
  p_actor_user_id uuid,
  p_new_status text DEFAULT 'accepted'
)
RETURNS public.gig_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  IF v_gig.organizer_id IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_app.leader_approval_status = 'pending' THEN
    RAISE EXCEPTION 'Application is still awaiting group leader approval' USING ERRCODE = 'P0001';
  END IF;

  IF v_app.status = p_new_status THEN
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
      updated_at = timezone('utc', now())
  WHERE id = v_app.id
  RETURNING * INTO v_app;

  RETURN v_app;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_gig_application_safely(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_gig_application_safely(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.are_slots_available(
  p_studio_id uuid,
  p_booking_date date,
  p_time_slots jsonb,
  p_user_id uuid DEFAULT NULL::uuid,
  p_exclude_booking_id uuid DEFAULT NULL::uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  slot jsonb;
  other_slot jsonb;
  slot_start time;
  slot_end time;
  other_start time;
  other_end time;
  v_day_of_week integer;
  v_has_override boolean;
  v_seen_slots jsonb := '[]'::jsonb;
BEGIN
  IF p_time_slots IS NULL
    OR jsonb_typeof(p_time_slots) <> 'array'
    OR jsonb_array_length(p_time_slots) = 0
  THEN
    RETURN FALSE;
  END IF;

  FOR slot IN SELECT * FROM jsonb_array_elements(p_time_slots)
  LOOP
    BEGIN
      slot_start := (slot->>'start')::time;
      slot_end := (slot->>'end')::time;
    EXCEPTION WHEN OTHERS THEN
      RETURN FALSE;
    END;

    IF slot_end <= slot_start THEN
      RETURN FALSE;
    END IF;

    FOR other_slot IN SELECT * FROM jsonb_array_elements(v_seen_slots)
    LOOP
      BEGIN
        other_start := (other_slot->>'start')::time;
        other_end := (other_slot->>'end')::time;
      EXCEPTION WHEN OTHERS THEN
        RETURN FALSE;
      END;

      IF slot_start < other_end AND slot_end > other_start THEN
        RETURN FALSE;
      END IF;
    END LOOP;

    v_seen_slots := v_seen_slots || jsonb_build_array(
      jsonb_build_object('start', slot_start::text, 'end', slot_end::text)
    );
  END LOOP;

  v_day_of_week := EXTRACT(DOW FROM p_booking_date)::integer;

  SELECT EXISTS (
    SELECT 1
    FROM public.studio_date_overrides
    WHERE studio_id = p_studio_id
      AND override_date = p_booking_date
  )
  INTO v_has_override;

  FOR slot IN SELECT * FROM jsonb_array_elements(p_time_slots)
  LOOP
    slot_start := (slot->>'start')::time;
    slot_end := (slot->>'end')::time;

    IF v_has_override THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.studio_date_overrides sdo
        WHERE sdo.studio_id = p_studio_id
          AND sdo.override_date = p_booking_date
          AND sdo.is_open = true
          AND sdo.open_time <= slot_start
          AND sdo.close_time >= slot_end
      ) THEN
        RETURN FALSE;
      END IF;
    ELSE
      IF NOT EXISTS (
        SELECT 1
        FROM public.studio_operating_hours soh
        WHERE soh.studio_id = p_studio_id
          AND soh.day_of_week = v_day_of_week
          AND soh.is_open = true
          AND soh.open_time <= slot_start
          AND soh.close_time >= slot_end
      ) THEN
        RETURN FALSE;
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.studio_bookings sb
      JOIN public.studio_booking_slots sbs
        ON sbs.booking_id = sb.id
      WHERE sb.studio_id = p_studio_id
        AND sb.booking_date = p_booking_date
        AND sb.status NOT IN ('cancelled', 'rejected')
        AND (p_exclude_booking_id IS NULL OR sb.id <> p_exclude_booking_id)
        AND (sbs.start_time < slot_end AND sbs.end_time > slot_start)
    ) THEN
      RETURN FALSE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.booking_holds bh
      WHERE bh.studio_id = p_studio_id
        AND bh.booking_date = p_booking_date
        AND bh.expires_at > now()
        AND (p_user_id IS NULL OR bh.user_id <> p_user_id)
        AND (bh.start_time < slot_end AND bh.end_time > slot_start)
    ) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_unresolved_studio_payments(p_threshold_minutes integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE public.studio_bookings sb
  SET
    status = 'cancelled',
    cancellation_reason = 'Payment not received within time limit',
    updated_at = timezone('utc', now())
  WHERE sb.status IN ('pending', 'confirmed')
    AND sb.payment_status IN ('unpaid', 'pending', 'failed')
    AND sb.created_at < timezone('utc', now()) - make_interval(mins => GREATEST(COALESCE(p_threshold_minutes, 30), 1));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_unresolved_studio_payments(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unresolved_studio_payments(integer) TO service_role;

DO $$
BEGIN
  BEGIN
    EXECUTE 'create extension if not exists pg_cron';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension unavailable: %', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    BEGIN
      IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire_unresolved_studio_payments_every_5_minutes') THEN
        PERFORM cron.unschedule((SELECT jobid FROM cron.job WHERE jobname = 'expire_unresolved_studio_payments_every_5_minutes' LIMIT 1));
      END IF;

      PERFORM cron.schedule(
        'expire_unresolved_studio_payments_every_5_minutes',
        '*/5 * * * *',
        $job$select public.expire_unresolved_studio_payments(30);$job$
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not schedule unresolved studio payment expiry: %', SQLERRM;
    END;
  END IF;
END;
$$;

-- RLS hardening for exposed 3NF/public-support tables.
ALTER TABLE public.email_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_operating_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_date_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_owner_penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_portfolio_urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gig_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gig_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gig_availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_open_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_roster_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_booking_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normalization_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gig_slot_fill_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gig_slot_fill_applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY studio_settings_public_read ON public.studio_settings FOR SELECT TO public USING (true);
CREATE POLICY studio_settings_owner_insert ON public.studio_settings FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_settings.studio_id AND s.owner_id = auth.uid()));
CREATE POLICY studio_settings_owner_update ON public.studio_settings FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_settings.studio_id AND s.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_settings.studio_id AND s.owner_id = auth.uid()));
CREATE POLICY studio_settings_owner_delete ON public.studio_settings FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_settings.studio_id AND s.owner_id = auth.uid()));

CREATE POLICY studio_hours_public_read ON public.studio_operating_hours FOR SELECT TO public USING (true);
CREATE POLICY studio_hours_owner_insert ON public.studio_operating_hours FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_operating_hours.studio_id AND s.owner_id = auth.uid()));
CREATE POLICY studio_hours_owner_update ON public.studio_operating_hours FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_operating_hours.studio_id AND s.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_operating_hours.studio_id AND s.owner_id = auth.uid()));
CREATE POLICY studio_hours_owner_delete ON public.studio_operating_hours FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_operating_hours.studio_id AND s.owner_id = auth.uid()));

CREATE POLICY studio_overrides_public_read ON public.studio_date_overrides FOR SELECT TO public USING (true);
CREATE POLICY studio_overrides_owner_insert ON public.studio_date_overrides FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_date_overrides.studio_id AND s.owner_id = auth.uid()));
CREATE POLICY studio_overrides_owner_update ON public.studio_date_overrides FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_date_overrides.studio_id AND s.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_date_overrides.studio_id AND s.owner_id = auth.uid()));
CREATE POLICY studio_overrides_owner_delete ON public.studio_date_overrides FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_date_overrides.studio_id AND s.owner_id = auth.uid()));

CREATE POLICY booking_holds_participant_read ON public.booking_holds FOR SELECT TO authenticated USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.studios s WHERE s.id = booking_holds.studio_id AND s.owner_id = auth.uid()));
CREATE POLICY booking_holds_user_insert ON public.booking_holds FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY booking_holds_user_delete ON public.booking_holds FOR DELETE TO authenticated USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.studios s WHERE s.id = booking_holds.studio_id AND s.owner_id = auth.uid()));

CREATE POLICY wallets_owner_read ON public.wallets FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY wallet_transactions_owner_read ON public.wallet_transactions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.wallets w WHERE w.id = wallet_transactions.wallet_id AND w.user_id = auth.uid()));

CREATE POLICY studio_owner_penalties_owner_read ON public.studio_owner_penalties FOR SELECT TO authenticated USING (owner_id = auth.uid());

CREATE POLICY profile_skills_public_read ON public.profile_skills FOR SELECT TO public USING (true);
CREATE POLICY profile_skills_owner_insert ON public.profile_skills FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
CREATE POLICY profile_skills_owner_delete ON public.profile_skills FOR DELETE TO authenticated USING (profile_id = auth.uid());

CREATE POLICY profile_genres_public_read ON public.profile_genres FOR SELECT TO public USING (true);
CREATE POLICY profile_genres_owner_insert ON public.profile_genres FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
CREATE POLICY profile_genres_owner_delete ON public.profile_genres FOR DELETE TO authenticated USING (profile_id = auth.uid());

CREATE POLICY profile_portfolio_public_read ON public.profile_portfolio_urls FOR SELECT TO public USING (true);
CREATE POLICY profile_portfolio_owner_insert ON public.profile_portfolio_urls FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
CREATE POLICY profile_portfolio_owner_update ON public.profile_portfolio_urls FOR UPDATE TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
CREATE POLICY profile_portfolio_owner_delete ON public.profile_portfolio_urls FOR DELETE TO authenticated USING (profile_id = auth.uid());

CREATE POLICY gig_requirements_public_read ON public.gig_requirements FOR SELECT TO public USING (true);
CREATE POLICY gig_requirements_owner_insert ON public.gig_requirements FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.gigs g WHERE g.id = gig_requirements.gig_id AND g.organizer_id = auth.uid()));
CREATE POLICY gig_requirements_owner_update ON public.gig_requirements FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.gigs g WHERE g.id = gig_requirements.gig_id AND g.organizer_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.gigs g WHERE g.id = gig_requirements.gig_id AND g.organizer_id = auth.uid()));
CREATE POLICY gig_requirements_owner_delete ON public.gig_requirements FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.gigs g WHERE g.id = gig_requirements.gig_id AND g.organizer_id = auth.uid()));

CREATE POLICY gig_media_public_read ON public.gig_media FOR SELECT TO public USING (true);
CREATE POLICY gig_media_owner_insert ON public.gig_media FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.gigs g WHERE g.id = gig_media.gig_id AND g.organizer_id = auth.uid()));
CREATE POLICY gig_media_owner_update ON public.gig_media FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.gigs g WHERE g.id = gig_media.gig_id AND g.organizer_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.gigs g WHERE g.id = gig_media.gig_id AND g.organizer_id = auth.uid()));
CREATE POLICY gig_media_owner_delete ON public.gig_media FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.gigs g WHERE g.id = gig_media.gig_id AND g.organizer_id = auth.uid()));

CREATE POLICY gig_availability_public_read ON public.gig_availability_slots FOR SELECT TO public USING (true);
CREATE POLICY gig_availability_owner_insert ON public.gig_availability_slots FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.gigs g WHERE g.id = gig_availability_slots.gig_id AND g.organizer_id = auth.uid()));
CREATE POLICY gig_availability_owner_update ON public.gig_availability_slots FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.gigs g WHERE g.id = gig_availability_slots.gig_id AND g.organizer_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.gigs g WHERE g.id = gig_availability_slots.gig_id AND g.organizer_id = auth.uid()));
CREATE POLICY gig_availability_owner_delete ON public.gig_availability_slots FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.gigs g WHERE g.id = gig_availability_slots.gig_id AND g.organizer_id = auth.uid()));

CREATE POLICY studio_amenities_public_read ON public.studio_amenities FOR SELECT TO public USING (true);
CREATE POLICY studio_amenities_owner_insert ON public.studio_amenities FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_amenities.studio_id AND s.owner_id = auth.uid()));
CREATE POLICY studio_amenities_owner_delete ON public.studio_amenities FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_amenities.studio_id AND s.owner_id = auth.uid()));

CREATE POLICY studio_types_public_read ON public.studio_types FOR SELECT TO public USING (true);
CREATE POLICY studio_types_owner_insert ON public.studio_types FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_types.studio_id AND s.owner_id = auth.uid()));
CREATE POLICY studio_types_owner_delete ON public.studio_types FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_types.studio_id AND s.owner_id = auth.uid()));

CREATE POLICY studio_media_public_read ON public.studio_media FOR SELECT TO public USING (true);
CREATE POLICY studio_media_owner_insert ON public.studio_media FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_media.studio_id AND s.owner_id = auth.uid()));
CREATE POLICY studio_media_owner_update ON public.studio_media FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_media.studio_id AND s.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_media.studio_id AND s.owner_id = auth.uid()));
CREATE POLICY studio_media_owner_delete ON public.studio_media FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_media.studio_id AND s.owner_id = auth.uid()));

CREATE POLICY studio_instruments_public_read ON public.studio_instruments FOR SELECT TO public USING (true);
CREATE POLICY studio_instruments_owner_insert ON public.studio_instruments FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_instruments.studio_id AND s.owner_id = auth.uid()));
CREATE POLICY studio_instruments_owner_update ON public.studio_instruments FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_instruments.studio_id AND s.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_instruments.studio_id AND s.owner_id = auth.uid()));
CREATE POLICY studio_instruments_owner_delete ON public.studio_instruments FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_instruments.studio_id AND s.owner_id = auth.uid()));

CREATE POLICY studio_availability_public_read ON public.studio_availability_slots FOR SELECT TO public USING (true);
CREATE POLICY studio_availability_owner_insert ON public.studio_availability_slots FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_availability_slots.studio_id AND s.owner_id = auth.uid()));
CREATE POLICY studio_availability_owner_update ON public.studio_availability_slots FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_availability_slots.studio_id AND s.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_availability_slots.studio_id AND s.owner_id = auth.uid()));
CREATE POLICY studio_availability_owner_delete ON public.studio_availability_slots FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_availability_slots.studio_id AND s.owner_id = auth.uid()));

CREATE POLICY studio_open_dates_public_read ON public.studio_open_dates FOR SELECT TO public USING (true);
CREATE POLICY studio_open_dates_owner_insert ON public.studio_open_dates FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_open_dates.studio_id AND s.owner_id = auth.uid()));
CREATE POLICY studio_open_dates_owner_update ON public.studio_open_dates FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_open_dates.studio_id AND s.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_open_dates.studio_id AND s.owner_id = auth.uid()));
CREATE POLICY studio_open_dates_owner_delete ON public.studio_open_dates FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_open_dates.studio_id AND s.owner_id = auth.uid()));

CREATE POLICY group_media_public_read ON public.group_media FOR SELECT TO public USING (true);
CREATE POLICY group_media_owner_insert ON public.group_media FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_media.group_id AND g.owner_id = auth.uid()));
CREATE POLICY group_media_owner_update ON public.group_media FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_media.group_id AND g.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_media.group_id AND g.owner_id = auth.uid()));
CREATE POLICY group_media_owner_delete ON public.group_media FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_media.group_id AND g.owner_id = auth.uid()));

CREATE POLICY group_roster_public_read ON public.group_roster_members FOR SELECT TO public USING (true);
CREATE POLICY group_roster_owner_insert ON public.group_roster_members FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_roster_members.group_id AND g.owner_id = auth.uid()));
CREATE POLICY group_roster_owner_update ON public.group_roster_members FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_roster_members.group_id AND g.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_roster_members.group_id AND g.owner_id = auth.uid()));
CREATE POLICY group_roster_owner_delete ON public.group_roster_members FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_roster_members.group_id AND g.owner_id = auth.uid()));

CREATE POLICY group_availability_public_read ON public.group_availability_slots FOR SELECT TO public USING (true);
CREATE POLICY group_availability_owner_insert ON public.group_availability_slots FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_availability_slots.group_id AND g.owner_id = auth.uid()));
CREATE POLICY group_availability_owner_update ON public.group_availability_slots FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_availability_slots.group_id AND g.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_availability_slots.group_id AND g.owner_id = auth.uid()));
CREATE POLICY group_availability_owner_delete ON public.group_availability_slots FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_availability_slots.group_id AND g.owner_id = auth.uid()));

CREATE POLICY studio_booking_slots_participant_read ON public.studio_booking_slots FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1
    FROM public.studio_bookings sb
    JOIN public.studios s ON s.id = sb.studio_id
    WHERE sb.id = studio_booking_slots.booking_id
      AND (sb.user_id = auth.uid() OR s.owner_id = auth.uid())
  )
);

CREATE POLICY gig_slot_fill_summary_public_read ON public.gig_slot_fill_summary FOR SELECT TO public USING (true);
CREATE POLICY gig_slot_fill_applicants_public_read ON public.gig_slot_fill_applicants FOR SELECT TO public USING (true);

CREATE POLICY studio_promotions_public_read ON public.studio_promotions FOR SELECT TO public USING (true);
CREATE POLICY studio_promotions_owner_insert ON public.studio_promotions FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_promotions.studio_id AND s.owner_id = auth.uid()));
CREATE POLICY studio_promotions_owner_update ON public.studio_promotions FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_promotions.studio_id AND s.owner_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_promotions.studio_id AND s.owner_id = auth.uid()));
CREATE POLICY studio_promotions_owner_delete ON public.studio_promotions FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.studios s WHERE s.id = studio_promotions.studio_id AND s.owner_id = auth.uid()));
