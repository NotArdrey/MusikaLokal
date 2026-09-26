-- One auth user may hold more than one application role. profiles.role remains
-- the active role so existing queries and authorization checks keep working.
create table if not exists public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  status text not null default 'ACTIVE',
  source text not null default 'LEGACY',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  primary key (profile_id, role),
  constraint profile_roles_role_check check (role in ('fan', 'musician', 'studio-owner', 'venue-owner', 'producer', 'admin', 'staff')),
  constraint profile_roles_status_check check (status in ('ACTIVE', 'PENDING_REVIEW', 'DECLINED'))
);

create index if not exists idx_profile_roles_role_status on public.profile_roles (role, status, profile_id);
alter table public.profile_roles enable row level security;

drop policy if exists "Users can view their own role memberships" on public.profile_roles;
create policy "Users can view their own role memberships" on public.profile_roles
  for select to authenticated using (auth.uid() = profile_id);

revoke all on table public.profile_roles from anon, authenticated;
grant select on table public.profile_roles to authenticated;
grant all on table public.profile_roles to service_role;

insert into public.profile_roles (profile_id, role, status, source, activated_at)
select p.id, p.role, 'ACTIVE', 'LEGACY', coalesce(p.id_verified_at, p.created_at, now())
from public.profiles p
on conflict (profile_id, role) do nothing;

create or replace function public.touch_profile_role_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status = 'ACTIVE' and old.status is distinct from 'ACTIVE' then
    new.activated_at := coalesce(new.activated_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_touch_profile_role_updated_at on public.profile_roles;
create trigger trg_touch_profile_role_updated_at before update on public.profile_roles
for each row execute function public.touch_profile_role_updated_at();

