-- Rollback playbook for the 3NF rollout.
-- Use with caution; prefer rollback by feature flags first.

BEGIN;

-- Phase 5 read-cutover rollback:
-- Action: switch feature flags back to legacy reads.
-- SQL not required unless hotfixing views.

-- Phase 3 dual-write rollback:
-- Action: disable normalized writes in app/API and keep legacy writes only.
-- SQL not required unless temporary DB trigger-based dual-write was used.

-- Phase 2 backfill rollback (data only, leaves schema in place):
TRUNCATE TABLE
  profile_skills,
  profile_genres,
  profile_portfolio_urls,
  gig_requirements,
  gig_media,
  gig_availability_slots,
  studio_amenities,
  studio_types,
  studio_media,
  studio_instruments,
  studio_availability_slots,
  studio_open_dates
RESTART IDENTITY;

COMMIT;
