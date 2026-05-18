# Mobile-to-Web Product Parity Matrix

This matrix treats `mobile/**` as read-only source of truth and excludes all web admin work.

Hard exclusions:
- Do not edit `mobile/**` or `mobile/supabase/**`.
- Do not edit `web/app/admin/**`.
- Do not edit `web/supabase/functions/admin-users-management/**`, `web/supabase/functions/admin-reports-management/**`, or `web/supabase/functions/permit-management/**`.
- Do not use admin-only behavior as a parity target.

Status legend: `Matched`, `Web Missing`, `Web Outdated`, `Web Different By Design`, `Out of Scope`.

| Priority | Feature | Mobile Source | Web Target | Backend Contract | States / Outputs To Match | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | Auth, role gates, identity gate | `mobile/app/_layout.tsx`, `mobile/src/context/AuthContext.tsx` | `web/app/_layout.tsx`, `web/src/context/AuthContext.tsx` | Supabase Auth, `profiles`, identity functions | signed out, guest, verified, identity required, recovery deep links | Web Outdated | Web has a lighter provider stack; keep desktop shell but match redirect and gate outputs. |
| P0 | Account/profile updates | `mobile/app/account_details.tsx`, `mobile/app/profile.tsx`, `mobile/app/edit_profile.tsx` | matching web files | `manage-profile`, `manage-details`, profile tables/storage | loading, validation, save success, upload failures, follow state | Web Outdated | `profile.tsx` is one of the largest route drifts. |
| P0 | Unified activity and bookings | `mobile/app/bookings.tsx` | `web/app/bookings.tsx` | `manage-bookings`, `gig-applications`, booking RPCs | pending, unpaid, partial, confirmed, checked-in, completed, review, history, relocation | Web Outdated | Web is close but differs in partial-payment and cancelled/history branches. |
| P0 | Studio booking form | `mobile/src/components/listingDetails/StudioBookTab.tsx` | matching web component | `manage-bookings:create`, direct function fallback | conflict, unavailable, unpaid existing booking, multi-slot recording, partial success | Web Outdated | High-risk flow; use targeted parity tests. |
| P0 | Payments and wallet | `mobile/app/payment-result.tsx`, `mobile/app/wallet.tsx` | matching web files | `paymongo`, `withdrawals`, wallet tables | success, failed, cancelled, pending, partial payment, deposit/withdrawal | Web Outdated | Verify redirect params and balance due labels. |
| P1 | Listing CRUD | `mobile/app/add_gig.tsx`, `add_group.tsx`, `add_studio.tsx`, edit/manage screens | matching web files | `listings-crud`, `manage-listings`, direct tables/storage | validation, upload, permit lock, delete/update failures | Web Outdated | Web files exist but drift by size and behavior. |
| P1 | Production user flows | `mobile/app/my_production.tsx`, `add_production.tsx`, `edit_production.tsx`, `production_team.tsx` | `web/app/my_production.tsx`, `web/app/production_team.tsx`, new product routes | `manage-production` | team create, invite, response, delete, producer role state | Web Missing | Web lacks add/edit production routes. |
| P1 | Social feed | `mobile/app/feed.tsx` | `web/app/feed.tsx` | `manage-social-feed`, feed media storage | for-you/following, create post, reactions, empty/error states | Web Missing | Web had post details but no feed route. |
| P1 | Marketplace browse | `mobile/app/marketplace.tsx` | `web/app/marketplace.tsx`, `web/app/shop.tsx` | `manage-marketplace` | browse, search, order, seller hub state | Web Missing | Web shop exists; add `/marketplace` compatibility route. |
| P1 | Playlists and stations | `mobile/app/create_playlist.tsx`, `playlist_details.tsx`, `create_station.tsx`, `station_details.tsx` | matching web files and new `create_station` | `manage-playlists` | create/update, details, delete, station status/schedule | Web Missing | Web lacked create station route. |
| P1 | Notifications and toasts | `mobile/src/context/TopToastContext.tsx`, `mobile/app/notifications.tsx` | `web/src/context/TopToastContext.tsx`, web notifications | `manage-notifications`, realtime notifications | success/info toast, warning/error modal, unread count | Web Outdated | Web toast was a console-only stub. |
| P2 | Chat and realtime | `mobile/app/chat.tsx`, `mobile/src/hooks/useChat.ts` | matching web files | conversation/message tables, realtime channels | send, upload, presence, unread refresh, failures | Web Outdated | Web hook differs; verify realtime channel behavior. |
| P2 | Mobile-only hardware runtime | push notifications, background radio playback, haptics | web-native equivalents only | Expo push, track-player, notification tables | no forced mobile UI clone | Web Different By Design | Web should not copy background audio or push runtime directly. |
| Out of Scope | Web admin | none | `web/app/admin/**` | admin functions | unchanged | Out of Scope | Listed only to protect exclusion. |

## Current File Drift Snapshot

Known route gaps from read-only comparison:
- Web-only product route: `discover.tsx`.
- Mobile-only product routes: `feed.tsx`, `marketplace.tsx`, `create_station.tsx`, `add_production.tsx`, `edit_production.tsx`.

Known migration drift:
- `20260427150000_move_completion_rate_to_musician_performance.sql`: product stats view drift.
- `20260427161000_add_resigned_gig_application_status.sql`: product booking/application status drift.
- `20260428222000_drop_inactive_unused_tables.sql`: includes an admin-audit table and must not be copied blindly while admin is excluded.

## Sync Loop

1. Read mobile changes.
2. Update this matrix.
3. Run `npm run parity:audit` from `web`.
4. Patch only non-admin web product files.
5. Run `npm run test:shared`.
6. Run `npm run typecheck`.
7. Run web E2E/smoke checks for affected routes.
8. Record intentional differences in this file.
