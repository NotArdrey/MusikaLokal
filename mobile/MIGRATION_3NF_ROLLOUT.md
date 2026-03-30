# 3NF Zero-Break Rollout (Expand-and-Contract)

This rollout keeps every release backward compatible and avoids big-bang changes.

## Scope (high-impact first)

- `profiles.skills`, `profiles.genres`, `profiles.portfolio_urls` → normalized child tables.
- `groups.members` remains legacy; `group_members` remains source of truth.
- `gigs.requirements`, `gigs.images`, `gigs.documents`, `gigs.availability` → normalized child tables.
- `studios.amenities`, `studios.types`, `studios.images`, `studios.instruments`, `studios.availability`, `studios.open_dates` → normalized child tables.
- `withdrawal_requests.payout_method_id` remains relational source; payout snapshot columns are optional immutable audit fields.
- `conversations.group_id` remains source; display fields are projected in view/query layer.

## Migration files

1. `supabase/migrations/20260222001000_expand_3nf_normalized_structures.sql`
   - Adds normalized tables, constraints, indexes.
   - Keeps all legacy columns in place.

2. `supabase/migrations/20260222001100_backfill_3nf_normalized_from_legacy.sql`
   - Idempotent backfill from arrays/JSON to child tables.
   - Safe to re-run.

3. `supabase/migrations/20260222001200_add_compatibility_views_and_guardrails.sql`
   - Adds compatibility projections for legacy payload shapes.
   - Adds parity and duplicate-check functions.

## Operational scripts

- `scripts/migration/3nf_guardrail_checks.sql`
  - Runs parity, duplicate, and orphan checks.
- `scripts/migration/3nf_rollback_playbook.sql`
  - Emergency rollback for Phase 2 data backfill.

## Phased rollout

### Phase 1: Expand
- Apply migration `20260222001000`.
- No app behavior changes.

### Phase 2: Backfill
- Apply migration `20260222001100`.
- Run `scripts/migration/3nf_guardrail_checks.sql`.

### Phase 3: Dual-write
- App/API writes both legacy and normalized tables.
- Reads still legacy.

### Phase 4: Shadow-read
- Add telemetry to compare legacy payload vs normalized projection payload.
- Track drift, null deltas, and latency.

### Phase 5: Cutover
- Switch reads behind feature flags by domain in this order:
  1) profiles
  2) groups
  3) gigs
  4) studios
  5) payouts/chat display

### Phase 6: Contract
- Stop legacy writes first.
- Freeze legacy columns.
- Drop legacy columns only after stable period and parity confidence.

## Safety controls checklist

- Compatibility views available for legacy payload reconstruction.
- Row-count parity checks green.
- Duplicate checks green.
- Orphan checks green.
- Error rate / latency / drift stable for one full release window before next domain.
