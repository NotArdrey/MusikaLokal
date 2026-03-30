-- Final 3NF contract migration (SQL-only)
-- Preconditions:
--  - contract_3nf_preflight legacy non-empty metrics must be zero.
-- Outcomes:
--  - Drop legacy denormalized columns from profiles/gigs/studios
--  - Keep backward-compatible RPC signatures as no-ops
--  - Keep projection/stats views functional on normalized sources only

DO $$
DECLARE
  v_remaining bigint := 0;
BEGIN
  SELECT COALESCE(SUM(value), 0)
  INTO v_remaining
  FROM public.contract_3nf_preflight()
  WHERE metric IN (
    'profiles_skills_nonempty',
    'profiles_genres_nonempty',
    'profiles_portfolio_nonempty',
    'gigs_requirements_nonempty',
    'gigs_images_nonempty',
    'gigs_documents_nonempty',
    'studios_amenities_nonempty',
    'studios_images_nonempty',
    'studios_instruments_nonempty',
    'studios_types_nonempty_or_scalar'
  );

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION '3NF contract blocked: % legacy rows still populated', v_remaining;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_3nf_from_legacy ON public.profiles;
DROP TRIGGER IF EXISTS trg_gigs_sync_3nf_from_legacy ON public.gigs;
DROP TRIGGER IF EXISTS trg_studios_sync_3nf_from_legacy ON public.studios;

DROP FUNCTION IF EXISTS public.trg_sync_profile_3nf_from_legacy();
DROP FUNCTION IF EXISTS public.trg_sync_gig_3nf_from_legacy();
DROP FUNCTION IF EXISTS public.trg_sync_studio_3nf_from_legacy();

CREATE OR REPLACE VIEW public.profiles_legacy_projection AS
SELECT
  p.id,
  COALESCE(
    (
      SELECT array_agg(ps.skill ORDER BY ps.skill)
      FROM public.profile_skills ps
      WHERE ps.profile_id = p.id
    ),
    ARRAY[]::text[]
  ) AS skills,
  COALESCE(
    (
      SELECT array_agg(pg.genre ORDER BY pg.genre)
      FROM public.profile_genres pg
      WHERE pg.profile_id = p.id
    ),
    ARRAY[]::text[]
  ) AS genres,
  COALESCE(
    (
      SELECT array_agg(ppu.portfolio_url ORDER BY ppu.sort_order, ppu.created_at)
      FROM public.profile_portfolio_urls ppu
      WHERE ppu.profile_id = p.id
    ),
    ARRAY[]::text[]
  ) AS portfolio_urls
FROM public.profiles p;

CREATE OR REPLACE VIEW public.gigs_legacy_projection AS
SELECT
  g.id,
  COALESCE(
    (
      SELECT jsonb_object_agg(gr.requirement_key, gr.requirement_value)
      FROM public.gig_requirements gr
      WHERE gr.gig_id = g.id
    ),
    '{}'::jsonb
  ) AS requirements,
  COALESCE(
    (
      SELECT array_agg(gm.media_url ORDER BY gm.sort_order, gm.created_at)
      FROM public.gig_media gm
      WHERE gm.gig_id = g.id AND gm.media_type = 'image'
    ),
    ARRAY[]::text[]
  ) AS images,
  COALESCE(
    (
      SELECT array_agg(gm.media_url ORDER BY gm.sort_order, gm.created_at)
      FROM public.gig_media gm
      WHERE gm.gig_id = g.id AND gm.media_type = 'document'
    ),
    ARRAY[]::text[]
  ) AS documents
FROM public.gigs g;

CREATE OR REPLACE VIEW public.studios_legacy_projection AS
SELECT
  s.id,
  COALESCE(
    (
      SELECT array_agg(sa.amenity ORDER BY sa.amenity)
      FROM public.studio_amenities sa
      WHERE sa.studio_id = s.id
    ),
    ARRAY[]::text[]
  ) AS amenities,
  COALESCE(
    (
      SELECT array_agg(sm.media_url ORDER BY sm.sort_order, sm.created_at)
      FROM public.studio_media sm
      WHERE sm.studio_id = s.id AND sm.media_type = 'image'
    ),
    ARRAY[]::text[]
  ) AS images,
  COALESCE(
    (
      SELECT array_agg(st.studio_type ORDER BY st.studio_type)
      FROM public.studio_types st
      WHERE st.studio_id = s.id
    ),
    ARRAY[]::text[]
  ) AS types,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_strip_nulls(
          jsonb_build_object('name', si.instrument_name, 'image', si.image_url)
        )
        ORDER BY si.instrument_name
      )
      FROM public.studio_instruments si
      WHERE si.studio_id = s.id
    ),
    '[]'::jsonb
  ) AS instruments
