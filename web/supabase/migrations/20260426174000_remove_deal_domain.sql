-- Remove the retired deal domain while preserving production teams and booking policies.

DROP VIEW IF EXISTS public.venue_partnership_deals_with_summary CASCADE;
DROP VIEW IF EXISTS public.studio_recording_deals_with_summary CASCADE;

DROP FUNCTION IF EXISTS public.calculate_deal_settlement(uuid, text, numeric) CASCADE;
DROP FUNCTION IF EXISTS public.mark_deal_terms_accepted(uuid, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.resolve_active_recording_package(uuid, uuid, numeric) CASCADE;

ALTER TABLE IF EXISTS public.conversations
  DROP COLUMN IF EXISTS deal_id;

ALTER TABLE IF EXISTS public.studio_bookings
  DROP COLUMN IF EXISTS recording_deal_package_id,
  DROP COLUMN IF EXISTS recording_deal_id;

DROP TABLE IF EXISTS public.recording_deal_packages CASCADE;
DROP TABLE IF EXISTS public.studio_recording_deals CASCADE;
DROP TABLE IF EXISTS public.deal_negotiation_events CASCADE;
DROP TABLE IF EXISTS public.deal_term_versions CASCADE;
DROP TABLE IF EXISTS public.venue_partnership_deals CASCADE;
