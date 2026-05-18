BEGIN;

-- Multi-session checkout creates one pending row per selected session before
-- payment. Slot overlap is already enforced separately, so this old one-row
-- per user/studio/day rule blocks valid batches after the first insert.
DROP INDEX IF EXISTS public.idx_unique_pending_studio_booking_per_day;

COMMIT;