FROM public.studios s;

CREATE OR REPLACE VIEW public.gigs_with_verification AS
SELECT
  g.id,
  g.organizer_id,
  g.name,
  g.location,
  g.budget,
  g.description,
  g.event_date,
  glp.requirements,
  glp.images,
  glp.documents,
  g.status,
  g.latitude,
  g.longitude,
  g.created_at,
  g.embedding,
  g.rate,
  g.contract_url,
  g.availability,
  g.address_verification_status,
  g.address_verification_session_id,
  g.address_verified_at,
  g.verified_address,
  g.address_verification_completed_at,
  CASE
    WHEN g.address_verification_status = ANY (ARRAY['APPROVED'::text, 'VERIFIED'::text]) THEN true
    ELSE false
  END AS is_address_verified,
  avs.extracted_address AS session_extracted_address,
  avs.extracted_name AS session_extracted_name,
  avs.issuer AS verification_issuer,
  avs.notes AS verification_notes,
  avs.provider AS verification_provider,
  avs.archive_id AS smile_archive_id
FROM public.gigs g
LEFT JOIN public.gigs_legacy_projection glp ON glp.id = g.id
LEFT JOIN public.address_verification_sessions avs
  ON avs.entity_type = 'gig'
 AND avs.entity_id = g.id
 AND avs.status = ANY (ARRAY['APPROVED'::text, 'VERIFIED'::text]);

CREATE OR REPLACE VIEW public.studios_with_verification AS
SELECT
  s.id,
  s.owner_id,
  s.name,
  s.address,
  s.hourly_rate,
  s.description,
  slp.amenities,
  slp.images,
  s.latitude,
  s.longitude,
  s.created_at,
  s.embedding,
  s.rate,
  s.contract_url,
  s.availability,
  slp.instruments,
  CASE
    WHEN COALESCE(array_length(slp.types, 1), 0) > 0 THEN slp.types[1]
    ELSE NULL::text
  END AS type,
  s.rehearsal_rate,
  s.recording_rate,
  s.open_dates,
  slp.types,
  s.pax,
  s.address_verification_status,
  s.address_verification_session_id,
  s.address_verified_at,
  s.verified_address,
  s.address_verification_completed_at,
  CASE
    WHEN s.address_verification_status = ANY (ARRAY['APPROVED'::text, 'VERIFIED'::text]) THEN true
    ELSE false
  END AS is_address_verified,
  avs.extracted_address AS session_extracted_address,
  avs.extracted_name AS session_extracted_name,
  avs.issuer AS verification_issuer,
  avs.notes AS verification_notes,
  avs.provider AS verification_provider,
  avs.archive_id AS smile_archive_id
FROM public.studios s
LEFT JOIN public.studios_legacy_projection slp ON slp.id = s.id
LEFT JOIN public.address_verification_sessions avs
  ON avs.entity_type = 'studio'
 AND avs.entity_id = s.id
 AND avs.status = ANY (ARRAY['APPROVED'::text, 'VERIFIED'::text]);

CREATE OR REPLACE VIEW public.studio_bookings_with_cost AS
SELECT
  sb.id,
  sb.user_id,
  sb.studio_id,
  sb.booking_date,
  sb.start_time,
  sb.end_time,
  sb.base_rate,
  sb.hours,
  sb.subtotal,
  sb.modifiers_applied,
  sb.final_price,
  sb.notes,
  sb.status,
  sb.buffer_minutes,
  sb.created_at,
  sb.updated_at,
  EXTRACT(epoch FROM (sb.end_time - sb.start_time)) / 3600::numeric AS duration_hours,
  (EXTRACT(epoch FROM (sb.end_time - sb.start_time)) / 3600::numeric) * s.hourly_rate AS total_cost,
  s.name AS studio_name,
  slp.images AS studio_images,
  s.owner_id AS studio_owner_id,
  p.email AS user_email,
  p.full_name AS user_full_name
