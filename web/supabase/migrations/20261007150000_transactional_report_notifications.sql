begin;

alter table public.reports
  add column if not exists moderation_revision bigint not null default 0;

create unique index if not exists notifications_report_revision_recipient
  on public.notifications (user_id, (meta->>'report_id'), (meta->>'report_revision'))
  where meta->>'event_type' = 'report_moderation_saved';

-- Match the admin's target-owner lookup without exposing private target data.
create or replace function public.report_notification_owner(p_type text, p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_table text;
  v_record jsonb;
  v_owner uuid;
begin
  if p_type in ('user', 'profile') then return p_id; end if;
  if p_type = 'booking' then
    select s.owner_id into v_owner from public.studio_bookings b
      join public.studios s on s.id = b.studio_id where b.id = p_id;
    return v_owner;
  end if;
  v_table := case p_type
    when 'group' then 'groups' when 'studio' then 'studios' when 'venue' then 'studios'
    when 'gig' then 'gigs' when 'product' then 'products'
    when 'playlist' then 'playlists' when 'feed_post' then 'feed_posts' end;
  if v_table is null or to_regclass('public.' || v_table) is null then return null; end if;
  execute format('select to_jsonb(t) from public.%I t where id = $1', v_table)
    into v_record using p_id;
  v_owner := coalesce(v_record->>'owner_id', v_record->>'organizer_id',
    v_record->>'seller_id', v_record->>'creator_id', v_record->>'author_id', v_record->>'user_id')::uuid;
  if v_owner is null and p_type = 'group' then
    select user_id into v_owner from public.group_members where group_id = p_id
      order by case lower(role) when 'owner' then 0 when 'leader' then 1 else 2 end, user_id limit 1;
    if v_owner is null then
      select user_id into v_owner from public.group_roster_members where group_id = p_id and user_id is not null
        order by case lower(member_role) when 'owner' then 0 when 'leader' then 1 else 2 end, user_id limit 1;
    end if;
  end if;
  return v_owner;
end;
$$;

create or replace function public.stamp_report_moderation_revision()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Request timestamps and expiry timestamps change on retries, not outcomes.
  new.moderation_revision := old.moderation_revision;
  if new.reviewed_by is not null and new.reviewed_at is not null and (
    old.reviewed_at is null or
    row(new.status, new.moderation_action, new.moderation_notes,
        new.escalation_status, new.escalation_reason, new.target_account_action)
    is distinct from
    row(old.status, old.moderation_action, old.moderation_notes,
        old.escalation_status, old.escalation_reason, old.target_account_action)
  ) then
    new.moderation_revision := old.moderation_revision + 1;
  end if;
  return new;
end;
$$;

create or replace function public.notify_saved_report_moderation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid;
  v_recipient uuid;
  v_notify_owner boolean;
  v_account_changed boolean;
  v_message text;
  v_title text;
  v_type text;
begin
  if new.moderation_revision = old.moderation_revision then return new; end if;
  v_owner := public.report_notification_owner(new.target_type, new.target_id);
  v_account_changed := new.target_account_action <> 'none' and
    (old.reviewed_at is null or new.target_account_action is distinct from old.target_account_action);
  v_notify_owner := new.moderation_action in ('warn_target_owner', 'warn_both', 'manual_review')
    or v_account_changed;

  for v_recipient in
    select distinct recipient from unnest(array[new.reporter_id,
      case when v_notify_owner then v_owner end]) as recipients(recipient)
    where recipient is not null
  loop
    v_title := case when new.escalation_status = 'manual_review' then 'Report Escalated' else 'Report Update' end;
    v_type := case when new.moderation_action <> 'none' then 'warning' else 'info' end;
    v_message := case when v_recipient = new.reporter_id then
      case when new.escalation_status = 'manual_review' then 'Your report was escalated for manual review.'
        when new.status = 'resolved' then 'An administrator reviewed and resolved your report.'
        when new.status = 'dismissed' then 'An administrator reviewed and dismissed your report.'
        else 'An administrator updated your report. It is pending review.' end
      else 'An administrator reviewed a report about your account or content and set it to ' || new.status || '.' end;
    if v_recipient = new.reporter_id and new.moderation_action in ('warn_reporter', 'warn_both') then
      v_message := v_message || ' You received a moderation warning.';
    end if;
    if v_recipient = v_owner and v_notify_owner then
      if new.moderation_action in ('warn_target_owner', 'warn_both') then
        v_message := v_message || ' Your account or content received a moderation warning.';
      end if;
      if v_account_changed then
        v_message := v_message || ' ' || case new.target_account_action
          when 'mark_unverified' then 'Your account requires verification review.'
          when 'ban_1_day' then 'Your account has been banned for 1 day.'
          when 'ban_7_days' then 'Your account has been banned for 7 days.'
          when 'ban_30_days' then 'Your account has been banned for 30 days.'
          when 'ban_permanent' then 'Your account has been permanently banned.'
          when 'lift_ban' then 'Your account ban was lifted.' else '' end;
        v_type := case when new.target_account_action = 'lift_ban' then 'success'
          when new.target_account_action = 'mark_unverified' then 'warning' else 'error' end;
      end if;
    end if;
    insert into public.notifications(user_id, type, title, message, read, meta)
    values (v_recipient, v_type, v_title, v_message, false, jsonb_build_object(
      'event_type', 'report_moderation_saved', 'report_id', new.id,
      'report_revision', new.moderation_revision, 'target_type', new.target_type,
      'target_id', new.target_id, 'next_status', new.status,
      'moderation_action', new.moderation_action, 'target_account_action', new.target_account_action,
      'target_account_action_expires_at', new.target_account_action_expires_at,
      'route', '/notifications', 'params', '{}'::jsonb
    )) on conflict do nothing;
  end loop;
  return new;
end;
$$;

revoke all on function public.report_notification_owner(text, uuid) from public, anon, authenticated;
revoke all on function public.stamp_report_moderation_revision() from public, anon, authenticated;
revoke all on function public.notify_saved_report_moderation() from public, anon, authenticated;

drop trigger if exists stamp_report_moderation_revision on public.reports;
create trigger stamp_report_moderation_revision before update on public.reports
  for each row execute function public.stamp_report_moderation_revision();
drop trigger if exists notify_saved_report_moderation on public.reports;
create trigger notify_saved_report_moderation after update on public.reports
  for each row execute function public.notify_saved_report_moderation();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables)
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

commit;
