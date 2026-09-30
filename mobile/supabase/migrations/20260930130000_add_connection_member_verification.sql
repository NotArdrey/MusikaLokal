-- Extend the consent-gated registered-member presence verification used by gig
-- applications to group-member and production-team connection applications.

begin;

alter table public.booking_requests
  add column if not exists member_verification_consent boolean not null default false,
  add column if not exists member_verification_consented_at timestamptz;

create or replace function public.normalize_booking_request_member_verification_consent()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.member_verification_consent then
    if tg_op = 'INSERT' or not coalesce(old.member_verification_consent, false) then
      new.member_verification_consented_at := now();
    else
      new.member_verification_consented_at := coalesce(old.member_verification_consented_at, now());
    end if;
  else
    new.member_verification_consented_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_booking_request_member_verification_consent
  on public.booking_requests;
create trigger trg_normalize_booking_request_member_verification_consent
before insert or update of member_verification_consent, member_verification_consented_at
on public.booking_requests
for each row execute function public.normalize_booking_request_member_verification_consent();

comment on column public.booking_requests.member_verification_consent is
  'Applicant consent to compare their registered profile photo with faces in the submitted connection-application video.';
comment on column public.booking_requests.member_verification_consented_at is
  'Server-recorded time at which registered-member verification consent was granted.';

alter table public.gig_application_member_verifications
  alter column application_id drop not null,
  add column if not exists booking_request_id uuid unique references public.booking_requests(id) on delete cascade;

alter table public.gig_application_member_verifications
  drop constraint if exists gig_application_member_verifications_target_check;
alter table public.gig_application_member_verifications
  add constraint gig_application_member_verifications_target_check check (
    (application_id is not null and booking_request_id is null)
    or (application_id is null and booking_request_id is not null)
  );

alter table public.gig_application_member_verification_results
  alter column application_id drop not null,
  add column if not exists booking_request_id uuid references public.booking_requests(id) on delete cascade;

alter table public.gig_application_member_verification_results
  drop constraint if exists gig_application_member_verification_results_target_check;
alter table public.gig_application_member_verification_results
  add constraint gig_application_member_verification_results_target_check check (
    (application_id is not null and booking_request_id is null)
    or (application_id is null and booking_request_id is not null)
  );

create index if not exists idx_member_verification_results_booking_request
  on public.gig_application_member_verification_results (booking_request_id, status)
  where booking_request_id is not null;

comment on table public.gig_application_member_verifications is
  'Asynchronous registered-member presence verification for either a gig application or a connection application.';
comment on column public.gig_application_member_verifications.booking_request_id is
  'Connection application being verified when application_id is null.';

commit;
