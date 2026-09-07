-- Gig history is a limited projection: applicants never receive another
-- applicant's CV, video, pitch, contact details, or private review notes.
create or replace function public.fetch_gig_history(p_offset integer default 0, p_limit integer default 10)
returns jsonb language sql stable security definer set search_path = '' as $$
  with visible_gigs as (
    select g.* from public.gigs g
    where auth.uid() is not null and (
      g.organizer_id = auth.uid() or public.staff_can_edit_gig(auth.uid(), g.id) or exists (
        select 1 from public.gig_applications a where a.gig_id = g.id and (
          a.applicant_id = auth.uid() or a.submitted_by_user_id = auth.uid()
          or public.can_view_gig_application_readonly_participant(a.id)
        )
      )
    )
    order by g.created_at desc, g.id desc
    limit least(greatest(p_limit, 1), 25) + 1 offset greatest(p_offset, 0)
  ), cards as (
    select g.created_at, g.id, jsonb_build_object(
      'id', g.id, 'name', g.name, 'event_date', g.event_date,
      'created_at', g.created_at, 'status', g.status, 'location', g.location,
      'is_owner', g.organizer_id = auth.uid() or public.staff_can_edit_gig(auth.uid(), g.id),
      'applicants', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id, 'applicant_id', a.applicant_id,
          'name', coalesce(gr.name, p.full_name, 'Applicant'),
          'avatar_url', p.avatar_url, 'group_id', a.group_id,
          'status', a.status, 'created_at', a.created_at,
          'is_self', a.applicant_id = auth.uid() or a.submitted_by_user_id = auth.uid()
            or public.can_view_gig_application_readonly_participant(a.id)
        ) order by a.created_at, a.id)
        from public.gig_applications a
        left join public.profiles p on p.id = a.applicant_id
        left join public.groups gr on gr.id = a.group_id
        where a.gig_id = g.id
      ), '[]'::jsonb)
    ) as card from visible_gigs g
  ) select coalesce(jsonb_agg(card order by created_at desc, id desc), '[]'::jsonb) from cards;
$$;
revoke all on function public.fetch_gig_history(integer, integer) from public, anon;
grant execute on function public.fetch_gig_history(integer, integer) to authenticated;
create index if not exists gigs_organizer_created_history_idx on public.gigs(organizer_id, created_at desc, id desc);
create index if not exists gig_applications_gig_created_history_idx on public.gig_applications(gig_id, created_at, id);

create table public.upload_moderation_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  uploader_name text,
  uploader_email text,
  content_hash text not null,
  context text not null,
  related_type text,
  related_id uuid,
  file_name text not null,
  media_kind text not null check (media_kind in ('photo', 'video', 'document')),
  preview_path text,
  media_path text,
  mime_type text,
  categories jsonb not null default '[]',
  confidence double precision check (confidence between 0 and 1),
  provider text,
  reason text not null,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected')),
  version integer not null default 0,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  evidence_delete_after timestamptz,
  evidence_deleted_at timestamptz,
  unique(user_id, content_hash, context)
);
create index upload_moderation_queue_idx on public.upload_moderation_cases(status, created_at desc, id);
create index upload_moderation_expiry_idx on public.upload_moderation_cases(evidence_delete_after) where evidence_delete_after is not null;
create table public.upload_moderation_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.upload_moderation_cases(id),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  action text not null,
  previous_status text,
  new_status text not null,
  notes text,
  created_at timestamptz not null default now()
);
create index upload_moderation_history_case_idx on public.upload_moderation_history(case_id, created_at);
create table public.upload_moderation_restrictions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  restricted_until timestamptz not null,
  case_id uuid not null references public.upload_moderation_cases(id)
);
alter table public.upload_moderation_cases enable row level security;
alter table public.upload_moderation_history enable row level security;
alter table public.upload_moderation_restrictions enable row level security;
-- All writes go through the authenticated Edge Functions / service RPC.
revoke all on public.upload_moderation_cases, public.upload_moderation_history, public.upload_moderation_restrictions from anon, authenticated;
grant all on public.upload_moderation_cases, public.upload_moderation_history, public.upload_moderation_restrictions to service_role;
revoke update, delete, truncate on public.upload_moderation_history from service_role;

