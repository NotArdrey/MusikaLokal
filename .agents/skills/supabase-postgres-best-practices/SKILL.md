---
name: supabase-postgres-best-practices
description: 'Optimize Supabase/Postgres queries, schema designs, migrations, indexes, RLS policies, and performance reviews. Use when writing SQL, reviewing slow queries, diagnosing missing indexes, tuning connection usage, designing tables, handling locking or N+1 patterns, or triaging MusikaLokal Edge Function failures such as Edge Function returned a non-2xx status code, stale router deployments, missing action handlers, and hidden invoke error details.'
argument-hint: 'Describe the query, schema, migration, RLS policy, or Edge Function failure.'
user-invocable: true
license: MIT
metadata:
  author: supabase
  version: "1.2.0"
  organization: Supabase
  date: April 2026
  abstract: Comprehensive Postgres performance optimization guide for developers using Supabase and Postgres. Contains rules across 8 categories, prioritized by impact from critical concerns such as query performance and connection management to incremental improvements in advanced features, plus MusikaLokal non-2xx and schema-drift triage patterns.
---

# Supabase Postgres Best Practices

Use this skill for repeatable Supabase/Postgres work where the agent needs to choose the right optimization or safety rules, load only the relevant references, and produce concrete SQL or review findings.

use env to access my personal access token and instructions if needed, but prioritize workspace-level references for shared best practices.

## When to Use

- Write or review SQL queries
- Design or revise schemas, constraints, and indexes
- Plan or review Supabase migrations
- Optimize RLS policies or privilege design
- Diagnose slow queries, locking, N+1 patterns, or connection pressure
- Investigate MusikaLokal Edge Function failures that may be masking backend or database errors
- Triage the exact symptom `Edge Function returned a non-2xx status code`

## Fast Path For Frequent Non-2xx Errors

If the reported symptom is `Edge Function returned a non-2xx status code`, do this before loading deeper Postgres references:

1. Identify the invoked function and action name.
2. Check whether that router action was added or changed recently.
3. Verify the Edge Function deployment is current.
4. Verify the action handler exists for the requested action.
5. Make the caller log the structured `error` fields from `supabase.functions.invoke(...)`.
6. Only then continue into SQL, schema, RLS, or migration analysis.

## Fast Path For PGRST204 Schema Cache Errors

If the reported symptom is `PGRST204` with a message like `Could not find the 'column_name' column of 'table_name' in the schema cache`, do this before changing application code:

1. Search the repo migrations for the missing column name.
2. Check the live table definition in `information_schema.columns` for that table.
3. Compare the target project's applied migration history with the repo migration that should add the column.
4. If the migration exists locally but the column is missing live, apply a catch-up migration to the target project.
5. Re-check the column and any supporting indexes after the migration.
6. Only treat it as a client/query bug if the live schema already contains the column.

## Fast Path For PostgREST 400 From Nested Selects

If the symptom is a 400 from a nested select (for example `studio:studios(...)`) and logs indicate a missing column in the joined table:

1. Pull edge-function, API, and Postgres logs for the same time window.
2. Copy the failing REST path and decode the `select=` clause to identify the exact nested field.
3. Verify whether the column exists live using `information_schema.columns`.
4. If the column is missing live but expected by repo code, apply a catch-up migration first.
5. In parallel, harden brittle selects by removing non-critical columns from nested projections where possible.
6. Redeploy the affected Edge Function and confirm the active version changed.
7. Re-check logs for the same endpoint and confirm transition from 400 to 200 responses.

## Workflow

1. Classify the task first.
   - Query plan or missing index problem
   - Schema or migration design
   - RLS or privilege review
   - Connection or concurrency issue
   - Data access pattern problem
   - Monitoring or diagnostics task
   - Edge Function non-2xx symptom in MusikaLokal
2. Gather the smallest useful context.
   - Read the current SQL, migration, schema, policy, or function code.
   - Capture the exact error text and the existing execution path.
   - For MusikaLokal non-2xx Edge Function errors, verify deployment and router action coverage before assuming a Postgres problem.
3. Load only the relevant references.
   - Start with [sections](./references/_sections.md) to map the task to a category.
   - Then load one or more category files, preferring higher-impact rules first.
4. Apply the highest-impact rules before incremental tuning.
   - Query performance: missing, composite, covering, and partial indexes; correct index types
   - Connection management: pooling, limits, prepared statements, idle timeout
   - Security and RLS: correctness first, then performance
   - Schema design: keys, constraints, foreign-key indexes, data types, partitioning
   - Locking and data access: transaction length, deadlock prevention, batching, pagination, upserts
   - Monitoring and advanced features: EXPLAIN ANALYZE, pg_stat_statements, JSONB, full-text search
5. Produce concrete output.
   - For implementation tasks, provide exact SQL, migration steps, or policy changes.
   - For reviews, list findings in severity order with the root cause and recommended fix.
   - Call out tradeoffs, rollout risks, and any migration ordering requirements.
6. Validate before declaring done.
   - Check correctness, performance impact, and Supabase compatibility.
   - Ensure indexes support query predicates and joins.
   - Ensure RLS policies remain safe and do not introduce accidental full scans.
   - Ensure migrations are applied to the intended environment and remain idempotent where required.
   - For non-2xx Edge Function failures, ensure deployment, router action coverage, and structured error logging were checked first.
   - Recommend measurement with EXPLAIN ANALYZE or pg_stat_statements when performance claims need proof.

## Decision Guide

### Query and Index Work

Use these first for slow reads or writes:

- [Missing indexes](./references/query-missing-indexes.md)
- [Composite indexes](./references/query-composite-indexes.md)
- [Covering indexes](./references/query-covering-indexes.md)
- [Partial indexes](./references/query-partial-indexes.md)
- [Index types](./references/query-index-types.md)

