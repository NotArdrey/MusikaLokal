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

Gig applicants can optionally consent to an advisory Groq review of redacted CV
text, video speech, up to three client-generated video frames, and stored
portfolio images. For solo applicants, the same consent also permits an advisory
comparison between the profile photo and those frames. For group applications,
the submitter must confirm authorization from every listed member; the database
snapshots that lineup and Groq performs a separate advisory comparison for each
member after any required group-leader approval. Results are limited to
`likely_same_person`, `likely_different_person`, or `unclear`; they do not identify
any person. The review is processed in the background and displayed to the gig
manager with source evidence, confidence, and limitations. It does not change
verification, eligibility, deterministic recommendation scores, or an application
decision.

Deploy `20260719010000_add_consent_gated_gig_portfolio_reviews.sql` followed by
`20260719030000_add_gig_face_similarity_review.sql`, then
`20260719040000_add_group_member_face_similarity_review.sql` before deploying
the `gig-applications` Edge Function. Configure `GROQ_API_KEY` as a Supabase secret.
Optional model overrides are documented in `mobile/.env.example`; enable Groq
Zero Data Retention in GroqCloud Data Controls when required by the deployment's
privacy policy.

## Gig performance video rights screening

New gig performance videos require an applicant ownership, license, or
permission acknowledgment and are fingerprinted through the existing ACRCloud
upload-safety workflow before upload. No match is recorded as `not_required`;
a released-recording match creates an Identity Review case while still allowing
the private gig application to be submitted. Admin approval or decline is
mirrored back to the application, and both the gig manager and Identity Review
admin can inspect the status and original video. This is a screening signal, not
a legal copyright or authorship determination.

Deploy `20260719020000_add_gig_video_copyright_screening.sql` before the updated
`upload-safety-screen`, `gig-applications`, and `admin-users-management` Edge
Functions. Configure `ACRCLOUD_HOST`, `ACRCLOUD_ACCESS_KEY`, and
`ACRCLOUD_ACCESS_SECRET`; uploads fail closed when fingerprinting is unavailable.

Operational Groq text defaults now use `openai/gpt-oss-120b`, then
`qwen/qwen3.6-27b` and `openai/gpt-oss-20b`. Vision defaults to
`qwen/qwen3.6-27b`. Environment overrides remain available through
`GROQ_TEXT_MODEL`, `GROQ_REVIEW_MODEL`, `GROQ_VISION_MODEL`, and
`GROQ_SPEECH_MODEL`.

## Gig application roles

Only musician accounts may submit gig applications, either as a solo performer
or for a duo/group they own or belong to. Producer and production-team roster
submissions are hidden in the clients and rejected by both the
`gig-applications` Edge Function and the database. Venue-originated invitations
remain valid when accepted by the invited musician, duo, or group. Deploy
`20260719050000_disable_production_gig_applications.sql` before the updated
`gig-applications` function.
