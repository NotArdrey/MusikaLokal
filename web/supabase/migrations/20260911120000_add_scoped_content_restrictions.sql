-- Add explicit restriction scopes so upload moderation can optionally suspend
-- social posting without conflating that action with a full account ban.

alter table public.upload_moderation_restrictions
  add column if not exists restriction_scopes text[];

update public.upload_moderation_restrictions
set restriction_scopes = array['media_upload']::text[]
where restriction_scopes is null or cardinality(restriction_scopes) = 0;

alter table public.upload_moderation_restrictions
  alter column restriction_scopes set default array['media_upload']::text[],
  alter column restriction_scopes set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'upload_moderation_restrictions_scopes_check'
      and conrelid = 'public.upload_moderation_restrictions'::regclass
  ) then
    alter table public.upload_moderation_restrictions
      add constraint upload_moderation_restrictions_scopes_check
      check (
        cardinality(restriction_scopes) between 1 and 2
        and restriction_scopes <@ array['media_upload', 'social_posting']::text[]
      );
  end if;
end;
$$;

comment on column public.upload_moderation_restrictions.restriction_scopes is
  'Active capabilities blocked for the user: media_upload and/or social_posting.';

create or replace function public.social_posting_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.upload_moderation_restrictions r
    where r.user_id = auth.uid()
      and r.restricted_until > now()
      and r.restriction_scopes @> array['social_posting']::text[]
  )
$$;

revoke all on function public.social_posting_allowed() from public;
grant execute on function public.social_posting_allowed() to authenticated;

drop policy if exists feed_posts_insert on public.feed_posts;
create policy feed_posts_insert on public.feed_posts
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and public.social_posting_allowed()
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('musician', 'producer', 'studio-owner', 'venue-owner', 'admin')
    )
  );

drop policy if exists feed_posts_update on public.feed_posts;
create policy feed_posts_update on public.feed_posts
  for update
  to authenticated
  using (
    public.social_posting_allowed()
    and (
      author_id = auth.uid()
      or exists (
        select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
      )
    )
  )
  with check (
    public.social_posting_allowed()
    and (
      author_id = auth.uid()
      or exists (
        select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
      )
    )
  );

create or replace function public.review_upload_moderation_case(
  p_case_id uuid, p_actor_id uuid, p_action text, p_notes text, p_version integer
) returns public.upload_moderation_cases language plpgsql security definer set search_path = '' as $$
declare
  c public.upload_moderation_cases;
  next_status text;
  notification_message text;
  requested_scopes text[];
begin
  if not exists(select 1 from public.profiles where id = p_actor_id and role = 'admin') then
    raise exception 'Admin role required' using errcode = '42501';
  end if;
  if p_action not in (
    'approve',
    'reject',
    'warn',
    'restrict_7_days',
    'restrict_uploads_7_days',
    'restrict_content_7_days',
    'lift_posting_restriction',
    'lift_restriction'
  ) then
    raise exception 'Invalid moderation action';
  end if;
  if length(trim(coalesce(p_notes, ''))) < 3 then
    raise exception 'Review notes are required';
  end if;

  select * into c from public.upload_moderation_cases where id = p_case_id for update;
  if not found then raise exception 'Moderation case not found'; end if;
  if c.version is distinct from p_version then
    raise exception 'Case changed. Refresh before reviewing.' using errcode = '40001';
  end if;
  if c.user_id is null and p_action in (
    'warn',
    'restrict_7_days',
    'restrict_uploads_7_days',
    'restrict_content_7_days',
    'lift_posting_restriction',
    'lift_restriction'
  ) then
    raise exception 'The uploader account has been deleted';
  end if;

  next_status := c.status;
  if p_action in ('approve', 'reject') then
    if c.status <> 'pending_review' then raise exception 'This case has already been decided'; end if;
    if p_action = 'approve' and c.preview_path is null and c.media_path is null then
      raise exception 'Evidence must be available before approval';
    end if;
    next_status := case when p_action = 'approve' then 'approved' else 'rejected' end;
  end if;

  if p_action in ('restrict_7_days', 'restrict_uploads_7_days', 'restrict_content_7_days') then
    requested_scopes := case
      when p_action = 'restrict_content_7_days'
        then array['media_upload', 'social_posting']::text[]
      else array['media_upload']::text[]
    end;

    insert into public.upload_moderation_restrictions(
      user_id,
      restricted_until,
      case_id,
      restriction_scopes
    )
    values(c.user_id, now() + interval '7 days', c.id, requested_scopes)
    on conflict(user_id) do update set
      restricted_until = greatest(
        public.upload_moderation_restrictions.restricted_until,
        excluded.restricted_until
      ),
      case_id = excluded.case_id,
      restriction_scopes = (
        select array_agg(distinct scope_name order by scope_name)
        from unnest(
          public.upload_moderation_restrictions.restriction_scopes
          || excluded.restriction_scopes
        ) as merged(scope_name)
      );
  elsif p_action = 'lift_posting_restriction' then
    update public.upload_moderation_restrictions
    set restriction_scopes = array_remove(restriction_scopes, 'social_posting')
    where user_id = c.user_id
      and restriction_scopes @> array['social_posting']::text[];

    delete from public.upload_moderation_restrictions
    where user_id = c.user_id and cardinality(restriction_scopes) = 0;
  elsif p_action = 'lift_restriction' then
    delete from public.upload_moderation_restrictions where user_id = c.user_id;
  end if;

  insert into public.upload_moderation_history(
    case_id,
    actor_id,
    actor_name,
    action,
    previous_status,
    new_status,
    notes
  )
  values(
    c.id,
    p_actor_id,
    (select full_name from public.profiles where id = p_actor_id),
    p_action,
    c.status,
    next_status,
    trim(p_notes)
  );

  update public.upload_moderation_cases set
    status = next_status,
    version = version + 1,
    evidence_delete_after = case
      when p_action in ('approve', 'reject') then now() + interval '30 days'
      else evidence_delete_after
    end,
    reviewed_at = now(),
    reviewed_by = p_actor_id
  where id = c.id
  returning * into c;

  notification_message := case p_action
    when 'approve' then 'Your media was approved. Select the same file again to finish your upload.'
    when 'reject' then 'Your media was rejected and remains unpublished.'
    when 'warn' then 'An administrator issued a warning about your upload.'
    when 'restrict_7_days' then 'Your media uploads are restricted for 7 days.'
    when 'restrict_uploads_7_days' then 'Your media uploads are restricted for 7 days.'
    when 'restrict_content_7_days' then 'Your media uploads and social posting are restricted for 7 days.'
    when 'lift_posting_restriction' then 'Your social posting restriction was lifted.'
    else 'Your upload and posting restrictions were lifted.'
  end;

  if c.user_id is not null then
    insert into public.notifications(user_id, type, title, message, meta)
    values(
      c.user_id,
      'info',
      'Upload moderation review',
      notification_message || ' ' || trim(p_notes),
      jsonb_build_object(
        'moderation_case_id', c.id,
        'action', p_action,
        'restriction_scopes', coalesce(requested_scopes, array[]::text[])
      )
    );
  end if;

  return c;
end;
$$;

revoke all on function public.review_upload_moderation_case(uuid, uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.review_upload_moderation_case(uuid, uuid, text, text, integer)
  to service_role;
