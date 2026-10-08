# Plan for the new bug report

Date: 2026-10-07 (Asia/Manila)

Release update: **APK 1.0.4, build 5 is published** at [the website download page](https://musika-lokal.vercel.app), including the email action destinations and radio artist follow-up below. It retains the earlier Activity send/CV modal, Wallet alignment/checkout recovery, and radio fixes. The actual browser APK download, full checksum, package/version, embedded source, and preserved signing certificate passed verification. APK 1.0.3 remains available for rollback. Evidence: [current release verification](docs/testing/email-radio-fixes-2026-10-08.json), [previous release verification](docs/testing/apk-release-1.0.3-2026-10-08.json). Physical Android Gmail/radio acceptance and the previously documented remote-push work remain pending.

Source: [NEW BUGS BELOW.docx](<E:/Downloads/NEW BUGS BELOW.docx>). Reviewed the document and all 15 embedded screenshots. This plan covers the seven remaining reports.

Status: NEW-01, NEW-04, NEW-05, NEW-06, NEW-07, and NEW-08 are implemented and verified with automated session checks. Their backend changes are deployed to Supabase where applicable. The additional feed/search sheet reviews fixes are implemented and verified against live public Supabase reads. NEW-02 email routing and all remaining button templates are now implemented, tested, and deployed to the website and Supabase senders. The 2026-10-08 radio artist follow-up and additional Active Musicians email destination are published in APK 1.0.4/build 5. Physical Android Gmail/radio acceptance remains pending. Earlier pending deployment statements below are historical and are superseded by the follow-up record. The document supplies reported behavior and requested outcomes; deployment authorization came from the user's implementation request.

## Follow-up: Share managed gigs, groups, studios, and production teams (2026-10-08)

Implemented requirement 3 as a regular **Share** action, then extended it to the user's **My Group**, **My Production**, and **My Studio** screens. Admin gig, studio, and production cards in `web/app/admin/manage.tsx` place **Share** between **View** and **Edit**. Mobile cards in `mobile/app/(tabs)/my_venue.tsx`, `my_group.tsx`, `my_production.tsx`, and `my_studio.tsx` place **Share** beside **Manage/View**, ahead of their other card actions. The action rows wrap on narrow screens.

All actions share the existing public HTTPS listing destination with the listing name and the same message format as the listing-details Share action. The four mobile screens use `shareListing.ts`, the existing `buildListingShareUrl` helper, and the native sharing menu. The admin dashboard uses matching URL normalization and the browser sharing menu; browsers without that menu copy the listing link and show confirmation. Cancelling the browser menu is silent. Sharing or clipboard failures expose the listing link for manual copying. Available social destinations depend on the device and receiving app; this adds manual sharing rather than publishing through connected company social accounts.

Verification: both TypeScript checks and all **7 existing share-link/gateway tests passed**. Direct invocation of all four mobile card callbacks verified the exact listing ID, encoded URL, name, and type (`gig`, `group`, `studio`, `production_team`). The admin handler checks covered its three listing types, clipboard fallback, cancellation, and error recovery, with mobile/admin URL parity. Targeted lint has no new diagnostics: the admin page retains its **3 pre-existing errors**, and the four mobile pages retain their **11 pre-existing warnings**; both share utilities pass lint. **Source implementation only; these new buttons are not yet included in the published website or APK.** Native social-app acceptance remains pending.

## Follow-up: applicant review readability and CV access (2026-10-08)

Implemented the applicant-review screenshot requests in `mobile/src/components/ApplicantDetailsModal.tsx`: body text is now 16px, small labels are at least 14px, and shaded panels/cards are replaced by plain rows and dividers. Labels, location text, and action buttons wrap on narrow screens with enlarged text. Registered member verification no longer has the extra **View evidence** control or a duplicated verification section. Optional CV/video/song analysis remains available under **File review details**.

The main **CV** section now shows a **View CV** button for each named group member; these buttons previously appeared only in the hidden evidence panel. Solo CV access remains available without optional AI-review consent. An unavailable member-document link exposes **Refresh applicant details**. Both use the existing media-opening and detail-refresh handlers.

Verification: mobile TypeScript and targeted ESLint pass, along with **24 focused regression tests**, **24 actual-font applicant layouts**, and **16 safe-area layouts**. Checks cover group/solo CV actions, unavailable-link recovery, simultaneous video review, 320/390/430px widths, both themes, and 1.6x text. The broader privacy/worker test run has **seven unrelated failures** from references to removed web routes and obsolete backend scoring assertions. Evidence: [layout results](docs/testing/applicant-review-ui-2026-10-08/layouts.json); reproducible checks: `node --test scripts/test-applicant-review-ui.mjs scripts/test-applicant-safe-areas.mjs scripts/test-connection-member-verification.mjs scripts/test-submitted-genre-fit.mjs`. **Included in published APK 1.0.4/build 5:** the release source map's complete `ApplicantDetailsModal.tsx` exactly matches this updated source, and its compiled bundle matches the verified APK bundle. This supersedes the earlier note that a new APK was needed. Physical Android acceptance remains pending. Evidence: [release verification](docs/testing/email-radio-fixes-2026-10-08.json).

## Follow-up: Gmail email buttons and radio artist mismatch (2026-10-08)

The screenshot's **Removed from Gig** email used an old deployed `musikalokal://notifications` button. Gmail can remove the actionable link for this custom scheme. All **13 affected deployed senders** now build HTTPS links and preserve the appropriate screen, including History for fired contracts, application CV tasks, Wallet, orders, and booking/application tabs. Identity-success emails use the same HTTPS entry. Registration confirmation code, its deployed function version, and its live Auth template are unchanged.

Email-change notices now open a dedicated browser confirmation page, verify only after the user presses Confirm, and return through the Account Details app link. Both confirmation arms were tested against a temporary live Auth fixture. The new-address `generateLink` response's `hashed_token` differs from its valid action-link token on this project; the sender now extracts the action-link token. Both confirmations succeeded, reusing the token failed, the temporary Auth/profile records were removed, and no mailbox emails were sent. Password recovery retains its existing isolated callback flow.

The radio fix prevents one station from inheriting another station's prepared native/fallback player, verifies the native track before using prepared audio, rejects stale track events from other stations, and avoids restoring idle preloaded songs as active sessions. The feed immediately uses the actual current song and artist for the selected station instead of prioritizing stale schedule metadata. It also limits song artwork to the same station. These changes address the report that Neil's song shows another artist until Stop is pressed.

Verification: **48 email/link checks and 71 radio checks passed**; both application TypeScript checks and the email Deno checks passed. All 13 downloaded deployed entry points and dependencies match their prepared payloads, JWT settings are preserved, and unrelated function versions are unchanged. The public browser gateway was checked with History, CV, Active Musicians, feed, and Account Details targets. Email-change layouts were checked at 320px in both themes. The feed retains its 12 existing lint errors and four warnings; the radio context has no lint diagnostics.

The website and **APK 1.0.4/build 5** are published at [musika-lokal.vercel.app](https://musika-lokal.vercel.app). The standalone APK's compiled bundle matches the verified source, the signing certificate matches 1.0.3, and both the upload's full download and the real browser download match its checksum/size. The verified staged website was promoted and checked on the public domain. APK 1.0.3 is retained. Existing delivered messages retain their original content; newly generated emails use the corrected buttons. There were no pending queued emails with custom-scheme buttons. **Physical Android Gmail/radio acceptance remains pending**; no Android device was connected. Evidence and full email inventory: [verification report](docs/testing/email-radio-fixes-2026-10-08.json), [session notes](docs/testing/email-radio-fixes-2026-10-08.md).

## Follow-up: APK hosting on Supabase (2026-10-08)

The website also offers **Download version 1.0.2** below the main download information. **1.0.3 remains the primary download**. The older-version link was verified by downloading the complete APK in a real browser and checking its size and SHA-256; both themes and narrow-screen layouts passed on the promoted website. Evidence: [Previous-version download verification](docs/testing/apk-previous-download-2026-10-08.json).

The public website now downloads APK **1.0.3 (build 4)** from the existing Supabase Pro project's public `android-releases` bucket. APK **1.0.2 (build 3)** is also retained there for rollback. Future `npm --prefix web run apk:publish` uploads use Supabase, verify the complete public file's checksum and size, then update the website manifest. Release paths remain immutable.

The project and APK bucket upload limits are **128 MiB**. Existing app buckets retain their previous effective limits. APK downloads are public; a restrictive storage policy blocks ordinary client roles from listing, uploading, replacing, or deleting release files. Publishing credentials remain server-only.

Both transferred APKs passed complete checksum verification. The website's release URL checks, TypeScript, export, and browser regression passed. A real browser downloaded the full APK from the staged deployment; the identical deployment was promoted and the production manifest, download link, layouts, themes, and protected admin routes were verified using the already downloaded file. Supabase project storage is approximately **2.14 GB**, including **205 MB** of APKs. The current and previous Vercel Blob copies remain available for older website deployments; six earlier Blob APKs were removed. Earlier claims that every previous APK remains available are superseded by this retention record. Evidence: [Supabase APK migration](docs/testing/supabase-apk-migration-2026-10-08.json).

## Follow-up: Activity send modal, Wallet alignment, and radio display (2026-10-08)

Published in APK **1.0.3 (build 4)**. Activity's green action now says **Send** on one line and opens a scrollable modal with the signed-in member's CV/resume uploader and member progress. It is accessible before all CVs are ready, including leader-created applications. Final submission remains restricted by the server to the group leader after every required CV is submitted. The existing CV page uses the same form, and Activity refreshes after saves.

The Wallet's red square was the **Pay Now loading state**, which previously hid the label while waiting for checkout. It now keeps **Opening…** visible, aborts a stalled request after 30 seconds, shows a retry message, and prevents concurrent checkout requests. Booking details and payment actions have separate rows, and history amounts align on their own line. Payment confirmation and wallet accounting behavior remain covered by the existing regression tests.

The radio screen now credits the managed artist rather than the administrative creator, uses consistent station artwork in the mini-player, and displays the actual player's track when tuned in. **Up Next** excludes the current track and explains when a station contains a single repeating song. A paused station can resume through the Listen control, and playback failures display an error.

Verification: mobile and web TypeScript passed; 97 group-application regression checks, 66 radio checks, 38 payment/wallet checks, 16 studio eligibility checks, and the new handler tests passed. Visual checks covered **24 application-modal layouts and 16 Wallet layouts**, including narrow screens, larger text, and both themes. The release build, embedded bundle, signing certificate, website build, and actual public APK download/checksum passed. A read-only live query confirmed that the CV bucket is private; this follow-up required no backend deployment or real application/payment submission. Existing lint diagnostics in Activity/Wallet/Station effect and memoization code are recorded in the release evidence. Physical Android acceptance remains pending.

## Follow-up: progressive slowdown (2026-10-07)

Implemented the client performance fixes identified in the session inspection: refresh only the newest feed page, batch realtime refreshes, detach header/gig listeners and radio UI clocks on blur, prevent inactive Activity/Shop refreshes, bound expiring/persisted caches, stop exhausted image retries, and load/cache recent chat messages with earlier-history pagination and stale-response guards. Existing bug fixes and native background radio playback are preserved. Details and verification: [session-performance-fixes-2026-10-07.md](docs/session-performance-fixes-2026-10-07.md). No backend deployment is required. Client release and extended device performance acceptance remain pending; this performance work built no APK.

## Follow-up: heads-up notifications (2026-10-07)

Added the mobile configuration and registration fixes for temporary system banners while another app is open. The notification module now uses a Metro-visible literal require with Expo's actual types. Android channel creation is awaited before permission/token registration, failures can be retried, and native FCM's default channel matches `musika-lokal-alerts-v2`. The build configuration accepts `EXPO_PUBLIC_EAS_PROJECT_ID` and `GOOGLE_SERVICES_JSON`; Notification Settings describes the background pop-up behavior. Existing foreground toasts and notification tap navigation remain intact.

Verification: **10 notification tests passed**, mobile TypeScript passed, targeted ESLint had zero errors, Android manifest introspection passed, and an Android bundle export passed with the notification library/channel/token modules confirmed in the source map. A read-only live database inspection confirmed the correct high-priority/default-sound payload and **zero active push devices**. No backend changes or real-user pushes were made.

Release remains pending: this checkout has no Expo project ID or Firebase Android configuration file. Configure those and the matching EAS FCM V1 credential, build/install a new APK, register an authorized test device, and verify the banner over another app. Android notification permissions/channel settings and Do Not Disturb govern the actual display. Setup and device checks: [mobile-push-notifications.md](docs/mobile-push-notifications.md). Evidence: [heads-up-notifications-2026-10-07.json](docs/testing/heads-up-notifications-2026-10-07.json).

## Follow-up: APK rebuild and admin release (2026-10-08)

Rebuilt the current mobile source as **1.0.5/build 6** and replaced the primary website download. The shared website deployment also includes the current admin source. Android signing/update compatibility, embedded source checks, both TypeScript checks, 91 focused regressions, website/admin browser regressions, and staged download/checksum verification passed. The verified deployment was promoted and production browser checks passed. Existing Vercel Blob storage was used because the available Supabase publishing credentials returned HTTP 403. No additional backend deployment was required. Physical Android installation and live authenticated admin workflows remain untested. Evidence: [apk-release-1.0.5-2026-10-08.json](docs/testing/apk-release-1.0.5-2026-10-08.json).

## Scope and implementation order

The affected user flows run in `mobile/`. Keep shared backend changes aligned in `mobile/supabase/` and `web/supabase/`, and update matching retained components when applicable. The current `web/app/` contains the admin/download application; a mobile route cannot be assumed to exist as a browser page.

| Order | Report | Intended result | Priority |
| --- | --- | --- | --- |
| 1 | NEW-04: Withdraw produces an error | Authorized withdrawal succeeds; other members receive appropriate actions | P1 |
| 2 | NEW-05: History says Ready to send | Terminal application status takes precedence over CV progress | P1 |
| 3 | NEW-07: Leader cannot upload a missing CV | Leader/member views expose their own CV task and readiness | P1 |
| 4 | NEW-02: Email action buttons do not work | Every email action button except registration confirmation opens its correct destination | P1 |
| 5 | NEW-08: Pay Now opens the wrong destination | Open Wallet with the outstanding studio balance visible | P1 |
| 6 | NEW-06: AI feed images are incorrect | Preserve real attachments and display the correct uploader avatar | P1 |
| 7 | NEW-01: Registration does not return after failure | Duplicate-identity rejection returns to registration details | P2 |

Fix withdrawal and status handling first. CV controls should work from Activity before the email entry point is added.

## Completion checklist

Checked items have implementation and automated session verification completed. Native acceptance and client release are tracked separately below; these checks do not claim that the installed APK has been updated.

The report sections retain the original planning diagnosis and acceptance criteria. Completed changes and evidence are recorded in the implementation session notes.

- [x] **NEW-04:** Fix withdrawal permissions and transitions.
- [x] **NEW-05:** Show Withdrawn in History.
- [x] **NEW-07:** Make the leader's missing CV actionable.
- [x] **NEW-02:** Fix all email action buttons except registration email confirmation. Source, backend, and APK release verified; physical Gmail acceptance is tracked separately below.
- [x] **NEW-08:** Send Pay Now to Wallet with the debt visible.
- [x] **NEW-06:** Correct AI recommendation media and avatars.
- [x] **NEW-01:** Return to registration after duplicate identity rejection.

Additional work requested in this session:

- [x] **Radio Live source:** Fix background Pause/Play, rejoin the shared timeline after pauses and buffering, show station/song live metadata, and preserve native playback when removed from recent apps. Android release and device acceptance remain pending.
- [x] **Feed sheet reviews:** Correct the query and verify loading against existing public reviews.
- [x] **Search sheet reviews:** Apply the same corrected shared hook and verify loading against existing public reviews.
- [x] **NEW-02 ordinary notification email source:** Preserve allowed destinations through the HTTPS gateway, native handoff, sign-in, and identity checks; verify sent and queued email HTML with stubs. This source subtask does not mark the full NEW-02 report complete.
- [x] **NEW-02 backend release and remaining templates:** Publish the gateway before deploying dependent Supabase senders; complete identity-success and email-change callback work.
- [ ] **NEW-02 Android acceptance:** Verify the inventoried buttons in Android Gmail with cold/warm launches, login handoff, and the working registration confirmation.

## Implementation session: 2026-10-07 (Radio Live background playback)

- **Background controls:** Android and headset Pause pauses playback. Play rejoins the shared station's current song and position before resuming. Stop clears native playback and the in-app session. Seeking and skipping remain unavailable for the shared radio timeline.
- **Live recovery:** The registered playback service checks drift from native progress and playback-recovery events, including while the React screen is closed. It uses the station anchor, queue revision, and complete native track queue, handles rotated queues and song/loop boundaries, leaves paused listeners paused, and cancels delayed work after newer Pause, Stop, or station-selection commands. The Expo fallback also corrects drift and reflects lock-screen playback intent.
- **Background card:** Metadata displays the station with LIVE and the current song/artist, with station artwork as a fallback. Notification duration is unknown and seeking is disabled; real song durations remain in the playback queue for shared timing. Initial and prepared native tune-in seek before starting audio.
- **App lifecycle:** Native playback continues when the app is removed from recent apps. Closing the React screen detaches UI listeners without resetting the service. Reopening restores the current native session, preserves a pause, and hands changed station snapshots back to queue synchronization. Late restoration cannot override a newer selection, Stop, or unmount.

Verification: `npm run test:radio`: **66 checks passed**, covering executable playback-service commands, drift recovery, pause/stop races, metadata, app restoration, Expo fallback controls, and the existing mobile/web station-queue regressions. Mobile TypeScript and `git diff --check`: **passed**. Targeted ESLint: **zero errors**, with four pre-existing warnings in `radioTrackPlayer.ts` and `safeTrackPlayer.ts`. This is a client-source change; no Supabase deployment is required. No APK or bundle was built. Device acceptance remains pending for the reported Android home/lock-screen card, notification controls, track boundaries, buffering/network recovery, recents removal/reopening, and two-device synchronization. The feature remains programmed radio using uploaded songs and a shared schedule.

## Implementation session: 2026-10-07 (reviews and ordinary email links)

- **Feed and search reviews:** Both entry points use `ListingDetailsSheet` and `useListingReviews`. The hook's author join selected `profiles.updated_at`, which does not exist in the live schema; its request failed with HTTP **400**, PostgreSQL **42703**. Both mobile and retained web hooks now select `created_at`, matching the deployed profile schema and existing backend detail query. Loading/error/retry behavior, last-response handling, and review ownership policies remain in place. Production-team reviews also benefit from the shared hook correction.
- **NEW-02, ordinary notification emails (source subtask):** `coreActionEmail` now resolves notification routing metadata into an HTTPS `/action` gateway URL. Explicit CV task, feature-consent, organizer application, Activity tab, production-team Applications, Wallet, order, and content destinations retain their allowed parameters. CV request/readiness events can infer their application destination. Unknown or invalid server-generated targets fall back to Notifications. Incoming ordinary action links validate trusted hosts, allowed routes, UUID record IDs, and enum values; credentials, duplicate parameters, and unsupported destinations are rejected. The gateway preserves its action destination in the native Open in app button and retains the install/download fallback. The existing saved destination and authentication entry support ordinary actions without consuming the destination before login/identity readiness. Recovery callbacks keep their dedicated precedence. Expo's Android intent filter includes `/action` for the next native release. Registration confirmation senders were not edited.

Verification:

- **65 checks passed** across listing review behavior, sent/queued email HTML, URL validation, native cold/warm handoff, login/identity handoff, existing shares and association config, browser gateway clicks/download fallback, password recovery, and notification authorization/retry tests. The new entry point is `npm run test:reviews-email-links`.
- Both application TypeScript checks and `git diff --check`: **passed**.
- `node scripts/check-live-listing-reviews.mjs` executed both production hooks with the public Supabase client against existing Studio, Group, and Artist review targets: **six successful reads**, returning **4, 1, and 2 reviews** respectively in each source copy, with author joins intact. It also reproduced the old query's exact HTTP 400/42703 failure. No remote records were changed. Evidence: [new-listing-reviews-2026-10-07.json](docs/testing/new-listing-reviews-2026-10-07.json).
- Browser gateway/recovery tests use local files served through test interception, including 320px/1280px widths, enlarged text, and both themes; they do not claim that the edited gateway is published or that Android Gmail was exercised.

Release and remaining work:

- The reviews fix is entirely client query source; **no Supabase migration or function deployment is required**.
- The checkout has no linked Vercel project or Vercel deployment credential. The available Vercel connector returned **"This app connection requires reauthentication. Reconnect the app and try again."** on read-only project inspection. Gateway publication could not be performed in this session. Dependent Supabase email senders were intentionally not deployed before their gateway exists; the existing root Supabase credentials cannot authenticate Vercel.
- **NEW-02 remains unchecked overall.** Publish/test `/action`, then release dependent Supabase senders with their existing JWT settings; finish the separate identity-success/email-change link paths listed below and authenticated wrong-user/withdrawn/expired and device Gmail acceptance. Client changes, including the new intent path, require a later client/native release. No bundle or APK was built.

### Email action inventory for the remaining NEW-02 work

| Template / button | Current generation and destination | Session result / remaining work |
| --- | --- | --- |
| Core notifications: Open MusikaLokal | Formerly shared `CORE_ACTION_EMAIL_APP_URL` or `musikalokal://notifications`; intended route and params come from notification metadata | Source now builds HTTPS `/action?destination=...`, preserving CV task IDs, application/feature-consent destinations, Activity tabs, team Applications, Wallet, orders, and content. Covers the shared helper used by booking, gig application, group, production, marketplace, listing, payment, admin listing/report, and permit senders. Auth/record access remains in destination handlers. Gateway/sender deployment and device acceptance pending. |
| Password reset: Reset Password and text fallback | `account-email`: HTTPS `/recovery#token_hash=...&type=recovery`, with dedicated Auth validation and browser/app choice | Existing implementation retained; 27 recovery checks passed across native/session/parser and browser tests. Actual mailbox and device/provider roundtrip pending. |
| Email change: Approve Email Change / Confirm New Email and text fallbacks | `account-email`: Supabase-generated HTTPS action links; current redirect defaults to `musikalokal://account_details` or the client's supplied callback | Separate email-change verification callback and HTTPS fallback still pending; not treated as an ordinary credential-free action link. |
| Identity success: Open MusikaLokal App | `didit-webhook`: `musikalokal://login?verified=true` | HTTPS browser/app handoff still pending; existing server identity validation must remain authoritative. |
| Registration/admin signup confirmation: Confirm Email / Confirm Email and Continue | Existing Auth confirmation link and `login-redirect` gateway | Excluded by the user. Generation and confirmation behavior remain unchanged. |
| Manual review, fingerprint retry, ownership-declined notices | Informational email bodies without action buttons | Inventoried; no button to repair. |

## Implementation session: 2026-10-07

- **NEW-04:** Current leaders can withdraw pending group applications, and original applicants/submitters retain their withdrawal access. CV participation no longer overrides Activity permissions. CV-only members get their upload/view destination. Leader review cards also expose Withdraw. Both cancellation entry points use the `manage-bookings` authorization, conditional update, penalty, capacity refresh, and notification path. Authorized duplicate/concurrent withdrawals return successfully without repeating writes or notifications; competing acceptance and completed records stay protected.
- **NEW-05:** Persisted application status takes precedence over CV readiness. Applicant withdrawal is recorded with `application_withdrawn`, allowing cancelled withdrawals to display Withdrawn while organizer cancellation, expiry, rejection, completion, and Happening Now retain their labels. CV tasks use a user-specific cancellable query, refresh on focus/realtime changes and decisions, and are cleared/refetched after withdrawal. The CV screen rejects late responses and hides upload/send controls after collection ends.
- **NEW-07:** The leader's View action opens the existing private CV task screen during collection. Cards show missing counts and disable Send until readiness is confirmed. The CV screen shows the leader's own submission and roster progress. A server-only database RPC locks the application, writes only the authenticated actor's roster CV, and recomputes readiness in one transaction. Withdrawal/finalization block later CV writes. Finalization and leader decisions also condition updates on the pending state.

Verification:

- `npm run test:group-application-actions`: **94 passed**, including executable Edge handlers, Activity navigation/disabled-action expressions, delayed response handling, PGlite submission/role guards, private CV ownership, organizer visibility, and existing authorization, timeline, upload, confirmation, and notification regressions.
- `npm --prefix mobile run typecheck`: **passed**.
- `npm --prefix web run typecheck`: **passed**.
- `git diff --check`: **passed**.
- The older `test-gig-application-privacy.mjs` suite was also attempted. It has six failures involving removed web screens and scoring-source assertions; those checks were not treated as passing or expanded into this session's fixes.

Deployment:

- Applied and recorded `20261007190000_serialize_group_member_cv_submissions` before deploying its dependent handler. Verified the deployed RPC body and server-only grants.
- `manage-bookings`: **109 → 110**, ACTIVE; `gig-applications`: **122 → 123**, ACTIVE. Both retain `verify_jwt = false` and their internal authenticated-user checks.
- Downloaded deployed sources and verified both entry points and changed shared helpers against local files. Preserved the newer live `notificationRoutes.ts` behavior in both source copies; this does not complete NEW-02's email-button work.
- Four live unauthenticated smoke checks returned **401**. No real user applications, CVs, email deliveries, or payments were used as live test fixtures.
- Evidence: [new-group-application-fixes-2026-10-07.json](docs/testing/new-group-application-fixes-2026-10-07.json). Previous function sources were saved in the temporary rollback directory recorded there.
- The inherited shell management token differed from the root `.env` token. Deployment explicitly loaded the root-file credential without printing it.

Still pending: a new client release; Android withdrawal/History/leader-CV checks on the reported device, including narrow width, larger text, both themes, cold/warm launches, and an authenticated live participant roundtrip. Backend deployment does not ship the client UI changes.

## Implementation session: 2026-10-07 (feed, Wallet, signup)

- **NEW-01:** Duplicate-identity rejection now stops and invalidates the completed Didit attempt, clears saved session credentials and return parameters, dismisses the completed verification view, and shows the error over registration details. OK leaves the entered email, password, role, document selection, and proof available. The reason remains next to the role selector, alongside the existing sign-in path. Replayed completion cannot create an account; a fresh valid attempt can succeed. Ordinary network errors retain verification for explicit retry. The backend identity-per-role rule and registration confirmation generation are unchanged.
- **NEW-06:** Artist/profile recommendations retain the actual profile photo, including when that photo also appears in the header. Missing profile photos produce no body image; stale stock fields cannot replace them. Existing Post attachment-only normalization stays in place and preserves photo/video order. Both `home-feed` source copies now fetch only uploader ID, name, and avatar for group, studio/venue, gig, and production candidates. Ranked recommendations and local/following fallbacks use the uploader header fields. The persisted public query cache version was advanced so old snapshots are not reused after the client release.
- **NEW-08:** Both studio Pay Now entry points dismiss the listing sheet and open `/wallet` with `section=outstanding`, a refresh key, and a booking ID when exactly one booking blocks reservation. Wallet refreshes on entry/focus, scrolls to Outstanding Balance after loading, highlights the specified booking, and keeps studio debt separate from available wallet funds. Its server summary reads the same internal debt RPC as reservation eligibility, covering initial unpaid and legacy partial balances rather than relying on a positive stored `remaining_balance`. Cancelled and settled bookings disappear on refresh. Explicit checkout uses full payment for initially unpaid bookings and balance payment after a confirmed downpayment. Checkout and settlement derive legacy partial debt without rewriting historical booking or wallet balances. Pending/failed balance checkouts retain only the confirmed downpayment's remainder; initial unconfirmed checkout amounts still do not count as payment. Navigation itself creates no checkout or charge.

Verification:

- `npm run test:new-feed-wallet-signup`: **96 passed**. Executes production signup completion/reset, feed normalization and backend candidates, Pay Now navigation, Wallet checkout stage and focus/scroll behavior, real payment/Wallet handlers against PGlite, and existing Didit, attachment, ownership, payment amount, webhook, replay, rollback, and reservation guard regressions.
- `npm --prefix mobile run typecheck`, `npm --prefix web run typecheck`, and `git diff --check`: **passed**.
- The older `test-feed-featured-suggestions.mjs` suite was attempted: two checks passed and three failed because it reads removed `web/app/feed.tsx` and `web/app/add_gig.tsx` screens. Those failures are recorded separately and were not treated as passing.

Deployment:

- Applied and recorded `20261007200000_wallet_outstanding_payment_destination` and `20261007200100_effective_studio_balance_checkout` before deploying their dependent functions. Verified the Wallet action payloads, reservation serialization, effective settlement allocation, and server-only RPC grants.
- `home-feed`: **111 -> 112**, ACTIVE, `verify_jwt=false`; `withdrawals`: **93 -> 94**, ACTIVE, `verify_jwt=true`; `paymongo`: **125 -> 126**, ACTIVE, `verify_jwt=false`. Existing authenticated-user checks and provider confirmation/replay protections remain in place.
- Downloaded deployed sources and verified the three entry points and their relevant shared helpers against local source. Retained the newer local notification routing already deployed with the previous group fixes; this does not complete NEW-02.
- Four unauthenticated Wallet/payment smoke checks returned **401**. A read-only guest `home-feed:mobile_home` request returned **200**, with 30 recommendations and all 21 returned listing candidates carrying an uploader avatar and the correct uploader identity. It invoked no external AI provider.
- Evidence: [new-feed-wallet-signup-fixes-2026-10-07.json](docs/testing/new-feed-wallet-signup-fixes-2026-10-07.json). Previous Edge sources and database function definitions are saved in the temporary rollback directory recorded there. The root `.env` management credential was loaded without printing secrets.

Still pending: **NEW-02**, a new client release, and Android/native acceptance for signup rejection, feed media/avatars, Wallet navigation at narrow width/larger text in both themes, cold/warm launches, and authenticated Didit/PayMongo test-mode roundtrips. The exact screenshot feed record was not identified in this session. No real signup, payment, cancellation, or mailbox delivery was used as a live test fixture. No client bundle or APK was built.

## Preparation and environment

- Record installed APK version/build and compare it with the code/backend under test. The existing release report records version `1.0.1`, build `2`; confirm the actual device version rather than assuming the screenshots used it.
- Use isolated fixtures: a leader, two ordinary group members, an unrelated musician, and a gig organizer; include both duo and band applications. Add unpaid, partially paid, settled, and cancelled studio bookings.
- Reproduce with the same identity signed in across cold/warm launches. Record application ID, authenticated actor ID, current leader ID, applicant/submitter IDs, raw status, CV status, and returned permissions. Keep credentials and CV contents out of diagnostic output.
- Preserve the existing working-tree deletion of `BUG_FIX_CHECKLIST.md` and changes to the two Supabase CLI cache files. This plan is a separate file.

The root `.env` already contains configured Supabase client settings, `SUPABASE_ACCESS_TOKEN`, and `SUPABASE_PROJECT_REF`. Both Expo `app.config.js` files load that root file, so no copied application `.env` is needed for the current setup.

| Setting | Use during implementation |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Existing application connection settings |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` | Existing project inspection and later backend release |
| `E2E_ENV_FILE` | Existing supported override to point Expo at isolated test configuration |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in ignored `.env.local-test` | Local fixture seeding, if integration tests need it; the example service key is a placeholder |
| `CORE_ACTION_EMAIL_APP_URL` in Supabase secrets | Existing server setting; configure an HTTPS gateway base and compose the task route in code |
| Existing Gmail sender secrets | Verify delivery configuration only if delivery itself fails; the report already shows a delivered message |

Inspect configuration by key/presence without printing values. Keep management tokens, service-role keys, and Gmail secrets server-side. No additional AI provider configuration is required to fix image normalization or routing.

Useful existing entry points:

```powershell
npm --prefix mobile run typecheck
npm --prefix web run typecheck
npm --prefix mobile start
npm --prefix web run dev
```

Restart Expo after changing environment settings. The root package still references `e2e/playwright.config.ts`, but `e2e/` is absent in this checkout. Some older tests also reference removed web routes. Repair only the verification entry points needed for these fixes; do not treat an unavailable suite as passing.

## NEW-04: Fix withdrawal permissions and transitions

**Confirmed in code:** The Activity card treats the presence of any member CV task as authority to act, overriding `viewer_can_act` and `viewer_access`. `manage-bookings` authorizes gig withdrawal using applicant/submitter identity but has no equivalent group-leader branch. Its error matches the screenshot. The exact reported row/actor combination still needs runtime reproduction.

**Files:** `mobile/app/(tabs)/bookings.tsx`, both `supabase/functions/manage-bookings/index.ts` copies, and the cancellation/status handlers in both `gig-applications/index.ts` copies.

**Fix:**

1. Return capabilities based on authenticated identity, group leadership, and raw persisted state. CV participation permits a member to manage their own CV; it does not by itself permit withdrawing the whole group.
2. Support the current leader's authorized pending withdrawal. Preserve an original submitter's ability to withdraw their own member-created pending application. Ordinary members must not cancel an application created by someone else.
3. Remove client-side permission overrides. Align Activity, detail screens, and both cancellation endpoints with the same transition rules; retain accepted-gig resignation/completion-penalty behavior.
4. Use conditional updates against the expected previous state. Handle duplicate taps and a concurrent already-completed withdrawal without misleading errors or duplicate notifications.
5. Refresh bookings and CV tasks together after a successful change.

**Acceptance:** Authorized pending withdrawal succeeds and moves the record to History. A CV-only member sees upload/view actions instead of an unusable Withdraw button. The leader can withdraw a member-created pending application. Unrelated musicians remain forbidden. Concurrent taps cannot reopen or modify a terminal application.

## NEW-05: Show Withdrawn in History

**Confirmed in code:** Activity chooses the task's CV label before `item.status`. Withdrawal refreshes bookings but does not explicitly refresh `groupApplicationTasksByApplicationId`, allowing a stale task to override a withdrawn application's status.

**Files:** `mobile/app/(tabs)/bookings.tsx`, both `GroupApplicationCvTaskList.tsx` copies, and `mobile/app/group_application_cv.tsx`.

**Fix:**

1. Derive the primary badge from current raw application status. Map an applicant's cancelled/resigned withdrawal to the existing Withdrawn display convention; retain other distinct terminal outcomes.
2. Use Your CV required / Waiting for members / Ready to send only for active pending CV collection.
3. Evict/refetch tasks after withdrawal, finalization, and leader decisions. Revalidate on focus and relevant realtime updates, and ignore late responses from previous applications/users.
4. A withdrawn CV screen must show the terminal status and hide upload/finalization controls even if its previous CV status was ready.

**Acceptance:** The screenshot scenario displays Withdrawn immediately, after reopening Activity, and after app restart. Delayed task responses cannot restore Ready to send. Rejected and completed records retain their correct labels.

## NEW-07: Make the leader's missing CV actionable

**Confirmed in code:** `group_application_cv.tsx` already supports uploading the signed-in participant's CV. However, the leader-review card's View button opens `BookingDetailsSheet` directly, bypassing the CV task destination. Approve remains available even when not all CVs are submitted.

**Files:** `mobile/app/(tabs)/bookings.tsx`, `mobile/app/group_application_cv.tsx`, `mobile/src/components/BookingDetailsSheet.tsx`, and both CV status/finalization backend handlers.

**Fix:**

1. Route the leader's View action to the CV task screen when collection is incomplete, or expose an obvious Upload Your CV action in the review sheet that opens that screen.
2. Show the leader's own submission state and roster progress. Reuse the existing uploader and private `application-cvs` storage flow.
3. Disable Approve/Send until every required member has submitted. Explain the missing CVs next to the disabled action. Keep the server validation in place.
4. Once ready, offer the leader's existing Send Complete Application action and retain the leader review flow for member-created applications.

**Acceptance:** From the exact leader-review state shown in the document, the leader can find and upload their own CV. The missing count decreases, readiness updates, and the leader can send the application. Members can submit only their own CV. CV files remain private and incomplete applications remain hidden from the gig organizer.

## NEW-02: Fix email action buttons

**Scope clarified by the user:** The member-CV email is one example of the problem. All email action buttons are in scope except the registration email confirmation button, which already works. This item fixes the buttons and their destinations; the missing CV controls remain covered separately by NEW-07.

**Confirmed in code:** The CV notification already records `/group_application_cv` and `applicationId`. `_shared/coreActionEmail.ts` discards the notification route and defaults to `musikalokal://notifications`, affecting every message built with that template. The existing share resolver/gateway does not support the CV task route. Other email templates and button builders need inspection to identify their specific failures.

**Files:** both `_shared/coreActionEmail.ts` and `_shared/notificationRoutes.ts` copies; other email senders/templates identified during the inventory, including non-registration actions in `account-email`; mobile link parsing, `app/+native-intent.tsx`, `app/_layout.tsx`, authentication handoff, and the static gateway under `web/public/` / its preparation script. Preserve the working registration confirmation flow.

**Fix:**

1. Inventory every email template and action button except registration confirmation. Record each button's generated URL, expected screen/action, required parameters, and signed-in/signed-out behavior. Include CV requests, booking and application updates, notifications, password recovery, and any other action emails that exist in the project.
2. For ordinary action emails, build an HTTPS URL using the intended allowed application route and encoded parameters from notification metadata. Use `CORE_ACTION_EMAIL_APP_URL` as the shared gateway base where applicable. Resolve each button to its intended destination rather than sending every message to Notifications.
3. Extend the browser gateway to cover the required action routes, including the member-CV task. Offer Open in app and the existing install/download fallback, retaining the destination and relevant record IDs. Do not assume the admin web app implements the corresponding mobile screens.
4. Allowlist each supported route and validate its parameters in incoming-link handling. Persist ordinary action destinations across login/required verification and cold/warm launches. Authentication actions such as password recovery must retain their dedicated validated callback/session flow and recovery precedence.
5. Check native intent filters and the published Android association for every required action path. Include any required change in the next client release.
6. Authenticate the user at protected destinations and recheck record access server-side. Ordinary notification links should contain record identifiers rather than credentials or signed CV download URLs. Invalid, expired, withdrawn, or inaccessible targets must show an appropriate state.
7. Leave registration confirmation URL generation and confirmation behavior unchanged, and include it as a regression check.

**Acceptance:** Every inventoried non-registration email button works from Android Gmail and opens the destination appropriate to that email, directly or through the gateway. The CV email reaches that application's CV task. Logged-out users retain their ordinary action destination after signing in; recovery buttons reach the valid reset flow. With no app installed, the relevant browser/install fallback works. Wrong-user, invalid-ID, expired, and withdrawn links show an appropriate state. Registration email confirmation still works. Use email stubs locally; actual mailbox delivery and device clicks are separate acceptance checks.

## NEW-08: Send Pay Now to Wallet with the debt visible

**Confirmed in code:** The studio banner and outstanding-payment error actions push `/bookings?tab=Pending`. The eligibility RPC/error payload also returns that destination. Wallet already contains outstanding balances, but `withdrawals` fetches unpaid bookings using `remaining_balance > 0`, while reservation eligibility also blocks unpaid bookings whose effective debt comes from `final_price - payment_amount`. Changing navigation alone may leave the relevant debt invisible.

**Files:** both `src/components/listingDetails/StudioBookTab.tsx` copies; `mobile/app/wallet.tsx`; both `supabase/functions/withdrawals/index.ts` copies; an additive migration updating the eligibility RPC/error destination currently defined in `20261007153000_enforce_studio_payment_eligibility.sql`.

**Fix:**

1. Change the banner, error action, and backend `pay_now` payload to Wallet. Dismiss the listing sheet before navigating.
2. Refresh the wallet summary on entry and focus the Outstanding Balance section. Pass a booking identifier when a specific blocking booking is available; show all affected bookings when several block reservation.
3. Align wallet debt visibility/calculation with the eligibility rules, including initial unpaid bookings and partial payments. Show studio debt separately from the user's available wallet balance. This is a read/display change, not a historical balance rewrite.
4. Keep the existing explicit checkout action and return handling. Refresh wallet and reservation eligibility after payment or cancellation; update the wallet text that currently points back to Activity.

**Acceptance:** Both Pay Now entry points open Wallet with the actual blocking debt visible. Full unpaid and partially paid bookings agree with the reservation gate. Cancelled/settled bookings disappear. Navigation creates no checkout or charge. Returning from provider test-mode payment refreshes the debt and eligibility.

## NEW-06: Correct AI recommendation media and avatars

**Confirmed in code:** Real text-only Post normalization already rejects stock/old image fields, and its focused tests pass. However, AI Artist normalization passes the profile photo as both preferred and blocked media into `getDistinctFeedCardImages`, which replaces it with a stock fallback. Backend listing candidates also lack consistent owner/organizer avatar fields. The screenshot's Solo Artist badge means the exact record may be a profile recommendation rather than a Post; capture its ID/type to distinguish those paths.

**Files:** `mobile/app/(tabs)/feed.tsx`, both `src/utils/postMedia.ts` copies, both `supabase/functions/home-feed/index.ts` copies, and relevant feed normalization/cache helpers.

**Fix:**

1. Reproduce against the current client/backend and inspect the card type and actual `post_media` records. Verify the existing text-only fix on the reported post before changing that path again.
2. Keep Post galleries sourced exclusively from that post's attachments, including AI-suggested Posts. Do not invent media from avatars or stock photos.
3. Correct Artist/profile recommendation handling so blocking a duplicate avatar does not generate an unrelated stock person. Use supplied profile media where intended, or omit the body image when none exists.
4. Include the actual uploader's name/avatar for group, studio, gig, and production recommendations, using the existing owner/organizer IDs and allowed profile data. Use a neutral header fallback only when that user has no usable avatar.
5. Apply the rules to server-ranked and local fallback recommendations and invalidate/version relevant persisted caches.

**Acceptance:** Text-only original and AI-suggested Posts have no body image. Attached photos/videos retain order. Artist cards do not show unrelated stock portraits. Listing headers show their uploader's real avatar, and profile-photo changes appear after refresh. Cold starts and cached results follow the same rules.

## NEW-01: Return to registration after duplicate identity rejection

**Confirmed in code:** `finishAccountCreation` recognizes duplicate-identity errors but only logs them, then shows Creation Failed. It does not reset the verification screen to registration details. The screenshot shows the duplicate-musician rejection while the successful Didit WebView remains visible.

**Files:** `mobile/app/signup.tsx`, existing Didit attempt/session helpers, and duplicate-identity response handling if error classification needs adjustment.

**Fix:**

1. Handle duplicate-identity rejection explicitly. Stop the attempt monitor, invalidate its stale completion callbacks, clear the completed signup verification session/return parameters, and dismiss the completed WebView.
2. After acknowledging the error, return to the registration details step with entered details preserved. Surface the reason there and retain the existing sign-in path for an existing account.
3. Preserve the backend rule allowing at most one verified identity per role. A fresh retry must use a fresh verification attempt rather than repeatedly trying to create the rejected account.

**Acceptance:** Reproduce Didit approval followed by duplicate-musician rejection. OK returns to registration. Polling/callback replay cannot create another account or reopen the completed verification view. A later valid attempt succeeds; ordinary network errors still allow the appropriate retry.

## Verification and release sequence

Baseline performed during planning:

- Mobile TypeScript: passed.
- Web TypeScript: passed.
- 46 checks passed across `test-group-application-member-cvs.mjs`, `test-post-attachments.mjs`, `test-studio-payment-eligibility.mjs`, `test-didit-attempts.mjs`, and `test-share-links.mjs`.
- These checks confirm existing behavior, not the seven planned fixes. Native Gmail, Didit, and payment roundtrips have not been reproduced in this planning pass.

For implementation:

1. Extend behavioral checks around the actual handlers/components and database policies: withdrawal and CV permissions, concurrent withdrawal, terminal badge precedence, CV task navigation, every non-registration email button's target construction and handoff, AI normalization, wallet debt parity, and duplicate-identity reset. Include the working registration confirmation as a regression check. Existing regex/source checks alone are insufficient.
2. Update expectations that currently encode the old `/bookings` payment destination. Keep private CV access, application visibility, accepted-gig penalties, and solo application regressions covered.
3. Run both TypeScript checks and the affected tests after each related change. Test screens at narrow width, larger text, and both themes.
4. On Android, verify each inventoried email button in Gmail with cold/warm launches and the appropriate login/recovery handoff, plus registration confirmation regression, the leader CV screen, withdrawal/history refresh, and the Didit rejection return. Verify checkout in provider test mode with isolated bookings.
5. Prepare additive migrations and aligned function sources, then deploy migrations before dependent functions/gateway/client changes when implementation/release is requested. Preserve existing function JWT settings and use the existing project settings.
6. Build a newly versioned APK for the client fixes, verify its manifest/signing certificate and gateway associations, and retain the previous release for rollback. Backend deployment alone does not ship these UI fixes.
7. Record evidence per report and keep unavailable native/provider acceptance checks pending. Mark an item fixed only after its reported scenario and relevant permissions/retry checks pass.
