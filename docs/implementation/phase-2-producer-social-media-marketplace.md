# Phase 2 Producer Network, Social Feed, And Media Marketplace

This document defines the next implementation slice after the commercial booking rollout.

## Goal

Extend MusikaLokal so it can support:

- musicians applying to producer-led projects
- producers inviting musicians directly from discovery surfaces
- role-aware Home modules that surface producer matching, social updates, playlists, stations, and merch drops
- a Facebook-like social feed for musicians, producers, venues, and studios
- teaser playlists and band radio stations that promote tracks and send listeners to Spotify or other external platforms for full playback
- merchandise sales and future exclusive digital drops for an artist's fanbase

The target is to fit these features into the current Supabase-centered architecture, notification system, realtime patterns, wallet flows, and Expo mobile plus Expo web clients without rewriting the rest of the marketplace.

## In Scope

- producer project, invite, and application workflows
- Home page integration for producer matching on both musician and producer experiences
- a dedicated social feed domain with follows, posts, reactions, and comments
- teaser playlists, external streaming links, and curated radio-station scheduling
- merchandise catalog, checkout, order history, seller balances, and payout references
- admin moderation, reporting, and audit support for the new social, media, and commerce records

## Out Of Scope

- the Vite web app in `web/web-app`
- full in-app streaming catalog playback
- synchronized live radio or DJ-broadcast infrastructure
- guest checkout for paid merchandise or exclusive content in the first rollout
- full entitlement-gated delivery of exclusive songs and playlists in the first rollout
- a full owner-model refactor across every existing listing type

## Product Decisions For This Slice

- producer matching is bidirectional: musicians can apply to producer projects, and producers can invite musicians
- the current Home screen stays the primary entry point and gets new role-aware modules instead of being replaced
- teaser audio is the first media scope; full tracks stay on Spotify or another external platform in the MVP
- merchandise is the first commerce scope; full exclusive-song and exclusive-playlist delivery follows after teaser and entitlement foundations are stable
- discovery can be broad, but paid actions remain authenticated-user flows in the first rollout

## Page Strategy

- Home remains the first-screen hub, but it is not the only surface for these features.
- Add dedicated pages whenever multi-step creation, moderation, or detail flows would make existing screens too dense.
- Prefer a hub-and-detail pattern: Home, Feed, Shop, and producer modules surface summaries that link to focused pages.
- Keep mobile and Expo web route parity for user-facing pages unless a workflow is explicitly admin-only.
- Allow admin-specific web pages when operational review, moderation, or payout workflows are too large for a single combined queue.

## Existing Foundations To Reuse

- producer signup role in [mobile/app/signup.tsx](../../mobile/app/signup.tsx) and [web/app/signup.tsx](../../web/app/signup.tsx)
- producer team management in [mobile/app/production_team.tsx](../../mobile/app/production_team.tsx) and [mobile/supabase/functions/manage-deals/index.ts](../../mobile/supabase/functions/manage-deals/index.ts)
- role-aware Home logic in [mobile/app/home.tsx](../../mobile/app/home.tsx) and [web/app/home.tsx](../../web/app/home.tsx)
- search and details UI in [mobile/src/components/SearchBottomSheet.tsx](../../mobile/src/components/SearchBottomSheet.tsx), [web/src/components/SearchBottomSheet.tsx](../../web/src/components/SearchBottomSheet.tsx), [mobile/src/components/ListingDetailsSheet.tsx](../../mobile/src/components/ListingDetailsSheet.tsx), and [web/src/components/ListingDetailsSheet.tsx](../../web/src/components/ListingDetailsSheet.tsx)
- application workflow patterns in [mobile/supabase/functions/gig-applications/index.ts](../../mobile/supabase/functions/gig-applications/index.ts)
- notification fan-out in [mobile/supabase/functions/manage-notifications/index.ts](../../mobile/supabase/functions/manage-notifications/index.ts)
- upload screening in [mobile/supabase/functions/upload-safety-screen/index.ts](../../mobile/supabase/functions/upload-safety-screen/index.ts)
- wallet, payment, and payout flows in [mobile/app/wallet.tsx](../../mobile/app/wallet.tsx), [web/app/wallet.tsx](../../web/app/wallet.tsx), [mobile/supabase/functions/paymongo/index.ts](../../mobile/supabase/functions/paymongo/index.ts), and [mobile/supabase/functions/withdrawals/index.ts](../../mobile/supabase/functions/withdrawals/index.ts)
- admin moderation surfaces in [web/app/admin](../../web/app/admin) and [web/supabase/functions/admin-reports-management/index.ts](../../web/supabase/functions/admin-reports-management/index.ts)

## Workstream 1. Producer Network Schema

Add new migrations under `mobile/supabase/migrations` for producer matching and discovery.

