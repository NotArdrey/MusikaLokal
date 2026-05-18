-- Remove the retired deal domain while preserving production teams and booking policies.

DO $$
DECLARE
  v_count bigint := 0;
  v_source_count bigint := 0;
  v_archived_count bigint := 0;
  r record;
BEGIN
  IF to_regclass('public.conversations') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'conversations'
        AND column_name = 'deal_id'
    )
  THEN
    SELECT count(*) INTO v_count
    FROM public.conversations
    WHERE deal_id IS NOT NULL;

    IF v_count <> 0 THEN
      RAISE EXCEPTION 'conversations.deal_id still has % non-null rows; refusing to drop deal domain', v_count;
    END IF;
  END IF;

  IF to_regclass('public.studio_bookings') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'studio_bookings'
        AND column_name = 'recording_deal_id'
    )
  THEN
    SELECT count(*) INTO v_count
    FROM public.studio_bookings
    WHERE recording_deal_id IS NOT NULL;

    IF v_count <> 0 THEN
      RAISE EXCEPTION 'studio_bookings.recording_deal_id still has % non-null rows; refusing to drop deal domain', v_count;
    END IF;
  END IF;

  IF to_regclass('public.studio_bookings') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'studio_bookings'
        AND column_name = 'recording_deal_package_id'
    )
  THEN
    SELECT count(*) INTO v_count
    FROM public.studio_bookings
    WHERE recording_deal_package_id IS NOT NULL;

    IF v_count <> 0 THEN
      RAISE EXCEPTION 'studio_bookings.recording_deal_package_id still has % non-null rows; refusing to drop deal domain', v_count;
    END IF;
  END IF;

  FOR r IN
    SELECT table_name
    FROM (
      VALUES
        ('recording_deal_packages'),
        ('studio_recording_deals'),
        ('deal_negotiation_events'),
        ('deal_term_versions')
    ) AS deal_tables(table_name)
  LOOP
    IF to_regclass(format('public.%I', r.table_name)) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', r.table_name)
      INTO v_count;

      IF v_count <> 0 THEN
        RAISE EXCEPTION '% still has % rows; refusing to drop deal domain', r.table_name, v_count;
      END IF;
    END IF;
  END LOOP;

  IF to_regclass('public.venue_partnership_deals') IS NOT NULL THEN
    EXECUTE $check$
      SELECT count(*)
      FROM public.venue_partnership_deals
      WHERE coalesce(status, '') <> 'settled'
        OR settled_at IS NULL
        OR accepted_term_version_id IS NOT NULL
    $check$
    INTO v_count;

    IF v_count <> 0 THEN
      RAISE EXCEPTION 'venue_partnership_deals has % unsettled or term-linked rows; refusing to drop deal domain', v_count;
    END IF;

    EXECUTE 'SELECT count(*) FROM public.venue_partnership_deals'
    INTO v_source_count;

    IF v_source_count <> 0 THEN
      IF to_regclass('private_archive.venue_partnership_deals_20260427') IS NULL THEN
        RAISE EXCEPTION 'venue_partnership_deals has % rows but archive table is missing; refusing to drop deal domain', v_source_count;
      END IF;

      EXECUTE $check$
        SELECT count(*)
        FROM public.venue_partnership_deals AS vpd
        WHERE EXISTS (
          SELECT 1
          FROM private_archive.venue_partnership_deals_20260427 AS archived
          WHERE archived.id = vpd.id
            AND archived.source_table = 'public.venue_partnership_deals'
        )
      $check$
      INTO v_archived_count;

      IF v_archived_count <> v_source_count THEN
        RAISE EXCEPTION 'venue_partnership_deals archive verification failed before drop: archived % of % rows', v_archived_count, v_source_count;
      END IF;
    END IF;
  END IF;
END
$$;

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
