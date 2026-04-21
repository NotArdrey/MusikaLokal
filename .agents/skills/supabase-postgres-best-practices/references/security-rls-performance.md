---
title: Optimize RLS Policies for Performance
impact: HIGH
impactDescription: 5-10x faster RLS queries with proper patterns
tags: rls, performance, security, optimization
---

## Optimize RLS Policies for Performance

Poorly written RLS policies can cause severe performance issues. Use subqueries and indexes strategically.

**Incorrect (function called for every row):**

```sql
create policy orders_policy on orders
  using (auth.uid() = user_id);  -- auth.uid() called per row!

-- With 1M rows, auth.uid() is called 1M times
```

**Correct (wrap functions in SELECT):**

```sql
create policy orders_policy on orders
  using ((select auth.uid()) = user_id);  -- Called once, cached

-- 100x+ faster on large tables
```

Use security definer functions for complex checks:

```sql
-- Create helper function (runs as definer, bypasses RLS)
create or replace function is_team_member(team_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members
    where team_id = $1 and user_id = (select auth.uid())
  );
$$;

-- Use in policy (indexed lookup, not per-row check)
create policy team_orders_policy on orders
  using ((select is_team_member(team_id)));
```

Avoid self-referential policy checks on the same table:

```sql
-- Incorrect: this policy reads the same table it protects.
-- On SELECT, Postgres can recurse back into the same policy evaluation.
create policy team_members_manage on public.team_members
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.team_members tm2
      where tm2.team_id = team_members.team_id
        and tm2.user_id = (select auth.uid())
        and tm2.role in ('owner', 'manager')
    )
  );

-- Correct: keep read access separate, and push mutation authorization
-- into a SECURITY DEFINER helper to avoid recursive policy evaluation.
create or replace function public.can_manage_team_members(target_team_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teams t
    where t.id = target_team_id
      and t.owner_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.team_members tm
    where tm.team_id = target_team_id
      and tm.user_id = (select auth.uid())
      and tm.role in ('owner', 'manager')
  );
$$;

create policy team_members_select on public.team_members
  for select
  to authenticated
  using (true);

create policy team_members_insert on public.team_members
  for insert
  to authenticated
  with check ((select public.can_manage_team_members(team_id)));

create policy team_members_update on public.team_members
  for update
  to authenticated
  using ((select public.can_manage_team_members(team_id)))
  with check ((select public.can_manage_team_members(team_id)));

create policy team_members_delete on public.team_members
  for delete
  to authenticated
  using ((select public.can_manage_team_members(team_id)));
```

If a policy must check membership or role data from the same table it protects, prefer a helper function or a different source table for the authorization decision. Do not put that lookup directly inside a `FOR ALL` policy on the same relation.

Always add indexes on columns used in RLS policies:

```sql
create index orders_user_id_idx on orders (user_id);
```

Reference: [RLS Performance](https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations)
