ALTER TABLE public.favorites
ADD COLUMN IF NOT EXISTS project_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'favorites_project_id_fkey'
      AND conrelid = 'public.favorites'::regclass
  ) THEN
    ALTER TABLE public.favorites
    ADD CONSTRAINT favorites_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.producer_projects(id) ON DELETE CASCADE;
  END IF;
END;
$$;

ALTER TABLE public.favorites
DROP CONSTRAINT IF EXISTS fav_one_target;

ALTER TABLE public.favorites
ADD CONSTRAINT fav_one_target CHECK (
  ((group_id IS NOT NULL)::integer +
   (studio_id IS NOT NULL)::integer +
   (gig_id IS NOT NULL)::integer +
   (profile_id IS NOT NULL)::integer +
   (project_id IS NOT NULL)::integer) = 1
);

CREATE INDEX IF NOT EXISTS idx_favorites_project_id ON public.favorites USING btree (project_id);