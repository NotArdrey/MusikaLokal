-- Keep qualification scoring separate from major document-verification gates.
-- A CV-name mismatch does not alter the weighted fit score, but it prevents the
-- recommendation from being presented as ready until an organizer reviews it.

alter table public.gig_application_recommendations
  drop constraint if exists gig_application_recommendations_recommendation_status_check;

alter table public.gig_application_recommendations
  add constraint gig_application_recommendations_recommendation_status_check
  check (
    recommendation_status in (
      'recommended',
      'possible_match',
      'not_eligible',
      'insufficient_data',
      'needs_review'
    )
  );

comment on column public.gig_application_recommendations.recommendation_status is
  'Advisory presentation state. needs_review is a separate verification gate and does not change the weighted gig-fit score.';