| Table | Purpose | Notes |
| --- | --- | --- |
| `producer_projects` | top-level producer opportunity or casting call | owned by a producer or production team, lifecycle-aware |
| `producer_project_roles` | required or optional talent slots per project | supports instrument, vocal, production, and support roles |
| `producer_project_applications` | musician-to-producer applications | mirrors gig application patterns but scoped to producer projects |
| `producer_talent_invites` | producer-to-musician invites | supports accept, reject, expire, and withdrawn states |
| `saved_talent` | producer shortlists and reusable candidate lists | lightweight save or bookmark layer for discovery |
| `producer_match_activity_events` | immutable timeline of applications, invites, accepts, rejects, and withdrawals | drives audit, notifications, and Home modules |

Recommended schema guidance:

- reuse `production_teams` as the producer organization anchor instead of introducing a parallel producer-company domain
- index every foreign key and add partial indexes for open projects, pending applications, and pending invites
- keep match state relational and queryable instead of hiding workflow semantics in JSON blobs
- expose read models such as `producer_projects_with_summary` and `producer_matches_with_summary` so clients do not rebuild large joins repeatedly
- keep RLS narrow by project owner, team member, applicant, invitee, and admin actor

## Workstream 2. Producer Network Function Boundaries

Add a new function, for example `manage-producer-network`, instead of merging this work into `manage-deals` or overloading `gig-applications`.

Suggested actions for `manage-producer-network`:

- `create_project`
- `update_project`
- `publish_project`
- `archive_project`
- `list_my_projects`
- `get_project_details`
- `apply_to_project`
- `withdraw_application`
- `invite_musician`
- `accept_invite`
- `reject_invite`
- `save_talent`
- `list_matches`

Keep these responsibilities in existing functions:

- [mobile/supabase/functions/manage-notifications/index.ts](../../mobile/supabase/functions/manage-notifications/index.ts): notification fan-out and template handling
- [mobile/supabase/functions/manage-bookings/index.ts](../../mobile/supabase/functions/manage-bookings/index.ts): booking execution and attendance states
- [mobile/supabase/functions/manage-deals/index.ts](../../mobile/supabase/functions/manage-deals/index.ts): venue partnerships and recording-deal logic

## Workstream 3. Home Page And Discovery Integration

Home should surface the new matching domain instead of forcing users to navigate to a separate tool first.

Producer Home should add modules such as:

- `Suggested Talent`
- `Available Musicians`
- `Pending Applications`
- `Saved Talent`

Musician Home should add modules such as:

- `Producer Calls`
- `Open Producer Projects`
- `Pending Invites`
- `Recommended Producers`

Client work should extend existing screens instead of replacing them:

- [mobile/app/home.tsx](../../mobile/app/home.tsx) and [web/app/home.tsx](../../web/app/home.tsx): add role-aware producer modules and realtime refresh hooks
- [mobile/src/components/SearchBottomSheet.tsx](../../mobile/src/components/SearchBottomSheet.tsx) and [web/src/components/SearchBottomSheet.tsx](../../web/src/components/SearchBottomSheet.tsx): add talent, producer, and project filters
- [mobile/src/components/ListingDetailsSheet.tsx](../../mobile/src/components/ListingDetailsSheet.tsx) and [web/src/components/ListingDetailsSheet.tsx](../../web/src/components/ListingDetailsSheet.tsx): add `Apply` and `Invite` actions where appropriate

### New pages to add

Required new pages for producer matching:

- Producer Projects page: browse open producer calls, filter by genre, role, location, and project status, and let producers manage their own calls.
- Producer Project Details page: show the full brief, required roles, timeline, team context, application state, invite controls, and recent activity.
- Match Inbox page: unify incoming musician applications and producer invites in one role-aware page instead of relying only on Home cards.

Recommended pages when discovery grows past Home and search:

- Talent Directory page: producer-focused musician discovery with shortlist, compare, and invite actions.
- Talent Profile page: public discovery view for a musician or group when the current account profile page is too owner-centric.
- Saved Talent page: dedicated shortlist management if producers build reusable candidate pools.

### Existing pages to extend instead of replacing

- [mobile/app/home.tsx](../../mobile/app/home.tsx) and [web/app/home.tsx](../../web/app/home.tsx): keep these as the entry points for the producer network.
- [mobile/app/production_team.tsx](../../mobile/app/production_team.tsx) and [web/app/production_team.tsx](../../web/app/production_team.tsx): add links into project creation, match inbox, and talent-management flows.
- [mobile/app/profile.tsx](../../mobile/app/profile.tsx) and [web/app/profile.tsx](../../web/app/profile.tsx): surface producer-project activity and talent visibility settings where useful.

## Workstream 4. Social Feed

Add a dedicated social domain that supports a Facebook-like feed without mixing feed posts into listing or booking tables.

