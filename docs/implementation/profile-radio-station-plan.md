# Profile-First Radio Station Plan

This document defines the implementation plan for moving the radio-station experience onto the profile page instead of treating it as a separate discovery-first surface.

## Goal

Make the artist or producer profile the main home for station identity, station management, and visitor discovery.

The profile should present a station as an extension of the user's playlist presence:

- owners create and manage their station from their own profile
- visitors discover a user's station while viewing that user's profile
- playlists remain the underlying content source for station rotation

## Product Decision

The station should live inside the existing Playlists tab in [mobile/app/profile.tsx](../../mobile/app/profile.tsx), not as a new top-level tab and not as a new bottom-navigation destination.

For the first release:

- show one primary station per profile in the UI
- place the station module above the playlist list inside the Playlists tab
- keep playlist creation and station creation as separate actions
- route station viewing and management through the existing station detail page

## Why Profile Is The Right Surface

- A station is part of an artist or producer identity, similar to playlists, media, and public profile information.
- Visitors already expect music-related assets to appear on the profile.
- The current Playlists tab is the most natural place to group playlists and station controls without adding another navigation layer.
- This keeps the bottom navigation stable and avoids adding a discovery surface before the station UX is complete.

## Current Foundations

Existing frontend surfaces:

- [mobile/app/profile.tsx](../../mobile/app/profile.tsx): already has a Playlists tab and playlist fetch flow
- [mobile/app/create_playlist.tsx](../../mobile/app/create_playlist.tsx): existing playlist creation and editing flow
- [mobile/app/playlist_details.tsx](../../mobile/app/playlist_details.tsx): existing playlist detail flow
- [mobile/app/station_details.tsx](../../mobile/app/station_details.tsx): existing station detail page

Existing backend actions in [mobile/supabase/functions/manage-playlists/index.ts](../../mobile/supabase/functions/manage-playlists/index.ts):

- `create_station`
- `update_station`
- `get_station_details`
- `list_my_stations`
- `browse_stations`
- `add_station_slot`
- `remove_station_slot`

## Current Gaps

### 1. Profile cannot fetch another user's station yet

The profile page can already fetch another user's playlists, but the station API only exposes `list_my_stations` for the signed-in owner and `browse_stations` for broad discovery.

Required backend addition:

- add a read action such as `get_user_station` or `list_user_stations` that accepts a target user id

### 2. Station details data contract is inconsistent

The current UI in [mobile/app/station_details.tsx](../../mobile/app/station_details.tsx) expects fields that do not line up cleanly with the current function payload from [mobile/supabase/functions/manage-playlists/index.ts](../../mobile/supabase/functions/manage-playlists/index.ts).

Examples to normalize:

- `owner_id` versus `creator_id`
- `cover_url` versus `cover_image_url`
- `status` versus `is_active` plus schedule-derived state
- flattened slot fields versus nested playlist payloads

This should be fixed before the profile module is shipped.

### 3. Owner management is still incomplete

The station detail page already shows a Manage Station button, but the owner workflow is still a placeholder.

Required owner actions:

- create a station
- edit station metadata
- add one of the owner's playlists into station rotation
- remove a playlist slot from rotation

## Proposed User Flow

### Owner flow

1. Owner opens [mobile/app/profile.tsx](../../mobile/app/profile.tsx).
2. Owner switches to the Playlists tab.
3. If no station exists, show a `Create Station` card above the playlist list.
4. Owner creates a station.
5. After creation, route to [mobile/app/station_details.tsx](../../mobile/app/station_details.tsx).
6. Owner adds existing playlists into the station rotation.
7. Profile Playlists tab now shows the station summary card above the playlists list.

### Visitor flow

1. Visitor opens another user's profile.
2. Visitor switches to the Playlists tab.
3. If the user has a public active station, show a station summary card above the playlist list.
4. Visitor taps `Open Station`.
5. Route to [mobile/app/station_details.tsx](../../mobile/app/station_details.tsx) in read-only mode.

## Proposed Profile Layout

Inside the Playlists tab in [mobile/app/profile.tsx](../../mobile/app/profile.tsx):

1. Station module
2. Playlist creation button for the owner
3. Playlist list

Recommended states:

### Owner with no station

- show a featured empty-state card
- primary CTA: `Create Station`
- helper text: explain that stations are built from existing playlists

