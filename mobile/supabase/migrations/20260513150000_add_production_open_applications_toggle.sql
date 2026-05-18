ALTER TABLE public.production_teams
ADD COLUMN IF NOT EXISTS open_production_applications BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.production_teams.open_production_applications IS
'Controls whether musicians, duos, and groups can apply to join a production team.';
