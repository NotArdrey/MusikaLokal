BEGIN;

-- Completion rate should measure completed contracts against musician-side
-- accepted-contract withdrawals. Being fired, rejected, or cancelled by the
-- organizer should remain historical context without lowering the public rate.

ALTER TABLE public.gig_applications
ADD COLUMN IF NOT EXISTS completion_rate_penalty boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.gig_applications.completion_rate_penalty IS
  'True only when a performer withdraws from an accepted upcoming gig and the outcome should lower completion rate.';

CREATE INDEX IF NOT EXISTS idx_gig_applications_solo_completion_penalty
  ON public.gig_applications (applicant_id, status)
  WHERE group_id IS NULL
    AND (status = 'completed' OR completion_rate_penalty = true);

CREATE INDEX IF NOT EXISTS idx_gig_applications_group_completion_penalty
  ON public.gig_applications (group_id, status)
  WHERE group_id IS NOT NULL
    AND (status = 'completed' OR completion_rate_penalty = true);

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
  COUNT(r.id) AS review_count,
  pc.completion_rate
FROM public.profiles p
LEFT JOIN public.reviews r ON r.user_id = p.id
LEFT JOIN public.profiles_legacy_projection plp ON plp.id = p.id
LEFT JOIN (
  SELECT
    ga.applicant_id,
    ROUND(
      (
        COUNT(*) FILTER (WHERE ga.status = 'completed')::numeric
        / NULLIF(COUNT(*), 0)::numeric
      ) * 100::numeric,
      0
    ) AS completion_rate
  FROM public.gig_applications ga
  WHERE ga.group_id IS NULL
    AND (ga.status = 'completed' OR ga.completion_rate_penalty = true)
  GROUP BY ga.applicant_id
) pc ON pc.applicant_id = p.id
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
  p.created_at,
  pc.completion_rate;

CREATE OR REPLACE VIEW public.groups_with_stats AS
SELECT
  g.id,
  g.owner_id,
  g.name,
  g.genre,
  g.description,
  glp.members,
  g.location,
  glp.images,
  g.latitude,
  g.longitude,
  g.rate,
  g.created_at,
  g.group_type,
  COALESCE(gap.availability, '[]'::jsonb) AS availability,
  COALESCE(AVG(r.rating), 0::numeric) AS rating,
  COUNT(r.id) AS review_count,
  gc.completion_rate
FROM public.groups g
LEFT JOIN public.reviews r ON r.group_id = g.id
LEFT JOIN public.groups_legacy_projection glp ON glp.id = g.id
LEFT JOIN public.groups_availability_projection gap ON gap.group_id = g.id
LEFT JOIN (
  SELECT
    ga.group_id,
    ROUND(
      (
        COUNT(*) FILTER (WHERE ga.status = 'completed')::numeric
        / NULLIF(COUNT(*), 0)::numeric
      ) * 100::numeric,
      0
    ) AS completion_rate
  FROM public.gig_applications ga
  WHERE ga.group_id IS NOT NULL
    AND (ga.status = 'completed' OR ga.completion_rate_penalty = true)
  GROUP BY ga.group_id
) gc ON gc.group_id = g.id
GROUP BY
  g.id,
  g.owner_id,
  g.name,
  g.genre,
  g.description,
  glp.members,
  g.location,
  glp.images,
  g.latitude,
  g.longitude,
  g.rate,
  g.created_at,
  g.group_type,
  gap.availability,
  gc.completion_rate;

COMMIT;
