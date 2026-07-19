-- Copyright ownership/permission screening for gig performance videos.

alter table public.gig_applications
  add column if not exists video_copyright_acknowledged boolean not null default false,
  add column if not exists video_copyright_acknowledged_at timestamptz,
  add column if not exists video_copyright_status text not null default 'not_screened',
  add column if not exists video_copyright_review_id uuid references public.manual_identity_reviews(id) on delete set null,
  add column if not exists video_copyright_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gig_applications_video_copyright_status_check'
      and conrelid = 'public.gig_applications'::regclass
  ) then
    alter table public.gig_applications
      add constraint gig_applications_video_copyright_status_check
      check (video_copyright_status in ('not_screened', 'not_required', 'pending_review', 'approved', 'declined'));
  end if;
end $$;

create index if not exists idx_gig_applications_video_copyright_review
  on public.gig_applications (video_copyright_review_id)
  where video_copyright_review_id is not null;

create or replace function public.normalize_gig_video_copyright_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_review public.manual_identity_reviews%rowtype;
  expected_user_id uuid;
  video_changed boolean;
begin
  expected_user_id := coalesce(new.submitted_by_user_id, new.applicant_id);
  video_changed := tg_op = 'INSERT' or new.video_url is distinct from old.video_url;

  if video_changed and new.video_url is not null then
    if coalesce(new.video_copyright_acknowledged, false) is not true then
      raise exception 'Performance video rights acknowledgment is required';
    end if;

    if coalesce(new.video_copyright_status, 'not_screened') = 'not_screened' then
      raise exception 'Performance video copyright screening result is required';
    end if;
  end if;

  if new.video_copyright_acknowledged then
    if tg_op = 'INSERT' or not coalesce(old.video_copyright_acknowledged, false) then
      new.video_copyright_acknowledged_at := now();
    else
      new.video_copyright_acknowledged_at := coalesce(old.video_copyright_acknowledged_at, now());
    end if;
  else
    new.video_copyright_acknowledged_at := null;
  end if;

  if new.video_copyright_review_id is not null then
    select * into linked_review
    from public.manual_identity_reviews
    where id = new.video_copyright_review_id;

    if not found
      or linked_review.user_id is distinct from expected_user_id
      or upper(coalesce(linked_review.source, '')) <> 'COPYRIGHT_OWNERSHIP' then
      raise exception 'Invalid performance video copyright review';
    end if;

    new.video_copyright_status := case upper(coalesce(linked_review.status, ''))
      when 'APPROVED' then 'approved'
      when 'DECLINED' then 'declined'
      else 'pending_review'
    end;
    new.video_copyright_metadata := coalesce(new.video_copyright_metadata, '{}'::jsonb)
      || coalesce(linked_review.metadata, '{}'::jsonb)
      || jsonb_build_object('manual_identity_review_id', linked_review.id, 'review_status', linked_review.status);
  elsif coalesce(new.video_copyright_status, 'not_screened') not in ('not_screened', 'not_required') then
    raise exception 'A copyright review ID is required for this performance video status';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_gig_video_copyright_fields on public.gig_applications;
create trigger trg_normalize_gig_video_copyright_fields
before insert or update of video_url, video_copyright_acknowledged, video_copyright_acknowledged_at,
  video_copyright_status, video_copyright_review_id, video_copyright_metadata
on public.gig_applications
for each row
execute function public.normalize_gig_video_copyright_fields();

create or replace function public.sync_gig_video_copyright_status_from_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if upper(coalesce(new.source, '')) <> 'COPYRIGHT_OWNERSHIP' then
    return null;
  end if;

  update public.gig_applications
  set
    video_copyright_status = case upper(coalesce(new.status, ''))
      when 'APPROVED' then 'approved'
      when 'DECLINED' then 'declined'
      else 'pending_review'
    end,
    video_copyright_metadata = coalesce(video_copyright_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'manual_identity_review_id', new.id,
        'review_status', new.status,
        'reviewed_at', new.reviewed_at,
        'reviewed_by', new.reviewed_by
      )
  where video_copyright_review_id = new.id;

  return null;
end;
$$;

drop trigger if exists trg_sync_gig_video_copyright_status_from_review on public.manual_identity_reviews;
create trigger trg_sync_gig_video_copyright_status_from_review
after update of status on public.manual_identity_reviews
for each row
execute function public.sync_gig_video_copyright_status_from_review();

comment on column public.gig_applications.video_copyright_status is
  'Released-recording fingerprint status. not_screened marks legacy applications; this is not a legal copyright determination.';
comment on column public.gig_applications.video_copyright_review_id is
  'Identity Review case used to review the applicant ownership, license, or permission claim for a matched recording.';
