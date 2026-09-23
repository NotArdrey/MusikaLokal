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

## Consent-gated gig portfolio review

Gig applicants can optionally consent to an advisory review of redacted CV text,
video speech, up to three client-generated video frames, and stored portfolio
images. Groq continues to handle CV classification, transcription, neutral visual
observations, and criteria evidence. Face matching alone is sent by the Supabase
Edge Function to the local service in `services/face-recognition`, which uses
DeepFace with ArcFace embeddings, RetinaFace detection, alignment, and cosine
distance. It compares up to three frames already sampled by the Expo client; the
Python service does not extract a second set of frames. For group applications,
the database snapshots the authorized lineup and the same service compares each
available member reference image against the sampled video faces. If a video
frame contains several people, the lowest ArcFace distance is retained and the
frame is marked as a multiple-person frame.
Results remain limited to
`likely_same_person`, `likely_different_person`, or `unclear`; they do not identify
any person. The stored result also includes similarity, confidence, sampled,
usable and matched frame counts, match rate, and multi-person frame counts. The
review is processed in the background and does not change verification,
eligibility, deterministic recommendation scores, or an application decision.

Deploy `20260719010000_add_consent_gated_gig_portfolio_reviews.sql` followed by
`20260719030000_add_gig_face_similarity_review.sql`, then
`20260719040000_add_group_member_face_similarity_review.sql` before deploying
the `gig-applications` Edge Function. Configure `GROQ_API_KEY`,
`FACE_RECOGNITION_URL` and, when configured on the service,
`FACE_RECOGNITION_API_KEY` as Supabase Edge Function secrets.
`FACE_RECOGNITION_TIMEOUT_MS` is optional and defaults to 60000. The pinned
DeepFace 0.0.101 ArcFace/cosine threshold (`0.68`) is used unless the service operator explicitly
sets `FACE_ARCFACE_THRESHOLD`; benchmark analysis never changes production
configuration. Never put these settings in Expo variables or client code.
Optional model overrides are documented in `mobile/.env.example`; enable Groq
Zero Data Retention in GroqCloud Data Controls when required by the deployment's
privacy policy.

Run `npm run benchmark:face -- services/face-recognition/benchmark-dataset.example.json`
with a labeled, consented dataset copy to generate the face-only benchmark report
and dashboard under `output/face-benchmark`. The benchmark imports the same face
service client as production and reports production-parity metadata, false match
and non-match rates, coverage, conditional accuracy, unclear/no-face/multiple-face
rates, processing/service failure rates, distance distributions, and diagnostic
threshold analysis separately from genre accuracy.

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

Operational Groq text defaults now use `openai/gpt-oss-120b`, then
`qwen/qwen3.8-27b` and `openai/gpt-oss-20b`. Vision defaults to
`qwen/qwen3.8-27b`. Environment overrides remain available through
`GROQ_TEXT_MODEL`, `GROQ_REVIEW_MODEL`, `GROQ_VISION_MODEL`, and
`GROQ_SPEECH_MODEL`.

Server-side AI filtering can use a second Groq account by setting
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