### Connection and Throughput Work

Use these for serverless pressure, pool exhaustion, or excessive connection churn:

- [Connection pooling](./references/conn-pooling.md)
- [Connection limits](./references/conn-limits.md)
- [Idle timeout](./references/conn-idle-timeout.md)
- [Prepared statements](./references/conn-prepared-statements.md)

### Security and RLS Work

Use these when policies, auth rules, or privilege boundaries are involved:

- [RLS basics](./references/security-rls-basics.md)
- [RLS performance](./references/security-rls-performance.md)
- [Privileges](./references/security-privileges.md)

### Schema and Migration Work

Use these when changing tables or long-term data shape:

- [Primary keys](./references/schema-primary-keys.md)
- [Constraints](./references/schema-constraints.md)
- [Foreign key indexes](./references/schema-foreign-key-indexes.md)
- [PGRST204 missing columns](./references/schema-pgrst204-missing-columns.md)
- [Data types](./references/schema-data-types.md)
- [Partitioning](./references/schema-partitioning.md)
- [Lowercase identifiers](./references/schema-lowercase-identifiers.md)

### Concurrency and Access Pattern Work

Use these for lock contention or inefficient access:

- [Short transactions](./references/lock-short-transactions.md)
- [Deadlock prevention](./references/lock-deadlock-prevention.md)
- [Advisory locks](./references/lock-advisory.md)
- [SKIP LOCKED](./references/lock-skip-locked.md)
- [Batch inserts](./references/data-batch-inserts.md)
- [N+1 queries](./references/data-n-plus-one.md)
- [Pagination](./references/data-pagination.md)
- [Upserts](./references/data-upsert.md)

### Diagnostics and Advanced Features

Use these when proving or extending an optimization:

- [EXPLAIN ANALYZE](./references/monitor-explain-analyze.md)
- [pg_stat_statements](./references/monitor-pg-stat-statements.md)
- [VACUUM and ANALYZE](./references/monitor-vacuum-analyze.md)
- [JSONB indexing](./references/advanced-jsonb-indexing.md)
- [Full-text search](./references/advanced-full-text-search.md)

## MusikaLokal Edge Function Triage

In this repository, the client wrappers can collapse many backend failures into the generic message `Edge Function returned a non-2xx status code`. Use this triage order:

1. Confirm the relevant Edge Function was deployed after any router action changes.
2. Confirm the requested action exists in the router function.
3. Inspect the returned `error` object from `supabase.functions.invoke(...)` instead of relying only on the thrown catch value.
4. Only after those checks should you treat the issue as a likely Postgres or schema problem.

Start with these router functions first when the failure appears after recent feature work:

- `manage-playlists`
- `manage-social-feed`
- `manage-marketplace`
- `manage-producer-network`
- `manage-deals`
- `manage-bookings`

### Known Pattern: Bookings Fetch Drift (`studios.studio_type`)

Use this exact playbook when bookings fail with generic non-2xx errors and logs point to nested `studio_bookings` selects:

1. Confirm whether requests still include `studio:studios(..., studio_type, ...)`.
2. Check live schema for `public.studios.studio_type`.
3. If missing, apply a catch-up migration that adds the column and backfills a safe default.
4. Also remove `studio_type` from non-essential nested selects in both the client fallback queries and `manage-bookings` fetch handler queries.
5. Redeploy `manage-bookings` and verify active function version/status.
6. Validate with fresh logs that `studio_bookings` fetches now return 200.

This dual fix (schema catch-up plus query hardening) prevents immediate outages and reduces future drift risk.


### MusikaLokal Deploy Reality Checks

For this repository, include these checks whenever triaging non-2xx issues tied to router updates:

1. If CLI deploy returns 401 but source is correct, treat it as auth/project access drift and retry via MCP.
2. For functions that rely on a root `deno.json`, set `import_map_path` explicitly during MCP deploy.
3. Confirm final state using function metadata (`slug`, `version`, `status`, `verify_jwt`) before declaring fix complete.

Required logging pattern:

```ts
const { data, error } = await supabase.functions.invoke("manage-social-feed", { body });

if (error) {
  console.error("manage-social-feed failed", {
    message: error.message,
    status: (error as any).status,
    code: (error as any).code,
    details: (error as any).details,
    hint: (error as any).hint,
    context: (error as any).context,
    body,
  });
  throw error;
}
```

Known affected surfaces include playlist/radio, social feed, producer network, and marketplace flows across the mobile app, with similar behavior possible anywhere the web app uses the shared Supabase wrapper.

## Completion Checks

- The chosen category and reference files match the actual problem.
- The solution addresses the root cause, not just a symptom.
- For `PGRST204` schema cache errors, repo migrations were compared against the live schema before changing application code.
- For PostgREST 400 nested-select failures, the exact failing `select` projection was verified against live schema and logs.
- For non-2xx Edge Function failures, deployment freshness, action existence, and structured error capture were verified before database debugging.
- For router fixes, function version/status was verified after deployment and logs were checked for recovery (400 to 200).
- SQL and schema changes are concrete and executable.
- Security and RLS implications are called out explicitly.
- Performance claims are either justified from known rules or paired with a measurement plan.
- Supabase deployment or migration steps are included when needed.

## References

- [Section map](./references/_sections.md)
- [Contributor guidance](./references/_contributing.md)
- [Reference template](./references/_template.md)
- https://www.postgresql.org/docs/current/
- https://supabase.com/docs
- https://wiki.postgresql.org/wiki/Performance_Optimization
- https://supabase.com/docs/guides/database/overview
- https://supabase.com/docs/guides/auth/row-level-security
