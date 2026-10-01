-- Add a secondary profile-photo comparison to registered-member video
-- verification. The approved ID-holder portrait remains the authoritative
-- identity result; profile-photo results are advisory and stored separately.

begin;

alter table public.member_verification_reference_faces
  drop constraint if exists member_verification_reference_faces_source_check;
alter table public.member_verification_reference_faces
  add constraint member_verification_reference_faces_source_check check (
    reference_source in ('legacy_profile_photo', 'verified_id_portrait', 'profile_photo')
  );

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select constraint_row.conname
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.member_verification_reference_faces'::regclass
      and constraint_row.contype = 'u'
      and pg_get_constraintdef(constraint_row.oid) = 'UNIQUE (member_id, collection_id)'
  loop
    execute format(
      'alter table public.member_verification_reference_faces drop constraint %I',
      constraint_name
    );
  end loop;
end;
$$;

alter table public.member_verification_reference_faces
  drop constraint if exists member_verification_reference_faces_member_source_key;
alter table public.member_verification_reference_faces
  add constraint member_verification_reference_faces_member_source_key
  unique (member_id, collection_id, reference_source);

alter table public.gig_application_member_verifications
  drop constraint if exists gig_application_member_verifications_source_check;
alter table public.gig_application_member_verifications
  add constraint gig_application_member_verifications_source_check check (
    reference_source in (
      'legacy_profile_photo',
      'verified_id_portrait',
      'verified_id_and_profile_photo'
    )
  );

alter table public.gig_application_member_verification_results
  add column if not exists profile_reference_face_id uuid
    references public.member_verification_reference_faces(id) on delete set null,
  add column if not exists profile_status text check (
    profile_status is null or profile_status in (
      'verified', 'needs_review', 'no_reference', 'reference_unusable'
    )
  ),
  add column if not exists profile_best_similarity numeric check (
    profile_best_similarity is null or profile_best_similarity between 0 and 100
  ),
  add column if not exists profile_match_count integer not null default 0 check (
    profile_match_count >= 0
  ),
  add column if not exists profile_first_match_timestamp_ms bigint check (
    profile_first_match_timestamp_ms is null or profile_first_match_timestamp_ms >= 0
  ),
  add column if not exists profile_best_match_timestamp_ms bigint check (
    profile_best_match_timestamp_ms is null or profile_best_match_timestamp_ms >= 0
  ),
  add column if not exists profile_matched_person_indexes integer[] not null default '{}';

comment on table public.member_verification_reference_faces is
  'Rekognition face-vector references for approved ID-holder portraits and registered profile photos. Original images and raw vectors are not stored here.';
comment on column public.gig_application_member_verifications.reference_source is
  'Reference-photo method for the result. New dual-reference checks use verified_id_and_profile_photo; existing results retain their historical method.';
comment on column public.gig_application_member_verification_results.profile_status is
  'Secondary profile-photo-to-video comparison. This does not establish identity or override the approved-ID result.';
comment on column public.gig_application_member_verification_results.profile_best_similarity is
  'Best advisory similarity between the registered profile-photo face and a face in the submitted video.';
comment on column public.gig_applications.member_verification_consent is
  'Consent to compare both the approved government-ID holder portrait and registered profile photo with faces in the submitted performance video.';
comment on column public.gig_application_members.member_verification_consent is
  'Per-roster-member consent for approved ID-holder portrait and registered profile-photo comparison against the submitted performance video.';
comment on column public.booking_requests.member_verification_consent is
  'Consent or group attestation to compare approved ID-holder portraits and registered profile photos with faces in the submitted connection-application video.';

commit;
