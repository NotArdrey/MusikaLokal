begin;

create table if not exists public.gig_application_profile_preferences (
  application_id uuid not null references public.gig_applications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  show_on_profile boolean not null default false,
  responded_at timestamptz not null default now(),
  primary key (application_id, user_id)
);

alter table public.gig_application_profile_preferences enable row level security;
revoke all on public.gig_application_profile_preferences from public, anon, authenticated;
grant select on public.gig_application_profile_preferences to authenticated;
grant all on public.gig_application_profile_preferences to service_role;
create policy "Performers can read their own profile preferences"
  on public.gig_application_profile_preferences for select to authenticated
  using (user_id = (select auth.uid()));

-- Preserve the old explicit profile choice for the solo performer or band owner.
-- The shared band choice never implies consent for the other members.
insert into public.gig_application_profile_preferences (application_id, user_id, show_on_profile, responded_at)
select ga.id, coalesce(g.owner_id, r.profile_id, ga.applicant_id), true,
  coalesce(ga.feature_consent_responded_at, ga.feature_consent_requested_at, ga.created_at)
from public.gig_applications ga
left join public.production_team_roster r on r.id = ga.production_roster_id
left join public.groups g on g.id = coalesce(r.group_id, ga.group_id)
where ga.status in ('accepted', 'approved', 'completed')
  and ga.feature_consent_status = 'accepted' and ga.show_on_profile = true
  and coalesce(g.owner_id, r.profile_id, ga.applicant_id) is not null
on conflict (application_id, user_id) do nothing;

