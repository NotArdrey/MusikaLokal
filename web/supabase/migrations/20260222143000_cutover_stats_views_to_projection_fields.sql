BEGIN;

-- Read cutover: keep API shape but source denormalized payload fields
-- from projection views so stats views no longer depend on legacy columns.

CREATE OR REPLACE VIEW public.profiles_with_stats AS
SELECT
  p.id,
  p.email,
  p.full_name,
  p.avatar_url,
  p.role,
  p.bio,
  p.location,
  plp.skills,
  plp.genres,
  plp.portfolio_urls,
  p.is_verified,
  p.verification_status,
  p.didit_session_id,
  p.id_document_expiry,
  p.id_verified_at,
  p.created_at,
  COALESCE(AVG(r.rating), 0::numeric) AS rating,
  COUNT(r.id) AS review_count
FROM public.profiles p
LEFT JOIN public.reviews r ON r.user_id = p.id
LEFT JOIN public.profiles_legacy_projection plp ON plp.id = p.id
GROUP BY
  p.id,
  p.email,
  p.full_name,
  p.avatar_url,
  p.role,
  p.bio,
  p.location,
  plp.skills,
  plp.genres,
  plp.portfolio_urls,
  p.is_verified,
  p.verification_status,
  p.didit_session_id,
  p.id_document_expiry,
  p.id_verified_at,
  p.created_at;

CREATE OR REPLACE VIEW public.gigs_with_stats AS
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
  g.business_permit_url,
  g.availability,
  g.address_verification_status,
  g.address_verification_session_id,
  g.address_verified_at,
  g.verified_address,
  g.address_verification_completed_at,
  COALESCE(AVG(r.rating), 0::numeric) AS rating,
  COUNT(r.id) AS review_count
FROM public.gigs g
LEFT JOIN public.reviews r ON r.gig_id = g.id
LEFT JOIN public.gigs_legacy_projection glp ON glp.id = g.id
GROUP BY
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
  g.business_permit_url,
  g.availability,
  g.address_verification_status,
  g.address_verification_session_id,
  g.address_verified_at,
  g.verified_address,
  g.address_verification_completed_at;

CREATE OR REPLACE VIEW public.studios_with_stats AS
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
    WHEN coalesce(array_length(slp.types, 1), 0) > 0 THEN slp.types[1]
    ELSE NULL
  END AS type,
  slp.types,
  s.rehearsal_rate,
  s.recording_rate,
  s.open_dates,
  s.pax,
  COALESCE(r.rating, 0::numeric) AS rating,
  COALESCE(r.review_count, 0::bigint) AS review_count,
  COALESCE(b.completion_rate, 100::numeric) AS completion_rate,
  COALESCE(ss.lead_time_hours, 24) AS lead_time_hours,
  COALESCE(ss.weekend_multiplier, 1.0) AS weekend_multiplier,
  COALESCE(ss.peak_season_multiplier, 1.0) AS peak_season_multiplier,
  COALESCE(ss.peak_season_dates, '[]'::jsonb) AS peak_season_dates,
  COALESCE(ss.off_peak_multiplier, 1.0) AS off_peak_multiplier,
  COALESCE(ss.off_peak_dates, '[]'::jsonb) AS off_peak_dates,
  COALESCE(ss.holiday_multiplier, 1.0) AS holiday_multiplier,
  CASE
    WHEN ss.peak_season_multiplier IS NOT NULL AND ss.peak_season_multiplier <> 1.0 THEN true
    WHEN ss.off_peak_multiplier IS NOT NULL AND ss.off_peak_multiplier <> 1.0 THEN true
    WHEN ss.weekend_multiplier IS NOT NULL AND ss.weekend_multiplier <> 1.0 THEN true
    ELSE false
  END AS has_seasonal_pricing,
  EXISTS (
    SELECT 1
    FROM public.studio_date_overrides sdo
    WHERE sdo.studio_id = s.id
  ) AS has_special_dates
FROM public.studios s
LEFT JOIN (
  SELECT
    rv.studio_id,
    AVG(rv.rating) AS rating,
    COUNT(rv.id) AS review_count
  FROM public.reviews rv
  GROUP BY rv.studio_id
) r ON r.studio_id = s.id
LEFT JOIN (
  SELECT
    sb.studio_id,
    CASE
      WHEN COUNT(sb.id) = 0 THEN 100::numeric
      ELSE ROUND((COUNT(CASE WHEN sb.status = 'completed' THEN 1 END)::numeric / COUNT(sb.id)::numeric) * 100::numeric, 0)
    END AS completion_rate
  FROM public.studio_bookings sb
  WHERE sb.status = ANY (ARRAY['completed'::text, 'cancelled'::text])
  GROUP BY sb.studio_id
) b ON b.studio_id = s.id
LEFT JOIN public.studio_settings ss ON ss.studio_id = s.id
LEFT JOIN public.studios_legacy_projection slp ON slp.id = s.id;

COMMIT;
