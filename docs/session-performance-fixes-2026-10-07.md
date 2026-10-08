# Progressive slowdown fixes

Date: 2026-10-07 (Asia/Manila).

Client source fixes are implemented for the causes found in the [inspection](session-performance-inspection-2026-10-07.md). Existing working-tree bug fixes and the deleted `BUG_FIX_CHECKLIST.md` were preserved. No Supabase function, migration, permission, remote record, payment, or release was changed in this work.

| Area | Result |
| --- | --- |
| Feed refresh | Refresh fetches the newest page once instead of rereading every loaded page. Existing data survives a failed refresh. Older posts remain available by scrolling. Realtime feed refreshes are batched with a 15-second cooldown. |
| Retained screens | Header message/notification subscriptions follow navigation focus and clean up on blur, including frozen tabs. Activity/Shop query enablement reads a focus reference updated by navigation events, so inactive tabs stay stale without making background refresh requests. Returning refreshes stale content. Radio-card UI clocks also follow focus; native radio playback continues. |
| Memory caches | Listing/post/production/booking details are limited to 40 entries with expiry. Activity caches retain at most eight identities; sender profiles, staff access and prefetch bookkeeping are also bounded. |
| Persisted caches | Screen caches retain at most 40 memory entries and 80 stored entries, expire after five minutes and skip oversized records. Cleanup operates only on the screen-cache prefix. Public query persistence retains at most 40 queries, three pages each, within a character budget; inactive query garbage collection is five minutes. Login tokens and saved uploads remain intact. |
| Image failures | Each distinct image candidate is tried once. Exhausted fallbacks stop. Duplicate/late error callbacks cannot move a newer image back to an old source. Both mobile and retained web components are corrected. |
| Chat | Initial reads return the latest 50 messages. Earlier messages remain available through stable timestamp/ID pagination, including identical timestamps and PostgreSQL microsecond precision. Local/read/reaction updates preserve ordering. Coalesced cache writes retain 50 recent messages plus unresolved local sends, preserving an older failed message for retry. Delayed pages/sender reads are rejected after account/conversation changes or blur. |
| Realtime | Personal notification/payout/withdrawal/payment-history tables use the subscriber's user filter. Public listing invalidation is retained. Gig count/performer updates batch events, ignore identifiable unrelated gigs, serialize requests and detach on blur. |
| Admin web | Disposable memory and session-storage caches are capped at 40 records. Login/session storage outside the cache prefix is preserved. |

The active feed and chat lists retain the history explicitly loaded in that visit, preserving backward scrolling. Refresh/reentry starts from recent content, and persisted/offscreen caches are bounded. These changes do not impose a hard scrolling limit or delete server history.

## Verification

Run `npm run test:performance` from the repository root. The **19 performance checks** execute actual client hooks/handlers with mocked Supabase/storage, plus the installed TanStack Query core. They cover fallback termination, cache expiry/eviction, concurrent writes and delayed invalidation, storage failures, failed feed refreshes, continued pagination, frozen-screen behavior, event bursts, focus cleanup, timestamp ties, failed-message preservation, and account/conversation races.

Measured in these isolated checks:

- A feed with 50 loaded pages refreshes with **one page request**, retaining one fresh page; the next page remains loadable. A failed refresh preserves all previous data.
- A burst of 100 message events makes **one unread refresh, two database reads**, on the active header. Blur removes its channel.
- Adding 1,000 distinct listing entries retains **40**, which expire. Writing 300 screen-cache keys retains **40 in memory and 80 in storage**; unrelated tokens/uploads survive cleanup.
- Loading 1,000 chat messages persists **50 per write**. A burst of 100 updates causes **one coalesced write**, with the latest update present. Three keyset pages return all 150 same-timestamp fixture messages exactly once.

Evidence: [session-performance-fixes-2026-10-07.json](testing/session-performance-fixes-2026-10-07.json), including source hashes. The original baseline remains in [session-performance-2026-10-07.json](testing/session-performance-2026-10-07.json).

Additional validation: **182 bug-fix checks**, **66 radio checks**, and **74 related notification/group-action/authorization/image checks** passed; these suites overlap, so those counts are not a unique combined total. Both app TypeScript checks and `git diff --check` passed. The core performance hooks/helpers/header passed targeted ESLint. Larger screens/hooks retain existing findings: the affected-file comparison records 28 errors versus 30 at HEAD, with no increase in error count for any compared file. That comparison is retained in [session-performance-lint-2026-10-07.json](testing/session-performance-lint-2026-10-07.json). HEAD excludes earlier uncommitted bug fixes, so it is identified separately from this task's new-source checks.

## Release and device acceptance

These are source changes. A new mobile client release is required before an installed APK receives them. No APK was built or published in this work, and no Android device was connected for frame-rate/native-heap measurements.

Device acceptance should exercise extended feed scrolling and return/refresh; Activity/Shop freshness after tab switches; unread badges, chat pagination and retries; image failures; and radio background controls. Actual improvement on the affected phone remains to be measured. No backend deployment is required for these fixes; the retained web changes require the normal web release.
