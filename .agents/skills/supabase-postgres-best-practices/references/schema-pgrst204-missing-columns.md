---
title: Fix PGRST204 Missing Column Errors by Reconciling Live Schema
impact: HIGH
impactDescription: Restores broken reads and writes immediately by fixing schema drift instead of regressing application code
tags: pgrst204, schema-cache, migrations, supabase, drift
---

## Fix PGRST204 Missing Column Errors by Reconciling Live Schema

When Supabase returns `PGRST204` with `Could not find the 'column_name' column of 'table_name' in the schema cache`, the common cause is schema drift: the application or Edge Function expects a column from a repo migration, but the target project never applied that migration.

**Incorrect (change client code first):**

```typescript
// App code was updated to use contextual chat fields.
// The live database never received the migration, so PostgREST rejects the query.
const { data, error } = await supabase
  .from("conversations")
  .select("*")
  .eq("deal_id", dealId);

if (error) {
  throw error;
}
```

Removing the filter or insert field here hides the real problem and can merge unrelated records or create incomplete rows.

**Correct (confirm drift, then apply the missing migration):**

```sql
-- 1. Confirm the live table really lacks the expected columns.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'conversations'
  and column_name in ('deal_id', 'producer_project_id')
order by column_name;

-- 2. Apply the idempotent catch-up DDL from the repo migration.
alter table public.conversations
  add column if not exists deal_id uuid references public.venue_partnership_deals(id) on delete set null,
  add column if not exists producer_project_id uuid references public.producer_projects(id) on delete set null;

create index if not exists idx_conversations_deal
  on public.conversations (deal_id)
  where deal_id is not null;

create index if not exists idx_conversations_producer_project
  on public.conversations (producer_project_id)
  where producer_project_id is not null;

-- 3. Re-check the live schema after the migration.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'conversations'
  and column_name in ('deal_id', 'producer_project_id')
order by column_name;
```

**Correct (diagnostic workflow):**

```text
1. Search the repo migrations for the missing column.
2. Inspect information_schema.columns on the target project.
3. Compare the target project's applied migrations with the repo migration list.
4. Apply a catch-up migration if the repo has the DDL and the live project does not.
5. Validate supporting foreign-key indexes, not just the column.
6. Only then revisit the client query.
```

**Why this works:**

- `PGRST204` is often a schema-contract problem, not a query-builder problem.
- Fixing the live schema preserves the intended application behavior.
- Adding indexes for new foreign-key columns prevents the follow-up performance regression after the feature starts using the new relationship.

Reference:
[Supabase Database Overview](https://supabase.com/docs/guides/database/overview)

Reference:
[Postgres Information Schema Columns](https://www.postgresql.org/docs/current/infoschema-columns.html)