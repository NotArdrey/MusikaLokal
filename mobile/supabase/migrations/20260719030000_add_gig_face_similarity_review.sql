-- Consent-gated advisory face similarity between an applicant profile photo and video frames.

alter table public.gig_applications
  add column if not exists ai_review_frame_urls jsonb not null default '[]'::jsonb;

alter table public.gig_application_ai_reviews
  add column if not exists face_similarity jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gig_applications_ai_review_frame_urls_check'
      and conrelid = 'public.gig_applications'::regclass
  ) then
    alter table public.gig_applications
      add constraint gig_applications_ai_review_frame_urls_check
      check (
        jsonb_typeof(ai_review_frame_urls) = 'array'
        and jsonb_array_length(ai_review_frame_urls) <= 3
      );
  end if;
end $$;

create or replace function public.normalize_gig_ai_review_frames()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not coalesce(new.ai_portfolio_review_consent, false) then
    new.ai_review_frame_url := null;
    new.ai_review_frame_urls := '[]'::jsonb;
    return new;
  end if;

  if jsonb_typeof(coalesce(new.ai_review_frame_urls, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(new.ai_review_frame_urls, '[]'::jsonb)) > 3 then
    raise exception 'AI review frames must be a JSON array containing at most three URLs';
  end if;

  if new.ai_review_frame_url is not null
    and jsonb_array_length(coalesce(new.ai_review_frame_urls, '[]'::jsonb)) = 0 then
    new.ai_review_frame_urls := jsonb_build_array(new.ai_review_frame_url);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_gig_ai_review_frames on public.gig_applications;
create trigger trg_normalize_gig_ai_review_frames
before insert or update of ai_portfolio_review_consent, ai_review_frame_url, ai_review_frame_urls
on public.gig_applications
for each row
execute function public.normalize_gig_ai_review_frames();

comment on column public.gig_application_ai_reviews.face_similarity is
  'Consent-gated advisory comparison of a solo applicant profile photo with representative video frames. Never identity verification or an automated decision.';