Recommended entities:

| Table | Purpose | Notes |
| --- | --- | --- |
| `follows` | user-to-user or user-to-entity follow graph | supports creators, producers, groups, and studios |
| `feed_posts` | top-level post records | can represent text, announcement, release, project update, merch drop, or playlist share |
| `post_media` | images, teaser clips, and cover assets attached to posts | keeps media normalized and reusable |
| `post_reactions` | likes and lightweight reactions | keep reaction type constrained and indexed |
| `post_comments` | threaded or flat comment model | start flat if threaded replies are not required on day one |
| `activity_events` | denormalized fan-out or audit events | powers feed ranking, notifications, and admin context |

Feed guidance:

- keep a dedicated Feed route for the full social experience
- also surface a compact `Feed` module on Home so social content appears immediately after launch
- reuse notification fan-out for follow, comment, and reaction events
- add report and moderation hooks from the first iteration instead of treating abuse tooling as a later add-on

### New pages to add

Required new pages for the social layer:

- Feed page: the primary news-feed experience with post ranking, follow activity, playlist shares, and merch-drop posts.
- Post Details page: open a single post with comments, reactions, shares, related media, and moderation actions.

Recommended pages when the feed feature set grows:

- Composer page: dedicated post creation flow if media upload, playlist attachment, and preview tools become too large for an inline composer.
- Following page: manage followed creators, producers, groups, studios, and stations.
- Activity page: profile-centric list of posts, reposts, comments, and playlist or product shares.

### Existing pages to extend instead of replacing

- [mobile/app/home.tsx](../../mobile/app/home.tsx) and [web/app/home.tsx](../../web/app/home.tsx): add compact feed modules and follow suggestions.
- [mobile/app/profile.tsx](../../mobile/app/profile.tsx) and [web/app/profile.tsx](../../web/app/profile.tsx): add creator activity, shared playlists, and storefront links.
- [mobile/app/notifications.tsx](../../mobile/app/notifications.tsx) and [web/app/notifications.tsx](../../web/app/notifications.tsx): include follow, reaction, comment, and repost-style events.

## Workstream 5. Teaser Playlists And Radio MVP

Add a media-promotion layer that helps musicians and bands promote original songs without taking on full streaming obligations in the MVP.

Recommended entities:

| Table | Purpose | Notes |
| --- | --- | --- |
| `playlists` | artist-curated playlists | can be public, unlisted, or promotional |
| `playlist_items` | ordered track references inside playlists | supports external links and teaser assets |
| `playlist_teaser_assets` | short preview clips and cover art | stored in Supabase Storage after safety screening |
| `external_platform_links` | Spotify and other outbound destinations | normalized link handling for full-track playback |
| `stations` | curated band or creator radio stations | station identity and metadata |
| `station_playlist_slots` | schedule or slot order for station rotations | keeps radio order relational |
| `playlist_play_events` | teaser play and outbound click metrics | supports ranking and analytics |

MVP rules for this media layer:

- teaser clips only for in-app playback
- full-track playback happens off-platform through Spotify or another external provider
- radio is a curated playlist station made from original band content, not synchronized live broadcast
- playlists and stations should be shareable into the feed and visible from Home modules

### New pages to add

Required new pages for playlists and radio:

- Playlist Details page: show the playlist track order, teaser clips, cover art, creator notes, and outbound Spotify or platform links.
- Create or Edit Playlist page: let artists assemble teaser playlists, upload preview assets, and attach external full-track destinations.
- Station Details page: show a station description, current rotation, scheduled playlist slots, and related creator or band information.

Recommended pages when media management grows:

- Artist Audio Hub page: a creator-facing dashboard for playlists, stations, teaser metrics, and outbound click performance.
- Station Management page: dedicated control surface for scheduling, slot ordering, and seasonal or campaign-based rotations.

### Existing pages to extend instead of replacing

- [mobile/app/home.tsx](../../mobile/app/home.tsx) and [web/app/home.tsx](../../web/app/home.tsx): surface trending playlists, featured stations, and newly released teasers.
- the new Feed page: make playlists and stations first-class share targets so they can circulate socially instead of living in a separate silo.

## Workstream 6. Merchandise And Digital Marketplace

Add a narrow marketplace that lets artists sell merchandise first and establish the payout and order patterns needed for future digital exclusives.

Recommended entities:

| Table | Purpose | Notes |
| --- | --- | --- |
| `products` | top-level merch or digital-drop listing | owned by an artist, group, or producer entity |
| `product_variants` | size, color, format, or edition variations | avoid overloading one product row with all stock semantics |
| `product_media` | product images and promo assets | keep storage references separate from product metadata |
| `orders` | checkout records | should stay immutable enough for audit and refund tracking |
| `order_items` | line items per order | snapshot price and title at purchase time |
| `shipping_profiles` | shipping rules for physical goods | separate physical delivery logic from product rows |
| `order_fulfillments` | shipment or release state tracking | supports both shipped merch and later digital releases |
| `user_entitlements` | future digital access records | reserve for exclusive drops, gated playlists, or premium content |

