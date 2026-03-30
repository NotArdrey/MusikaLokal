# Global 3NF Roadmap (Post Contracted Core)

Reference artifacts:
- Master execution plan: `THIRD_NORMAL_FORM_MASTER_PLAN_20260222.md`
- Repeatable scorecard SQL: `scripts/20260222_full_3nf_audit_scorecard.sql`
- MCP-applied Phase C migration: `supabase/migrations/20260222193000_phase_c_p0_practical_3nf_guards.sql`

Current status (MCP verified):
- `profiles` / `gigs` / `studios` legacy denormalized columns are contracted.
- Remaining non-atomic columns exist in other base tables and are not yet globally normalized.

## Scope classification

### Normalize next (domain data)
- `groups.members` (jsonb)
- `groups.images` (text[])
- `studio_bookings.time_slots` (jsonb)

### Keep as JSON/ARRAY (system/event/config payloads)
- Audit snapshots and external provider payloads:
  - `*_deletion_audit` JSON columns
  - `address_verification_sessions.raw_response`, `verification_result`
  - `verification_sessions.verification_data`
- Flexible metadata/config:
  - `notifications.meta`
  - `subscription_plans.features`
  - `booking_requests.event_details`
  - `studio_settings.peak_season_dates`, `off_peak_dates`

### Candidate for later normalization (only if product requires relational querying)
- `gigs.availability` / `gigs.slots_filled`
- `groups.availability`
- `studios.availability` / `studios.open_dates`

## Recommended execution phases

## Phase A: Groups domain
1. Expand
   - `group_members_normalized` child table (if not reusing existing `group_members` only)
   - `group_media` child table for `groups.images`
2. Backfill
   - Copy `groups.images` -> `group_media`
   - Ensure `groups.members` semantics are fully represented in relational tables.
3. Compatibility
   - `groups_legacy_projection` exposing `members` + `images` assembled from normalized tables.
4. Dual-write
   - Trigger or RPC sync from legacy -> normalized during transition.
5. Contract
   - Drop `groups.members`, `groups.images` only after all readers use projection/normalized paths.

## Phase B: Studio booking slots
1. Expand
   - `studio_booking_slots` (`booking_id`, `start_time`, `end_time`, `sort_order`).
2. Backfill
   - Parse `studio_bookings.time_slots` array into slot rows.
3. Compatibility
   - `studio_bookings_legacy_projection` to reconstruct `time_slots` json for legacy readers.
4. Dual-write
   - Trigger on `studio_bookings.time_slots` while app transitions.
5. Contract
   - Drop `studio_bookings.time_slots`.

## Phase C: Optional schedule normalization
Normalize schedule JSON only if you need stronger constraints and analytics:
- `gigs.availability` / `slots_filled`
- `groups.availability`
- `studios.availability` / `open_dates`

## Hard gates before each contract step
- Projection parity checks = 0 mismatches.
- No active dependencies on target legacy columns (`pg_depend` introspection).
- Preflight metrics for target columns = 0 non-empty.
- Advisors checked after DDL (`security`, `performance`).

## Immediate next migration target
Start with **Phase A (Groups)** because:
- Highest business value among remaining denormalized business data.
- Clear relational destination.
- Lower risk than schedule JSON decomposition.

Use `scripts/20260222_global_3nf_inventory.sql` before and after each phase.