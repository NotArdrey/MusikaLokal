-- Rollback for 20260222001000/01100/01200 3NF rollout files
-- Use only if Phase 1 needs to be fully reverted.

BEGIN;

DROP VIEW IF EXISTS public.conversations_display_projection;
DROP VIEW IF EXISTS public.studios_legacy_projection;
DROP VIEW IF EXISTS public.gigs_legacy_projection;
DROP VIEW IF EXISTS public.profiles_legacy_projection;

DROP FUNCTION IF EXISTS public.migration_duplicate_check();
DROP FUNCTION IF EXISTS public.migration_row_count_parity();

DROP TRIGGER IF EXISTS trg_prevent_withdrawal_snapshot_mutation ON public.withdrawal_requests;
DROP FUNCTION IF EXISTS public.prevent_withdrawal_snapshot_mutation();

ALTER TABLE public.withdrawal_requests
  ALTER COLUMN payout_type SET NOT NULL,
  ALTER COLUMN payout_account_name SET NOT NULL,
  ALTER COLUMN payout_account_number SET NOT NULL;

DROP TABLE IF EXISTS public.studio_open_dates;
DROP TABLE IF EXISTS public.studio_availability_slots;
DROP TABLE IF EXISTS public.studio_instruments;
DROP TABLE IF EXISTS public.studio_media;
DROP TABLE IF EXISTS public.studio_types;
DROP TABLE IF EXISTS public.studio_amenities;

DROP TABLE IF EXISTS public.gig_availability_slots;
DROP TABLE IF EXISTS public.gig_media;
DROP TABLE IF EXISTS public.gig_requirements;

DROP TABLE IF EXISTS public.profile_portfolio_urls;
DROP TABLE IF EXISTS public.profile_genres;
DROP TABLE IF EXISTS public.profile_skills;

COMMIT;
