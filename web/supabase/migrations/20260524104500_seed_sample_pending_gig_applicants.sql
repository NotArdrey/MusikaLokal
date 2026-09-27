BEGIN;
-- Demo data for applicant-count UI: pending applications on the open Malolos gig.
-- Idempotent and duplicate-safe against the active direct-applicant unique index.

WITH target_gig AS (
  SELECT id AS gig_id
  FROM public.gigs
  WHERE id = '9f0f8e11-5f21-4a00-8b00-000000000302'::uuid
    AND name = 'Malolos Weekend Stage'
  LIMIT 1
),
sample_rows(application_id, applicant_email, pitch_message, slot_type) AS (
  VALUES
    (
      '77777777-7777-4777-8777-000000000301'::uuid,
      'bea.navarro@gmail.com',
      'I can bring a bright acoustic-pop set with familiar OPM covers and a few originals.',
      'solo'
    ),
    (
      '77777777-7777-4777-8777-000000000302'::uuid,
      'carlo.santos@gmail.com',
      'Available for a guitar-forward set that can open the night and keep the crowd warm.',
      'solo'
    ),
    (
      '77777777-7777-4777-8777-000000000303'::uuid,
      'aira.bautista@gmail.com',
      'I can perform a mellow vocal set with keyboard accompaniment for the early slot.',
      'solo'
    ),
    (
      '77777777-7777-4777-8777-000000000304'::uuid,
      'paolo.mendoza@gmail.com',
      'Ready for an upbeat indie set with clean transitions and flexible timing.',
      'solo'
    )
),
candidate_applications AS (
  SELECT
    sr.application_id,
    p.id AS applicant_id,
    tg.gig_id,
    sr.pitch_message,
    sr.slot_type
  FROM sample_rows sr
  JOIN public.profiles p
    ON lower(p.email) = lower(sr.applicant_email)
   AND p.role = 'musician'
  CROSS JOIN target_gig tg
),
insertable_applications AS (
  SELECT ca.*
  FROM candidate_applications ca
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.gig_applications ga
    WHERE ga.id = ca.application_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.gig_applications ga
    WHERE ga.gig_id = ca.gig_id
      AND ga.applicant_id = ca.applicant_id
      AND ga.group_id IS NULL
      AND ga.production_team_id IS NULL
      AND ga.status = ANY (ARRAY['pending'::text, 'accepted'::text, 'approved'::text])
  )
)
INSERT INTO public.gig_applications (
  id,
  applicant_id,
  group_id,
  gig_id,
  status,
  pitch_message,
  slot_type,
  submitted_by_user_id,
  leader_approval_status,
  is_solo_application,
  show_on_profile
)
SELECT
  application_id,
  applicant_id,
  NULL,
  gig_id,
  'pending',
  pitch_message,
  slot_type,
  applicant_id,
  NULL,
  true,
  false
FROM insertable_applications;
;
COMMIT;
