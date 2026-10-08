# Progressive slowdown inspection

Date: 2026-10-07 (Asia/Manila).

Follow-up: the user authorized source fixes after this inspection. Their implementation and verification are recorded in [session-performance-fixes-2026-10-07.md](session-performance-fixes-2026-10-07.md). The findings below describe the original inspected behavior; baseline evidence is preserved separately.

The current source contains several mechanisms that increase work or retained memory as a session grows. The strongest match for slower navigation after scrolling is the feed: every loaded page remains cached, and a refresh requests every retained page again. Repeated message listeners on retained screens and detail caches without eviction add further pressure.

These behaviors were reproduced with the current source and synthetic data. Their contribution to the reported phone slowdown is a diagnosis, not a measured device result. No Android device was connected when `adb devices -l` was checked. The installed APK's version, frame rate, native heap, CPU usage, network latency, and thermal state have not been measured.

The inspection focused on `mobile/`, which implements the user flows in the open bug plan. Selected shared and admin web code was also inspected. Existing working-tree changes were preserved. No app implementation, package configuration, backend, or remote user records were changed.

## Findings

### 1. Feed refresh cost increases with scrolling

Source: `mobile/src/data/hooks.ts:193`, `mobile/app/(tabs)/feed.tsx:3912`, `mobile/app/(tabs)/feed.tsx:5224`, and `mobile/app/(tabs)/feed.tsx:5549`.

The feed uses an infinite query without a `maxPages` setting. Each successful pagination request adds another retained page. Returning to Home forces a refresh; the app calls the infinite query's `refetch()` and reconstructs the visible snapshot from all pages. The installed TanStack Query core, version 5.102.8, sequentially fetches the retained pages during this refresh.

The reproduction executed the actual feed hook's query function/options with the installed query core. Its API responses were mocked; no production request was made.

| Loaded pages | Retained posts, at 12 per page | Requests for one refresh |
| --- | ---: | ---: |
| 1 | 12 | 1 |
| 10 | 120 | 10 |
| 50 | 600 | 50 |

These numbers count feed-page requests only. The recommendation request can add further work. They do not represent measured network time or a 50-fold increase in frame-rendering time. Real content ending sooner can shorten a refresh.

The feed's `FlatList` is virtualized and memoized. That limits mounted cards, but the full query pages and normalized feed arrays remain retained. Shop, Search, and Notifications also use infinite queries without a page cap in `mobile/src/data/hooks.ts`; the feed was the flow exercised in the runtime reproduction.

### 2. Each mounted header adds another message listener

Source: `mobile/src/components/Header.tsx:235` and `mobile/src/components/Header.tsx:288`; retained tab configuration: `mobile/app/(tabs)/_layout.tsx:33`; preloading: `mobile/src/components/navbar.tsx:438`.

Every eligible signed-in, non-fan Header creates its own subscription to message changes. A delivered event calls `checkUnreadChats()`, which first reads conversation membership, then reads the unread count when memberships exist. The effect does not depend on screen focus.

The tab navigator retains screens, and the navbar preloads routes. Render freezing does not remove the header's underlying subscription. The number of real mounted headers depends on the role and navigation path; five was a synthetic scenario, not a device observation.

Executing the actual effect and unread-check callback with mocked Supabase reads produced:

| Mounted headers | Message channels | Database reads for one delivered event |
| --- | ---: | ---: |
| 1 | 1 | 2 |
| 5 | 5 | 10 |

Every channel was removed when the mocked headers unmounted. The observed issue is duplicated work while screens remain mounted; this reproduction did not find a missing unmount cleanup. The callbacks have no debounce or shared in-flight request guard.

### 3. Detail and screen caches retain previously viewed records

Source: `mobile/src/utils/listingDetailsCache.ts:9`, `mobile/src/components/PostDetailsModal.tsx:182`, `mobile/src/components/ProductionTeamDetailsSheet.tsx:100`, `mobile/src/components/BookingDetailsSheet.tsx:37`, and `mobile/src/utils/screenCache.ts:9`.

Several module-level Maps have no entry or byte limit. The 60-second TTL in the detail flows determines whether to fetch fresh data; it does not remove older entries automatically. Previously opened records can remain in memory until explicit invalidation or app-process exit.

The actual listing cache retained all **1,000 distinct entries** seeded with timestamps 24 hours old. Its getter still returned an expired entry. Consumers separately decide whether that entry is fresh enough to use, but the record remains retained either way.

The screen cache deletes expired data only when that key is read again or explicitly invalidated. After writing 300 distinct synthetic chat keys and advancing the mocked clock by 24 hours, all **300 memory entries and 300 storage entries** remained. Reading one expired key removed that key, leaving 299 in each store.

