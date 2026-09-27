-- Gig application review no longer uses identity documents or profile photos
-- as reference images for performance-video face matching.

drop trigger if exists trg_set_gig_identity_document_review_consent_timestamp
  on public.gig_applications;
drop trigger if exists trg_snapshot_gig_ai_review_group_members
  on public.gig_applications;

drop function if exists public.set_gig_identity_document_review_consent_timestamp();
drop function if exists public.snapshot_gig_ai_review_group_members();

update public.gig_application_ai_reviews as review
set source_summary = coalesce(review.source_summary, '{}'::jsonb)
      - 'identity_document_compared'
      - 'face_reference_source'
      - 'face_match_provider'
      - 'face_match_model'
      - 'face_match_threshold_tier'
      - 'face_match_threshold'
      - 'face_match_aggregation'
      - 'group_members_snapshotted'
      - 'group_profile_photos_compared'
      - 'group_identity_documents_compared',
    limitations = coalesce((
      select jsonb_agg(item.value)
      from jsonb_array_elements(coalesce(review.limitations, '[]'::jsonb)) as item(value)
      where lower(item.value #>> '{}') !~ '(face|identity document|approved id)'
    ), '[]'::jsonb),
    model_provider = replace(review.model_provider, '+faceplusplus', ''),
    model_version = split_part(review.model_version, '; face=', 1);

alter table public.gig_applications
  drop column if exists identity_document_review_consent,
  drop column if exists identity_document_review_consented_at,
  drop column if exists ai_review_group_member_ids;

alter table public.gig_application_ai_reviews
  drop column if exists face_similarity,
  drop column if exists group_face_similarity;
