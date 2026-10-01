-- Require the profile reference and approved ID reference to resolve to the
-- same tracked video person for every solo or roster member.

begin;

alter table public.gig_application_member_verification_results
  drop constraint if exists gig_application_member_verification_results_profile_status_check;
alter table public.gig_application_member_verification_results
  add constraint gig_application_member_verification_results_profile_status_check check (
    profile_status is null or profile_status in (
      'verified', 'needs_review', 'no_reference', 'reference_unusable', 'mismatch'
    )
  );

alter table public.gig_application_member_verification_results
  add column if not exists profile_issue_code text;

alter table public.gig_application_member_verification_results
  drop constraint if exists gig_application_member_verification_results_profile_issue_check;
alter table public.gig_application_member_verification_results
  add constraint gig_application_member_verification_results_profile_issue_check check (
    profile_issue_code is null or profile_issue_code in (
      'matches_another_member',
      'different_video_person',
      'identity_not_confirmed',
      'not_found_in_video'
    )
  );

comment on column public.gig_application_member_verification_results.profile_status is
  'Secondary profile-photo status. verified requires the profile and approved ID references to match the same tracked video person.';
comment on column public.gig_application_member_verification_results.profile_issue_code is
  'Reason the secondary profile-photo comparison needs review or mismatches the ID-verified video person.';

commit;
