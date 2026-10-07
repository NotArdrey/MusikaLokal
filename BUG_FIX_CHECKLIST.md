# MusikaLokal Bug Fix Checklist

**Status:** All 23 fixes are implemented and checked against the available local, browser, and server acceptance checks. Supabase changes and the published sharing/recovery pages are deployed and verified. No new client bundle or APK was built, as requested. The implementation checkboxes below do not certify a native release: physical Android, actual provider camera/upload/payment roundtrips, and a later client release remain pending in the separate release checks below.

**Source:** [Musika Lukal Bugs .pdf](<E:/Downloads/Musika Lukal Bugs .pdf>)

This checklist covers the bugs and requested improvements in the 20-page report. The report is evidence of the reported behavior; the confirmed choices below define the intended fixes.

Check an implementation item after its fix and available acceptance checks pass. Record unavailable device/provider acceptance separately; do not describe it as tested.

## Preparation

Record reproduction steps, affected roles, APK/backend versions, and evidence for each item. Prepare isolated test accounts and data. Repair test entrypoints needed for the affected flows.

During planning, both applications passed TypeScript checks and 19 focused existing tests passed. Those checks do not reproduce every reported failure; each item below needs its own acceptance checks.

## Part 1 - Layout and Action Fixes

**Difficulty: Easy**

- [x] **BUG-04 - Application-card layout** - Page 4  
  Wrap long gig names and keep status badges inside their cards. Verify narrow screens and larger fonts.
  **Verified locally (2026-10-07):** Title wrapping, header spacing, and contained status badges pass the production card fixtures at 320px/1280px with standard/160% text. The fixtures were rerun successfully in this continuation. Physical Android rendering remains a release check.

- [x] **BUG-06 - Composer profile avatar** - Page 6  
  Display the signed-in user's profile photo, with a fallback when missing. Verify profile-photo changes update the composer.
  **Verified locally (2026-10-07):** Both composer entry points use the signed-in profile photo. Controlled component checks pass for photo changes, realtime updates, focus/app-resume refresh, missing-photo fallback, stale responses after changing users, and sign-out cleanup.

- [x] **BUG-09 - Radio-button appearance** - Page 8  
  Standardize mute/unmute button dimensions, spacing, icons, and readable labels in both themes.
  **Verified locally (2026-10-07):** Profile station controls use matching flexible widths, 44px minimum heights, short Mute/Unmute labels, and action icons. The production control fixtures pass in both themes at narrow/desktop widths with standard/160% text. Physical Android rendering remains a release check.

- [x] **BUG-11 - Add Contract opens the wrong flow** - Page 10  
  Show the action only to authorized gig editors. Musicians can view existing contracts. After editing, return to the same gig.
  **Verified locally (2026-10-07):** The action uses the existing owner/staff editing permission. Production JSX and navigation-callback checks confirm viewer access to existing contracts, no add action for viewers, and editor navigation to and from the same gig's About tab.

- [x] **BUG-15 - Featured-performer expansion** - Page 13  
  Display two performers initially. Add working "Show more" and "Show less" controls for additional performers.
  **Verified locally (2026-10-07):** Mobile/web feed cards and gig details show two performers initially and expand/collapse correctly. Checks cover zero/two/five performers, changing the gig/list, accessible expanded state, and preventing expansion presses from opening the parent card.

- [x] **BUG-17 - Group-applicant header overlaps the status bar** - Page 15  
  Apply safe-area insets to the header and bottom actions. Verify notched Android devices.
  **Verified locally (2026-10-07):** The modal now has its own safe-area provider and applies all four edges to its header, scrolling body, and actions. The actual component passes eight browser fixtures with controlled 48px notch/34px gesture insets, 320px/430px widths, both themes, and standard/160% text. TypeScript passes. Physical notched Android rendering remains a release check.

- [x] **BUG-18 - Gig-applicant header overlaps the status bar** - Page 16  
  Apply the same safe-area behavior to gig applicant details, including back and contract-action buttons.
  **Verified locally (2026-10-07):** Added the same modal-specific provider and four-edge safe-area container. The actual component's header/back button and bottom actions remain within controlled notch/gesture insets in eight browser fixtures covering 320px/430px, both themes, and standard/160% text. TypeScript passes. Physical notched Android rendering remains a release check.

