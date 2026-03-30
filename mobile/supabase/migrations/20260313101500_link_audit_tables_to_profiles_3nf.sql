BEGIN;

-- Normalize orphan user references before adding FK constraints.
UPDATE public.studio_deletion_audit s
SET owner_id = NULL
WHERE owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = s.owner_id
  );

UPDATE public.studio_deletion_audit s
SET deleted_by = NULL
WHERE deleted_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = s.deleted_by
  );

UPDATE public.gig_deletion_audit g
SET organizer_id = NULL
WHERE organizer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = g.organizer_id
  );

UPDATE public.gig_deletion_audit g
SET deleted_by = NULL
WHERE deleted_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = g.deleted_by
  );

UPDATE public.group_deletion_audit gd
SET owner_id = NULL
WHERE owner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = gd.owner_id
  );

UPDATE public.group_deletion_audit gd
SET deleted_by = NULL
WHERE deleted_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = gd.deleted_by
  );

-- Add profile-based foreign keys to enforce relational integrity.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'studio_deletion_audit_owner_id_fkey'
      AND conrelid = 'public.studio_deletion_audit'::regclass
  ) THEN
    ALTER TABLE public.studio_deletion_audit
      ADD CONSTRAINT studio_deletion_audit_owner_id_fkey
      FOREIGN KEY (owner_id)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'studio_deletion_audit_deleted_by_fkey'
      AND conrelid = 'public.studio_deletion_audit'::regclass
  ) THEN
    ALTER TABLE public.studio_deletion_audit
      ADD CONSTRAINT studio_deletion_audit_deleted_by_fkey
      FOREIGN KEY (deleted_by)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gig_deletion_audit_organizer_id_fkey'
      AND conrelid = 'public.gig_deletion_audit'::regclass
  ) THEN
    ALTER TABLE public.gig_deletion_audit
      ADD CONSTRAINT gig_deletion_audit_organizer_id_fkey
      FOREIGN KEY (organizer_id)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gig_deletion_audit_deleted_by_fkey'
      AND conrelid = 'public.gig_deletion_audit'::regclass
  ) THEN
    ALTER TABLE public.gig_deletion_audit
      ADD CONSTRAINT gig_deletion_audit_deleted_by_fkey
      FOREIGN KEY (deleted_by)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'group_deletion_audit_owner_id_fkey'
      AND conrelid = 'public.group_deletion_audit'::regclass
  ) THEN
    ALTER TABLE public.group_deletion_audit
      ADD CONSTRAINT group_deletion_audit_owner_id_fkey
      FOREIGN KEY (owner_id)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'group_deletion_audit_deleted_by_fkey'
      AND conrelid = 'public.group_deletion_audit'::regclass
  ) THEN
    ALTER TABLE public.group_deletion_audit
      ADD CONSTRAINT group_deletion_audit_deleted_by_fkey
      FOREIGN KEY (deleted_by)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

-- Track who approved normalization exceptions for stronger 3NF lineage.
ALTER TABLE public.normalization_exceptions
  ADD COLUMN IF NOT EXISTS approved_by_user_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'normalization_exceptions_approved_by_user_id_fkey'
      AND conrelid = 'public.normalization_exceptions'::regclass
  ) THEN
    ALTER TABLE public.normalization_exceptions
      ADD CONSTRAINT normalization_exceptions_approved_by_user_id_fkey
      FOREIGN KEY (approved_by_user_id)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

COMMIT;