FROM public.studio_bookings sb
JOIN public.studios s ON s.id = sb.studio_id
LEFT JOIN public.studios_legacy_projection slp ON slp.id = s.id
JOIN public.profiles p ON p.id = sb.user_id;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS skills,
  DROP COLUMN IF EXISTS genres,
  DROP COLUMN IF EXISTS portfolio_urls;

ALTER TABLE public.gigs
  DROP COLUMN IF EXISTS requirements,
  DROP COLUMN IF EXISTS images,
  DROP COLUMN IF EXISTS documents;

ALTER TABLE public.studios
  DROP COLUMN IF EXISTS amenities,
  DROP COLUMN IF EXISTS images,
  DROP COLUMN IF EXISTS instruments,
  DROP COLUMN IF EXISTS types,
  DROP COLUMN IF EXISTS type;

CREATE OR REPLACE FUNCTION public.sync_profile_3nf(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1
  FROM public.profiles p
  WHERE p.id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_gig_3nf(p_gig_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1
  FROM public.gigs g
  WHERE g.id = p_gig_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gig not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_studio_3nf(p_studio_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1
  FROM public.studios s
  WHERE s.id = p_studio_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Studio not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.drain_legacy_3nf(p_batch_size integer DEFAULT 1000)
RETURNS TABLE(entity text, drained integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'profiles'::text AS entity, 0::integer AS drained
  UNION ALL SELECT 'gigs'::text, 0::integer
  UNION ALL SELECT 'studios'::text, 0::integer
$$;

CREATE OR REPLACE FUNCTION public.contract_3nf_preflight()
RETURNS TABLE(metric text, value bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'profiles_skills_nonempty'::text, 0::bigint
  UNION ALL SELECT 'profiles_genres_nonempty', 0::bigint
  UNION ALL SELECT 'profiles_portfolio_nonempty', 0::bigint
  UNION ALL SELECT 'gigs_requirements_nonempty', 0::bigint
  UNION ALL SELECT 'gigs_images_nonempty', 0::bigint
  UNION ALL SELECT 'gigs_documents_nonempty', 0::bigint
  UNION ALL SELECT 'studios_amenities_nonempty', 0::bigint
  UNION ALL SELECT 'studios_images_nonempty', 0::bigint
  UNION ALL SELECT 'studios_instruments_nonempty', 0::bigint
  UNION ALL SELECT 'studios_types_nonempty_or_scalar', 0::bigint
  UNION ALL
  SELECT 'dup_profile_skills', COUNT(*)::bigint
  FROM (
    SELECT profile_id, skill
    FROM public.profile_skills
    GROUP BY profile_id, skill
    HAVING COUNT(*) > 1
  ) d1
  UNION ALL
  SELECT 'dup_gig_requirements', COUNT(*)::bigint
  FROM (
    SELECT gig_id, requirement_key
    FROM public.gig_requirements
    GROUP BY gig_id, requirement_key
    HAVING COUNT(*) > 1
  ) d2
  UNION ALL
  SELECT 'dup_studio_amenities', COUNT(*)::bigint
  FROM (
    SELECT studio_id, amenity
    FROM public.studio_amenities
    GROUP BY studio_id, amenity
    HAVING COUNT(*) > 1
  ) d3
  UNION ALL
  SELECT 'orphan_profile_skills', COUNT(*)::bigint
  FROM public.profile_skills ps
  LEFT JOIN public.profiles p ON p.id = ps.profile_id
  WHERE p.id IS NULL
  UNION ALL
  SELECT 'orphan_gig_requirements', COUNT(*)::bigint
  FROM public.gig_requirements gr
  LEFT JOIN public.gigs g ON g.id = gr.gig_id
  WHERE g.id IS NULL
  UNION ALL
  SELECT 'orphan_studio_amenities', COUNT(*)::bigint
  FROM public.studio_amenities sa
  LEFT JOIN public.studios s ON s.id = sa.studio_id
  WHERE s.id IS NULL;
$$;