BEGIN;

ALTER TABLE public.favorites
  ADD COLUMN IF NOT EXISTS production_team_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'favorites_production_team_id_fkey'
      AND conrelid = 'public.favorites'::regclass
  ) THEN
    ALTER TABLE public.favorites
      ADD CONSTRAINT favorites_production_team_id_fkey
      FOREIGN KEY (production_team_id)
      REFERENCES public.production_teams(id)
      ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.favorites
  DROP CONSTRAINT IF EXISTS fav_one_target;

ALTER TABLE public.favorites
  ADD CONSTRAINT fav_one_target CHECK (
    ((group_id IS NOT NULL)::integer +
     (studio_id IS NOT NULL)::integer +
     (gig_id IS NOT NULL)::integer +
     (profile_id IS NOT NULL)::integer +
     (production_team_id IS NOT NULL)::integer) = 1
  );

CREATE INDEX IF NOT EXISTS idx_favorites_production_team_id
  ON public.favorites USING btree (production_team_id);

COMMIT;
