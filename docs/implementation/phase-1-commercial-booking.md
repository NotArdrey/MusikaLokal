# Phase 1 Commercial Booking Expansion

This document defines the first implementation slice for the expansion roadmap.

## Goal

Extend the existing booking platform so it can support:

- production-to-venue partnerships with negotiated pricing and deal terms
- flexible recording deals for studios and artists
- fixed-price rehearsal sessions with enforceable cancellation penalties

The target is to fit these flows into the current Supabase data model, wallet ledger, payment integration, and mobile plus Expo web clients without rewriting the rest of the booking stack.

## In Scope

- new commercial tables and supporting SQL functions
- payment and wallet references for negotiated deals, penalties, and refunds
- a dedicated Edge Function for deal lifecycle management
- mobile and Expo web surfaces for deal creation, negotiation, acceptance, and penalty visibility
- admin visibility for disputes, settlements, and payout exceptions

## Out Of Scope

- the Vite web app in `web/web-app`
- artist newsfeed, playlists, radio, and marketplace workstreams
- true contract e-signature integrations
- a full generic organization refactor across every listing owner type

## Existing Foundations To Reuse

- booking lifecycle and incident handling in [mobile/supabase/functions/manage-bookings/index.ts](../../mobile/supabase/functions/manage-bookings/index.ts)
- payment capture and refund flows in [mobile/supabase/functions/paymongo/index.ts](../../mobile/supabase/functions/paymongo/index.ts)
- payout and withdrawal logic in [mobile/supabase/functions/withdrawals/index.ts](../../mobile/supabase/functions/withdrawals/index.ts)
- booking tables and recording logic in [mobile/supabase_schema.sql](../../mobile/supabase_schema.sql)
- booking incident and payout hold patterns in the recent migrations under [mobile/supabase/migrations](../../mobile/supabase/migrations)
- booking and studio management UI in [mobile/app/bookings.tsx](../../mobile/app/bookings.tsx), [web/app/bookings.tsx](../../web/app/bookings.tsx), [mobile/app/manage_studio.tsx](../../mobile/app/manage_studio.tsx), and [web/app/manage_studio.tsx](../../web/app/manage_studio.tsx)

## Workstream 1. Schema Additions

Add new migrations under `mobile/supabase/migrations` for the following entities.

| Table | Purpose | Notes |
| --- | --- | --- |
| `production_teams` | production entities that can negotiate venue partnerships | keep ownership bounded to this feature rather than refactoring all owners |
| `production_team_members` | membership and roles inside production teams | include owner and manager role support |
| `venue_partnership_deals` | top-level venue partnership record | link to venue owner profile, optional gig, proposing team, lifecycle status |
| `deal_term_versions` | versioned commercial terms | snapshot revenue split, fixed fees, deposits, event date assumptions, cancellation clauses |
| `deal_negotiation_events` | append-only negotiation timeline | proposal, counteroffer, acceptance, rejection, cancellation, settlement update |
| `studio_recording_deals` | negotiated recording agreements | scoped to studio, counterparty, active period, status |
| `recording_deal_packages` | package pricing and quantity thresholds | supports tiered or block-based offers without mutating global studio settings |
| `booking_cancellation_policies` | explicit rehearsal cancellation rules | store refund windows, penalty percentages, no-show behavior |
| `booking_penalty_events` | immutable penalty ledger records | link booking, policy snapshot, calculated amounts, wallet references |

Recommended extensions to existing tables:

- `studio_bookings`: add optional references to `studio_recording_deals`, `recording_deal_packages`, and a cancellation-policy snapshot reference.
- `wallet_transactions`: if the current model does not already support it cleanly, add reference typing so transactions can point to deals, penalties, and settlement events without overloading booking-only semantics.
- `booking_incidents`: add optional linkage to penalty review or settlement-hold state when a cancellation or no-show becomes disputed.

Schema design guidance for this phase:

- index every foreign key added in the new tables
- use partial indexes for open or active states that power inbox and dashboard queries
- keep mutable business rules in version tables and snapshot references rather than recalculating from the latest settings
- avoid wide JSON blobs for relational core fields that will be filtered or joined frequently

## Workstream 2. SQL Functions, Views, And Policies

Add SQL helpers that keep commercial calculations inside Postgres where the source of truth already lives.

Required helpers:

- `calculate_deal_settlement(...)` for partnership and recording settlement math
- `calculate_booking_cancellation_penalty(...)` for rehearsal cancellation outcomes
- `apply_booking_penalty(...)` for creating penalty events and wallet ledger entries atomically
- `resolve_active_recording_package(...)` for booking-time package lookup
- `mark_deal_terms_accepted(...)` for version-safe acceptance transitions

Recommended read models:

- `venue_partnership_deals_with_summary`
- `studio_recording_deals_with_summary`
- `booking_penalty_events_with_summary`

Policy and concurrency guidance:

- keep RLS narrow by actor type and row ownership instead of exposing generic broad read policies
- perform settlement and penalty application inside transactions
- use row locking or equivalent transaction guards when multiple actors can settle or dispute the same commercial record
- expose dashboard-ready projections so clients do not rebuild large joins repeatedly

## Workstream 3. Edge Function Boundaries

Add a new function, for example `manage-deals`, instead of pushing negotiation logic into the already-large booking router.

Suggested actions for `manage-deals`:

- `create_venue_partnership_deal`
- `counter_venue_partnership_deal`
- `accept_venue_partnership_deal`
- `reject_venue_partnership_deal`
- `create_recording_deal`
- `add_recording_package`
- `accept_recording_deal`
- `list_my_deals`
- `get_deal_details`
- `mark_settlement_paid`
- `raise_deal_dispute`

Keep these responsibilities in existing functions:

