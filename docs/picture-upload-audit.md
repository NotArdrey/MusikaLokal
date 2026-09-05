# Picture upload audit — 2026-09-06

Reviewed both mobile and web picture upload entry points, their shared helpers,
save/removal handlers, relevant Edge Functions, and the live storage bucket,
policy, function, and trigger configuration.

| Feature | Storage path reviewed | Result |
| --- | --- | --- |
| Gig, studio and group photos; production logos | `ImageUploader` → `uploadStorageObject` → `listings` | Uses the Storage API. Gig SQL cleanup was fixed in migration `20260906120000`. |
| Marketplace pictures and admin listing pictures | Shared image uploader → `listings` | Uses the Storage API; no direct storage-table deletion. |
| Profile avatars | Edit profile → shared upload helper → `avatars` | Uses the Storage API. Added uploader-only overwrite/delete permissions. |
| Profile portfolio pictures | Profile screen → `portfolio` | Uses the Storage API. Added uploader-only overwrite/delete permissions; cleanup exceptions no longer misreport a completed profile removal. |
| Playlist and track covers | Shared image uploader → `playlist-assets` | Uses the Storage API; existing upload/update/delete policies cover the user's folder. |
| Feed pictures and thumbnails | Feed upload handler → `post-media` | Uses the Storage API. Added uploader-only overwrite permission for upload retries; an owner delete policy already exists. |
| Chat picture attachments | Chat upload handler → `chat-attachments` | Uses the Storage API. Image MIME types and bucket existence checked. |
| Studio instrument pictures and supporting image files | Shared upload helper → `listings` / `documents` | Uses the Storage API. Added uploader-only overwrite/delete permissions. |
| Signup identity pictures | Manual identity review Edge Function → private `identity-manual` | Uses the Storage API with server credentials. Private bucket permissions were not changed. |

The live database had no remaining application functions directly deleting from
storage tables, and no application-owned triggers on storage tables. Historical
migrations/schema exports still contain old definitions; the corrective
migrations supersede them.

## Changes

Migration `20260906130000`, mirrored under both apps and applied to the linked
database, permits Storage API deletion of the uploader's files in `avatars`,
`portfolio`, `listings`, and `documents`. It also permits the uploader to overwrite
their existing files in those buckets and `post-media`. Ownership is checked with
`owner_id`, because listing paths can begin with a listing ID rather than a user
ID. Other users' files and files without an uploader are excluded.

Both profile screens now use the shared cleanup helper after successfully
removing the database reference. The profile UI still updates successfully if
subsequent storage cleanup returns an error or throws a network exception.

## Verification

- `node --test scripts/test-storage-cleanup.cjs scripts/test-profile-media-removal.cjs`: 14 passing tests, including the actual profile removal handlers.
- `scripts/test-media-storage-policies.sql`: installed policy expressions checked for the uploader, another user, anonymous callers, unowned files, and excluded private buckets in rollback-only transactions.
- Both apps pass TypeScript checks; targeted lint reports no errors.
- Live file upload/overwrite/download/removal was attempted with `scripts/test-picture-storage-api.mjs`, but credential retrieval returned HTTP 403 before any files were created. Device/browser picker flows and actual Storage API round trips were therefore not verified.

The optional API smoke script requires an authorized `SUPABASE_SERVICE_ROLE_KEY`
or a management token permitted to retrieve that key. It creates one unreferenced
test PNG per image bucket and removes only those exact paths. It uses service
credentials, so client ownership policies are tested separately by the SQL suite.
