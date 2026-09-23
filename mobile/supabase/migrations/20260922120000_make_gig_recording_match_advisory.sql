-- Gig performance-video recognition is advisory genre evidence only.
-- A completed fingerprint result is still required, but no ownership declaration
-- or manual copyright review is required to submit a gig application.

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

  if video_changed and new.video_url is not null
    and coalesce(new.video_copyright_status, 'not_screened') = 'not_screened' then
    raise exception 'Performance video audio screening result is required';
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

comment on column public.gig_applications.video_copyright_acknowledged is
  'Legacy field. Gig application recording recognition no longer requires an ownership or permission declaration.';

comment on column public.gig_applications.video_copyright_status is
  'Recording-fingerprint status. For gig applications, not_required may include a recognized track used only as advisory genre evidence.';