Marketplace guidance:

- start with merch and seller payouts first
- allow fans to discover products broadly, but require authentication for paid actions in the first rollout
- extend `wallet_transactions` and payment references for `product_purchase`, `product_refund`, and seller earnings
- treat exclusive songs and playlists as a follow-up entitlement phase, not part of the teaser-only launch

### New pages to add

Required new pages for marketplace rollout:

- Shop page: marketplace discovery surface for artist storefronts, featured drops, and merch categories.
- Product Details page: show the full product gallery, variants, pricing, shipping or release info, and checkout entry point.
- Orders page: buyer order history, payment state, fulfillment state, and refund visibility.
- Seller Hub page: creator-facing product management, inventory, pricing, order review, and payout summaries.

Recommended pages when commerce operations grow:

- Artist Storefront page: branded seller page that combines profile, products, playlists, and social posts.
- Drop Details page: launch-focused page for timed merch or later digital-exclusive releases.

### Existing pages to extend instead of replacing

- [mobile/app/wallet.tsx](../../mobile/app/wallet.tsx) and [web/app/wallet.tsx](../../web/app/wallet.tsx): add seller earnings, product refunds, and payout references.
- [mobile/app/profile.tsx](../../mobile/app/profile.tsx) and [web/app/profile.tsx](../../web/app/profile.tsx): add storefront entry points and owned-product links where useful.

## Workstream 7. Admin, Moderation, And Search

Extend the admin control plane so the new domains do not launch without moderation, reporting, or audit coverage.

Admin additions should include:

- producer project review and dispute context
- moderation queues for feed posts, comments, playlists, stations, and product listings
- payout exception, refund, and seller-balance audit views
- search projections for producers, projects, playlists, stations, and products

Primary surfaces to extend:

- [web/app/admin/index.tsx](../../web/app/admin/index.tsx)
- [web/app/admin/reports.tsx](../../web/app/admin/reports.tsx)
- [web/app/admin/deals.tsx](../../web/app/admin/deals.tsx)
- [web/supabase/functions/admin-reports-management/index.ts](../../web/supabase/functions/admin-reports-management/index.ts)

### New admin pages to add when queues become too broad

Required additions once moderation spans multiple new domains:

- Admin Producer Network page: review producer projects, disputes, suspicious invite activity, and matching abuse reports.
- Admin Content page: moderate feed posts, comments, playlists, teaser assets, and stations in a dedicated content queue.
- Admin Marketplace page: review products, seller disputes, refunds, payout exceptions, and storefront violations.

Optional additions if one page per domain becomes easier to operate:

- Admin Playlists page
- Admin Stations page
- Admin Products page
- Admin Sellers page

## Suggested Migration And Delivery Order

1. add producer-network schema, views, and RLS policies
2. add the `manage-producer-network` Edge Function and notification hooks
3. add the Producer Projects page, Producer Project Details page, and Match Inbox page while extending Home and search for invite and apply flows
4. add the social-feed domain, Feed page, and Post Details page
5. add teaser playlists, Playlist Details and Create Playlist pages, external links, and station scheduling
6. add marketplace tables plus Shop, Product Details, Orders, and Seller Hub pages
7. extend admin moderation, reports, search, and audit surfaces and split them into dedicated admin pages when the combined queue becomes too broad
8. run end-to-end validation for matching, feed, playlists, station discovery, merch checkout, and moderation flows

## Definition Of Done

This slice is complete only when all of the following are true:

- musicians can apply to producer projects
- producers can invite musicians directly from discovery surfaces
- Home surfaces producer matching modules for both musicians and producers
- the feed supports posting, reacting, commenting, and following
- artists can publish teaser playlists with outbound Spotify or external listening links
- band radio stations can surface curated original-song rotations
- artists can sell merchandise and see the resulting balance or payout references
- admin can moderate the new social, media, and marketplace content without direct database intervention

## Validation Checklist

1. Run `npm run supabase:start` and `npm run supabase:reset` from `mobile` after each migration batch.
2. Run `npx tsc --noEmit` and `npm run lint` in `mobile` and `web` after each client or function change.
3. Test the full producer loop from project creation through application, invite, acceptance, and notification delivery.
4. Test the Home screen for role-aware modules, realtime refresh, and parity between mobile and Expo web.
5. Test the social feed for post creation, reaction, comment, follow, report, and moderation flows.
6. Test teaser playlist upload, teaser playback, external-link routing, station scheduling, and feed sharing.
7. Test merchandise checkout, refunds, seller-balance updates, and admin report visibility.