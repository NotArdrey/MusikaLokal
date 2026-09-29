# MusikaLokal

MusikaLokal contains separate Expo applications for mobile and web, a shared
Supabase backend history, and Playwright/Maestro end-to-end tests.

## Repository layout

- `mobile/` - Expo mobile application and mobile-facing Supabase resources
- `web/` - Expo web application and web-facing Supabase resources
- `e2e/` - cross-application Playwright and Maestro tests
- `supabase/` - repository-level database maintenance and alignment scripts
- `scripts/` - repository-wide maintenance and smoke-test utilities
- `docs/` - architecture, implementation notes, audits, and test documentation
- `.agents/` - repository-specific development-agent guidance
- `.vscode/` - shared VS Code tasks and the local development launcher

## Development

Start both applications from PowerShell:

```powershell
.\start-dev.ps1
```

Alternatively, run an application on its own:

```powershell
npm --prefix mobile install
npm --prefix mobile start

npm --prefix web install
npm --prefix web run dev
```

The mobile app uses Expo SDK 57 (React Native 0.86.3 and React 19.2.3).
To restart Metro after upgrading, run `cd mobile` followed by
`npx expo start --clear`. Use an SDK 57 compatible Expo Go installation, or
rebuild your native development app after the upgrade. See the
[Expo upgrade guide](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/).

Mobile audio previews and the Expo Go radio fallback use `expo-audio`; video
previews use `expo-video`. The existing `react-native-track-player` integration
for native builds still triggers Expo Doctor's New Architecture compatibility
warning and needs device validation. Run the audio lifecycle regression checks
from the repository root with `node --test scripts/test-expo-audio.mjs`.

The root package contains the end-to-end test dependencies and commands:

```powershell
npm install
npm run e2e:crud-full
```

Keep secrets in ignored `.env` files. Use `.env.e2e.example` as the template
for end-to-end test configuration. Generated logs, reports, build output, and
local IDE metadata are intentionally ignored.

For the detailed system design, see [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md).

## Account and identity policy

Fan and Musician profiles are separate accounts. A person who needs both roles
must register with two different email addresses, producing two independent
Supabase Auth user IDs. A verified identity may be associated with at most one
Fan account and at most one Musician account, so the same identity can own one
account of each role but cannot create a second account for either role.

The signup and manual-review functions reject reused email addresses and
same-role identity duplicates. Postgres also enforces the verified-identity
rule per role. Deploy `20260927133000_enforce_separate_role_accounts.sql` from
the applicable Supabase workspace before deploying the updated account and
identity-review Edge Functions.

## Consent-gated gig portfolio review

Gig applicants can optionally consent to an advisory review of extracted CV text
and the submitted performance video. Identity documents
and profile photos are not fetched, shown to gig managers, or compared with the
submitted video. The review is processed in the background and does not change
identity verification or make the final application decision.

Deploy `20260719010000_add_consent_gated_gig_portfolio_reviews.sql` followed by
`20260927180000_remove_gig_identity_video_matching.sql` and
`20260928120000_add_gig_recommendation_needs_review_status.sql` before deploying
the updated `gig-applications` Edge Function. Configure `GEMINI_API_KEY` as a
Supabase Edge Function secret. The primary model is configurable with
`GEMINI_MODEL` and defaults to `gemini-3.5-flash-lite`. Unclear, contradictory,
or malformed primary results can be retried once with `GEMINI_FALLBACK_MODEL`,
which defaults to `gemini-3.5-flash`; set `GEMINI_ENABLE_FALLBACK=false` to
disable that escalation. Never put server-side provider keys in Expo variables
or client code. `GIG_AI_REVIEW_PROVIDER=groq` temporarily preserves the legacy
CV/transcript/frame path for migration comparisons; Gemini is the default.

## Gig performance video recording screening

Gig performance videos are fingerprinted through the existing ACRCloud
upload-safety workflow before upload. For gig applications, released-recording
recognition is advisory genre evidence only: it does not require a rights
acknowledgment, block submission, or create an Identity Review case. The older
playlist upload copyright workflow remains active and still places recognized
playlist tracks into ownership review before public playback.

Deploy `20260719020000_add_gig_video_copyright_screening.sql` before the updated
`upload-safety-screen`, `gig-applications`, and `admin-users-management` Edge
Functions. Configure `ACRCLOUD_HOST`, `ACRCLOUD_ACCESS_KEY`, and
`ACRCLOUD_ACCESS_SECRET`; uploads fail closed when fingerprinting is unavailable.

Direct playlist-to-gig matching additionally uses an ACRCloud custom-content
bucket. Deploy `20260720233000_add_playlist_audio_fingerprints.sql`, then deploy
the updated `manage-playlists` and `upload-safety-screen` functions. Configure
`ACRCLOUD_CONSOLE_TOKEN`, `ACRCLOUD_CUSTOM_BUCKET_ID`,
`ACRCLOUD_CUSTOM_HOST`, `ACRCLOUD_CUSTOM_ACCESS_KEY`, and
`ACRCLOUD_CUSTOM_ACCESS_SECRET`. Bind the custom bucket to the custom
recognition project and use the recorded-audio mode for gig samples. New and
edited MP3 tracks are indexed automatically. Existing tracks can be indexed in
batches by invoking `manage-playlists` with action
`backfill_playlist_audio_fingerprints`, `offset` (starting at `0`), and `limit`
(up to `25`) until `next_offset` is `null`. Same-user matches reuse only a
linked `APPROVED` ownership review; other matches remain admin-review evidence.
If the standard ACRCloud project has melody/humming recognition enabled, those
results are also considered for live gig performances.

When ACRCloud strongly recognizes a released recording, its catalog genres are
stored with the application's copyright-screening metadata and used as advisory
genre evidence by the consent-gated gig review. For gig applications, a
recognized recording is not blocked, does not require an ownership declaration,
and does not create a `pending_review` case. The result is stored as
`not_required` with a signed genre-evidence receipt. Playlist audio uploads keep
their separate copyright-review workflow. Unrecognized original or live
performances are not assigned a genre by ACRCloud and remain dependent on other
evidence or manual review.

Legacy Groq review mode uses `openai/gpt-oss-120b`, then
`qwen/qwen3.8-27b` and `openai/gpt-oss-20b`. Vision defaults to
`qwen/qwen3.8-27b`. Environment overrides remain available through
`GROQ_TEXT_MODEL`, `GROQ_REVIEW_MODEL`, `GROQ_VISION_MODEL`, and
`GROQ_SPEECH_MODEL`.

Server-side AI Match Review can use a second Groq account by setting
`GROQ_FALLBACK_API_KEY` as a Supabase Edge Function secret. Keep this key
server-only; do not expose it through an `EXPO_PUBLIC_*` variable.

## Gig application roles

Only musician accounts may submit gig applications, either as a solo performer
or for a duo/group they own or belong to. Producer and production-team roster
submissions are hidden in the clients and rejected by both the
`gig-applications` Edge Function and the database. Venue-originated invitations
remain valid when accepted by the invited musician, duo, or group. Deploy
`20260719050000_disable_production_gig_applications.sql` before the updated
`gig-applications` function.
