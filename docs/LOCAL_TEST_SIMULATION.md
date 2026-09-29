# MusikaLokal local/test simulation data

This fixture set is development-only. The seed refuses every non-local Supabase host unless both the explicit remote-test flag and confirmation environment variable are supplied. Cleanup always refuses non-local hosts.

## Audited implementation differences

- The fixture contains musician accounts only. Because `gigs.organizer_id` is required, the test gig is attached to Andrea's profile as its database owner; no separate venue-owner account is created.
- Solo/duo/band are application/group types, not separate profile tables.
- Skills and genres are text rows in `profile_skills` and `profile_genres`; there are no instrument/genre ID foreign keys.
- Gig slots are the `slots` object inside normalized `gig_requirements` rows. There is no `gig_slots` table.
- Current group applications use one private `application-cvs` object and one `gig_application_members` row per linked member. The shared performance video remains on `gig_applications.video_url`.
- A non-owner can initiate a group application. The seed's Midnight Avenue snapshot is initiated by Lucas and records completed leader approval by Ethan.
- Missing-member coverage is tested without inserting a constraint-breaking or workflow-impossible database row.
- AI results are not fabricated. Consented applications are eligible for the existing review queue; actual model output requires the Edge Function and provider configuration.
- The application evidence vocabulary is `supported`, `not_supported`, and `unclear`; missing evidence maps to `unclear`, not failure.

## Run

1. Start a local Supabase stack and apply all migrations, including `20260928150000_add_group_application_member_cvs.sql` and `20260928151000_preserve_group_application_member_history.sql`.
2. Copy `.env.local-test.example` to `.env.local-test` and add the local service-role key.
3. Install Playwright Chromium if needed: `npx playwright install chromium`.
4. Run `npm run fixtures:videos`, `npm run seed:local-test`, then `npm run test:local-simulation`.
5. Reset with `npm run cleanup:local-test`.

The seed uploads every image/video/CV before inserting its database reference. Public images and videos use the same `avatars`, `listings`, and `documents` buckets as the UI. Member CVs use the private `application-cvs` bucket. Schema preflight checks current columns before any inserts.

Auth/profile UUIDs are created by Supabase; groups, gig, and applications use stable UUIDs declared in `scripts/local-test-data/fixtures.mjs`. Every user receives private `identity-manual` front/back/selfie image paths and a `manual_identity_reviews` row in `PENDING_REVIEW`. The cards are prominently marked `TEST FIXTURE — NOT VALID IDENTIFICATION`; the seed deliberately leaves `is_verified=false` and never creates an approval claim.
