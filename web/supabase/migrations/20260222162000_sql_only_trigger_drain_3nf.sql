-- SQL-only 3NF cutover support:
-- 1) Trigger-based dual-write from legacy columns -> normalized tables
-- 2) Safe legacy drain helper (skips trigger sync while nulling legacy columns)

CREATE OR REPLACE FUNCTION public.trg_sync_profile_3nf_from_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('app.skip_3nf_sync', true), '0') = '1' THEN
    RETURN NEW;
  END IF;

  PERFORM public.sync_profile_3nf(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_gig_3nf_from_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('app.skip_3nf_sync', true), '0') = '1' THEN
    RETURN NEW;
  END IF;

  PERFORM public.sync_gig_3nf(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_studio_3nf_from_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('app.skip_3nf_sync', true), '0') = '1' THEN
    RETURN NEW;
  END IF;

  PERFORM public.sync_studio_3nf(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_3nf_from_legacy ON public.profiles;
CREATE TRIGGER trg_profiles_sync_3nf_from_legacy
AFTER INSERT OR UPDATE OF skills, genres, portfolio_urls
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_profile_3nf_from_legacy();

DROP TRIGGER IF EXISTS trg_gigs_sync_3nf_from_legacy ON public.gigs;
CREATE TRIGGER trg_gigs_sync_3nf_from_legacy
AFTER INSERT OR UPDATE OF requirements, images, documents
ON public.gigs
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_gig_3nf_from_legacy();

DROP TRIGGER IF EXISTS trg_studios_sync_3nf_from_legacy ON public.studios;
CREATE TRIGGER trg_studios_sync_3nf_from_legacy
AFTER INSERT OR UPDATE OF amenities, images, instruments, types, type
ON public.studios
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_studio_3nf_from_legacy();

CREATE OR REPLACE FUNCTION public.drain_legacy_3nf(p_batch_size integer DEFAULT 1000)
RETURNS TABLE(entity text, drained integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_ids uuid[];
  v_gig_ids uuid[];
  v_studio_ids uuid[];
  v_id uuid;
  v_profiles integer := 0;
  v_gigs integer := 0;
  v_studios integer := 0;
BEGIN
  SELECT array_agg(id)
  INTO v_profile_ids
  FROM (
    SELECT id
    FROM public.profiles
    WHERE COALESCE(array_length(skills, 1), 0) > 0
       OR COALESCE(array_length(genres, 1), 0) > 0
       OR COALESCE(array_length(portfolio_urls, 1), 0) > 0
    ORDER BY id
    LIMIT p_batch_size
  ) t;

  IF v_profile_ids IS NOT NULL THEN
    FOREACH v_id IN ARRAY v_profile_ids LOOP
      PERFORM public.sync_profile_3nf(v_id);
    END LOOP;

    PERFORM set_config('app.skip_3nf_sync', '1', true);
    UPDATE public.profiles
    SET skills = NULL,
        genres = NULL,
        portfolio_urls = NULL
    WHERE id = ANY(v_profile_ids);
    GET DIAGNOSTICS v_profiles = ROW_COUNT;
    PERFORM set_config('app.skip_3nf_sync', '0', true);
  END IF;

  SELECT array_agg(id)
  INTO v_gig_ids
  FROM (
    SELECT id
    FROM public.gigs
    WHERE (requirements IS NOT NULL AND requirements <> '{}'::jsonb)
       OR COALESCE(array_length(images, 1), 0) > 0
       OR COALESCE(array_length(documents, 1), 0) > 0
    ORDER BY id
    LIMIT p_batch_size
  ) t;

  IF v_gig_ids IS NOT NULL THEN
    FOREACH v_id IN ARRAY v_gig_ids LOOP
      PERFORM public.sync_gig_3nf(v_id);
    END LOOP;

    PERFORM set_config('app.skip_3nf_sync', '1', true);
    UPDATE public.gigs
    SET requirements = NULL,
        images = NULL,
        documents = NULL
    WHERE id = ANY(v_gig_ids);
    GET DIAGNOSTICS v_gigs = ROW_COUNT;
    PERFORM set_config('app.skip_3nf_sync', '0', true);
  END IF;

  SELECT array_agg(id)
  INTO v_studio_ids
  FROM (
    SELECT id
    FROM public.studios
    WHERE COALESCE(array_length(amenities, 1), 0) > 0
       OR COALESCE(array_length(images, 1), 0) > 0
       OR (instruments IS NOT NULL AND instruments <> '[]'::jsonb)
       OR COALESCE(array_length(types, 1), 0) > 0
       OR NULLIF(BTRIM(type), '') IS NOT NULL
    ORDER BY id
    LIMIT p_batch_size
  ) t;

  IF v_studio_ids IS NOT NULL THEN
    FOREACH v_id IN ARRAY v_studio_ids LOOP
      PERFORM public.sync_studio_3nf(v_id);
    END LOOP;

    PERFORM set_config('app.skip_3nf_sync', '1', true);
    UPDATE public.studios
    SET amenities = NULL,
        images = NULL,
        instruments = NULL,
        types = NULL,
        type = NULL
    WHERE id = ANY(v_studio_ids);
    GET DIAGNOSTICS v_studios = ROW_COUNT;
    PERFORM set_config('app.skip_3nf_sync', '0', true);
  END IF;

  RETURN QUERY
  SELECT 'profiles'::text, v_profiles
  UNION ALL
  SELECT 'gigs'::text, v_gigs
  UNION ALL
  SELECT 'studios'::text, v_studios;
END;
$$;

SELECT * FROM public.drain_legacy_3nf(10000);