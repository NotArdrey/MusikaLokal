alter table public.gig_applications
  add column if not exists identity_document_review_consent boolean not null default false,
  add column if not exists identity_document_review_consented_at timestamptz;

create or replace function public.set_gig_identity_document_review_consent_timestamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.group_id is not null or new.production_roster_id is not null then
    new.identity_document_review_consent := false;
    new.identity_document_review_consented_at := null;
  elsif new.identity_document_review_consent then
    if tg_op = 'INSERT' then
      new.identity_document_review_consented_at := now();
    elsif not coalesce(old.identity_document_review_consent, false) then
      new.identity_document_review_consented_at := now();
    else
      new.identity_document_review_consented_at := coalesce(old.identity_document_review_consented_at, now());
    end if;
  else
    new.identity_document_review_consented_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_gig_identity_document_review_consent_timestamp
  on public.gig_applications;
create trigger trg_set_gig_identity_document_review_consent_timestamp
before insert or update of identity_document_review_consent, group_id, production_roster_id
on public.gig_applications
for each row execute function public.set_gig_identity_document_review_consent_timestamp();

comment on column public.gig_applications.identity_document_review_consent is
  'Explicit per-application consent for a solo applicant approved ID front image to be used as the Face++ reference and shown to the authorized gig manager. Never applies to group or represented-performer applications.';

comment on column public.gig_applications.identity_document_review_consented_at is
  'Time at which the solo applicant granted ID-image use and disclosure consent for this application.';

comment on column public.gig_application_ai_reviews.face_similarity is
  'Consent-gated advisory comparison of a solo applicant approved ID image with representative video frames. Never identity verification or an automated decision.';
