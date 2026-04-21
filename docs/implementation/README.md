# MusikaLokal Expansion Implementation Plan

This document turns the expansion roadmap into a repository-level implementation reference.

## Purpose

The current platform already has strong foundations in listings, bookings, wallet flows, chat, notifications, admin moderation, and Supabase Edge Functions. The missing work is not a rewrite. It is the addition of new bounded domains that fit the existing architecture without breaking the current booking and listing flows.

This plan assumes:

- the shared backend remains Supabase-centered
- the first rollout targets `mobile` and `web`
- `web/web-app` is intentionally out of scope until the backend contracts stabilize
- the first delivery priority is the commercial booking model

## Delivery Principles

- Prefer new bounded domains over broad rewrites of existing listing ownership or booking data.
- Reuse existing tables, functions, views, wallet flows, and Realtime patterns where they already match the problem.
- Add new Edge Functions for new domains instead of continuously expanding the largest action routers.
- Add dedicated pages when Home, bookings, manage, or profile surfaces would become too crowded to stay usable.
- Snapshot mutable business rules at transaction time so later edits do not rewrite historical commercial outcomes.
- Keep mobile and Expo web on the same backend contracts to reduce drift.

## Phase Map

| Phase | Outcome | Primary backend work | Primary client work | Depends on |
| --- | --- | --- | --- | --- |
| 1 | Domain boundaries and contracts | canonical schema and API contracts | none beyond contract review | none |
| 2 | Commercial booking MVP | deals, packages, penalties, wallet references, SQL functions, settlement flows | none beyond integration scaffolding | 1 |
| 3 | Commercial UI rollout | no new core schema | deals surfaces, studio policy editors, proposal entry points | 2 |
| 4 | Producer network and home discovery | producer projects, invites, applications, talent matching views | role-aware home modules, producer discovery, invite/apply flows | 2 |
| 5 | Artist graph and newsfeed | follows, posts, comments, activity projections | feed routes and follower activity UI | 4 |
| 6 | Teaser playlists and radio MVP | playlists, tracks, station schedules, storage namespaces | playlist and station discovery/detail views | 5 |
| 7 | Marketplace and digital drops | products, variants, orders, entitlements, payout references | catalog, checkout, order history, seller UI | 4 |
| 8 | Admin and rollout hardening | moderation, audit, search, notification templates | admin controls, search filters, rollout validation | 2 through 7 |

## Current Reuse Anchors

Use these existing modules as anchors instead of inventing parallel implementations:

- shared schema references: [mobile/supabase_schema.sql](../../mobile/supabase_schema.sql), [mobile/schema.sql](../../mobile/schema.sql), [web/schema.sql](../../web/schema.sql)
- booking execution: [mobile/supabase/functions/manage-bookings/index.ts](../../mobile/supabase/functions/manage-bookings/index.ts)
- payment and payout orchestration: [mobile/supabase/functions/paymongo/index.ts](../../mobile/supabase/functions/paymongo/index.ts), [mobile/supabase/functions/withdrawals/index.ts](../../mobile/supabase/functions/withdrawals/index.ts)
- listing-style action routing: [mobile/supabase/functions/manage-listings/index.ts](../../mobile/supabase/functions/manage-listings/index.ts)
- booking surfaces: [mobile/app/bookings.tsx](../../mobile/app/bookings.tsx), [web/app/bookings.tsx](../../web/app/bookings.tsx)
- studio management: [mobile/app/manage_studio.tsx](../../mobile/app/manage_studio.tsx), [web/app/manage_studio.tsx](../../web/app/manage_studio.tsx)
- listing entry flows: [mobile/app/add_studio.tsx](../../mobile/app/add_studio.tsx), [web/app/add_studio.tsx](../../web/app/add_studio.tsx), [mobile/app/add_gig.tsx](../../mobile/app/add_gig.tsx), [web/app/add_gig.tsx](../../web/app/add_gig.tsx)
- reusable discovery and detail UI: [mobile/src/components/ListingDetailsSheet.tsx](../../mobile/src/components/ListingDetailsSheet.tsx), [web/src/components/ListingDetailsSheet.tsx](../../web/src/components/ListingDetailsSheet.tsx), [mobile/src/components/SearchBottomSheet.tsx](../../mobile/src/components/SearchBottomSheet.tsx), [web/src/components/SearchBottomSheet.tsx](../../web/src/components/SearchBottomSheet.tsx)
- admin control plane: [web/app/admin/_AdminPanel.tsx](../../web/app/admin/_AdminPanel.tsx)

