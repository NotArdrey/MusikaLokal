-- Production team roster + production-aware gig applications

CREATE TABLE IF NOT EXISTS public.production_team_roster (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.production_teams(id) ON DELETE CASCADE,
    entity_kind text NOT NULL CHECK (entity_kind IN ('musician', 'duo', 'group')),
    profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
    added_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT production_team_roster_exactly_one_target CHECK (
        ((profile_id IS NOT NULL)::int + (group_id IS NOT NULL)::int) = 1
    )
);

ALTER TABLE public.production_team_roster ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_production_team_roster_team
    ON public.production_team_roster(team_id);

CREATE INDEX IF NOT EXISTS idx_production_team_roster_team_kind
    ON public.production_team_roster(team_id, entity_kind);

CREATE INDEX IF NOT EXISTS idx_production_team_roster_profile
    ON public.production_team_roster(profile_id)
    WHERE profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_production_team_roster_group
    ON public.production_team_roster(group_id)
    WHERE group_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_production_team_roster_unique_profile
    ON public.production_team_roster(team_id, profile_id)
    WHERE profile_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_production_team_roster_unique_group
    ON public.production_team_roster(team_id, group_id)
    WHERE group_id IS NOT NULL;

DROP POLICY IF EXISTS "Team members can view production roster" ON public.production_team_roster;
CREATE POLICY "Team members can view production roster"
ON public.production_team_roster FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.production_team_members ptm
        WHERE ptm.team_id = production_team_roster.team_id
          AND ptm.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Team managers can manage production roster" ON public.production_team_roster;
CREATE POLICY "Team managers can manage production roster"
ON public.production_team_roster FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.production_team_members ptm
        WHERE ptm.team_id = production_team_roster.team_id
          AND ptm.user_id = auth.uid()
          AND ptm.role = ANY (ARRAY['owner'::text, 'manager'::text])
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public.production_team_members ptm
        WHERE ptm.team_id = production_team_roster.team_id
          AND ptm.user_id = auth.uid()
          AND ptm.role = ANY (ARRAY['owner'::text, 'manager'::text])
    )
);

ALTER TABLE public.gig_applications
    ADD COLUMN IF NOT EXISTS production_team_id uuid REFERENCES public.production_teams(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS production_roster_id uuid REFERENCES public.production_team_roster(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.gig_applications.production_team_id IS
'Optional production team wrapper for applications submitted as one production organization.';

COMMENT ON COLUMN public.gig_applications.production_roster_id IS
'Optional production roster entry representing the selected musician, duo, or group for a production application.';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'unique_applicant_per_gig'
          AND conrelid = 'public.gig_applications'::regclass
    ) THEN
        ALTER TABLE public.gig_applications
            DROP CONSTRAINT unique_applicant_per_gig;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gig_applications_unique_direct_applicant
    ON public.gig_applications(gig_id, applicant_id)
    WHERE production_team_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_gig_applications_production_team_id
    ON public.gig_applications(production_team_id)
    WHERE production_team_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gig_applications_production_roster_id
    ON public.gig_applications(production_roster_id)
    WHERE production_roster_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gig_applications_unique_production_team
    ON public.gig_applications(gig_id, production_team_id)
    WHERE production_team_id IS NOT NULL AND status <> 'rejected';

ALTER TABLE public.gig_applications
    DROP CONSTRAINT IF EXISTS gig_applications_production_pair_check;

ALTER TABLE public.gig_applications
    ADD CONSTRAINT gig_applications_production_pair_check CHECK (
        (production_team_id IS NULL AND production_roster_id IS NULL)
        OR (production_team_id IS NOT NULL AND production_roster_id IS NOT NULL)
    );

CREATE OR REPLACE FUNCTION public.validate_production_gig_application()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    roster_record public.production_team_roster%ROWTYPE;
BEGIN
    IF NEW.production_team_id IS NULL AND NEW.production_roster_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.production_team_id IS NULL OR NEW.production_roster_id IS NULL THEN
        RAISE EXCEPTION 'production_team_id and production_roster_id must both be provided';
    END IF;

    SELECT *
    INTO roster_record
    FROM public.production_team_roster
    WHERE id = NEW.production_roster_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected production roster entry does not exist';
    END IF;

    IF roster_record.team_id <> NEW.production_team_id THEN
        RAISE EXCEPTION 'Selected production roster entry does not belong to the provided production team';
    END IF;

    IF roster_record.profile_id IS NOT NULL AND NEW.group_id IS NOT NULL THEN
        RAISE EXCEPTION 'Solo production roster entries cannot submit with a group_id';
    END IF;

    IF roster_record.group_id IS NOT NULL AND NEW.group_id IS DISTINCT FROM roster_record.group_id THEN
        RAISE EXCEPTION 'Production group applications must use the group stored in the selected roster entry';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_validate_production_gig_application ON public.gig_applications;

CREATE TRIGGER trigger_validate_production_gig_application
    BEFORE INSERT OR UPDATE OF production_team_id, production_roster_id, group_id
    ON public.gig_applications
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_production_gig_application();