create or replace function public.can_manage_production_team_members(target_team_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.production_teams pt
    where pt.id = target_team_id
      and pt.owner_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.production_team_members ptm
    where ptm.team_id = target_team_id
      and ptm.user_id = (select auth.uid())
      and ptm.role = any (array['owner'::text, 'manager'::text])
  );
$$;

revoke all on function public.can_manage_production_team_members(uuid) from public;
grant execute on function public.can_manage_production_team_members(uuid) to authenticated;

drop policy if exists "Team owners and managers can manage members"
on public.production_team_members;

create policy "Team owners and managers can insert members"
on public.production_team_members for insert
to authenticated
with check ((select public.can_manage_production_team_members(team_id)));

create policy "Team owners and managers can update members"
on public.production_team_members for update
to authenticated
using ((select public.can_manage_production_team_members(team_id)))
with check ((select public.can_manage_production_team_members(team_id)));

create policy "Team owners and managers can delete members"
on public.production_team_members for delete
to authenticated
using ((select public.can_manage_production_team_members(team_id)));