create or replace function public.manage_gig_feature_consent(
  p_application_id uuid, p_user_id uuid, p_scope text default null,
  p_show_on_profile boolean default false, p_show_on_gig_page boolean default false,
  p_write boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.gig_applications%rowtype;
  v_group_id uuid;
  v_performer_id uuid;
  v_owner_id uuid;
  v_member_role text;
  v_is_member boolean := false;
  v_can_self boolean := false;
  v_can_group boolean := false;
  v_active boolean;
  v_scope text;
  v_self boolean := false;
  v_changed boolean := false;
begin
  -- All identity parameters come from the Edge Function's verified JWT.
  select * into a from public.gig_applications where id = p_application_id for update;
  if not found then raise exception 'Application not found' using errcode = 'P0002'; end if;
  select coalesce(r.group_id, a.group_id), coalesce(r.profile_id, a.applicant_id)
    into v_group_id, v_performer_id
    from (select 1) seed left join public.production_team_roster r on r.id = a.production_roster_id;
  if v_group_id is not null then
    select owner_id into v_owner_id from public.groups where id = v_group_id for share;
    select role into v_member_role from public.group_members
      where group_id = v_group_id and user_id = p_user_id limit 1 for share;
    v_is_member := found;
    v_can_self := coalesce(v_owner_id = p_user_id, false) or v_is_member;
    v_can_group := coalesce(v_owner_id = p_user_id, false)
      or coalesce(v_is_member and v_member_role in ('owner', 'admin'), false);
  else
    v_can_self := coalesce(v_performer_id = p_user_id, false);
  end if;
  if not v_can_self and not v_can_group then
    raise exception 'Only the selected performer or current group members can manage featuring permission' using errcode = '42501';
  end if;
  v_active := coalesce(a.status in ('accepted', 'approved', 'completed'), false);
  select show_on_profile into v_self from public.gig_application_profile_preferences
    where application_id = a.id and user_id = p_user_id;
  v_self := coalesce(v_self, false);
  if p_write then
    if not v_active then raise exception 'Featuring permission is available only for accepted or completed applications' using errcode = 'P0001'; end if;
    -- Missing scope retains the legacy solo/band API, without changing members' choices.
    v_scope := coalesce(p_scope, case when v_group_id is null then 'self' else 'group' end);
    if v_scope not in ('self', 'group') then raise exception 'Invalid featuring scope' using errcode = '22023'; end if;
    if v_scope = 'group' then
      if not v_can_group then raise exception 'Only an authorized group leader can change the band feature' using errcode = '42501'; end if;
      v_changed := a.show_on_profile is distinct from p_show_on_profile or a.show_on_gig_page is distinct from p_show_on_gig_page
        or a.feature_consent_status is distinct from case when p_show_on_profile or p_show_on_gig_page then 'accepted' else 'declined' end;
    else
      if not v_can_self then raise exception 'You can change only your own profile preference' using errcode = '42501'; end if;
      v_changed := v_self is distinct from p_show_on_profile;
      insert into public.gig_application_profile_preferences(application_id, user_id, show_on_profile)
        values(a.id, p_user_id, p_show_on_profile)
        on conflict(application_id, user_id) do update
          set show_on_profile = excluded.show_on_profile, responded_at = now()
          where gig_application_profile_preferences.show_on_profile is distinct from excluded.show_on_profile;
      v_self := p_show_on_profile;
      if v_group_id is null then
        v_changed := v_changed or a.show_on_profile is distinct from p_show_on_profile or a.show_on_gig_page is distinct from p_show_on_gig_page
          or a.feature_consent_status is distinct from case when p_show_on_profile or p_show_on_gig_page then 'accepted' else 'declined' end;
      end if;
    end if;
    if (v_scope = 'group' or v_group_id is null) and v_changed then
      update public.gig_applications set show_on_profile = p_show_on_profile, show_on_gig_page = p_show_on_gig_page,
        feature_consent_status = case when p_show_on_profile or p_show_on_gig_page then 'accepted' else 'declined' end,
        feature_consent_responded_at = now()
        where id = a.id returning * into a;
    end if;
  end if;
  return jsonb_build_object(
    'self_show_on_profile', v_self and v_active,
    'can_edit_self', v_can_self and v_active, 'can_edit_group', v_can_group and v_active,
    'is_group_performance', v_group_id is not null, 'changed', v_changed,
    'feature_consent_status', a.feature_consent_status,
    'show_on_profile', a.show_on_profile, 'show_on_gig_page', a.show_on_gig_page,
    'feature_consent_responded_at', a.feature_consent_responded_at
  );
end;
$$;
revoke all on function public.manage_gig_feature_consent(uuid,uuid,text,boolean,boolean,boolean) from public, anon, authenticated;
grant execute on function public.manage_gig_feature_consent(uuid,uuid,text,boolean,boolean,boolean) to service_role;

-- Existing application UPDATE policies must not let a member bypass the band scope.
create or replace function public.guard_gig_feature_consent_update()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_group_id uuid;
  v_performer_id uuid;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or new.status is distinct from old.status
     or (new.show_on_profile is not distinct from old.show_on_profile
         and new.show_on_gig_page is not distinct from old.show_on_gig_page
         and new.feature_consent_status is not distinct from old.feature_consent_status) then
    return new;
  end if;
  select coalesce(r.group_id, old.group_id), coalesce(r.profile_id, old.applicant_id)
    into v_group_id, v_performer_id
    from (select 1) seed left join public.production_team_roster r on r.id = old.production_roster_id;
  if v_group_id is not null then
    if not exists(select 1 from public.groups where id = v_group_id and owner_id = auth.uid())
       and not exists(select 1 from public.group_members where group_id = v_group_id
         and user_id = auth.uid() and role in ('owner', 'admin')) then
      raise exception 'Only an authorized group leader can change the band feature' using errcode = '42501';
    end if;
  elsif v_performer_id is distinct from auth.uid() then
    raise exception 'Only the selected performer can change featuring permission' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_gig_feature_consent_update() from public, anon, authenticated;
create trigger guard_gig_feature_consent_update before update on public.gig_applications
  for each row execute function public.guard_gig_feature_consent_update();

create or replace function public.revoke_individual_gig_feature_preferences()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.status not in ('accepted', 'approved', 'completed')
     or old.status not in ('accepted', 'approved', 'completed')
     or new.group_id is distinct from old.group_id
     or new.production_roster_id is distinct from old.production_roster_id
     or new.applicant_id is distinct from old.applicant_id then
    update public.gig_application_profile_preferences set show_on_profile = false, responded_at = now()
      where application_id = new.id and show_on_profile = true;
  end if;
  return new;
end;
$$;
revoke all on function public.revoke_individual_gig_feature_preferences() from public, anon, authenticated;
create trigger revoke_individual_gig_feature_preferences
  after update of status, group_id, production_roster_id, applicant_id on public.gig_applications
  for each row execute function public.revoke_individual_gig_feature_preferences();

-- Expose only consented public timeline fields, never application documents or other members' preferences.
create or replace function public.get_public_performer_gig_timeline(p_target_id uuid, p_target_type text default 'artist')
returns table(id uuid, status text, group_id uuid, group_name text, gigs jsonb)
language sql stable security definer set search_path = public, pg_temp
as $$
  select distinct on (ga.gig_id) ga.id, ga.status, coalesce(r.group_id, ga.group_id), band.name,
    jsonb_build_object('id', g.id, 'name', g.name, 'location', g.location, 'budget', g.budget,
      'event_date', g.event_date, 'status', g.status,
      'gig_availability_slots', coalesce((select jsonb_agg(jsonb_build_object(
        'slot_date', s.slot_date, 'start_time', s.start_time, 'end_time', s.end_time)
        order by s.slot_date, s.start_time) from public.gig_availability_slots s where s.gig_id = g.id), '[]'::jsonb))
  from public.gig_applications ga
  join public.gigs g on g.id = ga.gig_id
  left join public.production_team_roster r on r.id = ga.production_roster_id
  left join public.groups band on band.id = coalesce(r.group_id, ga.group_id)
  where ga.status in ('accepted', 'approved', 'completed') and (
    (p_target_type = 'group' and band.id = p_target_id
      and ga.feature_consent_status = 'accepted' and ga.show_on_profile = true)
    or (p_target_type = 'artist' and exists (
      select 1 from public.gig_application_profile_preferences pref
      where pref.application_id = ga.id and pref.user_id = p_target_id and pref.show_on_profile = true
    ) and (
      (band.id is null and coalesce(r.profile_id, ga.applicant_id) = p_target_id)
      or band.owner_id = p_target_id or exists (
        select 1 from public.group_members m where m.group_id = band.id and m.user_id = p_target_id
      )
    ))
  )
  order by ga.gig_id, ga.created_at desc, ga.id;
$$;
revoke all on function public.get_public_performer_gig_timeline(uuid,text) from public;
grant execute on function public.get_public_performer_gig_timeline(uuid,text) to anon, authenticated, service_role;

-- A band occupies one lineup entry, independently of its members' profile choices.
create or replace function public.get_gig_featured_performers(p_gig_id uuid)
returns table (
  application_id uuid,
  gig_id uuid,
  display_name text,
  avatar_url text,
  entity_type text,
  profile_id uuid,
  group_id uuid,
  consented_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with featured as (
  select distinct on (coalesce(ga.group_id, roster.group_id),
    case when coalesce(ga.group_id, roster.group_id) is null then coalesce(roster.profile_id, ga.applicant_id) end)
    ga.id as application_id,
    ga.gig_id,
    coalesce(
      direct_group.name,
      roster_group.name,
      roster_profile.full_name,
      nullif(ga.performer_snapshot ->> 'display_name', ''),
      applicant.full_name,
      'Featured performer'
    ) as display_name,
    coalesce(
      media.media_url,
      roster_profile.avatar_url,
      nullif(ga.performer_snapshot ->> 'avatar_url', ''),
      applicant.avatar_url
    ) as avatar_url,
    case
      when coalesce(ga.group_id, roster.group_id) is not null then 'group'
      else 'musician'
    end as entity_type,
    case
      when coalesce(ga.group_id, roster.group_id) is null
        then coalesce(roster.profile_id, ga.applicant_id)
      else null
    end as profile_id,
    coalesce(ga.group_id, roster.group_id) as group_id,
    ga.feature_consent_responded_at as consented_at
  from public.gig_applications ga
  left join public.profiles applicant on applicant.id = ga.applicant_id
  left join public.groups direct_group on direct_group.id = ga.group_id
  left join public.production_team_roster roster on roster.id = ga.production_roster_id
  left join public.profiles roster_profile on roster_profile.id = roster.profile_id
  left join public.groups roster_group on roster_group.id = roster.group_id
  left join lateral (
    select gm.media_url
    from public.group_media gm
    where gm.group_id = coalesce(ga.group_id, roster.group_id)
    order by gm.sort_order asc, gm.created_at asc
    limit 1
  ) media on true
  where ga.gig_id = p_gig_id
    and ga.status in ('accepted', 'approved')
    and ga.feature_consent_status = 'accepted'
    and ga.show_on_gig_page = true
  order by coalesce(ga.group_id, roster.group_id),
    case when coalesce(ga.group_id, roster.group_id) is null then coalesce(roster.profile_id, ga.applicant_id) end,
    ga.feature_consent_responded_at asc nulls last, ga.created_at asc, ga.id
  ) select * from featured order by consented_at asc nulls last, application_id;
$$;


commit;