- [mobile/supabase/functions/manage-bookings/index.ts](../../mobile/supabase/functions/manage-bookings/index.ts): booking creation, cancellation, attendance, penalty hooks, and booking state changes
- [mobile/supabase/functions/paymongo/index.ts](../../mobile/supabase/functions/paymongo/index.ts): payment intent creation, payment capture, refunds, and settlement collection
- [mobile/supabase/functions/manage-notifications/index.ts](../../mobile/supabase/functions/manage-notifications/index.ts): notification fan-out if it already owns template dispatching

## Workstream 4. Client Surfaces

Phase 1 should keep the number of new top-level pages small. Most of the new commercial behavior belongs inside the current booking, studio, gig, and wallet flows.

### New pages to add

Required new pages for phase 1:

- Production Team page: create a production team, manage members and roles, and choose the active team that can propose venue partnerships. production is a new user note that add it too register page to log in as producer so that they do have own dedicated

- Deal Details page: show the negotiation timeline, current term version, settlement state, payment state, dispute state, and actions such as counter, accept, reject, or mark paid.
- Web admin Deals page: review commercial disputes, settlement holds, payout exceptions, and deal-level audit context.

Optional new page only if the existing creation flows become too crowded:

- Partnership Proposal page: a dedicated proposal builder for venue partnership terms. This should only be added if extending the current gig and venue flows makes those screens too large or confusing.

### Existing pages to extend instead of adding new routes

- [mobile/app/bookings.tsx](../../mobile/app/bookings.tsx) and [web/app/bookings.tsx](../../web/app/bookings.tsx): add a Deals view or tab to the current bookings and applications experience instead of creating a separate top-level deals index page.
- [mobile/app/manage_studio.tsx](../../mobile/app/manage_studio.tsx) and [web/app/manage_studio.tsx](../../web/app/manage_studio.tsx): add recording package builders, negotiated-rate history, and cancellation-policy editors here rather than creating separate package-management pages.
- [mobile/app/add_studio.tsx](../../mobile/app/add_studio.tsx) and [web/app/add_studio.tsx](../../web/app/add_studio.tsx): add fields for fixed rehearsal pricing and negotiable recording behavior.
- [mobile/app/edit_studio.tsx](../../mobile/app/edit_studio.tsx) and [web/app/edit_studio.tsx](../../web/app/edit_studio.tsx): support editing the same commercial settings after creation.
- [mobile/app/add_gig.tsx](../../mobile/app/add_gig.tsx) and [web/app/add_gig.tsx](../../web/app/add_gig.tsx): add partnership-initiation entry points for venue-side and production-side users.
- [mobile/app/wallet.tsx](../../mobile/app/wallet.tsx) and [web/app/wallet.tsx](../../web/app/wallet.tsx): surface deposits, penalties, refunds, and settlement-related ledger states instead of creating a separate commercial wallet page.

### Booking surfaces

- add a `Deals` view or tab to [mobile/app/bookings.tsx](../../mobile/app/bookings.tsx) and [web/app/bookings.tsx](../../web/app/bookings.tsx)
- show negotiation status, pending actions, accepted terms, settlement state, and penalty history

### Studio management

- extend [mobile/app/manage_studio.tsx](../../mobile/app/manage_studio.tsx) and [web/app/manage_studio.tsx](../../web/app/manage_studio.tsx) with recording package builders, negotiated-rate history, and cancellation-policy editors
- extend [mobile/app/add_studio.tsx](../../mobile/app/add_studio.tsx) and [web/app/add_studio.tsx](../../web/app/add_studio.tsx) so studios can separate fixed rehearsal pricing from negotiable recording pricing

### Venue and production entry flows

- extend [mobile/app/add_gig.tsx](../../mobile/app/add_gig.tsx) and [web/app/add_gig.tsx](../../web/app/add_gig.tsx) to allow venue-side or production-side users to start partnership proposals
- reuse the existing chat and notification patterns for negotiation updates rather than introducing a parallel messaging feature

## Workstream 5. Payment, Wallet, And Audit Integration

- treat accepted commercial deals as first-class payment references instead of forcing them into studio-booking-only assumptions
- create wallet ledger entries for deposits, settlement releases, refunds, and cancellation penalties
- preserve immutable audit history for every accepted term version and every penalty calculation
- keep payout holds aligned with the existing booking-incident workflow so disputes can freeze release when necessary

## Suggested Migration And Delivery Order

1. add schema tables and indexes
2. add SQL functions, views, and RLS policies
3. add the `manage-deals` Edge Function
4. wire payment and wallet references into booking and PayMongo flows
5. extend mobile and Expo web booking and studio screens
6. extend admin moderation and reporting paths
7. run end-to-end validation for proposal, counteroffer, acceptance, cancellation, refund, and dispute handling

## Definition Of Done

Phase 1 is complete only when all of the following are true:

- a production team can propose and negotiate a venue partnership
- a studio can publish and accept a negotiated recording package
- a rehearsal cancellation automatically produces the correct refund or penalty outcome
- wallet and audit records reflect every commercial event
- mobile and Expo web both surface the same commercial states
- admin can inspect disputes or settlement exceptions without direct database intervention

## Validation Checklist

1. Run `npm run supabase:start` and `npm run supabase:reset` from `mobile` after each migration batch.
2. Run `npx tsc --noEmit` and `npm run lint` in `mobile` and `web` after each client or function change.
3. Test the happy path for venue partnership negotiation from proposal through acceptance and payment.
4. Test a rehearsal cancellation across each policy window and verify the exact wallet outcomes.
5. Test a disputed cancellation or settlement hold and verify the incident, hold, and audit paths.
6. Test mobile and Expo web parity for the same commercial records.  