- [x] **BUG-22 - Admin withdrawal-filter layout** - Page 19  
  Align the dropdown and summary badges using existing admin filter styles. Verify desktop and narrow layouts.
  **Verified locally (2026-10-07):** Matched the payment monitor's filter/summary spacing. The real dropdown selects Pending in both themes. Browser checks confirm separated, wrapping badges and no viewport overflow at 320px/1280px with standard/160% text.

**Session evidence:** [2026-10-07 validation notes](docs/testing/bug-fix-session-2026-10-07.md). Both applications pass TypeScript, 14 existing focused tests pass, and the changed composer/performer components pass targeted lint. No APK, production bundle, deployment, or live provider mutation was performed. `adb devices -l` returned no connected device, so native-only acceptance checks remain unchecked.

## Part 2 - Bookmarks, Search, and Sharing

**Difficulty: Moderate**

- [x] **BUG-01 - Production-team bookmark fails** - Page 1  
  Add production teams to the card's favorite-type mapping. Synchronize search, details, and profile bookmark state; roll back failed updates. Verify persistence after restarting the app.
  **Verified locally (2026-10-07):** Production-team card labels map to `production_team`. Cards and team details share saved bookmark state; profile bookmarks refresh on changes and focus. PGlite-backed checks pass for both backend copies, removal, rollback, duplicate presses, client recreation, stale reads, and changing listings/users. Persistence was verified by recreating client state against the same database; no Android device was available.

- [x] **BUG-07 - Groups and musicians share one search filter** - Page 6  
  Add a Group filter. Musician returns individuals; Group returns groups; All includes both. Update backend filtering and cache keys together.
  **Verified locally (2026-10-07):** Added a selectable Group filter for musicians and owners. Both backend copies return only individuals for Musician/Solo Artist, only groups for Group/Music Group, and both for All. Search cache keys have a new version to exclude persisted mixed results. Acceptance checks pass for musician, owner, and guest requests.

