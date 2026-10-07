# Remaining bug fixes — 2026-10-07

The full checklist was read before work began. BUG-04, BUG-09, BUG-17, BUG-18, BUG-05, and BUG-19 are implemented and checked against available local/browser/server acceptance. The checklist now distinguishes implementation completion from physical-device/provider release acceptance. No production client bundle or APK was built, as requested.

## Layouts

The production application-card and radio-control fixtures pass at 320px/1280px, in both themes, with standard/160% text. These rerun the earlier wrapping, badge-containment, and consistent Mute/Unmute fixes.

Both applicant modals now have their own `SafeAreaProvider`, following [Expo's safe-area guidance for modal roots](https://docs.expo.dev/versions/latest/sdk/safe-area-context/). Their headers, scrolling content, and actions use all four safe-area edges. `scripts/test-applicant-safe-areas.mjs` renders the actual components with controlled 48px top, 34px bottom, and 8px side insets. Sixteen fixtures pass at 320px/430px, in both themes, with standard/160% text. These are browser fixtures with supplied metrics; they do not establish native inset measurement on a physical device. The [gig](remaining-bugs-2026-10-07/gig-safe-area.png) and [group](remaining-bugs-2026-10-07/group-safe-area.png) screenshots were inspected.

## Sharing

New URLs use `https://musika-lokal.vercel.app`. The app continues to normalize legacy website/custom-scheme formats. Android source intent filters use the published host and include recovery; the website association retains the downloadable APK's package/certificate mapping, following [Expo's Android App Links guidance](https://docs.expo.dev/linking/android-app-links/).

Seven share paths serve a standalone gateway without a redirect that discards the destination. “Open in app” offers the normalized custom-scheme target; the download action reads the current release metadata and falls back to the home page if metadata is unavailable. No automatic custom-scheme launch runs during a passive page load. Existing login/identity destination storage is retained. The native callback deduplication key now includes the Didit session ID so separate verification attempts can return independently.

Six link checks pass. Browser checks exercise all target paths, the app button, invalid content types, unavailable download metadata, both themes, and eight standard/enlarged-text layouts. The [dark](remaining-bugs-2026-10-07/share-dark.png) and [light](remaining-bugs-2026-10-07/share-light.png) screenshots were inspected. The existing exported website's download/theme/admin-protection test also passes after its local routing fixture was updated for the new gateway.

The gateway is published at [the sharing host](https://musika-lokal.vercel.app/feed). Deployment `dpl_Bv85CKmf7YzUEE6JE2GbXABJWZAL` preserves all **95** earlier website files, including recovery. Its four share files, seven HTTP entry paths, and security headers match the tested sources. Publishing reused the saved production artifacts through a prebuilt deployment; no Expo export or client bundle build ran. The original recovery deployment `dpl_AHMRWbkoxupFFgpd1qh8TkN6VuYq` remains available for rollback. Automatic HTTPS linking needs the later native release; the existing APK can use the explicit custom-scheme gateway button.

## Didit attempts

One controlled monitor handles timer, callback, and manual status checks. They join one in-flight request. Unknown/running states and network failures cannot finish signup. Only the current server-confirmed attempt can enter approval or the established review flow. Explicit checks can retry account creation without an automatic attempt-creation loop.

Cancellation/failure stops polling, invalidates the current generation, clears IDs/nonces/URLs/stored resume state, and returns to the entered details. A retry acquires its creation guard before awaiting storage, creates one fresh request, and saves only the returned attempt's nonce and URL. Changing email/role/document invalidates pending work. Restart restoration uses the saved attempt and ignores a callback ID from an older attempt. Late creation/status/account responses are rejected. Failed creation has an explicit Retry state; cancellation is disabled while account creation commits.

Both backend workspaces implement nonce-protected cancellation, rejection of invalidated attempts before provider fallback, and ignored superseded webhook results. Mobile's older creation/signup handlers were aligned with the existing secured web implementation so they issue and validate session nonces. Deployment retained the existing production shared dependencies and JWT settings.

The additive `20261007071203_guard_invalidated_didit_attempts.sql` trigger prevents provider retries from changing an already superseded status. It uses invoker security and a fixed search path, with direct function execution revoked from public/client roles. The deployment transaction proves pre-existing verification rows were unchanged. It does not change existing table permissions or RLS.

Fifteen focused tests pass across the actual creation/restoration handlers, controlled status monitor, both nonce helpers/session handlers, and both database migrations. They cover duplicate presses, cancellation, unknown/network states, stale reads/callbacks, restart restoration, approval/review, and persistent invalidation. Existing review and authorization checks continue to pass.

Live isolated rows verify bad-nonce rejection, cancellation/retries, delayed approval/review rejection, independent approval of the fresh row, and a superseded session read. A temporary authenticated diagnostic used the project's actual nonce secret to prepare fixtures and read the provider workflow; it was deleted after use. A first fixture using the management API's service key did not match the Edge runtime's nonce-secret configuration. No provider verification session, email, or charge was created. Every fixture row and the temporary function was removed, and unrelated function versions remain unchanged.

The configured workflow is **published** and not archived. Only the Philippines is enabled. Passport, driver's license, and ID capture are enabled; liveness and face matching are required. `image_capture_methods_allowed` is exactly `CAMERA_SCAN` and `UPLOAD`, checked against [Didit's workflow configuration reference](https://docs.didit.me/management-api/workflows/feature-configs). The provider workflow was inspected without modifying it.

Verified production functions:

- `create-didit-session`: **134**, `verify_jwt=false`.
- `didit-webhook`: **165**, `verify_jwt=false`.
- `create-unverified-user`: **126**, `verify_jwt=false`.

Downloaded deployed entrypoints match their tested payloads. The Supabase security advisors have the same 249 pre-existing findings before/after and introduce no new findings. Original sources and deployment artifacts are retained under ignored `tmp/remaining-bugs-deploy/`.

## Validation and pending release checks

- The full existing bug-fix regression suite passes **179 tests**. Its notification fixture was repaired to include the wallet query key required by the already-added global invalidation code.
- **15** focused Didit attempt checks, **6** share-link checks, the share browser test, and the applicant safe-area browser test pass. Existing authentication/recovery/release/authorization tests pass; the website test was rerun successfully after updating its old redirect fixture.
- Mobile/web TypeScript and all three staged Edge Function Deno checks pass. Signup and the new client utilities pass focused ESLint. The applicant components retain their pre-existing lint findings unrelated to the safe-area wrappers.
- `git diff --check` passes.

The installed SDK's `adb devices -l` reports no connected device. Physical Android layout, automatic Chrome/Messenger links, login/identity handoff, Didit camera/upload and restart behavior, and earlier playback/recovery/wallet device checks remain pending. Actual provider charge/camera/upload roundtrips were not run. The checklist lists these as separate unchecked release acceptance items; no native release is claimed.

See the [sanitized deployment evidence](bug-fix-remaining-deployment-2026-10-07.json).
