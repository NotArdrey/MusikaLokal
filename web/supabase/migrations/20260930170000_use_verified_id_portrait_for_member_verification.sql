-- Switch registered-member video verification from public profile photos to the
-- holder portrait supplied by an approved government identity document.

begin;

alter table public.member_verification_reference_faces
  add column if not exists reference_source text not null default 'legacy_profile_photo';

alter table public.gig_application_member_verifications
  add column if not exists reference_source text not null default 'legacy_profile_photo';

alter table public.member_verification_reference_faces
  drop constraint if exists member_verification_reference_faces_source_check;
alter table public.member_verification_reference_faces
  add constraint member_verification_reference_faces_source_check check (
    reference_source in ('legacy_profile_photo', 'verified_id_portrait')
  );

alter table public.gig_application_member_verifications
  drop constraint if exists gig_application_member_verifications_source_check;
alter table public.gig_application_member_verifications
  add constraint gig_application_member_verifications_source_check check (
    reference_source in ('legacy_profile_photo', 'verified_id_portrait')
  );

comment on table public.member_verification_reference_faces is
  'Rekognition face-vector references derived from an approved identity-document holder portrait. Raw ID documents and portrait URLs are not stored here.';
comment on column public.member_verification_reference_faces.reference_source is
  'Origin class for the cached Rekognition face. Only verified_id_portrait references may be reused by current workers.';
comment on column public.gig_application_member_verifications.reference_source is
  'Reference-photo method for this result. Existing results remain legacy_profile_photo; new checks use verified_id_portrait.';
comment on column public.gig_applications.member_verification_consent is
  'Consent to compare the approved government-ID holder portrait with faces in the submitted performance video.';
comment on column public.gig_application_members.member_verification_consent is
  'Per-roster-member consent for approved government-ID portrait comparison against the submitted performance video.';
comment on column public.booking_requests.member_verification_consent is
  'Consent or group attestation to compare approved government-ID holder portraits with faces in the submitted connection-application video.';

commit;