These are entry-retention measurements, not measured megabytes of app heap. Post/production/booking caches were checked in source rather than populated in the runtime reproduction. `web/src/admin/cache.ts` has the same deletion-on-read pattern without a cache-size limit; its impact on an admin browsing session remains unprofiled.

### 4. Broad realtime invalidation amplifies refresh work

Source: `mobile/src/data/realtime.ts:20` and `mobile/src/data/realtime.ts:184`; feed response: `mobile/app/(tabs)/feed.tsx:5635`.

The root invalidation channel registers changes on **38 tables**, with **zero row filters**. An event on another profile that is visible to the subscriber marks seven query prefixes/keys stale: CV tasks, bookings, details, feed, home, search, and wallet. The runtime reproduction executed the actual hook and confirmed those seven invalidations.

Supabase authorization still determines which changes a subscriber can receive; this finding does not mean every private database event is delivered to every user.

The global handler already batches events for 600 milliseconds, and the feed adds a 500-millisecond refresh debounce. Nevertheless, a delivered batch can still trigger the growing feed refresh described above. Bookings and Shop queries are enabled according to authentication/role rather than screen focus, so mounted inactive tabs can also refetch eligible invalidated queries. The gig applicant-count and featured-performer hooks separately subscribe to gig-application changes and issue RPC reads without a debounce or in-flight guard (`mobile/src/hooks/useGigApplicantCounts.ts`, `mobile/src/hooks/useGigFeaturedPerformers.ts`). Those extra RPC bursts were identified in source, not measured against a live database.

### 5. Failed images can retry indefinitely

Source: `mobile/src/components/CachedImage.tsx:120` and `web/src/components/CachedImage.tsx`.

When both the primary image and its distinct fallback fail, the error handler switches from primary to fallback, then from fallback back to primary. It has no record of attempted URLs and never reaches its final null state for this case.

Executing each client's actual `onError` expression produced 20 alternating callbacks without stopping. With only one failed primary and no fallback, the handler stopped after one callback. The defect therefore requires the failing fallback path; it does not affect every loaded image.

On a device where errors are delivered repeatedly, this can sustain image loading and state updates. Actual retry frequency, HTTP request count, and the presence of broken image pairs in the user's session were not measured.

### 6. Chat reads and rewrites the entire loaded history

Source: `mobile/src/hooks/useChat.ts:203`, `mobile/src/hooks/useChat.ts:917`, `mobile/src/hooks/useChat.ts:1020`, and `mobile/src/utils/screenCache.ts:84`.

The initial message query has no `limit()` or `range()` and requests messages, senders, and reactions in ascending order. This can request the entire accessible conversation, subject to the server's response-row cap. There is no older-message pagination in this hook.

Each incoming/update event scans and sorts the loaded message array, then serializes that whole history for AsyncStorage. The reproduction ran the actual upsert/sort helpers and cache writer, updating one existing synthetic message with a 256-character body:

| Loaded messages | Messages serialized for one update | Serialized bytes |
| --- | ---: | ---: |
| 50 | 50 | 17,926 |
| 1,000 | 1,000 | 358,926 |

Byte counts describe the synthetic fixture only; real attachments, reactions, and sender objects change payload size. This is a stronger candidate when lag appears during long or busy chat sessions.

## Other checks and limits

The reviewed feed query-cache subscription, header channels, authentication presence/profile channels, and bookings focus-refresh timer have cleanup paths. The radio feed card has a one-second UI timer and a rotation timer tied to mount state rather than screen focus; these are additional retained-screen work, not a demonstrated timer leak. Native radio playback is intentionally allowed to continue outside its screen.

The feed's media viewer creates its video player only while opened and releases it on unmount. The inspection did not establish accumulated hidden video players as the cause. Release-versus-development build overhead, device memory pressure, backend query latency, and network behavior remain outside this offline evidence.

## Reproduction and evidence

Run from the repository root:

```powershell
node scripts/inspect-session-performance.mjs
```

The runner now executes the performance regression checks against the corrected source and writes a separate fixes evidence file. Supabase calls and storage operations are mocked; it makes zero production network requests. The original baseline JSON below remains unchanged.

- Runner: [inspect-session-performance.mjs](../scripts/inspect-session-performance.mjs)
- Evidence, including hashes of executed source files: [session-performance-2026-10-07.json](testing/session-performance-2026-10-07.json)
- Supabase subscription/cleanup API reference: [subscribe](https://supabase.com/docs/reference/javascript/subscribe), [removeChannel](https://supabase.com/docs/reference/javascript/removechannel).

Verification: the offline runner completed successfully, its assertions passed, and its JavaScript syntax check passed. App fixes, builds, deployment, and native performance acceptance were not performed as part of this inspection.