### Owner with a station

- show station name, genre, active state, and playlist slot count
- primary CTA: `Manage Station`
- secondary CTA: `Add Playlist To Station` if the owner already has playlists

### Visitor viewing a station-enabled profile

- show station name, genre, creator identity, and slot count
- primary CTA: `Open Station`

### Visitor viewing a profile without a station

- render no station module
- keep the playlist list as the first visible content in the tab

## Implementation Slices

### Slice 1. Normalize the backend contract

Update [mobile/supabase/functions/manage-playlists/index.ts](../../mobile/supabase/functions/manage-playlists/index.ts) so the station payload is easier for the UI to consume.

Tasks:

- add `get_user_station` or `list_user_stations`
- normalize station detail payload fields for the screen
- include enough slot summary data for profile-card rendering
- keep owner-only mutation actions unchanged

Expected outcome:

- profile and station detail screens can consume one predictable station shape

### Slice 2. Fix the station detail screen

Update [mobile/app/station_details.tsx](../../mobile/app/station_details.tsx).

Tasks:

- align field names with the normalized backend response
- support owner and visitor modes cleanly
- show playlist slots using the nested playlist data returned by the function
- replace placeholder owner actions with real management actions or clear next-step entry points

Expected outcome:

- station details becomes the canonical station destination instead of a partial stub

### Slice 3. Add station state to the profile page

Update [mobile/app/profile.tsx](../../mobile/app/profile.tsx).

Tasks:

- add station state and loading state near the existing playlist state
- fetch station data alongside playlists when the profile refreshes
- render the station summary card above playlists
- gate owner-only actions behind the existing ownership and guest checks

Expected outcome:

- the Playlists tab becomes the single profile surface for station plus playlist content

### Slice 4. Add the station creation entry point

Add a dedicated creation flow modeled after [mobile/app/create_playlist.tsx](../../mobile/app/create_playlist.tsx).

Recommended new route:

- [mobile/app/create_station.tsx](../../mobile/app/create_station.tsx)

Tasks:

- collect name, description, genre, and optional cover image later
- call `create_station`
- redirect to [mobile/app/station_details.tsx](../../mobile/app/station_details.tsx) after success

Expected outcome:

- owners can create a station directly from the profile without overloading the profile page with form logic

### Slice 5. Add slot management

Extend [mobile/app/station_details.tsx](../../mobile/app/station_details.tsx) using the existing backend mutation actions.

Tasks:

- list the owner's playlists for quick attachment
- call `add_station_slot`
- call `remove_station_slot`
- refresh the station view after each mutation

Expected outcome:

- owners can manage station rotation from the station page without needing a second management screen

### Slice 6. Optional web parity

After the mobile flow is stable, mirror the same pattern in the Expo web client.

Primary web files:

- [web/app/profile.tsx](../../web/app/profile.tsx)
- [web/app/station_details.tsx](../../web/app/station_details.tsx)

## File Impact Summary

Core files for the mobile-first release:

- [mobile/app/profile.tsx](../../mobile/app/profile.tsx)
- [mobile/app/station_details.tsx](../../mobile/app/station_details.tsx)
- [mobile/app/create_station.tsx](../../mobile/app/create_station.tsx)
- [mobile/supabase/functions/manage-playlists/index.ts](../../mobile/supabase/functions/manage-playlists/index.ts)

Supporting docs to keep aligned:

- [SYSTEM_ARCHITECTURE.md](../../SYSTEM_ARCHITECTURE.md)
- [docs/implementation/README.md](./README.md)

## Validation Checklist

1. Owner without a station sees `Create Station` in the Playlists tab.
2. Owner can create a station and is redirected to station details.
3. Owner can add a playlist slot and see it appear in station details.
4. Owner can remove a playlist slot and see the list refresh.
5. Visitor can see a public station on another user's profile.
6. Visitor cannot see owner-only station controls.
7. Playlists still render correctly when no station exists.
8. Guest-mode profile behavior stays unchanged.

## Documentation Follow-Up

The implementation and architecture docs should stay consistent with the actual backend naming.

Current note:

- implementation code currently uses `stations` and `station_playlist_slots`
- some documentation still refers to `radio_stations` and `radio_station_slots`

When the profile-first station flow is implemented, update the documentation so the naming matches the live schema and functions.