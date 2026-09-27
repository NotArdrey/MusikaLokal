create or replace function public.set_gig_identity_document_review_consent_timestamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.production_roster_id is not null then
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

comment on column public.gig_applications.identity_document_review_consent is
  'Explicit per-application consent from the submitting representative to use and show approved ID fronts. For duo or group applications, this covers only the immutable snapshotted lineup.';

comment on column public.gig_applications.identity_document_review_consented_at is
  'Time at which the submitting applicant or group representative granted identity-document use and disclosure consent for this application.';

comment on column public.gig_application_ai_reviews.face_similarity is
  'Consent-gated advisory comparison of approved ID images with representative video frames. Never identity verification or an automated decision.';