create or replace function public.snapshot_upload_moderation_uploader()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select full_name, email into new.uploader_name, new.uploader_email from public.profiles where id = new.user_id;
  return new;
end;
$$;
revoke all on function public.snapshot_upload_moderation_uploader() from public;
create trigger snapshot_upload_moderation_uploader before insert on public.upload_moderation_cases
for each row execute function public.snapshot_upload_moderation_uploader();

create or replace function public.audit_upload_moderation_creation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.upload_moderation_history(case_id, action, new_status, notes)
  values(new.id, 'ai_flagged', new.status, new.reason);
  return new;
end;
$$;
revoke all on function public.audit_upload_moderation_creation() from public;
create trigger audit_upload_moderation_creation after insert on public.upload_moderation_cases
for each row execute function public.audit_upload_moderation_creation();

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('moderation-quarantine', 'moderation-quarantine', false, 104857600,
  array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','image/avif',
    'video/mp4','video/quicktime','video/webm','video/x-m4v','video/x-msvideo','video/mpeg'])
on conflict(id) do update set public = false;

create or replace function public.can_attach_moderation_evidence(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.upload_moderation_cases c
    where c.user_id = auth.uid() and split_part(p_name, '/', 1) = auth.uid()::text
      and split_part(p_name, '/', 2) = c.id::text
      and split_part(p_name, '/', 3) like 'original.%'
      and array_length(string_to_array(p_name, '/'), 1) = 3
      and c.media_path is null and c.status = 'pending_review');
$$;
revoke all on function public.can_attach_moderation_evidence(text) from public;
grant execute on function public.can_attach_moderation_evidence(text) to authenticated;
create policy "Uploader may attach original evidence once" on storage.objects
for insert to authenticated with check (
  bucket_id = 'moderation-quarantine' and public.can_attach_moderation_evidence(name)
);
-- No user SELECT/UPDATE/DELETE policy: originals and AI previews stay private.
-- Restrictive policies also override any pre-existing broad storage policies.
create policy "Quarantine reads require service authorization" on storage.objects as restrictive
for select to anon, authenticated using (bucket_id <> 'moderation-quarantine');
create policy "Quarantine originals must belong to a case" on storage.objects as restrictive
for insert to authenticated with check (bucket_id <> 'moderation-quarantine' or public.can_attach_moderation_evidence(name));
create policy "Quarantine rejects anonymous uploads" on storage.objects as restrictive
for insert to anon with check (bucket_id <> 'moderation-quarantine');
create policy "Quarantine evidence cannot be replaced" on storage.objects as restrictive
for update to anon, authenticated using (bucket_id <> 'moderation-quarantine') with check (bucket_id <> 'moderation-quarantine');
create policy "Quarantine evidence cannot be deleted by users" on storage.objects as restrictive
for delete to anon, authenticated using (bucket_id <> 'moderation-quarantine');

