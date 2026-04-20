# Session Bug Tracker

This file is based on the visible Copilot session list plus the saved local session transcripts and repository notes that were available on 2026-04-20.

If a full transcript was available, the entry uses exact start and end timestamps from that session. If only the sidebar title was visible, the entry is marked as inferred and unknown fields stay explicitly unknown.

## Bugs

### Follow Feature Backend Drift
- Session title: Troubleshooting Follow Feature Issues
- Description: Follow and unfollow could fail because the live Supabase project had drifted behind the local code. The app expected the follows and social-feed tables plus a deployed `manage-social-feed` Edge Function, while the live backend was missing those pieces. The client side also risked reporting success even when the function returned an error.
- When start: 2026-04-20 03:02 UTC
- When end: Not fully recovered from the saved transcript excerpt
- Status: In progress
- Solution: Apply the missing producer-network and social-feed migrations, deploy the `manage-social-feed` function, and harden follow handlers so they surface backend errors instead of assuming success.

### AI Suggest Shortcut Still Showing In Feed
- Session title: Removing AI Suggestion Icon from Feed Page
- Description: The mobile feed still rendered a dedicated AI Suggest shortcut/button in the feed shortcut row even though it should not appear there.
- When start: 2026-04-20 01:40 UTC
- When end: 2026-04-20 01:42 UTC
- Status: Done
- Solution: Remove the feed shortcut constant and the shortcut-row render block from the mobile feed screen, then delete the unused related styles.

### Feed Card Layout Needed Visual Cleanup
- Session title: Improving Card Design on Feed Page
- Description: The feed cards needed stronger spacing, rounded corners, shadow, and better media layout so they would read like real cards instead of flat content blocks.
- When start: 2026-04-20 01:43 UTC
- When end: 2026-04-20 01:43 UTC
- Status: Done
- Solution: Add card margins, border radius, elevation or shadow, cleaner media spacing, and tighter internal layout styling in the feed card styles.

### Notification Toast Popup Reliability Issue
- Session title: Fixing Notification Toast Popup Issue
- Description: The in-app notification toast flow could miss inserts on reconnect, app resume, or foreground transitions, and it could also mark invalid payloads as already shown.
- When start: 20 hours ago (from visible session list)
- When end: Unknown from the available logs
- Status: To do
- Solution: Keep the root Realtime notification channel resilient, backfill recent unread notifications on subscribe and app foreground, dedupe by notification ID, and validate the toast payload before registering it as shown.

### Endless Loop In Navigation Or Guard Flow
- Session title: Endless loop troubleshooting
- Description: Likely redirect or render-loop behavior caused by a navigation guard deciding too early while async role or auth resolution was still incomplete.
- When start: 1 day ago (from visible session list)
- When end: Unknown from the available logs
- Status: To do
- Solution: Add a dedicated `roleResolved` or guard-ready flag, keep protected routes blocked until the async role lookup finishes, and avoid redirect decisions based on partially resolved auth state.

### Feed Page Loading Stall Or Empty State
- Session title: Feed page loading issue
- Description: The feed could appear stuck, blank, or constantly loading because cached state was cleared too early, readiness was inferred too loosely, or the auth-role race delayed the real fetch path.
- When start: 1 day ago (from visible session list)
- When end: Unknown from the available logs
- Status: To do
- Solution: Preserve cached feed state on remount, gate fresh fetches on `roleResolved`, track LLM readiness from the real ready signal, and avoid clearing visible results before background rerank completes.

### Feed Redirection And Navbar Wiring Issue
- Session title: Feed Page Redirection and Navbar Integration Issues
- Description: The feed route likely behaved like a secondary route instead of a main-navigation surface, which can produce redirect confusion, wrong header behavior, or navbar state drift.
- When start: 1 day ago (from visible session list)
- When end: Unknown from the available logs
- Status: To do
- Solution: Align the feed route with the main navigation definitions, make header and back-button logic route-aware, and ensure navbar state and redirect rules use the same source of truth.

### Bookings Deals Tab Is Structurally Confusing
- Session title: Understanding the Deals Tab in Bookings Page
- Description: This is more of a product-structure issue than a pure code bug. The bookings screen mixes actual bookings with commercial deal proposals, which makes the Deals tab feel unclear.
- When start: 2026-04-20 04:53 UTC
- When end: 2026-04-20 05:11 UTC
- Status: Open
- Solution: Simplify the tab model so `Pending` contains anything waiting for user action, `Upcoming`, `Ongoing`, and `Review` contain only actual bookings, and `History` contains closed bookings and closed deals.

## Sessions Not Logged As Bugs

These visible sessions looked like clarification, planning, or implementation-reference work rather than direct bug reports, so they are not listed above as bugs:

- Implementation Request Details Needed
- Music Platform Features and Functionality Overview
- File reading and MCP server implementation
- File Reading and Implementation Guidance
- System Integration Plan for Music Platform Features