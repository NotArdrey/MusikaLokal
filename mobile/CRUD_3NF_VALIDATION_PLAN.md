# CRUD Validation Plan After 3NF Contract

## Scope
- Validate end-to-end CRUD behavior after 3NF contract migrations on MCP.
- Cover app flows, Supabase RLS, RPCs, and compatibility views.

## 1) Inventory CRUD entry points
- Source of truth: `app/**`, `src/**` Supabase calls.
- Key modules:
  - Chat: `conversations`, `conversation_participants`, `messages`, `message_reactions`, `conversations_display_projection`
  - Listings: `gigs`, `groups`, `studios`, and `*_with_stats` compatibility views
  - Booking + subscription + wallet modules
  - Deletion RPCs: `delete_gig_safely`, `delete_group_safely`, `delete_studio_safely`

## 2) Schema impact matrix
- High-risk contracted columns removed:
  - `conversations.participant_1`, `conversations.participant_2`
  - `conversations.group_name`, `conversations.group_avatar_url`
  - legacy availability/slots JSON columns in `gigs`, `groups`, `studios`
- Replacement contracts:
  - Participants: `conversation_participants`
  - Group display fields: `conversations_display_projection`
  - Availability/slots: normalized tables + projection views

## 3) DB-level smoke suite
- Use: `scripts/20260223_crud_3nf_smoke_suite.sql`
- Checks included:
  - No base-table legacy columns remain
  - No stale policy/function references to removed columns
  - Required normalized tables/views/functions exist
  - Exception ledger is complete for intentional JSONB payloads

## 4) App-level CRUD tests
- Chat
  - Create 1-on-1 conversation, send message, react, read updates
  - Create/open group chat, verify participant and display behavior
- Listings
  - Create/edit/delete Gig, Group, Studio
  - Verify read views (`*_with_stats`) render expected fields
- Booking/wallet/subscription
  - Create/update bookings and wallet reads
- Notifications
  - Leadership transfer accept/decline paths

## 5) RLS policy validation
- For each role (`owner/member/other`):
  - Positive CRUD path works
  - Forbidden path returns permission denial
- Focus tables: `conversations`, `conversation_participants`, `messages`, `message_reactions`

## 6) Projection compatibility validation
- Validate app-facing projection fields still exist and are populated:
  - `conversations_display_projection`
  - `gigs_availability_projection`, `groups_availability_projection`, `studios_availability_projection`
  - `gigs_slots_filled_projection`

## 7) Staged rollback drills
- Dry-run rollback script checks in staging first
- Confirm ability to restore app read paths without data loss

## 8) Release gates
- Gate A: DB smoke suite all PASS
- Gate B: Chat/listings/bookings manual CRUD scenarios all PASS
- Gate C: No critical errors in client logs during smoke run
- Gate D: RLS denial/allow matrix matches expected behavior

## Current status update
- Fixed a concrete post-3NF break in chat CRUD by refactoring app logic to normalized participants + projection display fields:
  - `src/hooks/useChat.ts`
  - `app/chat.tsx`
  - `src/components/UserSearchModal.tsx`