- [x] **BUG-05 - Shared links do not open the app** - Page 5  
  Use `musika-lokal.vercel.app` as the published link host. Add a share gateway with "Open in app" and an APK-download fallback. Preserve the target through login and verification. Align Android intent filters and website association with the delivered APK certificate. Test Chrome, Messenger, cold/warm starts, logged-out users, and app absence. Follow [Expo's Android App Links setup](https://docs.expo.dev/linking/android-app-links/).
  **Verified locally and deployed (2026-10-07):** New shares use the published host; the app still accepts legacy links. Seven website share paths now serve a standalone gateway with the exact custom-scheme target and current APK download. Six link checks and browser interactions cover target preservation, cold/warm entry, malformed links, legacy paths, missing download metadata, and eight responsive/theme/text layouts. Live HTTP checks verify the gateway, security headers, four published files, and retention of all 95 previous website artifacts. Android source intent filters and the published certificate association agree; the delivered older APK can use the explicit custom-scheme button, while automatic HTTPS app linking requires the later client release. Physical Chrome/Messenger and login/verification handoff checks remain in release acceptance. See the [remaining-fixes deployment report](docs/testing/bug-fix-remaining-deployment-2026-10-07.json).

**Link limitation:** Old links on the unresolved `musikalokal.app` domain require restored DNS to work from browsers. Continue accepting legacy link formats inside the app.

## Part 3 - Data Accuracy and Realtime Updates

**Difficulty: Moderate to Hard**

- [x] **BUG-08 - Text-only posts display unintended images** - Page 7  
  Render post galleries exclusively from attached media. Remove avatar/stock-image fallbacks from post rendering and normalization while preserving appropriate listing-card fallbacks. Clear composer attachments after submission or cancellation. Verify Home, Talent, post details, and admin views agree.
  **Verified locally (2026-10-07):** Both Home backends use attached post media without an avatar fallback. Feed/Talent normalization and both post-detail viewers reject stale image/stock-photo fields when attachments are empty, while listing-card fallbacks remain. Successful submission now dismisses and resets the composer while saving; cancellation also clears draft attachments. Behavioral checks cover text-only posts, photos/videos, attachment order, the next submission, and admin attachment views.

- [x] **BUG-12 - Activity tabs use the wrong order** - Page 11  
  Return and preserve `activity_at` from the latest persisted business action. Exclude scheduled event dates and AI-review updates. Sort newest first with stable ties and refresh after reservation, payment, acceptance, cancellation, or review. Verify a newer studio action appears above an older gig action.
  **Verified locally and deployed (2026-10-07):** Server-controlled activity timestamps cover reservations, payment/state changes, applications, connection requests, and transactional review flags. Both backend copies and all mobile activity/application tabs preserve and sort them with stable ties; multi-slot batches retain the latest action. Fifteen acceptance checks pass, including a newer studio action above an older gig, AI/no-op exclusion, rollback, RLS, reconnect, and resume. The migration and `manage-bookings` version 107 are verified live. Historical values use available persisted action timestamps; missing historical actions are not inferred from generic `updated_at`. Client release remains pending.

- [x] **BUG-16 - Reviews blink or fail to load** - Page 14  
  Replace competing fetch paths with one authoritative query keyed by listing type and ID. Preserve reviews during refresh, distinguish errors from empty results, and reject stale responses after switching listings.
  **Verified locally (2026-10-07):** Both clients use one review-state query per listing target, with loading/error/Retry states. Existing reviews stay visible during refresh or failed reads; only a successful empty response clears them. Checks cover stable keys, changing listing ID/type, superseded requests, cancellation, and rendered loading/error/empty states. Detail-fetch backends retain legacy responses but let the new client skip duplicate review reads. Production-team reviews retain their existing owner-profile scope.

- [x] **BUG-23 - Admin report actions do not notify users immediately** - Page 20  
  Create notifications transactionally with saved moderation results. Notify the reporter about saved outcomes and the affected owner about applicable actions. Deduplicate retries per report revision and recipient. Update the inbox and unread badge through realtime events. Verify delivery within five seconds while online and recovery after reconnection or app resume.
  **Verified locally and deployed (2026-10-07):** Report outcomes and recipient notifications commit together, with server-controlled revisions and retry deduplication. Thirteen checks cover failures/rollback, subsequent outcomes, warnings/account actions, target ownership, permissions, inbox invalidation, unread counts, stale responses, reconnect, and resume. Live isolated recipients received events in 1.378s and 1.346s; inbox/unread reads, concurrent retries, missed-event recovery, and cross-user isolation pass. The migration and `admin-reports-management` version 68 are verified live. Client refresh changes require a later release; native rendering remains untested.

## Part 4 - Group Gigs and Visibility

**Difficulty: Hard**

- [x] **BUG-02 - Group gigs appear only for the leader** - Pages 2-3  
  Include accepted group gigs for leaders and linked members. Automatically show them in each participant's own profile view. Verify both Jared and Neil see the accepted group gig without duplicate cards.
  **Verified locally (2026-10-07):** Own-profile timelines now use the existing backend membership/audience checks and include accepted group gigs automatically, independent of public featuring. Both backend copies pass Jared/Neil, completed/cancelled history, removed-member, unauthorized-read, and membership-failure checks. Production profile callbacks pass duplicate-card, band-label, sign-out, changed-viewer, and private-cache checks. Visitor timelines continue to require explicit public consent. `manage-bookings` was deployed to Supabase on 2026-10-07; live unauthenticated requests are rejected. Signed-in participant acceptance remains locally verified.

- [x] **BUG-03 - Members cannot manage their own featuring preference** - Page 3  
  Add per-application, per-user public-profile preferences. Extend `fetch_feature_consent` to return the member's preference and editing permissions. Extend `respond_feature_consent` with `self` and `group` scopes. Members control their own profiles; leader-authorized users control the band's public feature. Display the band once in the lineup, regardless of how many members display the gig on their profiles.
  **Verified locally and deployed (2026-10-07):** Members can save their own public-profile choice; authorized leaders have separate band controls. Both backends return the caller's preference and permissions, and public artist/group timelines use the appropriate consent. Twenty-one local checks cover independent persistence, defaults, legacy consent, permissions/RLS, rollback, retries, stale requests, sign-out, completion/cancellation, production screen controls, and lineup deduplication. Live signed-in fixtures verify independent and concurrent choices, guest timelines, leader restrictions, direct-update protection, and one band in gig/Feed lineups. Both additive migrations and `gig-applications` version 122 are verified; existing application rows/policies and production dependencies are preserved. All fixtures were removed. Client release and physical Android rendering remain pending. See the [member featuring deployment report](docs/testing/bug-fix-member-featuring-deployment-2026-10-07.json).

- [x] **BUG-14 - Future accepted gigs appear as Done** - Page 12  
  Classify performances using their schedules in Asia/Manila. Closing applications must not complete a future gig. Include completed applications in historical timelines and label cancelled performances accurately. Verify the October 22 example remains Upcoming before its performance starts.
  **Verified locally (2026-10-07):** Artist/profile and both group timeline views use Manila performance schedules instead of application-closing status. Thirteen behavioral checks pass for the October 22 example, schedule boundaries, multiple dates, overnight events, completed history, cancellation labels, deduplication, and stale responses. Both database migration copies pass PGlite checks for retaining existing consent on completion and enforcing public visibility with real RLS. The additive migration was applied and recorded in Supabase on 2026-10-07; the live trigger and public-consent policy were verified. Previously revoked consent is not reconstructed.

## Part 5 - Payments and Reservation Rules

**Difficulty: Very Hard**

- [x] **BUG-10 - Online payments are missing from wallet history** - Page 9  
  Persist confirmed full-payment, downpayment, balance-payment, and refund events. Merge them into `get_wallet_summary` and add a Payments filter. External spending must not deduct the in-app wallet balance again. Deduplicate provider payment references and booking allocations; update booking state and associated financial records atomically. Backfill confirmed history without inventing installment dates, and label aggregate historical records appropriately. Verify PHP 6,000 appears once, payment stages are accurate, and repeated webhooks create no duplicates.
  **Verified locally and deployed (2026-10-07):** Both backends persist confirmed provider references and booking allocations, atomically save booking state and owner earnings/refund reversals, and leave the payer's wallet balance unchanged. The wallet merges online spending/refunds and adds Payments, external-method labels, and historical-total labels. Thirty-five acceptance checks cover PHP 6,000 once, installment stages, direct/checkout webhooks, polling, redirects, signed-event retries, rollback, permissions, stale callbacks, server pricing, and complete multi-booking allocations. The rendered wallet passes both themes, filters, focus, changing users, and sign-out checks. Eight historical records were reconciled without changing existing balances or inventing installment dates. Live concurrency, wallet summaries, refund retries, RLS, and Realtime delivery pass. The additive migration and `paymongo` version 125, `withdrawals` version 93, and `manage-bookings` version 109 are verified. Fixtures were removed; no charges or emails were sent. Client release, physical Android rendering, and an actual provider charge roundtrip remain pending. See the [payment deployment report](docs/testing/bug-fix-wallet-payments-deployment-2026-10-07.json).

- [x] **BUG-13 - Another studio can be reserved with unpaid balances** - Page 11  
  Block new reservations across studios while an active unpaid checkout or positive remaining balance exists, including after a downpayment. Enforce the rule in the database transaction that creates reservations, with a per-user lock and one eligibility check per multi-slot batch. Route every reservation-creation path through enforcement. Return `OUTSTANDING_STUDIO_PAYMENT` with affected bookings and a "Pay now" destination. Keep payment retry, balance settlement, and cancellation of existing bookings available. Verify concurrent requests cannot bypass the rule and settlement or cancellation restores eligibility.
  **Verified locally and deployed (2026-10-07):** All inserts use a statement-level guard and a per-user lock. Both booking handlers prepare and price all sessions before one transaction saves the days and ordered slots; both clients submit one batch and show the global balance block with Pay Now. Sixteen checks cover unpaid/pending/failed checkouts, downpayments, positive balances, rollback, direct inserts, legacy single-session callers, authorization, stale responses, and reconnect/resume. Live requests held open while competing RPC/direct inserts waited: both competitors were blocked, with only one reservation saved. Settlement/cancellation restore eligibility and failed slots leave no bookings. Both migrations and `manage-bookings` version 108 are verified live. Client changes require a later release; older clients retain single-session compatibility and need the new client for atomic multi-session submissions.

## Part 6 - Station Library Controls

**Difficulty: Very Hard**

- [x] **BUG-21 - Admin cannot fully select or shuffle station content** - Page 19  
  Extend playlist selection with track inclusion/exclusion, playlist and track ordering, and "Shuffle queue." Persist one ordered queue shared by listeners, with a queue revision and playback anchor. Extend `admin_upsert_station_from_source` with selected track order while retaining playlist-only compatibility. Return one authoritative playback queue for playback, Now Playing, and Up Next in both clients. Update listeners when its revision changes and skip unavailable or restricted tracks. Saving starts the new revision at its first playable track; existing stations retain their order until edited. Verify selection, ordering, shuffle persistence, and synchronized playback for two listeners.
  **Verified locally and deployed (2026-10-07):** The admin editor supports individual track choices, playlist/track ordering, and a saved shuffled queue. Thirty behavioral checks cover both SQL/backend/client copies, atomic save rollback, legacy callers and playlist controls, permissions, persisted order, shared timelines, stale requests, unavailable content, and prepared-audio invalidation. The production editor passes interaction checks and eight browser layouts. Two live authenticated listeners received the revision in 1.411s and 1.408s and returned identical queue order, anchor, and timeline position. Browse/profile summaries use the same queue. The additive migration and `manage-playlists` version 76 are verified; existing stations, slots, policies, and triggers were preserved. Fixtures were removed. Client release and physical Android audio checks remain pending. See the [station deployment report](docs/testing/bug-fix-station-queue-deployment-2026-10-07.json).

## Part 7 - Authentication and Recovery

**Difficulty: Highest Risk**

- [x] **BUG-19 - Didit decline/cancel causes loops or verification bypass** - Pages 17-18  
  Consolidate signup around the current server-confirmed verification attempt. Clear failed-session IDs, nonces, URLs, stored resume state, and polling. Explicit retry creates exactly one fresh attempt; ignore superseded callbacks and webhook results. Preserve entered details and prevent failed/unknown states from advancing to email verification. Preserve legitimate approval/manual-review paths. Verify the published workflow referenced by `DIDIT_WORKFLOW_ID`, supported document types, and intended camera/upload methods using `image_capture_methods_allowed` from [Didit's configuration reference](https://docs.didit.me/management-api/workflows/feature-configs). Replace overlapping polling with one controlled loop and distinct loading/failure states. Test repeated decline/cancel followed by success, delayed callbacks, camera/upload flows, and app restarts.
  **Verified locally and deployed (2026-10-07):** One monitor now handles automatic, callback, and manual checks without overlapping requests. Cancel/failure clears the current attempt and returns to the entered details; explicit retry makes one fresh request. Restart restoration uses the saved attempt instead of the callback's ID. Stale reads, creation results, account-creation responses, and callbacks are rejected. Failed starts expose Retry. A nonce-protected cancellation endpoint and database trigger keep superseded attempts invalid even after late provider approval/review writes; signup rejects them before provider fallback. Fifteen focused checks pass, including production creation/restoration handlers and both database/backend copies. Live isolated fixtures verify nonce rejection, cancellation/retries, ignored late writes, and independent approval of the new attempt. The configured workflow is published, permits Philippine passport/driver's license/national ID, requires liveness/face matching, and allows `CAMERA_SCAN` and `UPLOAD`. The migration and `create-didit-session` 134, `didit-webhook` 165, and `create-unverified-user` 126 are verified with their existing JWT settings and production dependencies. All fixtures and the temporary authenticated diagnostic were removed; no provider session, email, or charge was created. Actual camera/upload flows and physical Android restart rendering remain release checks. See the [remaining-fixes deployment report](docs/testing/bug-fix-remaining-deployment-2026-10-07.json).

- [x] **BUG-20 - Password-reset email does not reach the reset form** - Page 18  
  Add an HTTPS recovery callback on the published host, configure Supabase's allowed redirects, and normalize query/fragment callback data. Establish and validate the recovery session before normal auth routing. Require a valid recovery credential rather than trusting `type=recovery`. Display new-password and confirmation fields; handle expired/reused links with a new-link action. After success, sign out and return to login. Follow [Supabase's mobile-linking flow](https://supabase.com/docs/guides/auth/native-mobile-deep-linking). Test cold/warm starts and recovery while another session is signed in.
  **Verified locally and deployed (2026-10-07):** Reset emails now use `https://musika-lokal.vercel.app/recovery` with a single-use recovery hash. The published callback offers browser reset and Open in app; query/fragment and legacy callbacks are normalized. Recovery uses a separate server-validated session before saved-share, identity, or role routing; ordinary login tokens and a recovery marker alone cannot enable the form. Twenty-seven focused checks cover cold/warm callbacks, effect replay, stale responses, duplicate saves, password confirmation/policy errors, sign-out retry, reloads, and both themes at narrow/desktop widths with enlarged text. Live isolated identities verify old/new passwords, revoked recovery sessions, reused/expired callbacks, legacy fragments, and recovery while another identity is signed in. `account-email` version 38 and the exact allowed HTTPS redirect are verified; all 90 existing website artifacts and the deployed email dependency are preserved. Fixtures were removed; no reset-email delivery requests were made. Automatic Auth notices were limited to isolated test addresses. No client bundle or APK was built. Native client release and physical Android checks remain pending. See the [recovery deployment report](docs/testing/bug-fix-password-recovery-deployment-2026-10-07.json).

## Verification and Release

For each part:

1. Run targeted behavioral tests and applicable TypeScript checks.
2. Verify its PDF scenarios and record screenshots or test evidence.
3. Test relevant permissions, failures, retries, and app restarts.
4. Mark implementation checkboxes after the available acceptance checks pass, and keep unavailable release checks explicitly pending.

Use Node/PGlite for database behavior, permissions, concurrency, and idempotency; browser checks for admin/callback pages; Android device checks for layouts, links, camera/upload, and playback.

Deploy additive migrations before dependent functions and clients. Keep equivalent backend fixes aligned across both workspaces while preserving legitimate differences. The current request excludes a client bundle/APK build. During the later client release, deliver a newly versioned APK for native-link changes, verify the actual downloadable build, and retain the previous release for rollback.

All 23 implementation items pass the available checks. Release acceptance remains open until the following checks are completed:

- [ ] Build and publish a newly versioned native client when requested; validate the downloadable APK's manifest and certificate.
- [ ] Verify BUG-04/09/17/18 on physical Android with a notch, narrow viewport, larger fonts, and both themes.
- [ ] Verify automatic HTTPS links in Chrome and Messenger, cold/warm launches, logged-out login/identity handoff, and app absence using the new client.
- [ ] Verify Didit camera scan/upload, repeated decline/cancel followed by approval, and device restarts with isolated provider identities.
- [ ] Complete the previously recorded physical playback/recovery/wallet checks and a provider test-mode payment roundtrip.

### Supabase deployment - 2026-10-07

- [x] Apply and record `20261007120000_preserve_completed_gig_timeline_consent.sql` transactionally, retaining explicit consent and enabled RLS.
- [x] Deploy `home-feed`, `manage-details`, `search-content`, and `manage-bookings` with their existing JWT settings.
- [x] Verify deployed sources and run live read-only Home, search, and detail checks; confirm private timelines reject missing/anonymous identities.
- [x] Apply and record `20261007140000_persist_business_activity_order.sql`, preserve business data and RLS, publish the three activity tables, and deploy/verify `manage-bookings` version 107. See the [activity deployment report](docs/testing/bug-fix-activity-deployment-2026-10-07.json).
- [x] Apply and verify `20261007143000_record_each_review_activity.sql` so every participant's submitted review advances activity even when a shared review flag is already true.
- [x] Apply and record `20261007150000_transactional_report_notifications.sql`, preserving historical reports/notifications and RLS; deploy and verify `admin-reports-management` version 68. Live online delivery, retry deduplication, inbox/unread reads, and isolation pass. See the [notification deployment report](docs/testing/bug-fix-report-notifications-deployment-2026-10-07.json).
- [x] Apply and record `20261007153000_enforce_studio_payment_eligibility.sql` and `20261007153500_avoid_studio_eligibility_fk_deadlocks.sql`, preserving existing bookings, slots, and RLS; deploy and verify `manage-bookings` version 108. Live concurrent RPC/direct-insert, settlement, cancellation, and rollback checks pass. See the [reservation deployment report](docs/testing/bug-fix-studio-eligibility-deployment-2026-10-07.json).
- [x] Apply and record `20261007160000_individual_gig_feature_preferences.sql` and `20261007160500_guard_feature_consent_status_transitions.sql`, preserving existing applications, policies, triggers, and explicit consent; deploy and verify `gig-applications` version 122 with existing production dependencies. Live member/leader, public timeline, concurrency, permission, and lineup checks pass. See the [member featuring deployment report](docs/testing/bug-fix-member-featuring-deployment-2026-10-07.json).
- [x] Apply and record `20261007170000_persist_station_playback_queue.sql`, retaining existing station/slot contents, RLS policies, and triggers; publish station updates and deploy/verify `manage-playlists` version 76. Live concurrent saves, two-listener delivery/timelines, authoritative summaries, legacy controls, permissions, and unavailable-track checks pass. See the [station deployment report](docs/testing/bug-fix-station-queue-deployment-2026-10-07.json).
- [x] Apply and record `20261007180000_record_online_studio_payments.sql`, preserving existing bookings, wallet balances, financial records, RLS policies, and triggers; publish payer-only payment history and deploy/verify `paymongo` version 125, `withdrawals` version 93, and `manage-bookings` version 109 with their existing JWT settings and production dependencies. Live wallet summaries, concurrent retries, installment stages, refunds, rollback, and isolation pass. See the [payment deployment report](docs/testing/bug-fix-wallet-payments-deployment-2026-10-07.json).
- [x] Add the exact published HTTPS recovery redirect, deploy/verify `account-email` version 38 with its existing JWT setting and deployed email dependency, and publish the standalone recovery callback using the existing website artifacts. Live reset, session revocation, reused/expired links, legacy callbacks, and cross-user isolation pass. See the [recovery deployment report](docs/testing/bug-fix-password-recovery-deployment-2026-10-07.json).
- [x] Apply and record `20261007071203_guard_invalidated_didit_attempts.sql`, preserving existing verification rows and permissions; deploy/verify `create-didit-session` 134, `didit-webhook` 165, and `create-unverified-user` 126. Live isolated attempt checks, published workflow configuration, fixture/diagnostic cleanup, and unchanged unrelated function versions pass. Security advisors introduce no new findings.
- [x] Publish and verify the standalone share gateway at all seven share paths, preserving the 95 existing website files and the previous deployment for rollback. No client bundle or APK was built. See the [remaining-fixes deployment report](docs/testing/bug-fix-remaining-deployment-2026-10-07.json).

Deployment used the root `.env` for the existing project. Versions and evidence are recorded in the [session notes](docs/testing/bug-fix-session-2026-10-07.md). No app bundle or APK was built. Client changes still require a later client release, and native/provider checks remain pending.

## Confirmed Defaults

- Members control their own public-profile visibility; the leader controls the band's public feature.
- New public visibility defaults to private; preserve existing explicit consent during migration.
- Any active unpaid studio balance blocks new studio reservations.
- The reservation block applies to new studio reservations; payment and cancellation of existing bookings remain available.
- Administrators can choose both playlists and individual tracks, arrange them, and save a shuffled queue.
- Retain the existing visual design, identity policy, and payment provider.
- Use isolated fixtures and provider test modes. Historical reconciliation must not replay charges or change stored balances.
