-- Staff users are scoped to exactly one listing/team at a time.
-- Multiple staff users can point at the same listing/team with different levels.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY[
    'fan'::text,
    'musician'::text,
    'studio-owner'::text,
    'venue-owner'::text,
    'producer'::text,
    'admin'::text,
    'staff'::text
  ]));

CREATE TABLE IF NOT EXISTS public.staff_listing_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type = ANY (ARRAY['studio'::text, 'venue'::text, 'production'::text])),
  studio_id uuid REFERENCES public.studios(id) ON DELETE CASCADE,
  gig_id uuid REFERENCES public.gigs(id) ON DELETE CASCADE,
  production_team_id uuid REFERENCES public.production_teams(id) ON DELETE CASCADE,
  access_level smallint NOT NULL CHECK (access_level = ANY (ARRAY[1::smallint, 2::smallint, 3::smallint])),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  revoked_at timestamptz,
  CONSTRAINT staff_listing_access_exact_target_check CHECK (
    (
      entity_type = 'studio'::text
      AND studio_id IS NOT NULL
      AND gig_id IS NULL
      AND production_team_id IS NULL
    )
    OR (
      entity_type = 'venue'::text
      AND gig_id IS NOT NULL
      AND studio_id IS NULL
      AND production_team_id IS NULL
    )
    OR (
      entity_type = 'production'::text
      AND production_team_id IS NOT NULL
      AND studio_id IS NULL
      AND gig_id IS NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_listing_access_one_active_user_idx
  ON public.staff_listing_access(staff_user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS staff_listing_access_staff_active_idx
  ON public.staff_listing_access(staff_user_id, access_level)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS staff_listing_access_studio_active_idx
  ON public.staff_listing_access(studio_id, access_level)
  WHERE revoked_at IS NULL AND studio_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS staff_listing_access_gig_active_idx
  ON public.staff_listing_access(gig_id, access_level)
  WHERE revoked_at IS NULL AND gig_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS staff_listing_access_production_active_idx
  ON public.staff_listing_access(production_team_id, access_level)
  WHERE revoked_at IS NULL AND production_team_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_staff_listing_access_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_staff_listing_access_updated_at ON public.staff_listing_access;
CREATE TRIGGER trg_staff_listing_access_updated_at
  BEFORE UPDATE ON public.staff_listing_access
  FOR EACH ROW EXECUTE FUNCTION public.set_staff_listing_access_updated_at();

ALTER TABLE public.staff_listing_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_listing_access_admin_manage ON public.staff_listing_access;
CREATE POLICY staff_listing_access_admin_manage
  ON public.staff_listing_access
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS staff_listing_access_own_read ON public.staff_listing_access;
CREATE POLICY staff_listing_access_own_read
  ON public.staff_listing_access
  FOR SELECT
  TO authenticated
  USING (staff_user_id = auth.uid() AND revoked_at IS NULL);

CREATE OR REPLACE FUNCTION public.staff_access_level_for_studio(p_user_id uuid, p_studio_id uuid)
RETURNS smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT min(sla.access_level)::smallint
  FROM public.staff_listing_access sla
  WHERE sla.staff_user_id = p_user_id
    AND sla.entity_type = 'studio'
    AND sla.studio_id = p_studio_id
    AND sla.revoked_at IS NULL;
$function$;

CREATE OR REPLACE FUNCTION public.staff_access_level_for_gig(p_user_id uuid, p_gig_id uuid)
RETURNS smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT min(sla.access_level)::smallint
  FROM public.staff_listing_access sla
  WHERE sla.staff_user_id = p_user_id
    AND sla.entity_type = 'venue'
    AND sla.gig_id = p_gig_id
    AND sla.revoked_at IS NULL;
$function$;

CREATE OR REPLACE FUNCTION public.staff_access_level_for_production(p_user_id uuid, p_team_id uuid)
RETURNS smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT min(sla.access_level)::smallint
  FROM public.staff_listing_access sla
  WHERE sla.staff_user_id = p_user_id
    AND sla.entity_type = 'production'
    AND sla.production_team_id = p_team_id
    AND sla.revoked_at IS NULL;
$function$;

CREATE OR REPLACE FUNCTION public.staff_can_read_studio(p_user_id uuid, p_studio_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.staff_access_level_for_studio(p_user_id, p_studio_id) IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.staff_can_edit_studio(p_user_id uuid, p_studio_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.staff_access_level_for_studio(p_user_id, p_studio_id) = 1;
$function$;

CREATE OR REPLACE FUNCTION public.staff_can_manage_studio_bookings(p_user_id uuid, p_studio_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.staff_access_level_for_studio(p_user_id, p_studio_id) = ANY (ARRAY[1::smallint, 2::smallint]);
$function$;

CREATE OR REPLACE FUNCTION public.staff_can_read_gig(p_user_id uuid, p_gig_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.staff_access_level_for_gig(p_user_id, p_gig_id) IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.staff_can_edit_gig(p_user_id uuid, p_gig_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.staff_access_level_for_gig(p_user_id, p_gig_id) = 1;
$function$;

CREATE OR REPLACE FUNCTION public.staff_can_manage_gig_applications(p_user_id uuid, p_gig_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.staff_access_level_for_gig(p_user_id, p_gig_id) = ANY (ARRAY[1::smallint, 2::smallint]);
$function$;

CREATE OR REPLACE FUNCTION public.staff_can_read_production(p_user_id uuid, p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.staff_access_level_for_production(p_user_id, p_team_id) IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.staff_can_edit_production(p_user_id uuid, p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.staff_access_level_for_production(p_user_id, p_team_id) = 1;
$function$;

CREATE OR REPLACE FUNCTION public.staff_can_manage_production_applications(p_user_id uuid, p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.staff_access_level_for_production(p_user_id, p_team_id) = ANY (ARRAY[1::smallint, 2::smallint]);
$function$;

GRANT EXECUTE ON FUNCTION public.staff_access_level_for_studio(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_access_level_for_gig(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_access_level_for_production(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_read_studio(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_edit_studio(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_manage_studio_bookings(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_read_gig(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_edit_gig(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_manage_gig_applications(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_read_production(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_edit_production(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_can_manage_production_applications(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS staff_can_read_assigned_studios ON public.studios;
CREATE POLICY staff_can_read_assigned_studios
  ON public.studios
  FOR SELECT
  TO authenticated
  USING (public.staff_can_read_studio(auth.uid(), id));

DROP POLICY IF EXISTS staff_can_read_assigned_gigs ON public.gigs;
CREATE POLICY staff_can_read_assigned_gigs
  ON public.gigs
  FOR SELECT
  TO authenticated
  USING (public.staff_can_read_gig(auth.uid(), id));

DROP POLICY IF EXISTS staff_can_read_assigned_production_teams ON public.production_teams;
CREATE POLICY staff_can_read_assigned_production_teams
  ON public.production_teams
  FOR SELECT
  TO authenticated
  USING (public.staff_can_read_production(auth.uid(), id));

DROP POLICY IF EXISTS staff_can_read_assigned_studio_bookings ON public.studio_bookings;
CREATE POLICY staff_can_read_assigned_studio_bookings
  ON public.studio_bookings
  FOR SELECT
  TO authenticated
  USING (public.staff_can_read_studio(auth.uid(), studio_id));

DROP POLICY IF EXISTS staff_can_manage_assigned_studio_bookings ON public.studio_bookings;
CREATE POLICY staff_can_manage_assigned_studio_bookings
  ON public.studio_bookings
  FOR UPDATE
  TO authenticated
  USING (public.staff_can_manage_studio_bookings(auth.uid(), studio_id))
  WITH CHECK (public.staff_can_manage_studio_bookings(auth.uid(), studio_id));

DROP POLICY IF EXISTS staff_can_read_assigned_gig_applications ON public.gig_applications;
CREATE POLICY staff_can_read_assigned_gig_applications
  ON public.gig_applications
  FOR SELECT
  TO authenticated
  USING (
    public.staff_can_read_gig(auth.uid(), gig_id)
    OR (
      production_team_id IS NOT NULL
      AND public.staff_can_read_production(auth.uid(), production_team_id)
    )
  );

DROP POLICY IF EXISTS staff_can_manage_assigned_gig_applications ON public.gig_applications;
CREATE POLICY staff_can_manage_assigned_gig_applications
  ON public.gig_applications
  FOR UPDATE
  TO authenticated
  USING (
    public.staff_can_manage_gig_applications(auth.uid(), gig_id)
    OR (
      production_team_id IS NOT NULL
      AND public.staff_can_manage_production_applications(auth.uid(), production_team_id)
    )
  )
  WITH CHECK (
    public.staff_can_manage_gig_applications(auth.uid(), gig_id)
    OR (
      production_team_id IS NOT NULL
      AND public.staff_can_manage_production_applications(auth.uid(), production_team_id)
    )
  );

DROP POLICY IF EXISTS staff_can_update_assigned_studios ON public.studios;
CREATE POLICY staff_can_update_assigned_studios
  ON public.studios
  FOR UPDATE
  TO authenticated
  USING (public.staff_can_edit_studio(auth.uid(), id))
  WITH CHECK (public.staff_can_edit_studio(auth.uid(), id));

DROP POLICY IF EXISTS staff_can_update_assigned_gigs ON public.gigs;
CREATE POLICY staff_can_update_assigned_gigs
  ON public.gigs
  FOR UPDATE
  TO authenticated
  USING (public.staff_can_edit_gig(auth.uid(), id))
  WITH CHECK (public.staff_can_edit_gig(auth.uid(), id));

DROP POLICY IF EXISTS staff_can_update_assigned_production_teams ON public.production_teams;
CREATE POLICY staff_can_update_assigned_production_teams
  ON public.production_teams
  FOR UPDATE
  TO authenticated
  USING (public.staff_can_edit_production(auth.uid(), id))
  WITH CHECK (public.staff_can_edit_production(auth.uid(), id));

DROP POLICY IF EXISTS staff_can_manage_assigned_production_roster ON public.production_team_roster;
CREATE POLICY staff_can_manage_assigned_production_roster
  ON public.production_team_roster
  FOR ALL
  TO authenticated
  USING (public.staff_can_edit_production(auth.uid(), team_id))
  WITH CHECK (public.staff_can_edit_production(auth.uid(), team_id));

DROP POLICY IF EXISTS staff_can_manage_assigned_production_members ON public.production_team_members;
CREATE POLICY staff_can_manage_assigned_production_members
  ON public.production_team_members
  FOR ALL
  TO authenticated
  USING (public.staff_can_edit_production(auth.uid(), team_id))
  WITH CHECK (public.staff_can_edit_production(auth.uid(), team_id));

DROP POLICY IF EXISTS staff_can_view_assigned_production_roster ON public.production_team_roster;
CREATE POLICY staff_can_view_assigned_production_roster
  ON public.production_team_roster
  FOR SELECT
  TO authenticated
  USING (public.staff_can_read_production(auth.uid(), team_id));

DROP POLICY IF EXISTS staff_can_view_assigned_production_members ON public.production_team_members;
CREATE POLICY staff_can_view_assigned_production_members
  ON public.production_team_members
  FOR SELECT
  TO authenticated
  USING (public.staff_can_read_production(auth.uid(), team_id));

DROP POLICY IF EXISTS staff_can_read_assigned_booking_requests ON public.booking_requests;
CREATE POLICY staff_can_read_assigned_booking_requests
  ON public.booking_requests
  FOR SELECT
  TO authenticated
  USING (studio_id IS NOT NULL AND public.staff_can_read_studio(auth.uid(), studio_id));

DROP POLICY IF EXISTS staff_can_manage_assigned_booking_requests ON public.booking_requests;
CREATE POLICY staff_can_manage_assigned_booking_requests
  ON public.booking_requests
  FOR UPDATE
  TO authenticated
  USING (studio_id IS NOT NULL AND public.staff_can_manage_studio_bookings(auth.uid(), studio_id))
  WITH CHECK (studio_id IS NOT NULL AND public.staff_can_manage_studio_bookings(auth.uid(), studio_id));

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT *
    FROM (VALUES
      ('studio_types', 'studio_id'),
      ('studio_amenities', 'studio_id'),
      ('studio_instruments', 'studio_id'),
      ('studio_media', 'studio_id'),
      ('studio_settings', 'studio_id'),
      ('studio_operating_hours', 'studio_id'),
      ('studio_date_overrides', 'studio_id'),
      ('studio_promotions', 'studio_id'),
      ('studio_availability_slots', 'studio_id'),
      ('studio_open_dates', 'studio_id'),
      ('booking_cancellation_policies', 'studio_id')
    ) AS tables(table_name, target_column)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'staff_can_read_assigned_' || item.table_name, item.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.staff_can_read_studio(auth.uid(), %I))',
      'staff_can_read_assigned_' || item.table_name,
      item.table_name,
      item.target_column
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'staff_can_manage_assigned_' || item.table_name, item.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.staff_can_edit_studio(auth.uid(), %I)) WITH CHECK (public.staff_can_edit_studio(auth.uid(), %I))',
      'staff_can_manage_assigned_' || item.table_name,
      item.table_name,
      item.target_column,
      item.target_column
    );
  END LOOP;
END $$;

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT *
    FROM (VALUES
      ('gig_requirements', 'gig_id'),
      ('gig_media', 'gig_id'),
      ('gig_availability_slots', 'gig_id')
    ) AS tables(table_name, target_column)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'staff_can_read_assigned_' || item.table_name, item.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.staff_can_read_gig(auth.uid(), %I))',
      'staff_can_read_assigned_' || item.table_name,
      item.table_name,
      item.target_column
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'staff_can_manage_assigned_' || item.table_name, item.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.staff_can_edit_gig(auth.uid(), %I)) WITH CHECK (public.staff_can_edit_gig(auth.uid(), %I))',
      'staff_can_manage_assigned_' || item.table_name,
      item.table_name,
      item.target_column,
      item.target_column
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.prevent_staff_listing_owner_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR public.is_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'studios' THEN
    IF OLD.owner_id IS DISTINCT FROM NEW.owner_id
      AND OLD.owner_id IS DISTINCT FROM v_actor
      AND public.staff_can_edit_studio(v_actor, OLD.id)
    THEN
      RAISE EXCEPTION 'Staff cannot reassign studio ownership';
    END IF;
  ELSIF TG_TABLE_NAME = 'gigs' THEN
    IF OLD.organizer_id IS DISTINCT FROM NEW.organizer_id
      AND OLD.organizer_id IS DISTINCT FROM v_actor
      AND public.staff_can_edit_gig(v_actor, OLD.id)
    THEN
      RAISE EXCEPTION 'Staff cannot reassign gig ownership';
    END IF;
  ELSIF TG_TABLE_NAME = 'production_teams' THEN
    IF OLD.owner_id IS DISTINCT FROM NEW.owner_id
      AND OLD.owner_id IS DISTINCT FROM v_actor
      AND public.staff_can_edit_production(v_actor, OLD.id)
    THEN
      RAISE EXCEPTION 'Staff cannot reassign production ownership';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_staff_studio_owner_reassignment ON public.studios;
CREATE TRIGGER trg_prevent_staff_studio_owner_reassignment
  BEFORE UPDATE ON public.studios
  FOR EACH ROW EXECUTE FUNCTION public.prevent_staff_listing_owner_reassignment();

DROP TRIGGER IF EXISTS trg_prevent_staff_gig_owner_reassignment ON public.gigs;
CREATE TRIGGER trg_prevent_staff_gig_owner_reassignment
  BEFORE UPDATE ON public.gigs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_staff_listing_owner_reassignment();

DROP TRIGGER IF EXISTS trg_prevent_staff_production_owner_reassignment ON public.production_teams;
CREATE TRIGGER trg_prevent_staff_production_owner_reassignment
  BEFORE UPDATE ON public.production_teams
  FOR EACH ROW EXECUTE FUNCTION public.prevent_staff_listing_owner_reassignment();