create or replace function public.review_upload_moderation_case(
  p_case_id uuid, p_actor_id uuid, p_action text, p_notes text, p_version integer
) returns public.upload_moderation_cases language plpgsql security definer set search_path = '' as $$
declare c public.upload_moderation_cases; next_status text; notification_message text;
begin
  if not exists(select 1 from public.profiles where id = p_actor_id and role = 'admin') then
    raise exception 'Admin role required' using errcode = '42501';
  end if;
  if p_action not in ('approve','reject','warn','restrict_7_days','lift_restriction') then
    raise exception 'Invalid moderation action';
  end if;
  if length(trim(coalesce(p_notes, ''))) < 3 then raise exception 'Review notes are required'; end if;
  select * into c from public.upload_moderation_cases where id = p_case_id for update;
  if not found then raise exception 'Moderation case not found'; end if;
  if c.version is distinct from p_version then raise exception 'Case changed. Refresh before reviewing.' using errcode = '40001'; end if;
  if c.user_id is null and p_action in ('warn','restrict_7_days','lift_restriction') then raise exception 'The uploader account has been deleted'; end if;
  next_status := c.status;
  if p_action in ('approve','reject') then
    if c.status <> 'pending_review' then raise exception 'This case has already been decided'; end if;
    if p_action = 'approve' and c.preview_path is null and c.media_path is null then
      raise exception 'Evidence must be available before approval';
    end if;
    next_status := case when p_action = 'approve' then 'approved' else 'rejected' end;
  end if;
  if p_action = 'restrict_7_days' then
    insert into public.upload_moderation_restrictions(user_id, restricted_until, case_id)
    values(c.user_id, now() + interval '7 days', c.id)
    on conflict(user_id) do update set restricted_until = greatest(upload_moderation_restrictions.restricted_until, excluded.restricted_until), case_id = excluded.case_id;
  elsif p_action = 'lift_restriction' then
    delete from public.upload_moderation_restrictions where user_id = c.user_id;
  end if;
  insert into public.upload_moderation_history(case_id, actor_id, actor_name, action, previous_status, new_status, notes)
  values(c.id, p_actor_id, (select full_name from public.profiles where id = p_actor_id), p_action, c.status, next_status, trim(p_notes));
  update public.upload_moderation_cases set status = next_status, version = version + 1,
    evidence_delete_after = case when p_action in ('approve','reject') then now() + interval '30 days' else evidence_delete_after end,
    reviewed_at = now(), reviewed_by = p_actor_id where id = c.id returning * into c;
  notification_message := case p_action
    when 'approve' then 'Your media was approved. Select the same file again to finish your upload.'
    when 'reject' then 'Your media was rejected and remains unpublished.'
    when 'warn' then 'An administrator issued a warning about your upload.'
    when 'restrict_7_days' then 'Your media uploads are restricted for 7 days.'
    else 'Your media upload restriction was lifted.' end;
  if c.user_id is not null then
    insert into public.notifications(user_id, type, title, message, meta)
    values(c.user_id, 'info', 'Upload moderation review', notification_message || ' ' || trim(p_notes),
      jsonb_build_object('moderation_case_id', c.id, 'action', p_action));
  end if;
  return c;
end;
$$;
revoke all on function public.review_upload_moderation_case(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.review_upload_moderation_case(uuid, uuid, text, text, integer) to service_role;

-- The admin queue removes expired objects through the Storage API first, then
-- records cleanup here. Decisions, hashes, and their audit history are retained.
create or replace function public.finalize_moderation_evidence_cleanup(p_case_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.upload_moderation_cases;
begin
  select * into c from public.upload_moderation_cases where id = p_case_id for update;
  if not found or c.status = 'pending_review' or c.evidence_delete_after > now() or c.evidence_delete_after is null then return; end if;
  update public.upload_moderation_cases set preview_path = null, media_path = null,
    evidence_delete_after = null, evidence_deleted_at = now() where id = c.id;
  insert into public.upload_moderation_history(case_id, action, previous_status, new_status, notes)
  values(c.id, 'evidence_removed', c.status, c.status, 'Private evidence removed after the 30-day post-review retention period.');
end;
$$;
revoke all on function public.finalize_moderation_evidence_cleanup(uuid) from public, anon, authenticated;
grant execute on function public.finalize_moderation_evidence_cleanup(uuid) to service_role;

-- Also enforce restrictions for uploads using existing storage paths.
create or replace function public.media_uploads_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from public.upload_moderation_restrictions r
    where r.user_id = auth.uid() and r.restricted_until > now());
$$;
revoke all on function public.media_uploads_allowed() from public;
grant execute on function public.media_uploads_allowed() to authenticated;
create policy "Enforce media upload restriction" on storage.objects as restrictive
for insert to authenticated with check (bucket_id = 'moderation-quarantine' or public.media_uploads_allowed());
create policy "Enforce media replacement restriction" on storage.objects as restrictive
for update to authenticated using (public.media_uploads_allowed()) with check (public.media_uploads_allowed());
