-- Archive retired venue partnership deals before dropping the public deal domain.
-- The archive schema is intentionally outside public and is not exposed through PostgREST.

CREATE SCHEMA IF NOT EXISTS private_archive;

REVOKE ALL ON SCHEMA private_archive FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA private_archive FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA private_archive FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA private_archive TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    GRANT USAGE ON SCHEMA private_archive TO supabase_admin;
  END IF;
END
$$;

DO $$
DECLARE
  v_source_count bigint := 0;
  v_archived_count bigint := 0;
BEGIN
  IF to_regclass('public.venue_partnership_deals') IS NOT NULL THEN
    EXECUTE $archive$
      CREATE TABLE IF NOT EXISTS private_archive.venue_partnership_deals_20260427 AS
      SELECT
        now()::timestamptz AS archived_at,
        'public.venue_partnership_deals'::text AS source_table,
        vpd.*
      FROM public.venue_partnership_deals AS vpd
    $archive$;

    EXECUTE $archive$
      INSERT INTO private_archive.venue_partnership_deals_20260427
      SELECT
        now()::timestamptz AS archived_at,
        'public.venue_partnership_deals'::text AS source_table,
        vpd.*
      FROM public.venue_partnership_deals AS vpd
      WHERE NOT EXISTS (
        SELECT 1
        FROM private_archive.venue_partnership_deals_20260427 archived
        WHERE archived.id = vpd.id
      )
    $archive$;

    EXECUTE $archive$
      SELECT count(*)
      FROM public.venue_partnership_deals
    $archive$
    INTO v_source_count;

    EXECUTE $archive$
      SELECT count(*)
      FROM public.venue_partnership_deals AS vpd
      WHERE EXISTS (
        SELECT 1
        FROM private_archive.venue_partnership_deals_20260427 AS archived
        WHERE archived.id = vpd.id
          AND archived.source_table = 'public.venue_partnership_deals'
      )
    $archive$
    INTO v_archived_count;

    IF v_archived_count <> v_source_count THEN
      RAISE EXCEPTION
        'venue_partnership_deals archive verification failed: archived % of % rows',
        v_archived_count,
        v_source_count;
    END IF;
  END IF;
END
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA private_archive FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA private_archive FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA private_archive FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT ON ALL TABLES IN SCHEMA private_archive TO service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA private_archive TO supabase_admin;
  END IF;
END
$$;
