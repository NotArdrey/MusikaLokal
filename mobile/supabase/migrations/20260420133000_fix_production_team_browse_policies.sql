drop policy if exists "Team members can view their teams"
on public.production_teams;

drop policy if exists "Deal participants can view teams"
on public.production_teams;

drop policy if exists "Authenticated users can browse teams"
on public.production_teams;

create policy "Authenticated users can browse teams"
on public.production_teams for select
to authenticated
using (true);

drop policy if exists "Team owners and managers can manage members"
on public.production_team_members;

create policy "Team owners and managers can manage members"
on public.production_team_members for all
to authenticated
using (
  exists (
    select 1
    from public.production_team_members ptm2
    where ptm2.team_id = production_team_members.team_id
      and ptm2.user_id = auth.uid()
      and ptm2.role = any (array['owner'::text, 'manager'::text])
  )
)
with check (
  exists (
    select 1
    from public.production_team_members ptm2
    where ptm2.team_id = production_team_members.team_id
      and ptm2.user_id = auth.uid()
      and ptm2.role = any (array['owner'::text, 'manager'::text])
  )
);

drop policy if exists "Authenticated users can browse team members"
on public.production_team_members;

create policy "Authenticated users can browse team members"
on public.production_team_members for select
to authenticated
using (
  exists (
    select 1
    from public.production_teams pt
    where pt.id = production_team_members.team_id
  )
);