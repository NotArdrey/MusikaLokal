# Gig history, upload moderation, and profile loading

The mobile and web apps now show Gig History under Bookings → History and on
the Manage dashboards for gig owners and musicians. Each card lists every
application and its status, including declined, cancelled, and pending entries.
Posted gigs with no applicants are included. History uses existing gig and
application records; records already permanently deleted cannot be reconstructed.

The `fetch_gig_history` RPC authenticates the viewer and allows the organizer,
authorized gig staff, applicant, submitter, or participating group/production
performer to see associated gigs. Other applicants are represented by name,
group, application date, and status. CVs, pitches, contact details, private
videos, and review notes are not exposed. Gigs are paginated ten at a time.

## Moderation workflow

Visual AI blocks create `upload_moderation_cases` and an initial audit event.
The server stores the exact screened image or video frame in the private
`moderation-quarantine` bucket before returning a case ID. The client then
attaches the full original image/video. A failed evidence attachment keeps the
upload blocked and displays a retry message; the initial case and AI evidence
are preserved. Cases include uploader, timestamps, associated gig/profile/post
or draft context, categories, confidence when supplied, provider, reason, and
status. Video frames are screened individually; multiple flagged frames may
produce multiple cases, each with the original video attached.

Admin → Reports → **AI-blocked uploads** provides private previews, original
video playback, prior rejection counts, and decision history. Reviewers can
approve, reject, warn, restrict uploads for seven days, or lift a restriction.
Notes are required and sent to the uploader. Approval and rejection are final
for that case. Warnings and restrictions leave pending media unpublished until
an explicit approval/rejection. Restriction enforcement covers the screening
endpoint and authenticated Storage inserts/updates.

Approval permits the uploader to select the same media again and finish the
original form. It does not automatically publish an incomplete draft. Matching
uses a server-computed SHA-256 hash of the screened content, scoped to its
uploader and upload context. Cases bypass the client decision cache on retry
so admin decisions take effect immediately. Client filenames and cache IDs
cannot grant an approval to different content.

Decisions, notifications, restrictions, and audit entries commit in one database
transaction. A version check prevents two admins from silently overwriting one
another's review. Evidence previews use five-minute signed URLs. Restrictive
Storage policies protect quarantine even if older permissive policies grant
broad access. Evidence is eligible for removal 30 days after approval/rejection;
the next admin queue refresh removes up to five expired cases' objects and logs
the cleanup. Pending evidence stays available for review. Decision records and
hashes remain after evidence removal.

Provider outages are treated as retryable screening failures and do not create
violation cases. Existing released-recording copyright reviews continue through
Identity Review. The reusable video uploader and web feed now also screen visual
content before uploading. Video screening samples frames; it does not inspect
every frame or establish that an entire video is safe.

## Profile loading

Profile details, stats, skills, genres, and portfolio queries start together.
The page becomes visible as soon as that core data is ready. Gig timelines,
bookmarks, playlists, and connections no longer block the initial profile.
Mobile follower/following lists load when their sheet is opened, eliminating
the two full-list Edge Function calls during every profile refresh. Existing
mobile caching remains, with duplicate-request bookkeeping corrected; web
requests ignore stale results after changing profiles.

## Deployment and verification

Apply `20260907180546_gig_history_and_upload_moderation.sql` once to the shared
MusikaLokal database. Identical copies are kept in both apps' migration folders.
It depends on the existing participant visibility and `staff_can_edit_gig`
functions. Deploy the updated `upload-safety-screen` function with its shared
`_shared/uploadModeration.ts`, and `admin-reports-management` from `web/supabase`.
Then release the mobile/web clients together. Existing AI provider secrets are
used; there are no new external services or secrets to configure.

Run `npm run test:workflows` from the repository root. The tests use an isolated
PGlite database for migrations, role access, history grouping, restriction
enforcement, review versioning, and transactional audit/notification rollback.
The Edge Function tests mock AI, authentication, and Storage and exercise the
actual screening handler, evidence hashing, retries, provider failures, and
private evidence capture. They do not call the live database or AI providers.

Local verification also includes TypeScript checks for both apps and the changed
Edge Functions, targeted lint, and an Expo production web export. All 17 workflow
tests pass.

On September 8, 2026 (Asia/Manila), the migration was applied to MusikaLokal
(`aefldxegsvzecshlayza`) through a project-scoped MCP connection using the root
`.env` credentials explicitly. The terminal's inherited token and the default
MCP connection refer to a different project, so they must not be used for this
deployment. The local migration filenames match the live migration version.

Deployed Edge Functions: `upload-safety-screen` version 58 and
`admin-reports-management` version 53, both ACTIVE. Live checks confirmed the
private quarantine bucket, moderation table RLS, restricted review permissions,
authenticated history access, and HTTP 401 responses without authentication.
Read-only checks with representative existing organizer and applicant records
confirmed complete applicant counts and no private application fields in history.

Deployment scope is Supabase only, as requested. The updated web and mobile
clients remain in the workspace; no Vercel deployment or app release was made.
Signed-in browser testing remains unverified because no browser connection is
available in this session.
