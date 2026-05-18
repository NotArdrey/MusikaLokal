-- Keep production gig application references valid while production teams/roster rows are deleted.

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
        IF TG_OP = 'UPDATE' THEN
            IF OLD.production_team_id IS NOT NULL AND OLD.production_roster_id IS NOT NULL THEN
                NEW.production_team_id := NULL;
                NEW.production_roster_id := NULL;
                RETURN NEW;
            END IF;
        END IF;

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