## Phase Breakdown

### Phase 1. Domain boundaries and contracts

- Freeze the first rollout to `mobile` and `web`.
- Define canonical entities for deals, penalties, follows, posts, playlists, stations, products, and orders.
- Keep production teams as a dedicated new domain instead of refactoring every owner model.
- Normalize action names and payload shapes before UI work begins.

### Phase 2. Commercial booking MVP

- Add a negotiated-deals domain for production-to-venue partnerships.
- Add recording deal packages that complement existing studio recording rules.
- Add cancellation-policy snapshots and penalty events for fixed-price rehearsal bookings.
- Reuse existing `studio_bookings`, `wallet_transactions`, `booking_holds`, and `booking_incidents`.

Detailed phase guide: [phase-1-commercial-booking.md](./phase-1-commercial-booking.md)

### Phase 3. Commercial UI rollout

- Add a Deals surface to the booking pages.
- Extend studio management for package builders, policy editors, and negotiation history.
- Extend studio and gig creation flows with negotiable commercial options.
- Reuse the existing chat and notification patterns for negotiation state changes.

### Phase 4. Producer network and home discovery

- Add producer project, application, invite, saved-talent, and match activity domains.
- Surface producer matching directly on Home for both producers and musicians instead of burying it in a separate route.
- Reuse production teams, notifications, and existing listing discovery patterns.

Detailed phase guide: [phase-2-producer-social-media-marketplace.md](./phase-2-producer-social-media-marketplace.md)

### Phase 5. Artist graph and newsfeed

- Add follows, posts, media, reactions, comments, and activity events.
- Introduce a dedicated feed route rather than overloading the current listing-first home screen on day one.
- Reuse notifications and Realtime for follower activity fan-out.

### Phase 6. Teaser playlists and radio MVP

- Add playlists, tracks, teaser assets or external links, and station schedules.
- Keep radio as a curated playlist station, not true synchronized streaming.
- Use Storage only for teaser clips and art assets in the MVP.

Detailed profile-first station plan: [profile-radio-station-plan.md](./profile-radio-station-plan.md)

### Phase 7. Marketplace and digital drops

- Add products, variants, orders, order items, digital entitlements, and payout references.
- Reuse PayMongo plus wallet transactions for capture, refunds, seller earnings, and payouts.
- Start with a narrow catalog and checkout flow even if the schema supports both physical and digital goods.
- Defer full in-app streaming or downloadable exclusive songs and playlists until entitlement-gated media delivery is stable.

### Phase 8. Admin and rollout hardening

- Extend moderation and audit surfaces for deals, posts, playlists, stations, products, disputes, and payout exceptions.
- Extend discovery/search for the new entities.
- Update documentation and schema references as each domain lands.

## Recommended Implementation Order

1. Add the commercial schema and SQL helpers in `mobile/supabase/migrations`.
2. Add the new commercial Edge Function and minimal changes to existing payment and booking functions.
3. Update the mobile and Expo web booking and studio flows.
4. Add admin moderation and audit support for the new commercial records.
5. Move to producer matching and Home discovery after the commercial contracts are stable.
6. Layer in the social feed, playlists and radio, then marketplace and digital drops.

## Verification Checklist

1. Run `npm run supabase:start` and `npm run supabase:reset` from `mobile` after each migration batch.
2. Run `npx tsc --noEmit` and `npm run lint` in both `mobile` and `web` after each implementation slice.
3. Validate an end-to-end commercial flow: propose a venue partnership, counteroffer it, accept it, collect payment, cancel a rehearsal booking, and verify wallet and audit records.
4. Validate moderation and dispute handling before moving any new flow toward production.

## Decisions Locked For The First Rollout

- `mobile` and `web` ship first.
- `web/web-app` waits until the shared backend contracts settle.
- radio is a curated playlist-station MVP, not a live synchronized streaming product.
- producer discovery is bidirectional: musicians can apply, and producers can invite.
- Home stays the main hub and gains role-aware producer, feed, and media modules instead of being replaced.
- the backend remains Supabase-centered; no separate Node service is introduced for this roadmap.