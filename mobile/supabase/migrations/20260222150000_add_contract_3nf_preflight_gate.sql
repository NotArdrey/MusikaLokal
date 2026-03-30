BEGIN;

-- Preflight gate for destructive contract phase.
-- This is non-destructive and can be run anytime before null/drop migrations.

DROP FUNCTION IF EXISTS public.contract_3nf_preflight();

CREATE OR REPLACE FUNCTION public.contract_3nf_preflight()
RETURNS TABLE(metric text, value bigint)
LANGUAGE sql
AS $$
  WITH c AS (
    SELECT
      (SELECT count(*) FROM public.profiles WHERE coalesce(array_length(skills,1),0) > 0) AS profiles_skills_nonempty,
      (SELECT count(*) FROM public.profiles WHERE coalesce(array_length(genres,1),0) > 0) AS profiles_genres_nonempty,
      (SELECT count(*) FROM public.profiles WHERE coalesce(array_length(portfolio_urls,1),0) > 0) AS profiles_portfolio_nonempty,
      (SELECT count(*) FROM public.gigs WHERE requirements IS NOT NULL AND requirements <> '{}'::jsonb) AS gigs_requirements_nonempty,
      (SELECT count(*) FROM public.gigs WHERE coalesce(array_length(images,1),0) > 0) AS gigs_images_nonempty,
      (SELECT count(*) FROM public.gigs WHERE coalesce(array_length(documents,1),0) > 0) AS gigs_documents_nonempty,
      (SELECT count(*) FROM public.studios WHERE coalesce(array_length(amenities,1),0) > 0) AS studios_amenities_nonempty,
      (SELECT count(*) FROM public.studios WHERE coalesce(array_length(images,1),0) > 0) AS studios_images_nonempty,
      (SELECT count(*) FROM public.studios WHERE instruments IS NOT NULL AND instruments <> '[]'::jsonb) AS studios_instruments_nonempty,
      (SELECT count(*) FROM public.studios WHERE coalesce(array_length(types,1),0) > 0 OR type IS NOT NULL) AS studios_types_nonempty_or_scalar,
      (SELECT count(*) FROM (
          SELECT profile_id, skill, count(*) c FROM public.profile_skills GROUP BY 1,2 HAVING count(*) > 1
      ) d) AS dup_profile_skills,
      (SELECT count(*) FROM (
          SELECT gig_id, requirement_key, count(*) c FROM public.gig_requirements GROUP BY 1,2 HAVING count(*) > 1
      ) d) AS dup_gig_requirements,
      (SELECT count(*) FROM (
          SELECT studio_id, amenity, count(*) c FROM public.studio_amenities GROUP BY 1,2 HAVING count(*) > 1
      ) d) AS dup_studio_amenities,
      (SELECT count(*) FROM public.profile_skills ps LEFT JOIN public.profiles p ON p.id = ps.profile_id WHERE p.id IS NULL) AS orphan_profile_skills,
      (SELECT count(*) FROM public.gig_requirements gr LEFT JOIN public.gigs g ON g.id = gr.gig_id WHERE g.id IS NULL) AS orphan_gig_requirements,
      (SELECT count(*) FROM public.studio_amenities sa LEFT JOIN public.studios s ON s.id = sa.studio_id WHERE s.id IS NULL) AS orphan_studio_amenities
  )
  SELECT 'profiles_skills_nonempty', profiles_skills_nonempty FROM c
  UNION ALL SELECT 'profiles_genres_nonempty', profiles_genres_nonempty FROM c
  UNION ALL SELECT 'profiles_portfolio_nonempty', profiles_portfolio_nonempty FROM c
  UNION ALL SELECT 'gigs_requirements_nonempty', gigs_requirements_nonempty FROM c
  UNION ALL SELECT 'gigs_images_nonempty', gigs_images_nonempty FROM c
  UNION ALL SELECT 'gigs_documents_nonempty', gigs_documents_nonempty FROM c
  UNION ALL SELECT 'studios_amenities_nonempty', studios_amenities_nonempty FROM c
  UNION ALL SELECT 'studios_images_nonempty', studios_images_nonempty FROM c
  UNION ALL SELECT 'studios_instruments_nonempty', studios_instruments_nonempty FROM c
  UNION ALL SELECT 'studios_types_nonempty_or_scalar', studios_types_nonempty_or_scalar FROM c
  UNION ALL SELECT 'dup_profile_skills', dup_profile_skills FROM c
  UNION ALL SELECT 'dup_gig_requirements', dup_gig_requirements FROM c
  UNION ALL SELECT 'dup_studio_amenities', dup_studio_amenities FROM c
  UNION ALL SELECT 'orphan_profile_skills', orphan_profile_skills FROM c
  UNION ALL SELECT 'orphan_gig_requirements', orphan_gig_requirements FROM c
  UNION ALL SELECT 'orphan_studio_amenities', orphan_studio_amenities FROM c;
$$;

COMMIT;
