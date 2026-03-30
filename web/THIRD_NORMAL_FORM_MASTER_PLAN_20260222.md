# Third Normal Form Master Plan (2026-02-22)

This document is the authoritative, execution-grade plan for finishing global 3NF in `public` while preserving production safety.

## 1) Current state snapshot

Based on MCP schema inspection (base tables only):

- Total base tables: 53
- Primary key coverage: complete (no base table without PK)
- 3NF status: **partially complete**

### 1.0.1 MCP-applied update (2026-02-22)

- Applied migration: `supabase/migrations/20260222193000_phase_c_p0_practical_3nf_guards.sql`
- Added `group_availability_slots` + sync trigger/backfill for `groups.availability`.
- Enforced `conversations.group_name` and `conversations.group_avatar_url` as derived cache fields via triggers.
- Added `normalization_exceptions` registry and seeded approved exceptions.

### 1.1 Already completed (contracted / normalized)

- Core profile/gig/studio legacy array columns are already contracted.
- Groups Phase A completed:
  - `groups.members` and `groups.images` transitioned and contracted.
- Studio Bookings Phase B completed:
  - `studio_bookings.time_slots` transitioned and contracted.

### 1.2 Remaining non-3NF candidates in base tables

#### A) Domain data requiring explicit decision (normalize vs intentional denormalization)

- `gigs.availability` (jsonb)
- `gigs.slots_filled` (jsonb)
- `groups.availability` (jsonb)
- `studios.availability` (jsonb)
- `studios.open_dates` (jsonb)
- `group_roster_members.metadata` (jsonb)
- `group_roster_members.raw_member` (jsonb)

#### B) Usually acceptable as system/config payloads (documented exception)

- `booking_requests.event_details` (jsonb)
- `studio_bookings.modifiers_applied` (jsonb)
- `studio_settings.peak_season_dates` (jsonb)
- `studio_settings.off_peak_dates` (jsonb)
- `subscription_plans.features` (jsonb)

#### C) Transitive dependency candidate

- `conversations.group_name` with `conversations.group_id`
  - Risk: `group_id -> groups.name` implies transitive dependency inside `conversations`.
  - Action: treat as read-model cache only, or remove from write model.

## 2) Normalization policy (enforced)

Every base table must satisfy:

1. Key dependency: non-key columns depend on the key.
2. Whole-key dependency: no partial dependency on composite key subsets.
3. No transitive dependency: non-key columns do not depend on other non-key columns.

Allowed exceptions (must be documented in schema notes):

- Immutable audit snapshots and third-party raw payloads.
- Config JSON that is not queried relationally and is small/stable.

## 3) Full execution phases

## Phase 0 — Freeze and guardrails

Objective: lock decision criteria and avoid schema drift mid-rollout.

Actions:

- Keep all pending 3NF work in additive-first migrations.
- Use repeatable scorecard script: `scripts/20260222_full_3nf_audit_scorecard.sql`.
- Require green checks before any destructive contract step.

Exit criteria:

- Scope list approved.
- Candidate exceptions explicitly accepted.

## Phase 1 — Functional dependency inventory

Objective: formalize FDs for all remaining candidate tables.

Actions:

- Record FDs per table (example: `group_id -> group_name`).
- Confirm whether candidate JSON columns contain repeating entities.
- Confirm whether each JSON field is queried/filterable in product logic.

Exit criteria:

- Each candidate table has a written FD map and decision (`normalize` or `exception`).

## Phase 2 — Target canonical schema for remaining candidates

Objective: define relational destination for candidates marked `normalize`.

Default targets:

- Schedule slots:
  - `gig_availability_slots`, `group_availability_slots`, `studio_availability_slots`
  - Columns: parent FK, `day_of_week`, optional `slot_date`, `start_time`, `end_time`, boolean status.
- Open dates:
  - `studio_open_dates` (`studio_id`, `open_date`, `is_open`).
- Roster payload cleanup:
  - Keep typed columns as source (`member_name`, `member_role`, `instrument`),
  - Optional side table for structured extra attributes only if needed.
- Conversation display fields:
  - Project from join/view (`conversations_display_projection`) rather than persisting denormalized names.

Exit criteria:

- DDL for all `normalize` decisions drafted and reviewed.

## Phase 3 — Expand migrations (additive only)

Objective: add structures without breaking current reads/writes.

Actions:

- Create new normalized tables/indexes/constraints.
- Add compatibility views/functions where legacy shape is needed.
- Keep all legacy columns untouched.

Exit criteria:

- Migrations apply cleanly in staging and prod.

## Phase 4 — Idempotent backfill + dual-write

Objective: populate canonical tables and prevent drift during transition.

Actions:

- Backfill in batches with idempotent `INSERT ... ON CONFLICT` patterns.
- Enable dual-write (trigger or API layer) for transition period.
- Track parity counters and mismatches.

Exit criteria:

- Backfill complete.
- Parity mismatch = 0 for agreed checks.

## Phase 5 — Shadow read and cutover

Objective: switch reads safely.

Actions:

- Compare legacy payload projection vs canonical projection in shadow mode.
- Enable read flags by domain.
- Remove legacy reads once stable.

Exit criteria:

- Error/latency/drift stable through at least one release window.

## Phase 6 — Contract (destructive)

Objective: remove legacy columns and sync logic.

Actions:

- Stop legacy writes first.
- Re-run scorecard and dependency checks.
- Drop legacy columns only after green preflight.

Exit criteria:

- Legacy columns removed (or formally exempted).
- 3NF exception register updated.

## 4) Exact run order for operators

1. Run inventory + scorecard:
   - `scripts/20260222_global_3nf_inventory.sql`
   - `scripts/20260222_full_3nf_audit_scorecard.sql`
2. Validate existing guardrails:
   - `scripts/migration/3nf_guardrail_checks.sql`
   - `scripts/20260222_contract_readiness_check.sql`
3. For each remaining `normalize` candidate:
   - apply expand migration
   - run backfill
   - run scorecard/parity checks
   - activate dual-write
   - shadow-read verification
   - cutover read path
   - contract legacy columns
4. After each DDL phase:
   - run Supabase advisors (`security`, `performance`)

## 5) Table-by-table decision ledger (current)

- `conversations.group_name` / `group_avatar_url`: **pending cleanup** (projection-preferred).
- `gigs.availability` / `slots_filled`: **pending decision** (normalize if analytics/constraints needed).
- `groups.availability`: **pending decision** (normalize if query semantics required).
- `studios.availability` / `open_dates`: **pending decision** (normalize if booking rules demand strict constraints).
- `group_roster_members.metadata` / `raw_member`: **pending decision** (prefer typed columns; keep raw payload only for migration traceability).
- `booking_requests.event_details`: **exception candidate** (payload).
- `studio_bookings.modifiers_applied`: **exception candidate** (pricing payload/audit).
- `studio_settings.peak_season_dates` / `off_peak_dates`: **exception candidate** (config payload).
- `subscription_plans.features`: **exception candidate** (plan metadata).

## 6) Minimum acceptance definition (project-level)

Project is considered 3NF-compliant for base transactional model when:

- All `normalize` candidates are migrated and contracted, and
- All retained JSON/transitive fields are explicitly documented as accepted exceptions, and
- Scorecard reports no unresolved violations outside exception list.
