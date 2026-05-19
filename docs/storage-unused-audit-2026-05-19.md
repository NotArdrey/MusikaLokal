# Supabase Storage Unused Asset Audit

Date: 2026-05-19
Project: Musika Lokal

## Cleanup Result

Completed at: 2026-05-19T03:22:24Z

Deleted through Supabase Storage API:

| Bucket | Deleted objects | Deleted bytes |
| --- | ---: | ---: |
| documents | 283 | 833,482,953 |
| listings | 300 | 125,590,380 |
| avatars | 26 | 12,998,673 |
| chat-attachments | 9 | 6,540,943 |
| portfolio | 20 | 2,861,399 |
| post-media | 1 | 512,018 |

Total deleted: 639 objects, 981,986,366 bytes.

Skipped/protected:

- `identity-manual`, because identity documents may need retention review.
- `public-assets`, because `verification-v2.html` is referenced by the verification redirect Edge Function.

Live storage after cleanup:

| Bucket | Remaining objects | Remaining size |
| --- | ---: | ---: |
| identity-manual | 52 | 40 MB |
| documents | 25 | 26 MB |
| listings | 25 | 9657 kB |
| avatars | 4 | 8428 kB |
| post-media | 4 | 2227 kB |
| portfolio | 3 | 1050 kB |
| public-assets | 2 | 6096 bytes |
| chat-attachments | 0 | 0 bytes |

## Scope

Compared live `storage.objects` against live public database rows that can reference uploaded files:

- listings, profile, portfolio, chat, post, product, playlist, station, studio, group, gig, booking, notification, and manual identity tables
- text/json/array rows were scanned for exact object names, bucket/path values, public object URLs, signed object URLs, and URL-encoded spaces
- code references were checked for known storage-only assets such as verification redirect pages

Initial audit did not delete storage objects. The cleanup above was performed afterward using `scripts/cleanup-unused-storage.mjs`.

## Bucket Summary

| Bucket | Total | DB-unreferenced | Candidate size | Notes |
| --- | ---: | ---: | ---: | --- |
| documents | 308 | 302 | 815 MB | Largest cleanup opportunity. Mostly old performance videos, contracts, CV/application PDFs, business permits, and playlist audio not referenced by current rows. |
| listings | 325 | 318 | 124 MB | Mostly `temp/...` images; `listings/temp` alone is about 98 MB unreferenced. |
| identity-manual | 52 | 52 | 40 MB | Current `manual_identity_reviews` row has null image paths, so these are orphan candidates. Review before deleting because identity evidence may have retention requirements. |
| avatars | 30 | 26 | 12 MB | Current profile/root avatars account for the referenced objects; older user folders look orphaned. |
| chat-attachments | 9 | 9 | 6.2 MB | `messages.attachment_url` is currently null for all messages, so these uploaded files are orphan candidates. |
| portfolio | 23 | 20 | 2.7 MB | Only 3 current portfolio URLs reference storage objects. |
| post-media | 5 | 1 | 500 KB | 4 are referenced by `post_media`; 1 is not. |
| public-assets | 2 | 2 | 6 KB | Not DB-referenced, but `verification-v2.html` is used by the verification redirect code. Keep this bucket. |

Total DB-unreferenced candidates: about 1000 MB. Practical safe cleanup after exclusions is about 994 MB if `public-assets` is kept.

## Biggest Candidate Groups

| Bucket / folder | Candidate size | Count | Created range |
| --- | ---: | ---: | --- |
| `documents/6455083b-6e13-4f5c-a10f-24fdb5bc0961` | 283 MB | 19 | 2026-04-29 to 2026-05-04 |
| `documents/contracts` | 129 MB | 121 | 2026-01-28 to 2026-05-18 |
| `listings/temp` | 98 MB | 237 | 2026-01-28 to 2026-05-18 |
| `documents/6ef09c0f-790e-4247-bdcf-8717591f966b` | 85 MB | 9 | 2026-03-10 to 2026-05-02 |
| `documents/14d2e916-8d1c-4c04-9877-7ccd9bea6149` | 72 MB | 42 | 2026-01-28 to 2026-04-24 |
| `documents/00000000-0000-0000-0000-000000000010` | 52 MB | 15 | 2026-04-21 to 2026-04-22 |
| `documents/business-permits` | 21 MB | 43 | 2026-02-05 to 2026-04-16 |
| `documents/playlist-audio` | 12 MB | 6 | 2026-04-21 to 2026-05-13 |

## Largest Individual Candidates

| Bucket | Path | Size |
| --- | --- | ---: |
| documents | `6455083b-6e13-4f5c-a10f-24fdb5bc0961/performance-videos/1777875351794_video.mp4` | 34 MB |
| documents | `6455083b-6e13-4f5c-a10f-24fdb5bc0961/performance-videos/1777481805064_video.mp4` | 34 MB |
| documents | `6455083b-6e13-4f5c-a10f-24fdb5bc0961/performance-videos/1777876013831_video.mp4` | 34 MB |
| documents | `6455083b-6e13-4f5c-a10f-24fdb5bc0961/performance-videos/1777877277617_video.mp4` | 34 MB |
| documents | `6455083b-6e13-4f5c-a10f-24fdb5bc0961/performance-videos/1777873285886_video.mp4` | 34 MB |
| documents | `6455083b-6e13-4f5c-a10f-24fdb5bc0961/performance-videos/1777877381533_video.mp4` | 34 MB |
| documents | `6ef09c0f-790e-4247-bdcf-8717591f966b/performance-videos/1777739869293_video.mp4` | 24 MB |
| documents | `bbfd86e2-3a7b-4a1b-94fe-9e6715d5a69b/performance-videos/1777804458809_video.mp4` | 24 MB |
| documents | `6540160a-274e-4503-a553-ecb2f709325c/performance-videos/1777875818259_video.mp4` | 24 MB |
| documents | `6455083b-6e13-4f5c-a10f-24fdb5bc0961/performance-videos/1777874056905_video.mp4` | 18 MB |

## Keep / Review Before Delete

- Keep `public-assets/verification-v2.html`; it is referenced by the verification redirect Edge Function.
- Review `identity-manual` before deleting. It is unreferenced by the current database, but identity documents may need retention/legal handling.
- Review `documents/playlist-audio`; current playlist rows use external URLs, but this folder is tied to the playlist upload feature.
- `test-upload-1769646632975.txt` in `listings` is safe-looking test residue.
- `listings/temp` and duplicated old `documents/performance-videos` are the most likely quick wins after a spot check.
