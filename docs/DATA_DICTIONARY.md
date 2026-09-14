# MusikaLokal Data Dictionary

Last generated: 2026-09-12 (Asia/Manila)  
Coverage: `public` application tables reconstructed through migration `20260911120000_add_scoped_content_restrictions`.  
Inventory: **102 tables**, **1174 columns**, and **9 application-facing views**.

## Scope and provenance

This dictionary starts from the repository's catalog-derived production schema snapshot generated at `2026-05-19T13:28:53+08:00` and folds in all 232 version-controlled SQL migrations in filename order so schema additions not present in that snapshot are still represented. Supabase-managed schemas such as `auth`, `storage`, and `realtime` are intentionally excluded. View column definitions, functions, triggers, indexes, policies, and storage buckets are outside this column dictionary.

The linked production database could not be queried directly with the available project credentials, so this is a repository-derived contract rather than a live catalog dump. SQL built dynamically inside procedural blocks may require live verification. Column descriptions without explicit database comments are concise business interpretations based on names, constraints, foreign keys, migrations, and application usage.

Legend: **PK** = primary key; **FK** = foreign key; **UQ** = single-column unique constraint; “Required” reflects `NOT NULL` in the reconstructed DDL. RLS indicates whether row-level security was explicitly enabled in the parsed schema history.

## Table inventory

| Domain | Table | Purpose | Columns | RLS |
|---|---|---|---:|:---:|
| Identity & Profiles | [`address_verification_sessions`](#address-verification-sessions) | Stores address verification sessions records used by the MusikaLokal platform. | 25 | Yes |
| Moderation & Audit | [`audit_event_changes`](#audit-event-changes) | Stores audit event changes records used by the MusikaLokal platform. | 5 | Yes |
| Moderation & Audit | [`audit_events`](#audit-events) | General create, update, and delete audit event headers. | 13 | Yes |
| Listings & Bookings | [`booking_attendance_events`](#booking-attendance-events) | Event history for booking attendance. | 6 | Yes |
| Listings & Bookings | [`booking_cancellation_policies`](#booking-cancellation-policies) | Stores booking cancellation policies records used by the MusikaLokal platform. | 11 | Yes |
| Listings & Bookings | [`booking_holds`](#booking-holds) | Stores booking holds records used by the MusikaLokal platform. | 8 | Yes |
| Listings & Bookings | [`booking_incidents`](#booking-incidents) | Stores booking incidents records used by the MusikaLokal platform. | 16 | Yes |
| Listings & Bookings | [`booking_penalty_events`](#booking-penalty-events) | Event history for booking penalty. | 13 | Yes |
| Listings & Bookings | [`booking_requests`](#booking-requests) | Cross-entity invitations and applications, including group membership and production-team connections. | 10 | Yes |
| Messaging & Notifications | [`conversation_participants`](#conversation-participants) | Profiles participating in each conversation and their per-conversation state. | 8 | Yes |
| Messaging & Notifications | [`conversations`](#conversations) | Chat conversation containers; membership is normalized through conversation participants. | 9 | Yes |
| Platform Support | [`didit_webhook_events`](#didit-webhook-events) | Event history for didit webhook. | 6 | Yes |
| Messaging & Notifications | [`email_notifications`](#email-notifications) | Stores email notifications records used by the MusikaLokal platform. | 9 | Yes |
| Playlists & Radio | [`external_platform_links`](#external-platform-links) | Stores external platform links records used by the MusikaLokal platform. | 9 | Yes |
| Listings & Bookings | [`favorites`](#favorites) | Stores favorites records used by the MusikaLokal platform. | 8 | Yes |
| Social | [`feed_posts`](#feed-posts) | Social-feed posts authored by profiles, groups, or production teams. | 18 | Yes |
| Social | [`follows`](#follows) | Stores follows records used by the MusikaLokal platform. | 5 | Yes |
| Listings & Bookings | [`gig_application_ai_reviews`](#gig-application-ai-reviews) | Stores gig application ai reviews records used by the MusikaLokal platform. | 18 | Yes |
| Listings & Bookings | [`gig_application_recommendations`](#gig-application-recommendations) | Stores gig application recommendations records used by the MusikaLokal platform. | 17 | Yes |
| Listings & Bookings | [`gig_applications`](#gig-applications) | Applications from musicians, groups, or production teams to gigs, including acceptance and completion lifecycle. | 44 | Yes |
| Listings & Bookings | [`gig_availability_slots`](#gig-availability-slots) | Stores gig availability slots records used by the MusikaLokal platform. | 8 | Yes |
| Listings & Bookings | [`gig_deletion_audit`](#gig-deletion-audit) | Audit history for gig deletion operations. | 10 | Yes |
| Listings & Bookings | [`gig_media`](#gig-media) | Media assets attached to gig records. | 6 | Yes |
| Listings & Bookings | [`gig_requirements`](#gig-requirements) | Stores gig requirements records used by the MusikaLokal platform. | 5 | Yes |
| Listings & Bookings | [`gig_slot_fill_applicants`](#gig-slot-fill-applicants) | Stores gig slot fill applicants records used by the MusikaLokal platform. | 4 | Yes |
| Listings & Bookings | [`gig_slot_fill_summary`](#gig-slot-fill-summary) | Stores gig slot fill summary records used by the MusikaLokal platform. | 4 | Yes |
| Listings & Bookings | [`gigs`](#gigs) | Venue opportunities, performance requirements, schedule, location, compensation, permit state, and lifecycle data. | 28 | Yes |
| Listings & Bookings | [`group_availability_slots`](#group-availability-slots) | Stores group availability slots records used by the MusikaLokal platform. | 8 | Yes |
| Listings & Bookings | [`group_deletion_audit`](#group-deletion-audit) | Audit history for group deletion operations. | 9 | Yes |
| Listings & Bookings | [`group_media`](#group-media) | Media assets attached to group records. | 6 | Yes |
| Listings & Bookings | [`group_members`](#group-members) | Normalized membership records for group. | 5 | Yes |
| Listings & Bookings | [`group_playlists`](#group-playlists) | Stores group playlists records used by the MusikaLokal platform. | 5 | Yes |
| Listings & Bookings | [`group_roster_members`](#group-roster-members) | Normalized membership records for group roster. | 11 | Yes |
| Listings & Bookings | [`groups`](#groups) | Musical group and duo listings owned and managed by profiles. | 13 | Yes |
| Identity & Profiles | [`identity_document_claims`](#identity-document-claims) | Stores identity document claims records used by the MusikaLokal platform. | 21 | Yes |
| Platform Support | [`leadership_transfer_requests`](#leadership-transfer-requests) | Stores leadership transfer requests records used by the MusikaLokal platform. | 8 | Yes |
| Platform Support | [`manual_identity_reviews`](#manual-identity-reviews) | Stores manual identity reviews records used by the MusikaLokal platform. | 34 | Yes |
| Messaging & Notifications | [`message_reactions`](#message-reactions) | Stores message reactions records used by the MusikaLokal platform. | 5 | Yes |
| Messaging & Notifications | [`messages`](#messages) | Chat messages and attachment metadata sent within conversations. | 8 | Yes |
| Identity & Profiles | [`musician_verification_uploads`](#musician-verification-uploads) | Stores musician verification uploads records used by the MusikaLokal platform. | 15 | Yes |
| Moderation & Audit | [`normalization_exceptions`](#normalization-exceptions) | Stores normalization exceptions records used by the MusikaLokal platform. | 5 | Yes |
| Messaging & Notifications | [`notification_preferences`](#notification-preferences) | Stores notification preferences records used by the MusikaLokal platform. | 9 | Yes |
| Messaging & Notifications | [`notifications`](#notifications) | In-app notification records and navigation metadata for a profile. | 9 | Yes |
| Marketplace | [`order_fulfillments`](#order-fulfillments) | Stores order fulfillments records used by the MusikaLokal platform. | 11 | Yes |
| Marketplace | [`order_items`](#order-items) | Stores order items records used by the MusikaLokal platform. | 10 | Yes |
| Marketplace | [`orders`](#orders) | Marketplace purchases with buyer, seller, payment, shipping, and fulfillment state. | 20 | Yes |
| Wallet & Payments | [`payout_methods`](#payout-methods) | Stores payout methods records used by the MusikaLokal platform. | 10 | Yes |
| Moderation & Audit | [`permit_audit_log`](#permit-audit-log) | Stores permit audit log records used by the MusikaLokal platform. | 13 | Yes |
| Wallet & Payments | [`platform_withdrawal_payment_links`](#platform-withdrawal-payment-links) | Stores platform withdrawal payment links records used by the MusikaLokal platform. | 10 | Yes |
| Wallet & Payments | [`platform_withdrawals`](#platform-withdrawals) | Stores platform withdrawals records used by the MusikaLokal platform. | 16 | Yes |
| Playlists & Radio | [`playlist_audio_fingerprints`](#playlist-audio-fingerprints) | Stores playlist audio fingerprints records used by the MusikaLokal platform. | 12 | Yes |
| Playlists & Radio | [`playlist_items`](#playlist-items) | Ordered tracks and audio metadata within playlists. | 14 | Yes |
| Playlists & Radio | [`playlist_play_events`](#playlist-play-events) | Event history for playlist play. | 8 | Yes |
| Playlists & Radio | [`playlist_teaser_assets`](#playlist-teaser-assets) | Stores playlist teaser assets records used by the MusikaLokal platform. | 10 | Yes |
| Playlists & Radio | [`playlists`](#playlists) | Curated audio collections owned by profiles, groups, or other supported entities. | 14 | Yes |
| Social | [`post_comments`](#post-comments) | Threaded comments on social-feed posts. | 15 | Yes |
| Social | [`post_media`](#post-media) | Media assets attached to post records. | 16 | Yes |
| Social | [`post_reactions`](#post-reactions) | Stores post reactions records used by the MusikaLokal platform. | 5 | Yes |
| Marketplace | [`product_media`](#product-media) | Media assets attached to product records. | 8 | Yes |
| Marketplace | [`product_variants`](#product-variants) | Stores product variants records used by the MusikaLokal platform. | 9 | Yes |
| Production & Collaboration | [`production_team_members`](#production-team-members) | Normalized membership records for production team. | 5 | Yes |
| Production & Collaboration | [`production_team_roster`](#production-team-roster) | Stores production team roster records used by the MusikaLokal platform. | 7 | Yes |
| Production & Collaboration | [`production_teams`](#production-teams) | Producer-led teams used for collaboration, roster management, and venue-facing applications. | 8 | Yes |
| Marketplace | [`products`](#products) | Marketplace product listings offered by sellers. | 18 | Yes |
| Identity & Profiles | [`profile_genres`](#profile-genres) | Stores profile genres records used by the MusikaLokal platform. | 4 | Yes |
| Identity & Profiles | [`profile_portfolio_urls`](#profile-portfolio-urls) | Stores profile portfolio urls records used by the MusikaLokal platform. | 5 | Yes |
| Identity & Profiles | [`profile_skills`](#profile-skills) | Stores profile skills records used by the MusikaLokal platform. | 4 | Yes |
| Identity & Profiles | [`profiles`](#profiles) | Application accounts and public/private profile attributes for musicians, owners, producers, fans, and administrators. | 28 | Yes |
| Messaging & Notifications | [`push_notification_devices`](#push-notification-devices) | Stores push notification devices records used by the MusikaLokal platform. | 15 | Yes |
| Identity & Profiles | [`registration_attempts`](#registration-attempts) | Stores registration attempts records used by the MusikaLokal platform. | 12 | Yes |
| Moderation & Audit | [`reports`](#reports) | User-submitted moderation reports and their administrative resolution workflow. | 17 | Yes |
| Listings & Bookings | [`review_likes`](#review-likes) | Stores review likes records used by the MusikaLokal platform. | 4 | Yes |
| Listings & Bookings | [`reviews`](#reviews) | Post-engagement ratings and written reviews between platform participants. | 11 | Yes |
| Marketplace | [`shipping_profiles`](#shipping-profiles) | Stores shipping profiles records used by the MusikaLokal platform. | 11 | Yes |
| Social | [`social_activity_events`](#social-activity-events) | Event history for social activity. | 8 | Yes |
| Production & Collaboration | [`staff_listing_access`](#staff-listing-access) | Stores staff listing access records used by the MusikaLokal platform. | 11 | Yes |
| Playlists & Radio | [`station_playlist_slots`](#station-playlist-slots) | Stores station playlist slots records used by the MusikaLokal platform. | 9 | Yes |
| Playlists & Radio | [`stations`](#stations) | Radio-style stations and their ownership, presentation, and rotation settings. | 19 | Yes |
| Listings & Bookings | [`studio_amenities`](#studio-amenities) | Stores studio amenities records used by the MusikaLokal platform. | 4 | Yes |
| Listings & Bookings | [`studio_availability_slots`](#studio-availability-slots) | Stores studio availability slots records used by the MusikaLokal platform. | 8 | Yes |
| Listings & Bookings | [`studio_booking_slots`](#studio-booking-slots) | Stores studio booking slots records used by the MusikaLokal platform. | 6 | Yes |
| Listings & Bookings | [`studio_bookings`](#studio-bookings) | Studio reservation requests, payment state, schedule, attendance, cancellation, relocation, and completion data. | 44 | Yes |
| Listings & Bookings | [`studio_date_overrides`](#studio-date-overrides) | Stores studio date overrides records used by the MusikaLokal platform. | 8 | Yes |
| Listings & Bookings | [`studio_deletion_audit`](#studio-deletion-audit) | Audit history for studio deletion operations. | 9 | Yes |
| Listings & Bookings | [`studio_instruments`](#studio-instruments) | Stores studio instruments records used by the MusikaLokal platform. | 7 | Yes |
| Listings & Bookings | [`studio_media`](#studio-media) | Media assets attached to studio records. | 6 | Yes |
| Listings & Bookings | [`studio_open_dates`](#studio-open-dates) | Stores studio open dates records used by the MusikaLokal platform. | 5 | Yes |
| Listings & Bookings | [`studio_operating_hours`](#studio-operating-hours) | Stores studio operating hours records used by the MusikaLokal platform. | 11 | Yes |
| Listings & Bookings | [`studio_owner_penalties`](#studio-owner-penalties) | Stores studio owner penalties records used by the MusikaLokal platform. | 8 | Yes |
| Listings & Bookings | [`studio_promotions`](#studio-promotions) | Stores studio promotions records used by the MusikaLokal platform. | 16 | Yes |
| Listings & Bookings | [`studio_settings`](#studio-settings) | Stores studio settings records used by the MusikaLokal platform. | 26 | Yes |
| Listings & Bookings | [`studio_types`](#studio-types) | Stores studio types records used by the MusikaLokal platform. | 4 | Yes |
| Listings & Bookings | [`studios`](#studios) | Bookable studio listings, addresses, rates, verification state, and owner-facing configuration. | 28 | Yes |
| Moderation & Audit | [`upload_moderation_cases`](#upload-moderation-cases) | Current automated or manual moderation case for an uploaded media object. | 24 | Yes |
| Moderation & Audit | [`upload_moderation_history`](#upload-moderation-history) | Append-only status history for upload moderation decisions. | 9 | Yes |
| Moderation & Audit | [`upload_moderation_restrictions`](#upload-moderation-restrictions) | Upload restrictions imposed on a user after moderation outcomes. | 4 | Yes |
| Marketplace | [`user_entitlements`](#user-entitlements) | Stores user entitlements records used by the MusikaLokal platform. | 10 | Yes |
| Identity & Profiles | [`verification_sessions`](#verification-sessions) | Stores verification sessions records used by the MusikaLokal platform. | 4 | Yes |
| Wallet & Payments | [`wallet_deposits`](#wallet-deposits) | Stores wallet deposits records used by the MusikaLokal platform. | 7 | Yes |
| Wallet & Payments | [`wallet_transactions`](#wallet-transactions) | Immutable-style wallet ledger entries for earnings, deposits, deductions, and withdrawals. | 10 | Yes |
| Wallet & Payments | [`wallets`](#wallets) | Current in-app balance state by owner profile. | 6 | Yes |
| Wallet & Payments | [`withdrawal_requests`](#withdrawal-requests) | Stores withdrawal requests records used by the MusikaLokal platform. | 19 | Yes |

## Column definitions

### address_verification_sessions

Tracks Didit Proof of Address verification sessions for studios and gigs Domain: **Identity & Profiles**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the address verification sessions row. |
| `session_id` | `TEXT` | Yes | UQ | -- | -- | -- | Didit session ID |
| `user_id` | `UUID` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `entity_type` | `TEXT` | Yes |  | -- | -- | `(entity_type IN ('studio', 'gig'))` | Type of entity being verified (studio or gig) |
| `entity_id` | `UUID` | No |  | -- | -- | -- | Stores the entity id value for this record. |
| `expected_address` | `TEXT` | No |  | -- | -- | -- | Address entered by user for the studio/gig |
| `expected_name` | `TEXT` | No |  | -- | -- | -- | Verified name of the owner from ID verification |
| `extracted_address` | `TEXT` | No |  | -- | -- | -- | Address extracted from utility bill by Didit |
| `extracted_name` | `TEXT` | No |  | -- | -- | -- | Name extracted from utility bill by Didit |
| `issuer` | `TEXT` | No |  | -- | -- | -- | Stores the issuer value for this record. |
| `issue_date` | `TEXT` | No |  | -- | -- | -- | Calendar date for issue. |
| `name_matches` | `BOOLEAN` | No |  | -- | -- | -- | Stores the name matches value for this record. |
| `address_matches` | `BOOLEAN` | No |  | -- | -- | -- | Stores the address matches value for this record. |
| `status` | `TEXT` | No |  | `'PENDING'` | -- | `(status IN ('PENDING', 'APPROVED', 'DECLINED', 'ABANDONED', 'MANUAL_REVIEW', 'PENDING_REVIEW'))` | Current lifecycle state of this record. |
| `notes` | `TEXT` | No |  | -- | -- | -- | Free-form notes about this record. |
| `verified_at` | `TIMESTAMP WITH TIME ZONE` | No |  | -- | -- | -- | Timestamp for the verified event. |
| `raw_response` | `JSONB` | No |  | -- | -- | -- | Stores the raw response value for this record. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | Yes |  | `TIMEZONE('utc'::TEXT, NOW())` | -- | -- | Timestamp when the row was created. |
| `smile_user_id` | `TEXT` | No |  | -- | -- | -- | Smile Identity user ID |
| `archive_id` | `TEXT` | No |  | -- | -- | -- | Smile Identity archive/document ID |
| `provider` | `TEXT` | No |  | `'smile'` | -- | -- | Verification provider (smile) |
| `verification_result` | `JSONB` | No |  | -- | -- | -- | Full verification result from Smile API |
| `error_code` | `TEXT` | No |  | -- | -- | -- | Stores the error code value for this record. |
| `error_message` | `TEXT` | No |  | -- | -- | -- | Stores the error message value for this record. |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | No |  | `TIMEZONE('utc'::TEXT, NOW())` | -- | -- | Timestamp when the row was last updated. |

### audit_event_changes

One row per changed column for normalized audit details. Domain: **Moderation & Audit**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the audit event changes row. |
| `audit_event_id` | `uuid` | Yes | FK | -- | `audit_events.id` | -- | References `audit_events.id`. |
| `column_name` | `text` | Yes |  | -- | -- | `(length(btrim(column_name)) > 0)` | Stores the column name value for this record. |
| `old_value` | `text` | No |  | -- | -- | -- | Stores the old value value for this record. |
| `new_value` | `text` | No |  | -- | -- | -- | Stores the new value value for this record. |

### audit_events

Append-only audit event header for CRUD and business actions across MusikaLokal. Domain: **Moderation & Audit**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the audit events row. |
| `occurred_at` | `timestamptz` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp for the occurred event. |
| `actor_user_id` | `uuid` | No |  | -- | -- | -- | Historical actor profile id. Intentionally not a foreign key so profile deletion cannot erase audit attribution. |
| `target_user_id` | `uuid` | No |  | -- | -- | -- | Historical target profile id. Intentionally not a foreign key so profile deletion cannot erase audit attribution. |
| `actor_role` | `text` | No |  | -- | -- | -- | Stores the actor role value for this record. |
| `action` | `text` | Yes |  | -- | -- | `(length(btrim(action)) > 0)` | Stores the action value for this record. |
| `entity_schema` | `text` | Yes |  | `'public'` | -- | -- | Stores the entity schema value for this record. |
| `entity_table` | `text` | Yes |  | -- | -- | `(length(btrim(entity_table)) > 0)` | Stores the entity table value for this record. |
| `entity_id` | `text` | Yes |  | -- | -- | `(length(btrim(entity_id)) > 0)` | Stores the entity id value for this record. |
| `entity_label` | `text` | No |  | -- | -- | -- | Stores the entity label value for this record. |
| `source` | `text` | Yes |  | `'database'` | -- | -- | Stores the source value for this record. |
| `request_id` | `text` | No |  | -- | -- | -- | Stores the request id value for this record. |
| `metadata` | `jsonb` | Yes |  | `'{}'::jsonb` | -- | -- | Small contextual payload for historical audit evidence. Registered as a controlled 3NF exception. |

### booking_attendance_events

Event history for booking attendance. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the booking attendance events row. |
| `booking_id` | `uuid` | Yes | FK | -- | `studio_bookings.id` | -- | References `studio_bookings.id`. |
| `reporter_user_id` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `event_type` | `text` | Yes |  | -- | -- | `(event_type IN ('booking_started', 'checked_in', 'late', 'not_attending', 'no_show'))` | Stores the event type value for this record. |
| `notes` | `text` | No |  | -- | -- | -- | Free-form notes about this record. |
| `created_at` | `timestamptz` | Yes |  | `timezone('utc', now())` | -- | -- | Timestamp when the row was created. |

### booking_cancellation_policies

Stores booking cancellation policies records used by the MusikaLokal platform. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the booking cancellation policies row. |
| `studio_id` | `uuid` | Yes | FK | -- | `studios.id` | -- | References `studios.id`. |
| `name` | `text` | Yes |  | `'Standard Policy'::text` | -- | -- | Stores the name value for this record. |
| `full_refund_hours_before` | `integer` | Yes |  | `48` | -- | -- | Stores the full refund hours before value for this record. |
| `partial_refund_hours_before` | `integer` | Yes |  | `24` | -- | -- | Stores the partial refund hours before value for this record. |
| `partial_refund_pct` | `numeric` | Yes |  | `50` | -- | -- | Stores the partial refund pct value for this record. |
| `no_show_penalty_pct` | `numeric` | Yes |  | `100` | -- | -- | Stores the no show penalty pct value for this record. |
| `late_cancel_penalty_pct` | `numeric` | Yes |  | `50` | -- | -- | Stores the late cancel penalty pct value for this record. |
| `is_active` | `boolean` | Yes |  | `true` | -- | -- | Boolean flag for is active. |
| `created_at` | `timestamptz` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamptz` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was last updated. |

### booking_holds

Temporary cart locks (3NF) Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the booking holds row. |
| `user_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `studio_id` | `uuid` | Yes | FK | -- | `studios.id` | -- | References `studios.id`. |
| `booking_date` | `date` | Yes |  | -- | -- | -- | Calendar date for booking. |
| `start_time` | `time without time zone` | Yes |  | -- | -- | -- | Stores the start time value for this record. |
| `end_time` | `time without time zone` | Yes |  | -- | -- | -- | Stores the end time value for this record. |
| `expires_at` | `timestamp with time zone` | Yes |  | -- | -- | -- | Timestamp for the expires event. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |

### booking_incidents

Stores booking incidents records used by the MusikaLokal platform. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the booking incidents row. |
| `booking_id` | `uuid` | Yes | FK | -- | `studio_bookings.id` | -- | References `studio_bookings.id`. |
| `reporter_user_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `counterparty_user_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `issue_type` | `text` | Yes |  | -- | -- | `(issue_type IN (     'cannot_access_studio',     'entry_denied',     'no_show_claim',     'other'   ))` | Stores the issue type value for this record. |
| `status` | `text` | Yes |  | `'open'` | -- | `(status IN (     'open',     'responded',     'manual_review',     'resolved_refund',     'resolved_no_refund',     'dismissed'   ))` | Current lifecycle state of this record. |
| `reporter_notes` | `text` | No |  | -- | -- | -- | Free-form notes about reporter. |
| `counterparty_notes` | `text` | No |  | -- | -- | -- | Free-form notes about counterparty. |
| `response_deadline_at` | `timestamp with time zone` | Yes |  | -- | -- | -- | Timestamp for the response deadline event. |
| `responded_at` | `timestamp with time zone` | No |  | -- | -- | -- | Timestamp for the responded event. |
| `resolved_at` | `timestamp with time zone` | No |  | -- | -- | -- | Timestamp for the resolved event. |
| `resolved_by_user_id` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `resolution` | `text` | No |  | -- | -- | -- | Stores the resolution value for this record. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was last updated. |
| `penalty_event_id` | `uuid` | No | FK | -- | `booking_penalty_events.id` | -- | References `booking_penalty_events.id`. |

### booking_penalty_events

Event history for booking penalty. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the booking penalty events row. |
| `booking_id` | `uuid` | Yes | FK | -- | `studio_bookings.id` | -- | References `studio_bookings.id`. |
| `policy_snapshot` | `jsonb` | No |  | -- | -- | -- | Stores the policy snapshot value for this record. |
| `penalty_type` | `text` | Yes |  | -- | -- | -- | Stores the penalty type value for this record. |
| `penalty_amount` | `numeric` | Yes |  | -- | -- | -- | Monetary or rate value for penalty amount. |
| `refund_amount` | `numeric` | Yes |  | `0` | -- | -- | Monetary or rate value for refund amount. |
| `booking_total` | `numeric` | Yes |  | -- | -- | -- | Stores the booking total value for this record. |
| `penalized_user_id` | `uuid` | Yes | FK | -- | `auth.users.id` | -- | References `auth.users.id`. |
| `beneficiary_user_id` | `uuid` | No | FK | -- | `auth.users.id` | -- | References `auth.users.id`. |
| `wallet_transaction_id` | `uuid` | No | FK | -- | `wallet_transactions.id` | -- | References `wallet_transactions.id`. |
| `refund_transaction_id` | `uuid` | No | FK | -- | `wallet_transactions.id` | -- | References `wallet_transactions.id`. |
| `notes` | `text` | No |  | -- | -- | -- | Free-form notes about this record. |
| `created_at` | `timestamptz` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |

### booking_requests

Cross-entity invitations and applications, including group membership and production-team connections. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the booking requests row. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |
| `sender_id` | `uuid` | Yes | FK | -- | `auth.users.id` | -- | References `auth.users.id`. |
| `receiver_id` | `uuid` | No | FK | -- | `auth.users.id` | -- | References `auth.users.id`. |
| `group_id` | `uuid` | No | FK | -- | `groups.id` | -- | References `groups.id`. |
| `message` | `text` | No |  | -- | -- | -- | Stores the message value for this record. |
| `status` | `text` | No |  | `'pending'::text` | -- | -- | Current lifecycle state of this record. |
| `event_details` | `jsonb` | No |  | -- | -- | -- | Stores the event details value for this record. |
| `attachment_url` | `text` | No |  | -- | -- | -- | URL for the attachment resource. |
| `studio_id` | `uuid` | No | FK | -- | `studios.id` | -- | References `studios.id`. |

### conversation_participants

Participants in group conversations. For 1-on-1 chats, participant_1 and participant_2 columns in conversations table are used instead. Domain: **Messaging & Notifications**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the conversation participants row. |
| `conversation_id` | `uuid` | Yes | FK | -- | `conversations.id` | -- | References `conversations.id`. |
| `user_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `role` | `text` | No |  | `'member'::text` | -- | -- | Stores the role value for this record. |
| `joined_at` | `timestamp with time zone` | No |  | `timezone('utc'::text, now())` | -- | -- | Timestamp for the joined event. |
| `last_read_at` | `timestamp with time zone` | No |  | -- | -- | -- | Timestamp for the last read event. |
| `is_muted` | `boolean` | Yes |  | `false` | -- | -- | Boolean flag for is muted. |
| `muted_until` | `timestamp with time zone` | No |  | -- | -- | -- | Stores the muted until value for this record. |

### conversations

Chat conversation containers; membership is normalized through conversation participants. Domain: **Messaging & Notifications**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the conversations row. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was last updated. |
| `studio_booking_id` | `uuid` | No | FK | -- | `studio_bookings.id` | -- | References `studio_bookings.id`. |
| `gig_application_id` | `uuid` | No | FK | -- | `gig_applications.id` | -- | References `gig_applications.id`. |
| `gig_id` | `uuid` | No | FK | -- | `gigs.id` | -- | References `gigs.id`. |
| `group_id` | `uuid` | No | FK | -- | `groups.id` | -- | References `groups.id`. |
| `studio_id` | `uuid` | No | FK | -- | `studios.id` | -- | References `studios.id`. |
| `is_group` | `boolean` | No |  | `false` | -- | -- | Boolean flag for is group. |

### didit_webhook_events

Event history for didit webhook. Domain: **Platform Support**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `event_key` | `text` | Yes | PK | -- | -- | -- | Primary identifier for the didit webhook events row. |
| `session_id` | `text` | No |  | -- | -- | -- | Stores the session id value for this record. |
| `status` | `text` | No |  | -- | -- | -- | Current lifecycle state of this record. |
| `payload_hash` | `text` | Yes |  | -- | -- | -- | Stores the payload hash value for this record. |
| `processed_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp for the processed event. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### email_notifications

Stores email notifications records used by the MusikaLokal platform. Domain: **Messaging & Notifications**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the email notifications row. |
| `recipient_email` | `text` | Yes |  | -- | -- | -- | Stores the recipient email value for this record. |
| `recipient_name` | `text` | No |  | -- | -- | -- | Stores the recipient name value for this record. |
| `subject` | `text` | Yes |  | -- | -- | -- | Stores the subject value for this record. |
| `html_content` | `text` | No |  | -- | -- | -- | Stores the html content value for this record. |
| `template_type` | `text` | No |  | -- | -- | -- | Stores the template type value for this record. |
| `status` | `text` | No |  | `'pending'::text` | -- | -- | Current lifecycle state of this record. |
| `error_message` | `text` | No |  | -- | -- | -- | Stores the error message value for this record. |
| `created_at` | `timestamp with time zone` | No |  | `now()` | -- | -- | Timestamp when the row was created. |

### external_platform_links

Stores external platform links records used by the MusikaLokal platform. Domain: **Playlists & Radio**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the external platform links row. |
| `owner_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `platform` | `text` | Yes |  | -- | -- | `(platform IN ('spotify', 'apple_music', 'youtube_music', 'soundcloud', 'bandcamp', 'deezer', 'tidal', 'other'))` | Stores the platform value for this record. |
| `url` | `text` | Yes |  | -- | -- | `(char_length(url) BETWEEN 1 AND 2000)` | Stores the url value for this record. |
| `label` | `text` | No |  | -- | -- | `(char_length(label) <= 200)` | Stores the label value for this record. |
| `linked_playlist_id` | `uuid` | No | FK | -- | `playlists.id` | -- | References `playlists.id`. |
| `linked_item_id` | `uuid` | No | FK | -- | `playlist_items.id` | -- | References `playlist_items.id`. |
| `click_count` | `integer` | No |  | `0` | -- | `(click_count >= 0)` | Stored count of click. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### favorites

Stores favorites records used by the MusikaLokal platform. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the favorites row. |
| `user_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `group_id` | `uuid` | No | FK | -- | `groups.id` | -- | References `groups.id`. |
| `studio_id` | `uuid` | No | FK | -- | `studios.id` | -- | References `studios.id`. |
| `gig_id` | `uuid` | No | FK | -- | `gigs.id` | -- | References `gigs.id`. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |
| `profile_id` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `production_team_id` | `uuid` | No | FK | -- | `production_teams.id` | -- | References `production_teams.id`. |

### feed_posts

Social-feed posts authored by profiles, groups, or production teams. Domain: **Social**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the feed posts row. |
| `author_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `post_type` | `text` | Yes |  | `'text'` | -- | `(post_type IN ('text', 'announcement', 'release', 'project_update', 'merch_drop', 'playlist_share', 'station_share'))` | Stores the post type value for this record. |
| `content` | `text` | No |  | -- | -- | `(char_length(content) <= 5000)` | Stores the content value for this record. |
| `visibility` | `text` | Yes |  | `'public'` | -- | `(visibility IN ('public', 'followers', 'unlisted'))` | Stores the visibility value for this record. |
| `is_pinned` | `boolean` | No |  | `false` | -- | -- | Boolean flag for is pinned. |
| `linked_playlist_id` | `uuid` | No | FK | -- | `playlists.id` | -- | References `playlists.id`. |
| `linked_product_id` | `uuid` | No | FK | -- | `products.id` | -- | References `products.id`. |
| `reaction_count` | `integer` | No |  | `0` | -- | -- | Stored count of reaction. |
| `comment_count` | `integer` | No |  | `0` | -- | `(comment_count >= 0)` | Stored count of comment. |
| `share_count` | `integer` | No |  | `0` | -- | `(share_count >= 0)` | Stored count of share. |
| `is_reported` | `boolean` | No |  | `false` | -- | -- | Boolean flag for is reported. |
| `is_hidden` | `boolean` | No |  | `false` | -- | -- | Boolean flag for is hidden. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was last updated. |
| `linked_gig_id` | `uuid` | No | FK | -- | `gigs.id` | -- | Optional gig-backed comment thread used by Talent gig cards. These posts are excluded from the regular feed. |
| `linked_entity_type` | `text` | No |  | -- | -- | -- | Entity type for a listing-backed comment thread. These posts are excluded from the regular feed. |
| `linked_entity_id` | `uuid` | No |  | -- | -- | -- | Entity ID paired with linked_entity_type for a listing-backed comment thread. |

### follows

Stores follows records used by the MusikaLokal platform. Domain: **Social**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the follows row. |
| `follower_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `followed_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `followed_type` | `text` | Yes |  | `'profile'` | -- | -- | Stores the followed type value for this record. |

### gig_application_ai_reviews

Advisory evidence extracted from consented application media. This table must not be used to accept/reject applicants or alter deterministic recommendation scores. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the gig application ai reviews row. |
| `application_id` | `uuid` | Yes | FK, UQ | -- | `gig_applications.id` | -- | References `gig_applications.id`. |
| `gig_id` | `uuid` | Yes | FK | -- | `gigs.id` | -- | References `gigs.id`. |
| `status` | `text` | Yes |  | `'queued'` | -- | `(     status in ('queued', 'processing', 'completed', 'partial', 'failed', 'consent_revoked')   )` | Current lifecycle state of this record. |
| `consented_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the consented event. |
| `source_summary` | `jsonb` | Yes |  | `'{}'::jsonb` | -- | -- | Structured advisory source-processing results, including CV classification and face-review counts. |
| `evidence` | `jsonb` | Yes |  | `'[]'::jsonb` | -- | -- | Stores the evidence value for this record. |
| `overall_summary` | `text` | Yes |  | `''` | -- | -- | Stores the overall summary value for this record. |
| `limitations` | `jsonb` | Yes |  | `'[]'::jsonb` | -- | -- | Stores the limitations value for this record. |
| `model_provider` | `text` | Yes |  | `'groq'` | -- | -- | Stores the model provider value for this record. |
| `model_version` | `text` | Yes |  | `''` | -- | -- | Stores the model version value for this record. |
| `error_message` | `text` | No |  | -- | -- | -- | Stores the error message value for this record. |
| `queued_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp for the queued event. |
| `started_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the started event. |
| `completed_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the completed event. |
| `updated_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was last updated. |
| `face_similarity` | `jsonb` | Yes |  | `'{}'::jsonb` | -- | -- | Consent-gated advisory comparison of a solo applicant profile photo with representative video frames. Never identity verification or an automated decision. |
| `group_face_similarity` | `jsonb` | Yes |  | `'[]'::jsonb` | -- | -- | Per-member advisory visual similarity results for the snapshotted group lineup. Never identity verification or an automated decision. |

### gig_application_recommendations

Stores gig application recommendations records used by the MusikaLokal platform. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the gig application recommendations row. |
| `application_id` | `uuid` | Yes | FK, UQ | -- | `gig_applications.id` | -- | References `gig_applications.id`. |
| `gig_id` | `uuid` | Yes | FK | -- | `gigs.id` | -- | References `gigs.id`. |
| `score` | `smallint` | No |  | -- | -- | `(score between 0 and 100)` | Stores the score value for this record. |
| `is_verified` | `boolean` | Yes |  | `false` | -- | -- | Boolean flag for is verified. |
| `is_eligible` | `boolean` | Yes |  | `false` | -- | -- | Boolean flag for is eligible. |
| `recommendation_status` | `text` | Yes |  | -- | -- | `(     recommendation_status in ('recommended', 'possible_match', 'not_eligible')   )` | Lifecycle state for recommendation. |
| `matched_criteria` | `jsonb` | Yes |  | `'[]'::jsonb` | -- | -- | Stores the matched criteria value for this record. |
| `missing_criteria` | `jsonb` | Yes |  | `'[]'::jsonb` | -- | -- | Stores the missing criteria value for this record. |
| `explanation` | `text` | Yes |  | `''` | -- | -- | Stores the explanation value for this record. |
| `criteria_snapshot` | `jsonb` | Yes |  | `'{}'::jsonb` | -- | -- | Stores the criteria snapshot value for this record. |
| `model_provider` | `text` | Yes |  | `'rules'` | -- | -- | Stores the model provider value for this record. |
| `model_version` | `text` | Yes |  | `'gig-fit-v1'` | -- | -- | Stores the model version value for this record. |
| `generated_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp for the generated event. |
| `updated_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was last updated. |
| `distance_km` | `numeric(8,1)` | No |  | -- | -- | -- | Haversine distance between stored gig and performer coordinates; null when unavailable. |
| `distance_status` | `text` | No |  | -- | -- | -- | Advisory location range result; never an automatic hiring decision. |

### gig_applications

Applications from musicians, groups, or production teams to gigs, including acceptance and completion lifecycle. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the gig applications row. |
| `applicant_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `group_id` | `uuid` | No | FK | -- | `groups.id` | -- | References `groups.id`. |
| `gig_id` | `uuid` | Yes | FK | -- | `gigs.id` | -- | References `gigs.id`. |
| `pitch_message` | `text` | No |  | -- | -- | -- | Stores the pitch message value for this record. |
| `video_url` | `text` | No |  | -- | -- | -- | URL for the video resource. |
| `status` | `text` | No |  | `'pending'::text` | -- | -- | Current lifecycle state of this record. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |
| `reviewed_by_applicant` | `boolean` | No |  | `false` | -- | -- | Stores the reviewed by applicant value for this record. |
| `reviewed_by_organizer` | `boolean` | No |  | `false` | -- | -- | Stores the reviewed by organizer value for this record. |
| `cancellation_reason` | `text` | No |  | -- | -- | -- | Stores the cancellation reason value for this record. |
| `note` | `text` | No |  | -- | -- | -- | Stores the note value for this record. |
| `cv_url` | `text` | No |  | -- | -- | -- | URL to the uploaded CV file |
| `is_solo_application` | `boolean` | No |  | `false` | -- | -- | True if user applied as individual, false if applied as part of a group |
| `rejected_at` | `TIMESTAMP WITH TIME ZONE` | No |  | -- | -- | -- | Timestamp when the application was rejected, used for cooldown calculation |
| `slot_type` | `TEXT` | No |  | -- | -- | `(slot_type IN ('solo', 'duo', 'band'))` | The slot type this application is for: solo, duo, or band |
| `submitted_by_user_id` | `UUID` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `leader_approval_status` | `TEXT` | No |  | -- | -- | `(leader_approval_status IN ('pending', 'approved', 'rejected'))` | Lifecycle state for leader approval. |
| `leader_reviewed_at` | `TIMESTAMP WITH TIME ZONE` | No |  | -- | -- | -- | Timestamp for the leader reviewed event. |
| `reconfirmation_required_at` | `TIMESTAMPTZ` | No |  | -- | -- | -- | Timestamp for the reconfirmation required event. |
| `reconfirmation_due_at` | `TIMESTAMPTZ` | No |  | -- | -- | -- | Timestamp for the reconfirmation due event. |
| `system_status_reason` | `TEXT` | No |  | -- | -- | -- | Stores the system status reason value for this record. |
| `show_on_profile` | `boolean` | Yes |  | `false` | -- | -- | True only when the performer explicitly permits this accepted gig on their public profile. |
| `production_team_id` | `uuid` | No | FK | -- | `production_teams.id` | -- | Optional production team wrapper for applications submitted as one production organization. |
| `production_roster_id` | `uuid` | No | FK | -- | `production_team_roster.id` | -- | Optional production roster entry representing the selected musician, duo, or group for a production application. |
| `updated_at` | `timestamptz` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was last updated. |
| `performer_snapshot` | `jsonb` | Yes |  | `'{}'::jsonb` | -- | -- | Immutable-ish display snapshot of the selected production roster performer at application time. |
| `completion_rate_penalty` | `boolean` | Yes |  | `false` | -- | -- | True only when a performer withdraws from an accepted upcoming gig and the outcome should lower completion rate. |
| `feature_consent_status` | `text` | Yes |  | `'not_requested'` | -- | -- | Per-application performer decision for public gig/profile featuring. Acceptance is independent from this status. |
| `show_on_gig_page` | `boolean` | Yes |  | `false` | -- | -- | True only when the performer explicitly permits public display on the gig details page and its Feed cards. |
| `feature_consent_requested_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the feature consent requested event. |
| `feature_consent_responded_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the feature consent responded event. |
| `ai_portfolio_review_consent` | `boolean` | Yes |  | `false` | -- | -- | Explicit applicant consent to send application CV text, video audio, and representative portfolio images to the configured AI provider for advisory evidence review. |
| `ai_portfolio_review_consented_at` | `timestamptz` | No |  | -- | -- | -- | Time at which the applicant granted AI portfolio review consent for this application. |
| `ai_review_frame_url` | `text` | No |  | -- | -- | -- | A client-generated representative frame from the submitted performance video. It is reviewed only when AI portfolio review consent is true. |
| `video_copyright_acknowledged` | `boolean` | Yes |  | `false` | -- | -- | Stores the video copyright acknowledged value for this record. |
| `video_copyright_acknowledged_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the video copyright acknowledged event. |
| `video_copyright_status` | `text` | Yes |  | `'not_screened'` | -- | -- | Released-recording fingerprint status. not_screened marks legacy applications; this is not a legal copyright determination. |
| `video_copyright_review_id` | `uuid` | No | FK | -- | `manual_identity_reviews.id` | -- | Identity Review case used to review the applicant ownership, license, or permission claim for a matched recording. |
| `video_copyright_metadata` | `jsonb` | Yes |  | `'{}'::jsonb` | -- | -- | Structured supplemental metadata. |
| `ai_review_frame_urls` | `jsonb` | Yes |  | `'[]'::jsonb` | -- | -- | Stores the ai review frame urls value for this record. |
| `ai_review_group_member_ids` | `uuid[]` | Yes |  | `'{}'::uuid[]` | -- | -- | Immutable-at-submission snapshot of group profile IDs covered by the submitter authorization for advisory face similarity. |
| `fired_at` | `timestamptz` | No |  | -- | -- | -- | UTC timestamp when an accepted performer assignment was terminated. |
| `fired_by_user_id` | `uuid` | No | FK | -- | `profiles.id` | -- | Organizer or authorized venue staff user who terminated the performer assignment. |

### gig_availability_slots

Stores gig availability slots records used by the MusikaLokal platform. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the gig availability slots row. |
| `gig_id` | `UUID` | Yes | FK | -- | `gigs.id` | -- | References `gigs.id`. |
| `day_of_week` | `SMALLINT` | No |  | -- | -- | -- | Stores the day of week value for this record. |
| `slot_date` | `DATE` | No |  | -- | -- | -- | Calendar date for slot. |
| `start_time` | `TIME` | Yes |  | -- | -- | -- | Stores the start time value for this record. |
| `end_time` | `TIME` | Yes |  | -- | -- | -- | Stores the end time value for this record. |
| `is_available` | `BOOLEAN` | Yes |  | `TRUE` | -- | -- | Boolean flag for is available. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | Yes |  | `TIMEZONE('utc'::TEXT, NOW())` | -- | -- | Timestamp when the row was created. |

### gig_deletion_audit

Audit history for gig deletion operations. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the gig deletion audit row. |
| `gig_id` | `UUID` | Yes |  | -- | -- | -- | Stores the gig id value for this record. |
| `organizer_id` | `UUID` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `deleted_by` | `UUID` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `deleted_at` | `TIMESTAMPTZ` | Yes |  | `timezone('utc'::TEXT, now())` | -- | -- | Soft-deletion timestamp; null while active. |
| `gig_snapshot` | `JSONB` | Yes |  | -- | -- | -- | Stores the gig snapshot value for this record. |
| `related_counts` | `JSONB` | Yes |  | -- | -- | -- | Stores the related counts value for this record. |
| `applicant_counts` | `JSONB` | Yes |  | -- | -- | -- | Stores the applicant counts value for this record. |
| `storage_cleanup` | `JSONB` | No |  | -- | -- | -- | Stores the storage cleanup value for this record. |
| `reason` | `TEXT` | No |  | -- | -- | -- | Stores the reason value for this record. |

### gig_media

Media assets attached to gig records. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the gig media row. |
| `gig_id` | `UUID` | Yes | FK | -- | `gigs.id` | -- | References `gigs.id`. |
| `media_type` | `TEXT` | Yes |  | -- | -- | `(media_type IN ('image', 'document'))` | Stores the media type value for this record. |
| `media_url` | `TEXT` | Yes |  | -- | -- | -- | URL for the media resource. |
| `sort_order` | `INTEGER` | Yes |  | `0` | -- | -- | Stores the sort order value for this record. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | Yes |  | `TIMEZONE('utc'::TEXT, NOW())` | -- | -- | Timestamp when the row was created. |

### gig_requirements

Stores gig requirements records used by the MusikaLokal platform. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the gig requirements row. |
| `gig_id` | `UUID` | Yes | FK | -- | `gigs.id` | -- | References `gigs.id`. |
| `requirement_key` | `TEXT` | Yes |  | -- | -- | -- | Stores the requirement key value for this record. |
| `requirement_value` | `JSONB` | Yes |  | -- | -- | -- | Stores the requirement value value for this record. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | Yes |  | `TIMEZONE('utc'::TEXT, NOW())` | -- | -- | Timestamp when the row was created. |

### gig_slot_fill_applicants

Stores gig slot fill applicants records used by the MusikaLokal platform. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `gig_id` | `uuid` | Yes | PK, FK | -- | `gigs.id` | -- | References `gigs.id`. |
| `slot_type` | `text` | Yes | PK | -- | -- | `(slot_type IN ('solo','duo','band'))` | Primary identifier for the gig slot fill applicants row. |
| `applicant_id` | `uuid` | Yes | PK | -- | -- | -- | Primary identifier for the gig slot fill applicants row. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### gig_slot_fill_summary

Stores gig slot fill summary records used by the MusikaLokal platform. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `gig_id` | `uuid` | Yes | PK, FK | -- | `gigs.id` | -- | References `gigs.id`. |
| `slot_type` | `text` | Yes | PK | -- | -- | `(slot_type IN ('solo','duo','band'))` | Primary identifier for the gig slot fill summary row. |
| `accepted_count` | `integer` | Yes |  | `0` | -- | `(accepted_count >= 0)` | Stored count of accepted. |
| `updated_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was last updated. |

### gigs

Venue opportunities, performance requirements, schedule, location, compensation, permit state, and lifecycle data. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the gigs row. |
| `organizer_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `name` | `text` | Yes |  | -- | -- | -- | Stores the name value for this record. |
| `location` | `text` | No |  | -- | -- | -- | Stores the location value for this record. |
| `budget` | `numeric` | No |  | -- | -- | -- | Stores the budget value for this record. |
| `description` | `text` | No |  | -- | -- | -- | Human-readable description of the gigs record. |
| `event_date` | `timestamp with time zone` | No |  | -- | -- | -- | Calendar date for event. |
| `status` | `text` | No |  | `'open'::text` | -- | -- | Current lifecycle state of this record. |
| `latitude` | `double precision` | No |  | -- | -- | -- | Stores the latitude value for this record. |
| `longitude` | `double precision` | No |  | -- | -- | -- | Stores the longitude value for this record. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |
| `embedding` | `vector(384)` | No |  | -- | -- | -- | Stores the embedding value for this record. |
| `rate` | `numeric` | No |  | -- | -- | -- | Monetary or rate value for rate. |
| `contract_url` | `text` | No |  | -- | -- | -- | URL to contract document in Supabase storage |
| `address_verification_status` | `TEXT` | No |  | `'NOT_STARTED'` | -- | `(address_verification_status IN ('NOT_STARTED', 'PENDING', 'APPROVED', 'DECLINED', 'ABANDONED', 'MANUAL_REVIEW', 'PENDING_REVIEW'))` | Status of address verification: NOT_STARTED, PENDING, APPROVED, DECLINED, ABANDONED, MANUAL_REVIEW, PENDING_REVIEW |
| `address_verification_session_id` | `TEXT` | No |  | -- | -- | -- | Stores the address verification session id value for this record. |
| `address_verified_at` | `TIMESTAMP WITH TIME ZONE` | No |  | -- | -- | -- | Timestamp for the address verified event. |
| `verified_address` | `TEXT` | No |  | -- | -- | -- | Address extracted and verified from utility bill |
| `address_verification_completed_at` | `TIMESTAMP WITH TIME ZONE` | No |  | -- | -- | -- | Timestamp when address verification was completed |
| `business_permit_url` | `TEXT` | No |  | -- | -- | -- | URL to the uploaded business permit document (PDF or image) |
| `reapplication_cooldown_days` | `numeric(8,3)` | No |  | `30` | -- | `(reapplication_cooldown_days >= 0 AND reapplication_cooldown_days <= 365)` | Cooldown after rejection expressed in days; fractional values support exact hours (for example, 0.5 = 12 hours). Zero allows immediate reapplication. |
| `total_slots_filled` | `INTEGER` | No |  | `0` | -- | -- | Quick count of total accepted applications across all slot types |
| `permit_status` | `text` | No |  | `'pending_review'` | -- | -- | Lifecycle state for permit. |
| `permit_reviewed_by` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `permit_reviewed_at` | `timestamp with time zone` | No |  | -- | -- | -- | Timestamp for the permit reviewed event. |
| `permit_admin_notes` | `text` | No |  | -- | -- | -- | Free-form notes about permit admin. |
| `permit_rejection_reason` | `text` | No |  | -- | -- | -- | Stores the permit rejection reason value for this record. |
| `permit_resubmissions_used` | `integer` | Yes |  | `0` | -- | -- | Number of permit resubmissions used after rejection. Capped at 1. |

### group_availability_slots

Stores group availability slots records used by the MusikaLokal platform. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the group availability slots row. |
| `group_id` | `uuid` | Yes | FK | -- | `groups.id` | -- | References `groups.id`. |
| `day_of_week` | `smallint` | No |  | -- | -- | -- | Stores the day of week value for this record. |
| `slot_date` | `date` | No |  | -- | -- | -- | Calendar date for slot. |
| `start_time` | `time` | Yes |  | -- | -- | -- | Stores the start time value for this record. |
| `end_time` | `time` | Yes |  | -- | -- | -- | Stores the end time value for this record. |
| `is_available` | `boolean` | Yes |  | `true` | -- | -- | Boolean flag for is available. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### group_deletion_audit

Audit history for group deletion operations. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the group deletion audit row. |
| `group_id` | `UUID` | Yes |  | -- | -- | -- | Stores the group id value for this record. |
| `owner_id` | `UUID` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `deleted_by` | `UUID` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `deleted_at` | `TIMESTAMPTZ` | Yes |  | `timezone('utc'::TEXT, now())` | -- | -- | Soft-deletion timestamp; null while active. |
| `group_snapshot` | `JSONB` | Yes |  | -- | -- | -- | Stores the group snapshot value for this record. |
| `related_counts` | `JSONB` | Yes |  | -- | -- | -- | Stores the related counts value for this record. |
| `application_counts` | `JSONB` | Yes |  | -- | -- | -- | Stores the application counts value for this record. |
| `reason` | `TEXT` | No |  | -- | -- | -- | Stores the reason value for this record. |

### group_media

Media assets attached to group records. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the group media row. |
| `group_id` | `uuid` | Yes | FK | -- | `groups.id` | -- | References `groups.id`. |
| `media_type` | `text` | Yes |  | `'image'` | -- | -- | Stores the media type value for this record. |
| `media_url` | `text` | Yes |  | -- | -- | -- | URL for the media resource. |
| `sort_order` | `integer` | Yes |  | `0` | -- | -- | Stores the sort order value for this record. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### group_members

Normalized membership records for group. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the group members row. |
| `group_id` | `uuid` | Yes | FK | -- | `groups.id` | -- | References `groups.id`. |
| `user_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `role` | `text` | No |  | `'member'::text` | -- | -- | Stores the role value for this record. |
| `joined_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp for the joined event. |

### group_playlists

Stores group playlists records used by the MusikaLokal platform. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the group playlists row. |
| `group_id` | `uuid` | Yes | FK | -- | `groups.id` | -- | References `groups.id`. |
| `playlist_id` | `uuid` | Yes | FK | -- | `playlists.id` | -- | References `playlists.id`. |
| `position` | `integer` | Yes |  | `0` | -- | `(position >= 0)` | Stores the position value for this record. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### group_roster_members

Normalized membership records for group roster. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the group roster members row. |
| `group_id` | `uuid` | Yes | FK | -- | `groups.id` | -- | References `groups.id`. |
| `user_id` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `member_name` | `text` | Yes |  | -- | -- | -- | Stores the member name value for this record. |
| `member_role` | `text` | No |  | -- | -- | -- | Stores the member role value for this record. |
| `instrument` | `text` | No |  | -- | -- | -- | Stores the instrument value for this record. |
| `avatar_url` | `text` | No |  | -- | -- | -- | URL for the avatar resource. |
| `sort_order` | `integer` | Yes |  | `0` | -- | -- | Stores the sort order value for this record. |
| `metadata` | `jsonb` | Yes |  | `'{}'::jsonb` | -- | -- | Structured supplemental metadata. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `raw_member` | `jsonb` | No |  | `'{}'::jsonb` | -- | -- | Stores the raw member value for this record. |

### groups

Musical group and duo listings owned and managed by profiles. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the groups row. |
| `owner_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `name` | `text` | Yes |  | -- | -- | -- | Stores the name value for this record. |
| `genre` | `text` | No |  | -- | -- | -- | Stores the genre value for this record. |
| `description` | `text` | No |  | -- | -- | -- | Human-readable description of the groups record. |
| `location` | `text` | No |  | -- | -- | -- | Stores the location value for this record. |
| `latitude` | `double precision` | No |  | -- | -- | -- | Stores the latitude value for this record. |
| `longitude` | `double precision` | No |  | -- | -- | -- | Stores the longitude value for this record. |
| `rate` | `numeric` | No |  | -- | -- | -- | Monetary or rate value for rate. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |
| `embedding` | `vector(384)` | No |  | -- | -- | -- | Stores the embedding value for this record. |
| `group_type` | `text` | No |  | `'band'::text` | -- | -- | Type of musical group: duo (exactly 2 members) or band (3+ members) |
| `open_group_applications` | `BOOLEAN` | Yes |  | `TRUE` | -- | -- | Stores the open group applications value for this record. |

### identity_document_claims

Stores identity document claims records used by the MusikaLokal platform. Domain: **Identity & Profiles**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the identity document claims row. |
| `user_id` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `role` | `text` | Yes |  | -- | -- | -- | Stores the role value for this record. |
| `document_fingerprint` | `text` | No |  | -- | -- | -- | Stores the document fingerprint value for this record. |
| `document_type` | `text` | No |  | -- | -- | -- | Stores the document type value for this record. |
| `document_type_key` | `text` | No |  | -- | -- | -- | Stores the document type key value for this record. |
| `document_country` | `text` | Yes |  | `'PHL'` | -- | -- | Stores the document country value for this record. |
| `source` | `text` | Yes |  | `'DIDIT'` | -- | `(source in ('DIDIT', 'MANUAL_UPLOAD', 'DIDIT_PENDING', 'DIDIT_DUPLICATE'))` | Stores the source value for this record. |
| `status` | `text` | Yes |  | `'APPROVED'` | -- | `(status in ('APPROVED', 'PENDING_REVIEW', 'DECLINED', 'REVOKED'))` | Current lifecycle state of this record. |
| `didit_session_id` | `text` | No |  | -- | -- | -- | Stores the didit session id value for this record. |
| `manual_review_id` | `uuid` | No | FK | -- | `manual_identity_reviews.id` | -- | References `manual_identity_reviews.id`. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was last updated. |
| `last_seen_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp for the last seen event. |
| `original_user_id` | `uuid` | No |  | -- | -- | -- | Stores the original user id value for this record. |
| `normalized_email` | `text` | No |  | -- | -- | -- | Stores the normalized email value for this record. |
| `claim_metadata` | `jsonb` | Yes |  | `'{}'::jsonb` | -- | -- | Structured supplemental metadata. |
| `deleted_profile_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the deleted profile event. |
| `verified_full_legal_name` | `text` | No |  | -- | -- | -- | Stores the verified full legal name value for this record. |
| `normalized_full_legal_name` | `text` | No |  | -- | -- | -- | Stores the normalized full legal name value for this record. |
| `birth_date` | `date` | No |  | -- | -- | -- | Calendar date for birth. |

### leadership_transfer_requests

Stores leadership transfer requests records used by the MusikaLokal platform. Domain: **Platform Support**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the leadership transfer requests row. |
| `group_id` | `uuid` | Yes | FK | -- | `groups.id` | -- | References `groups.id`. |
| `from_user_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `to_user_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `status` | `text` | No |  | `'pending'::text` | -- | -- | Current lifecycle state of this record. |
| `message` | `text` | No |  | -- | -- | -- | Stores the message value for this record. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |
| `responded_at` | `timestamp with time zone` | No |  | -- | -- | -- | Timestamp for the responded event. |

### manual_identity_reviews

Stores manual identity reviews records used by the MusikaLokal platform. Domain: **Platform Support**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the manual identity reviews row. |
| `user_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `submitted_by_email` | `text` | Yes |  | -- | -- | -- | Stores the submitted by email value for this record. |
| `document_type` | `text` | Yes |  | -- | -- | -- | Stores the document type value for this record. |
| `document_type_key` | `text` | No |  | -- | -- | -- | Stores the document type key value for this record. |
| `document_country` | `text` | Yes |  | `'PHL'` | -- | -- | Stores the document country value for this record. |
| `source` | `text` | Yes |  | `'MANUAL_UPLOAD'` | -- | `(source in ('MANUAL_UPLOAD', 'DIDIT_PENDING'))` | Stores the source value for this record. |
| `status` | `text` | Yes |  | `'PENDING_REVIEW'` | -- | `(status in ('PENDING_REVIEW', 'APPROVED', 'DECLINED'))` | Current lifecycle state of this record. |
| `front_image_path` | `text` | No |  | -- | -- | -- | Stores the front image path value for this record. |
| `back_image_path` | `text` | No |  | -- | -- | -- | Stores the back image path value for this record. |
| `selfie_image_path` | `text` | No |  | -- | -- | -- | Stores the selfie image path value for this record. |
| `review_notes` | `text` | No |  | -- | -- | -- | Free-form notes about review. |
| `reviewed_by` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `reviewed_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the reviewed event. |
| `decision_email_sent_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the decision email sent event. |
| `expected_decision_by` | `timestamptz` | Yes |  | `(now() + interval '7 days')` | -- | -- | Stores the expected decision by value for this record. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was last updated. |
| `submitted_role` | `text` | No |  | -- | -- | -- | Stores the submitted role value for this record. |
| `didit_session_id` | `text` | No |  | -- | -- | -- | Stores the didit session id value for this record. |
| `document_fingerprint` | `text` | No |  | -- | -- | -- | Stores the document fingerprint value for this record. |
| `duplicate_reason` | `text` | No |  | -- | -- | -- | Stores the duplicate reason value for this record. |
| `duplicate_match_count` | `integer` | Yes |  | `0` | -- | -- | Stored count of duplicate match. |
| `metadata` | `jsonb` | Yes |  | `'{}'::jsonb` | -- | -- | Structured supplemental metadata. |
| `verified_full_legal_name` | `text` | No |  | -- | -- | -- | Stores the verified full legal name value for this record. |
| `normalized_full_legal_name` | `text` | No |  | -- | -- | -- | Stores the normalized full legal name value for this record. |
| `birth_date` | `date` | No |  | -- | -- | -- | Calendar date for birth. |
| `review_reason` | `text` | No |  | -- | -- | -- | Stores the review reason value for this record. |
| `matched_on` | `text` | No |  | -- | -- | -- | Stores the matched on value for this record. |
| `music_video_path` | `text` | No |  | -- | -- | -- | Private storage object path in musician-verification-videos for musician signup proof. |
| `music_video_original_name` | `text` | No |  | -- | -- | -- | Stores the music video original name value for this record. |
| `music_video_mime_type` | `text` | No |  | -- | -- | -- | Stores the music video mime type value for this record. |
| `music_video_size_bytes` | `bigint` | No |  | -- | -- | -- | Stores the music video size bytes value for this record. |
| `music_video_uploaded_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the music video uploaded event. |

### message_reactions

Stores message reactions records used by the MusikaLokal platform. Domain: **Messaging & Notifications**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the message reactions row. |
| `message_id` | `uuid` | Yes | FK | -- | `messages.id` | -- | References `messages.id`. |
| `user_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `emoji` | `text` | Yes |  | -- | -- | -- | Stores the emoji value for this record. |
| `created_at` | `timestamp with time zone` | No |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |

### messages

Chat messages and attachment metadata sent within conversations. Domain: **Messaging & Notifications**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the messages row. |
| `conversation_id` | `uuid` | Yes | FK | -- | `conversations.id` | -- | References `conversations.id`. |
| `sender_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `content` | `text` | Yes |  | -- | -- | -- | Stores the content value for this record. |
| `message_type` | `text` | No |  | `'text'::text` | -- | -- | Stores the message type value for this record. |
| `attachment_url` | `text` | No |  | -- | -- | -- | URL for the attachment resource. |
| `read_at` | `timestamp with time zone` | No |  | -- | -- | -- | Timestamp for the read event. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |

### musician_verification_uploads

Tracks pre-auth musician signup music-video proof uploads before admin review. Domain: **Identity & Profiles**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the musician verification uploads row. |
| `email_hash` | `text` | No |  | -- | -- | -- | Stores the email hash value for this record. |
| `signup_role` | `text` | Yes |  | `'musician'` | -- | -- | Stores the signup role value for this record. |
| `bucket_id` | `text` | Yes |  | `'musician-verification-videos'` | -- | -- | Stores the bucket id value for this record. |
| `object_path` | `text` | Yes | UQ | -- | -- | -- | Stores the object path value for this record. |
| `original_name` | `text` | No |  | -- | -- | -- | Stores the original name value for this record. |
| `mime_type` | `text` | Yes |  | -- | -- | -- | Stores the mime type value for this record. |
| `size_bytes` | `bigint` | Yes |  | -- | -- | -- | Stores the size bytes value for this record. |
| `status` | `text` | Yes |  | `'PENDING'` | -- | -- | Current lifecycle state of this record. |
| `expires_at` | `timestamptz` | Yes |  | `(now() + interval '24 hours')` | -- | -- | Timestamp for the expires event. |
| `user_id` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `manual_review_id` | `uuid` | No | FK | -- | `manual_identity_reviews.id` | -- | References `manual_identity_reviews.id`. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `consumed_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the consumed event. |
| `updated_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was last updated. |

### normalization_exceptions

Stores normalization exceptions records used by the MusikaLokal platform. Domain: **Moderation & Audit**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `table_name` | `text` | Yes | PK | -- | -- | -- | Primary identifier for the normalization exceptions row. |
| `column_name` | `text` | Yes | PK | -- | -- | -- | Primary identifier for the normalization exceptions row. |
| `rationale` | `text` | Yes |  | -- | -- | -- | Stores the rationale value for this record. |
| `approved_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp for the approved event. |
| `approved_by_user_id` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |

### notification_preferences

Stores notification preferences records used by the MusikaLokal platform. Domain: **Messaging & Notifications**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `user_id` | `uuid` | Yes | PK, FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `booking_confirmed` | `boolean` | Yes |  | `true` | -- | -- | Stores the booking confirmed value for this record. |
| `awaiting_confirmation` | `boolean` | Yes |  | `true` | -- | -- | Stores the awaiting confirmation value for this record. |
| `upload_required` | `boolean` | Yes |  | `false` | -- | -- | Stores the upload required value for this record. |
| `event_reminder` | `boolean` | Yes |  | `true` | -- | -- | Stores the event reminder value for this record. |
| `leave_review` | `boolean` | Yes |  | `false` | -- | -- | Stores the leave review value for this record. |
| `created_at` | `timestamp with time zone` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamp with time zone` | Yes |  | `now()` | -- | -- | Timestamp when the row was last updated. |
| `push_enabled` | `boolean` | Yes |  | `true` | -- | -- | Stores the push enabled value for this record. |

### notifications

In-app notification records and navigation metadata for a profile. Domain: **Messaging & Notifications**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the notifications row. |
| `user_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `type` | `text` | No |  | -- | -- | -- | Stores the type value for this record. |
| `title` | `text` | Yes |  | -- | -- | -- | Stores the title value for this record. |
| `message` | `text` | Yes |  | -- | -- | -- | Stores the message value for this record. |
| `read` | `boolean` | No |  | `false` | -- | -- | Stores the read value for this record. |
| `image` | `text` | No |  | -- | -- | -- | Stores the image value for this record. |
| `meta` | `jsonb` | No |  | -- | -- | -- | Structured supplemental metadata. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |

### order_fulfillments

Stores order fulfillments records used by the MusikaLokal platform. Domain: **Marketplace**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the order fulfillments row. |
| `order_id` | `uuid` | Yes | FK | -- | `orders.id` | -- | References `orders.id`. |
| `fulfillment_type` | `text` | Yes |  | `'shipment'` | -- | `(fulfillment_type IN ('shipment', 'digital_release', 'pickup'))` | Stores the fulfillment type value for this record. |
| `status` | `text` | Yes |  | `'pending'` | -- | `(status IN ('pending', 'preparing', 'shipped', 'in_transit', 'delivered', 'failed', 'returned'))` | Current lifecycle state of this record. |
| `tracking_number` | `text` | No |  | -- | -- | `(char_length(tracking_number) <= 100)` | Stores the tracking number value for this record. |
| `carrier` | `text` | No |  | -- | -- | `(char_length(carrier) <= 100)` | Stores the carrier value for this record. |
| `shipped_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the shipped event. |
| `delivered_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the delivered event. |
| `notes` | `text` | No |  | -- | -- | `(char_length(notes) <= 1000)` | Free-form notes about this record. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was last updated. |

### order_items

Stores order items records used by the MusikaLokal platform. Domain: **Marketplace**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the order items row. |
| `order_id` | `uuid` | Yes | FK | -- | `orders.id` | -- | References `orders.id`. |
| `product_id` | `uuid` | Yes | FK | -- | `products.id` | -- | References `products.id`. |
| `variant_id` | `uuid` | No | FK | -- | `product_variants.id` | -- | References `product_variants.id`. |
| `product_title` | `text` | Yes |  | -- | -- | -- | Stores the product title value for this record. |
| `variant_label` | `text` | No |  | -- | -- | -- | Stores the variant label value for this record. |
| `quantity` | `integer` | Yes |  | `1` | -- | `(quantity > 0)` | Stores the quantity value for this record. |
| `unit_price` | `numeric` | Yes |  | -- | -- | `(unit_price >= 0)` | Monetary or rate value for unit price. |
| `line_total` | `numeric` | Yes |  | -- | -- | `(line_total >= 0)` | Stores the line total value for this record. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### orders

Marketplace purchases with buyer, seller, payment, shipping, and fulfillment state. Domain: **Marketplace**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the orders row. |
| `buyer_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `seller_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `order_number` | `text` | Yes | UQ | `('ORD-' \|\| upper(substr(gen_random_uuid()::text, 1, 8)))` | -- | -- | Stores the order number value for this record. |
| `status` | `text` | Yes |  | `'pending'` | -- | `(status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'disputed'))` | Current lifecycle state of this record. |
| `subtotal` | `numeric` | Yes |  | -- | -- | `(subtotal >= 0)` | Stores the subtotal value for this record. |
| `shipping_fee` | `numeric` | No |  | `0` | -- | `(shipping_fee >= 0)` | Monetary or rate value for shipping fee. |
| `total_amount` | `numeric` | Yes |  | -- | -- | `(total_amount >= 0)` | Monetary or rate value for total amount. |
| `currency` | `text` | Yes |  | `'PHP'` | -- | -- | Stores the currency value for this record. |
| `shipping_profile_id` | `uuid` | No | FK | -- | `shipping_profiles.id` | -- | References `shipping_profiles.id`. |
| `shipping_address` | `jsonb` | No |  | -- | -- | -- | Stores the shipping address value for this record. |
| `payment_reference` | `text` | No |  | -- | -- | -- | Stores the payment reference value for this record. |
| `wallet_transaction_id` | `uuid` | No | FK | -- | `wallet_transactions.id` | -- | References `wallet_transactions.id`. |
| `notes` | `text` | No |  | -- | -- | `(char_length(notes) <= 1000)` | Free-form notes about this record. |
| `confirmed_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the confirmed event. |
| `shipped_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the shipped event. |
| `delivered_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the delivered event. |
| `cancelled_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the cancelled event. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was last updated. |

### payout_methods

Stores payout methods records used by the MusikaLokal platform. Domain: **Wallet & Payments**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the payout methods row. |
| `user_id` | `UUID` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `type` | `TEXT` | Yes |  | -- | -- | -- | Stores the type value for this record. |
| `account_name` | `TEXT` | Yes |  | -- | -- | -- | Stores the account name value for this record. |
| `account_number` | `TEXT` | Yes |  | -- | -- | -- | Stores the account number value for this record. |
| `bank_name` | `TEXT` | No |  | -- | -- | -- | Stores the bank name value for this record. |
| `is_default` | `boolean` | No |  | `false` | -- | -- | Boolean flag for is default. |
| `is_verified` | `BOOLEAN` | No |  | `FALSE` | -- | -- | Boolean flag for is verified. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | Yes |  | `TIMEZONE('utc'::TEXT, NOW())` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | Yes |  | `TIMEZONE('utc'::TEXT, NOW())` | -- | -- | Timestamp when the row was last updated. |

### permit_audit_log

Stores permit audit log records used by the MusikaLokal platform. Domain: **Moderation & Audit**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the permit audit log row. |
| `entity_type` | `VARCHAR(20)` | Yes |  | -- | -- | `(entity_type IN ('studio', 'gig'))` | Stores the entity type value for this record. |
| `entity_id` | `UUID` | Yes |  | -- | -- | -- | Stores the entity id value for this record. |
| `action` | `VARCHAR(20)` | Yes |  | -- | -- | `(action IN ('submitted', 'approved', 'rejected', 'resubmitted'))` | Stores the action value for this record. |
| `performed_by` | `UUID` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `reason` | `TEXT` | No |  | -- | -- | -- | Stores the reason value for this record. |
| `notes` | `TEXT` | No |  | -- | -- | -- | Free-form notes about this record. |
| `metadata` | `JSONB` | No |  | `'{}'` | -- | -- | Structured supplemental metadata. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | Yes |  | `TIMEZONE('utc'::TEXT, NOW())` | -- | -- | Timestamp when the row was created. |
| `previous_status` | `TEXT` | No |  | -- | -- | -- | Lifecycle state for previous. |
| `new_status` | `TEXT` | No |  | -- | -- | -- | Lifecycle state for new. |
| `rejection_reason` | `TEXT` | No |  | -- | -- | -- | Stores the rejection reason value for this record. |
| `admin_notes` | `TEXT` | No |  | -- | -- | -- | Free-form notes about admin. |

### platform_withdrawal_payment_links

Stores platform withdrawal payment links records used by the MusikaLokal platform. Domain: **Wallet & Payments**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the platform withdrawal payment links row. |
| `withdrawal_id` | `uuid` | Yes | FK | -- | `platform_withdrawals.id` | -- | References `platform_withdrawals.id`. |
| `booking_id` | `uuid` | Yes | FK | -- | `studio_bookings.id` | -- | References `studio_bookings.id`. |
| `payment_status` | `text` | No |  | -- | -- | -- | Lifecycle state for payment. |
| `payment_amount` | `numeric` | Yes |  | `0` | -- | -- | Monetary or rate value for payment amount. |
| `provider_earning` | `numeric` | Yes |  | `0` | -- | -- | Stores the provider earning value for this record. |
| `refund_amount` | `numeric` | Yes |  | `0` | -- | -- | Monetary or rate value for refund amount. |
| `platform_net_amount` | `numeric` | Yes |  | `0` | -- | -- | Monetary or rate value for platform net amount. |
| `payment_reference` | `text` | No |  | -- | -- | -- | Stores the payment reference value for this record. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### platform_withdrawals

Stores platform withdrawals records used by the MusikaLokal platform. Domain: **Wallet & Payments**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the platform withdrawals row. |
| `amount` | `numeric` | Yes |  | -- | -- | `(amount >= 100)` | Monetary or rate value for amount. |
| `status` | `text` | Yes |  | `'completed'` | -- | `(status IN ('completed', 'cancelled'))` | Current lifecycle state of this record. |
| `reference_number` | `text` | Yes | UQ | -- | -- | -- | Stores the reference number value for this record. |
| `notes` | `text` | No |  | -- | -- | -- | Free-form notes about this record. |
| `source_gross_revenue` | `numeric` | Yes |  | `0` | -- | -- | Stores the source gross revenue value for this record. |
| `source_provider_earnings` | `numeric` | Yes |  | `0` | -- | -- | Stores the source provider earnings value for this record. |
| `source_refunds` | `numeric` | Yes |  | `0` | -- | -- | Stores the source refunds value for this record. |
| `source_platform_net` | `numeric` | Yes |  | `0` | -- | -- | Stores the source platform net value for this record. |
| `available_before` | `numeric` | Yes |  | `0` | -- | -- | Stores the available before value for this record. |
| `available_after` | `numeric` | Yes |  | `0` | -- | -- | Stores the available after value for this record. |
| `payment_count` | `integer` | Yes |  | `0` | -- | -- | Stored count of payment. |
| `processed_by` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `processed_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp for the processed event. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was last updated. |

### playlist_audio_fingerprints

Maps private ACRCloud custom-content fingerprints to user-owned playlist items for same-recording evidence. Domain: **Playlists & Radio**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the playlist audio fingerprints row. |
| `playlist_item_id` | `uuid` | Yes | FK, UQ | -- | `playlist_items.id` | -- | References `playlist_items.id`. |
| `owner_user_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `provider` | `text` | Yes |  | `'acrcloud_custom'` | -- | -- | Stores the provider value for this record. |
| `provider_bucket_id` | `text` | No |  | -- | -- | -- | Stores the provider bucket id value for this record. |
| `provider_file_id` | `text` | No |  | -- | -- | -- | Stores the provider file id value for this record. |
| `provider_acrid` | `text` | No |  | -- | -- | -- | ACRCloud custom-file ACRID returned by the custom recognition project; not a copyright ownership identifier. |
| `status` | `text` | Yes |  | `'processing'` | -- | -- | Provider indexing state. A match is trusted only after ACRCloud returns the provider ACRID during identification. |
| `error_message` | `text` | No |  | -- | -- | -- | Stores the error message value for this record. |
| `metadata` | `jsonb` | Yes |  | `'{}'::jsonb` | -- | -- | Structured supplemental metadata. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was last updated. |

### playlist_items

Ordered tracks and audio metadata within playlists. Domain: **Playlists & Radio**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the playlist items row. |
| `playlist_id` | `uuid` | Yes | FK | -- | `playlists.id` | -- | References `playlists.id`. |
| `title` | `text` | Yes |  | -- | -- | `(char_length(title) BETWEEN 1 AND 200)` | Stores the title value for this record. |
| `artist_name` | `text` | No |  | -- | -- | `(char_length(artist_name) <= 200)` | Stores the artist name value for this record. |
| `duration_seconds` | `numeric` | No |  | -- | -- | -- | Stores the duration seconds value for this record. |
| `position` | `integer` | Yes |  | `0` | -- | -- | Stores the position value for this record. |
| `teaser_asset_id` | `uuid` | No | FK | -- | `playlist_teaser_assets.id` | -- | References `playlist_teaser_assets.id`. |
| `external_link_id` | `uuid` | No | FK | -- | `external_platform_links.id` | -- | References `external_platform_links.id`. |
| `created_at` | `timestamp with time zone` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `audio_url` | `text` | No |  | -- | -- | -- | URL for the audio resource. |
| `cover_image_url` | `text` | No |  | -- | -- | -- | Optional per-track artwork shown in radio and playlist track displays before falling back to playlist artwork. |
| `copyright_status` | `text` | Yes |  | `'not_required'` | -- | -- | Controls whether an uploaded playlist MP3 is public: not_required/approved are public; pending_review/declined are hidden from public playback. |
| `copyright_review_id` | `uuid` | No | FK | -- | `manual_identity_reviews.id` | -- | Manual identity review row used for released-track ownership approval. |
| `copyright_metadata` | `jsonb` | Yes |  | `'{}'::jsonb` | -- | -- | Structured supplemental metadata. |

### playlist_play_events

Event history for playlist play. Domain: **Playlists & Radio**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the playlist play events row. |
| `playlist_id` | `uuid` | No | FK | -- | `playlists.id` | -- | References `playlists.id`. |
| `item_id` | `uuid` | No | FK | -- | `playlist_items.id` | -- | References `playlist_items.id`. |
| `station_id` | `uuid` | No | FK | -- | `stations.id` | -- | References `stations.id`. |
| `user_id` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `event_type` | `text` | Yes |  | -- | -- | `(event_type IN ('teaser_play', 'outbound_click', 'station_tune_in', 'station_tune_out'))` | Stores the event type value for this record. |
| `platform` | `text` | No |  | -- | -- | -- | Stores the platform value for this record. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### playlist_teaser_assets

Stores playlist teaser assets records used by the MusikaLokal platform. Domain: **Playlists & Radio**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the playlist teaser assets row. |
| `playlist_id` | `uuid` | Yes | FK | -- | `playlists.id` | -- | References `playlists.id`. |
| `uploader_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `asset_type` | `text` | Yes |  | -- | -- | `(asset_type IN ('teaser_clip', 'cover_art', 'track_preview'))` | Stores the asset type value for this record. |
| `storage_path` | `text` | Yes |  | -- | -- | -- | Stores the storage path value for this record. |
| `mime_type` | `text` | No |  | -- | -- | -- | Stores the mime type value for this record. |
| `duration_seconds` | `numeric` | No |  | -- | -- | -- | Stores the duration seconds value for this record. |
| `file_size_bytes` | `bigint` | No |  | -- | -- | -- | Stores the file size bytes value for this record. |
| `screen_result` | `text` | No |  | -- | -- | `(screen_result IN ('passed', 'failed', 'pending'))` | Stores the screen result value for this record. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### playlists

Curated audio collections owned by profiles, groups, or other supported entities. Domain: **Playlists & Radio**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the playlists row. |
| `creator_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `title` | `text` | Yes |  | -- | -- | `(char_length(title) BETWEEN 1 AND 200)` | Stores the title value for this record. |
| `description` | `text` | No |  | -- | -- | `(char_length(description) <= 2000)` | Human-readable description of the playlists record. |
| `cover_image_url` | `text` | No |  | -- | -- | -- | URL for the cover image resource. |
| `visibility` | `text` | Yes |  | `'public'` | -- | `(visibility IN ('public', 'unlisted', 'promotional'))` | Stores the visibility value for this record. |
| `genre` | `text` | No |  | -- | -- | -- | Stores the genre value for this record. |
| `track_count` | `integer` | No |  | `0` | -- | `(track_count >= 0)` | Stored count of track. |
| `total_duration_seconds` | `numeric` | No |  | `0` | -- | -- | Stores the total duration seconds value for this record. |
| `is_featured` | `boolean` | No |  | `false` | -- | -- | Boolean flag for is featured. |
| `is_hidden` | `boolean` | No |  | `false` | -- | -- | Boolean flag for is hidden. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was last updated. |
| `owner_group_id` | `uuid` | No | FK | -- | `groups.id` | -- | References `groups.id`. |

### post_comments

Threaded comments on social-feed posts. Domain: **Social**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the post comments row. |
| `post_id` | `uuid` | Yes | FK | -- | `feed_posts.id` | -- | References `feed_posts.id`. |
| `author_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `parent_comment_id` | `uuid` | No | FK | -- | `post_comments.id` | -- | References `post_comments.id`. |
| `content` | `text` | Yes |  | -- | -- | `(char_length(content) BETWEEN 1 AND 2000)` | Stores the content value for this record. |
| `is_hidden` | `boolean` | No |  | `false` | -- | -- | Boolean flag for is hidden. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was last updated. |
| `moderation_status` | `text` | Yes |  | `'approved'` | -- | -- | Lifecycle state for moderation. |
| `moderation_reason` | `text` | No |  | -- | -- | -- | Stores the moderation reason value for this record. |
| `moderation_categories` | `jsonb` | Yes |  | `'[]'::jsonb` | -- | -- | Stores the moderation categories value for this record. |
| `moderation_score` | `numeric` | No |  | -- | -- | -- | Stores the moderation score value for this record. |
| `moderation_provider` | `text` | No |  | -- | -- | -- | Stores the moderation provider value for this record. |
| `moderated_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the moderated event. |
| `moderation_metadata` | `jsonb` | Yes |  | `'{}'::jsonb` | -- | -- | Structured supplemental metadata. |

### post_media

Media assets attached to post records. Domain: **Social**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the post media row. |
| `post_id` | `uuid` | Yes | FK | -- | `feed_posts.id` | -- | References `feed_posts.id`. |
| `media_type` | `text` | Yes |  | -- | -- | `(media_type IN ('image', 'teaser_clip', 'cover_art'))` | Stores the media type value for this record. |
| `storage_path` | `text` | Yes |  | -- | -- | -- | Stores the storage path value for this record. |
| `mime_type` | `text` | No |  | -- | -- | -- | Stores the mime type value for this record. |
| `width` | `integer` | No |  | -- | -- | -- | Stores the width value for this record. |
| `height` | `integer` | No |  | -- | -- | -- | Stores the height value for this record. |
| `duration_seconds` | `numeric` | No |  | -- | -- | -- | Stores the duration seconds value for this record. |
| `display_order` | `integer` | No |  | `0` | -- | -- | Stores the display order value for this record. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `thumbnail_path` | `text` | No |  | -- | -- | -- | Stores the thumbnail path value for this record. |
| `is_cover` | `boolean` | Yes |  | `false` | -- | -- | Boolean flag for is cover. |
| `safety_context` | `text` | No |  | -- | -- | -- | Stores the safety context value for this record. |
| `safety_checked_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the safety checked event. |
| `safety_status` | `text` | Yes |  | `'passed'` | -- | -- | Lifecycle state for safety. |
| `safety_metadata` | `jsonb` | Yes |  | `'{}'::jsonb` | -- | -- | Structured supplemental metadata. |

### post_reactions

Stores post reactions records used by the MusikaLokal platform. Domain: **Social**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the post reactions row. |
| `post_id` | `uuid` | Yes | FK | -- | `feed_posts.id` | -- | References `feed_posts.id`. |
| `user_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `reaction_type` | `text` | Yes |  | `'like'` | -- | `(reaction_type IN ('like', 'love', 'fire', 'clap', 'sad'))` | Stores the reaction type value for this record. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### product_media

Media assets attached to product records. Domain: **Marketplace**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the product media row. |
| `product_id` | `uuid` | Yes | FK | -- | `products.id` | -- | References `products.id`. |
| `media_type` | `text` | Yes |  | `'image'` | -- | `(media_type IN ('image', 'video', 'promo_clip'))` | Stores the media type value for this record. |
| `storage_path` | `text` | Yes |  | -- | -- | -- | Stores the storage path value for this record. |
| `mime_type` | `text` | No |  | -- | -- | -- | Stores the mime type value for this record. |
| `display_order` | `integer` | No |  | `0` | -- | -- | Stores the display order value for this record. |
| `is_primary` | `boolean` | No |  | `false` | -- | -- | Boolean flag for is primary. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### product_variants

Stores product variants records used by the MusikaLokal platform. Domain: **Marketplace**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the product variants row. |
| `product_id` | `uuid` | Yes | FK | -- | `products.id` | -- | References `products.id`. |
| `variant_label` | `text` | Yes |  | -- | -- | `(char_length(variant_label) BETWEEN 1 AND 100)` | Stores the variant label value for this record. |
| `variant_type` | `text` | Yes |  | `'size'` | -- | `(variant_type IN ('size', 'color', 'format', 'edition', 'other'))` | Stores the variant type value for this record. |
| `price_override` | `numeric` | No |  | -- | -- | `(price_override IS NULL OR price_override >= 0)` | Monetary or rate value for price override. |
| `sku` | `text` | No |  | -- | -- | `(char_length(sku) <= 50)` | Stores the sku value for this record. |
| `stock_quantity` | `integer` | No |  | `0` | -- | `(stock_quantity >= 0)` | Stores the stock quantity value for this record. |
| `is_available` | `boolean` | No |  | `true` | -- | -- | Boolean flag for is available. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### production_team_members

Normalized membership records for production team. Domain: **Production & Collaboration**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the production team members row. |
| `team_id` | `uuid` | Yes | FK | -- | `production_teams.id` | -- | References `production_teams.id`. |
| `user_id` | `uuid` | Yes | FK | -- | `auth.users.id` | -- | References `auth.users.id`. |
| `role` | `text` | Yes |  | `'member'::text` | -- | -- | Stores the role value for this record. |
| `joined_at` | `timestamptz` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp for the joined event. |

### production_team_roster

Stores production team roster records used by the MusikaLokal platform. Domain: **Production & Collaboration**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the production team roster row. |
| `team_id` | `uuid` | Yes | FK | -- | `production_teams.id` | -- | References `production_teams.id`. |
| `entity_kind` | `text` | Yes |  | -- | -- | `(entity_kind IN ('musician', 'duo', 'group'))` | Stores the entity kind value for this record. |
| `profile_id` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `group_id` | `uuid` | No | FK | -- | `groups.id` | -- | References `groups.id`. |
| `added_by_user_id` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### production_teams

Producer-led teams used for collaboration, roster management, and venue-facing applications. Domain: **Production & Collaboration**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the production teams row. |
| `owner_id` | `uuid` | Yes | FK | -- | `auth.users.id` | -- | References `auth.users.id`. |
| `name` | `text` | Yes |  | -- | -- | -- | Stores the name value for this record. |
| `description` | `text` | No |  | -- | -- | -- | Human-readable description of the production teams record. |
| `logo_url` | `text` | No |  | -- | -- | -- | URL for the logo resource. |
| `created_at` | `timestamptz` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamptz` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was last updated. |
| `open_production_applications` | `BOOLEAN` | Yes |  | `TRUE` | -- | -- | Controls whether musicians, duos, and groups can apply to join a production team. |

### products

Marketplace product listings offered by sellers. Domain: **Marketplace**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the products row. |
| `seller_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `group_id` | `uuid` | No | FK | -- | `groups.id` | -- | References `groups.id`. |
| `title` | `text` | Yes |  | -- | -- | `(char_length(title) BETWEEN 1 AND 200)` | Stores the title value for this record. |
| `description` | `text` | No |  | -- | -- | `(char_length(description) <= 5000)` | Human-readable description of the products record. |
| `product_type` | `text` | Yes |  | `'merch'` | -- | `(product_type IN ('merch', 'digital_drop', 'exclusive_content'))` | Stores the product type value for this record. |
| `category` | `text` | No |  | -- | -- | `(category IN ('apparel', 'accessories', 'vinyl', 'cd', 'poster', 'sticker', 'digital', 'bundle', 'other'))` | Stores the category value for this record. |
| `base_price` | `numeric` | Yes |  | -- | -- | `(base_price >= 0)` | Monetary or rate value for base price. |
| `currency` | `text` | Yes |  | `'PHP'` | -- | `(char_length(currency) = 3)` | Stores the currency value for this record. |
| `status` | `text` | Yes |  | `'draft'` | -- | `(status IN ('draft', 'active', 'sold_out', 'archived', 'suspended'))` | Current lifecycle state of this record. |
| `is_featured` | `boolean` | No |  | `false` | -- | -- | Boolean flag for is featured. |
| `is_limited_edition` | `boolean` | No |  | `false` | -- | -- | Boolean flag for is limited edition. |
| `limited_quantity` | `integer` | No |  | -- | -- | `(limited_quantity IS NULL OR limited_quantity > 0)` | Stores the limited quantity value for this record. |
| `total_sold` | `integer` | No |  | `0` | -- | `(total_sold >= 0)` | Stores the total sold value for this record. |
| `average_rating` | `numeric` | No |  | `0` | -- | -- | Stores the average rating value for this record. |
| `review_count` | `integer` | No |  | `0` | -- | `(review_count >= 0)` | Stored count of review. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was last updated. |

### profile_genres

Stores profile genres records used by the MusikaLokal platform. Domain: **Identity & Profiles**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the profile genres row. |
| `profile_id` | `UUID` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `genre` | `TEXT` | Yes |  | -- | -- | -- | Stores the genre value for this record. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | Yes |  | `TIMEZONE('utc'::TEXT, NOW())` | -- | -- | Timestamp when the row was created. |

### profile_portfolio_urls

Stores profile portfolio urls records used by the MusikaLokal platform. Domain: **Identity & Profiles**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the profile portfolio urls row. |
| `profile_id` | `UUID` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `portfolio_url` | `TEXT` | Yes |  | -- | -- | -- | URL for the portfolio resource. |
| `sort_order` | `INTEGER` | Yes |  | `0` | -- | -- | Stores the sort order value for this record. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | Yes |  | `TIMEZONE('utc'::TEXT, NOW())` | -- | -- | Timestamp when the row was created. |

### profile_skills

Stores profile skills records used by the MusikaLokal platform. Domain: **Identity & Profiles**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the profile skills row. |
| `profile_id` | `UUID` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `skill` | `TEXT` | Yes |  | -- | -- | -- | Stores the skill value for this record. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | Yes |  | `TIMEZONE('utc'::TEXT, NOW())` | -- | -- | Timestamp when the row was created. |

### profiles

Application accounts and public/private profile attributes for musicians, owners, producers, fans, and administrators. Domain: **Identity & Profiles**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK, FK | -- | `auth.users.id` | -- | References `auth.users.id`. |
| `email` | `text` | Yes | UQ | -- | -- | -- | Stores the email value for this record. |
| `full_name` | `text` | No |  | -- | -- | -- | Stores the full name value for this record. |
| `avatar_url` | `text` | No |  | -- | -- | -- | URL for the avatar resource. |
| `role` | `text` | Yes |  | -- | -- | -- | Stores the role value for this record. |
| `bio` | `text` | No |  | -- | -- | -- | Stores the bio value for this record. |
| `location` | `text` | No |  | -- | -- | -- | Stores the location value for this record. |
| `is_verified` | `boolean` | No |  | `false` | -- | -- | Boolean flag for is verified. |
| `verification_status` | `text` | No |  | -- | -- | -- | Lifecycle state for verification. |
| `didit_session_id` | `text` | No |  | -- | -- | -- | Stores the didit session id value for this record. |
| `id_document_expiry` | `date` | No |  | -- | -- | -- | Stores the id document expiry value for this record. |
| `id_verified_at` | `timestamp with time zone` | No |  | -- | -- | -- | Timestamp for the id verified event. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |
| `interest_vector` | `vector(384)` | No |  | -- | -- | -- | Stores the interest vector value for this record. |
| `contact_number` | `text` | No |  | -- | -- | -- | Stores the contact number value for this record. |
| `address` | `text` | No |  | -- | -- | -- | Stores the address value for this record. |
| `smile_user_id` | `TEXT` | No |  | -- | -- | -- | Smile Identity user ID for document verification |
| `show_gig_statuses` | `BOOLEAN` | Yes |  | `TRUE` | -- | -- | Stores the show gig statuses value for this record. |
| `is_banned` | `boolean` | Yes |  | `false` | -- | -- | Client-visible account ban flag mirrored from admin moderation actions. |
| `banned_until` | `timestamp with time zone` | No |  | -- | -- | -- | When a temporary account ban expires. NULL with is_banned=true means permanent. |
| `ban_reason` | `text` | No |  | -- | -- | -- | Short admin-facing reason or source for the active/last ban. |
| `ban_action` | `text` | No |  | -- | -- | -- | Stores the ban action value for this record. |
| `banned_at` | `timestamp with time zone` | No |  | -- | -- | -- | Timestamp for the banned event. |
| `banned_by` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `ban_lifted_at` | `timestamp with time zone` | No |  | -- | -- | -- | Timestamp for the ban lifted event. |
| `ban_lifted_by` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `latitude` | `double precision` | No |  | -- | -- | -- | Latitude captured by the profile location picker; never inferred from address text during recommendation reads. |
| `longitude` | `double precision` | No |  | -- | -- | -- | Longitude captured by the profile location picker; never inferred from address text during recommendation reads. |

### push_notification_devices

Stores push notification devices records used by the MusikaLokal platform. Domain: **Messaging & Notifications**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the push notification devices row. |
| `user_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `installation_id` | `text` | Yes |  | -- | -- | -- | Stores the installation id value for this record. |
| `push_token` | `text` | Yes |  | -- | -- | -- | Stores the push token value for this record. |
| `token_type` | `text` | Yes |  | `'expo'` | -- | `(token_type in ('expo'))` | Stores the token type value for this record. |
| `platform` | `text` | No |  | -- | -- | `(platform in ('android', 'ios'))` | Stores the platform value for this record. |
| `device_name` | `text` | No |  | -- | -- | -- | Stores the device name value for this record. |
| `app_version` | `text` | No |  | -- | -- | -- | Stores the app version value for this record. |
| `project_id` | `text` | No |  | -- | -- | -- | Stores the project id value for this record. |
| `is_active` | `boolean` | Yes |  | `true` | -- | -- | Boolean flag for is active. |
| `last_seen_at` | `timestamptz` | Yes |  | `timezone('utc', now())` | -- | -- | Timestamp for the last seen event. |
| `created_at` | `timestamptz` | Yes |  | `timezone('utc', now())` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamptz` | Yes |  | `timezone('utc', now())` | -- | -- | Timestamp when the row was last updated. |
| `disabled_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the disabled event. |
| `disabled_reason` | `text` | No |  | -- | -- | -- | Stores the disabled reason value for this record. |

### registration_attempts

Stores registration attempts records used by the MusikaLokal platform. Domain: **Identity & Profiles**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the registration attempts row. |
| `action` | `text` | Yes |  | -- | -- | -- | Stores the action value for this record. |
| `email_hash` | `text` | No |  | -- | -- | -- | Stores the email hash value for this record. |
| `ip_hash` | `text` | No |  | -- | -- | -- | Stores the ip hash value for this record. |
| `device_hash` | `text` | No |  | -- | -- | -- | Stores the device hash value for this record. |
| `user_id` | `uuid` | No |  | -- | -- | -- | Stores the user id value for this record. |
| `didit_session_id` | `text` | No |  | -- | -- | -- | Stores the didit session id value for this record. |
| `blocked` | `boolean` | Yes |  | `false` | -- | -- | Stores the blocked value for this record. |
| `success` | `boolean` | Yes |  | `false` | -- | -- | Stores the success value for this record. |
| `reason` | `text` | No |  | -- | -- | -- | Stores the reason value for this record. |
| `metadata` | `jsonb` | Yes |  | `'{}'::jsonb` | -- | -- | Structured supplemental metadata. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### reports

User-submitted moderation reports and their administrative resolution workflow. Domain: **Moderation & Audit**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the reports row. |
| `reporter_id` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `target_type` | `text` | Yes |  | -- | -- | -- | Stores the target type value for this record. |
| `target_id` | `uuid` | Yes |  | -- | -- | -- | Stores the target id value for this record. |
| `reason` | `text` | Yes |  | -- | -- | -- | Stores the reason value for this record. |
| `details` | `text` | No |  | -- | -- | -- | Stores the details value for this record. |
| `status` | `text` | No |  | `'pending'::text` | -- | -- | Current lifecycle state of this record. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |
| `reviewed_by` | `uuid` | No | FK | -- | `profiles.id` | -- | Admin user id that last reviewed this report. |
| `reviewed_at` | `timestamp with time zone` | No |  | -- | -- | -- | Timestamp when the report was last reviewed by an admin. |
| `moderation_action` | `text` | Yes |  | `'none'` | -- | -- | Last moderation action taken by admin. |
| `moderation_notes` | `text` | No |  | -- | -- | -- | Optional admin moderation notes. |
| `escalation_status` | `text` | Yes |  | `'none'` | -- | -- | Escalation state for admin triage. |
| `escalated_at` | `timestamp with time zone` | No |  | -- | -- | -- | Timestamp when report was escalated to manual review. |
| `escalation_reason` | `text` | No |  | -- | -- | -- | Optional reason for escalation. |
| `target_account_action` | `text` | Yes |  | `'none'` | -- | -- | Account-level action applied to the reported owner/profile during report moderation. |
| `target_account_action_expires_at` | `timestamp with time zone` | No |  | -- | -- | -- | Expiry timestamp for temporary account-level moderation actions when applicable. |

### review_likes

Stores review likes records used by the MusikaLokal platform. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the review likes row. |
| `user_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `review_id` | `uuid` | Yes | FK | -- | `reviews.id` | -- | References `reviews.id`. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |

### reviews

Post-engagement ratings and written reviews between platform participants. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the reviews row. |
| `author_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `group_id` | `uuid` | No | FK | -- | `groups.id` | -- | References `groups.id`. |
| `studio_id` | `uuid` | No | FK | -- | `studios.id` | -- | References `studios.id`. |
| `gig_id` | `uuid` | No | FK | -- | `gigs.id` | -- | References `gigs.id`. |
| `user_id` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `rating` | `integer` | Yes |  | -- | -- | -- | Stores the rating value for this record. |
| `content` | `text` | No |  | -- | -- | -- | Stores the content value for this record. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |
| `studio_booking_id` | `uuid` | No | FK | -- | `studio_bookings.id` | -- | References `studio_bookings.id`. |
| `gig_application_id` | `uuid` | No | FK | -- | `gig_applications.id` | -- | References `gig_applications.id`. |

### shipping_profiles

Stores shipping profiles records used by the MusikaLokal platform. Domain: **Marketplace**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the shipping profiles row. |
| `seller_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `name` | `text` | Yes |  | -- | -- | `(char_length(name) BETWEEN 1 AND 100)` | Stores the name value for this record. |
| `shipping_type` | `text` | Yes |  | `'standard'` | -- | `(shipping_type IN ('standard', 'express', 'pickup', 'digital'))` | Stores the shipping type value for this record. |
| `base_fee` | `numeric` | No |  | `0` | -- | `(base_fee >= 0)` | Monetary or rate value for base fee. |
| `currency` | `text` | Yes |  | `'PHP'` | -- | -- | Stores the currency value for this record. |
| `estimated_days_min` | `integer` | No |  | `3` | -- | -- | Stores the estimated days min value for this record. |
| `estimated_days_max` | `integer` | No |  | `7` | -- | -- | Stores the estimated days max value for this record. |
| `regions` | `text[]` | No |  | `ARRAY['PH']` | -- | -- | Stores the regions value for this record. |
| `is_default` | `boolean` | No |  | `false` | -- | -- | Boolean flag for is default. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### social_activity_events

Event history for social activity. Domain: **Social**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the social activity events row. |
| `event_type` | `text` | Yes |  | -- | -- | `(event_type IN (         'follow', 'unfollow',         'post_created', 'post_updated', 'post_deleted',         'reaction_added', 'reaction_removed',         'comment_added', 'comment_deleted',         'post_reported', 'post_hidden', 'post_restored'     ))` | Stores the event type value for this record. |
| `actor_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `target_user_id` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `post_id` | `uuid` | No | FK | -- | `feed_posts.id` | -- | References `feed_posts.id`. |
| `comment_id` | `uuid` | No | FK | -- | `post_comments.id` | -- | References `post_comments.id`. |
| `metadata` | `jsonb` | No |  | `'{}'` | -- | -- | Structured supplemental metadata. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### staff_listing_access

Stores staff listing access records used by the MusikaLokal platform. Domain: **Production & Collaboration**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the staff listing access row. |
| `staff_user_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `entity_type` | `text` | Yes |  | -- | -- | `(entity_type = ANY (ARRAY['studio'::text, 'venue'::text, 'production'::text]))` | Stores the entity type value for this record. |
| `studio_id` | `uuid` | No | FK | -- | `studios.id` | -- | References `studios.id`. |
| `gig_id` | `uuid` | No | FK | -- | `gigs.id` | -- | References `gigs.id`. |
| `production_team_id` | `uuid` | No | FK | -- | `production_teams.id` | -- | References `production_teams.id`. |
| `access_level` | `smallint` | Yes |  | -- | -- | `(access_level = ANY (ARRAY[1::smallint, 2::smallint, 3::smallint]))` | Stores the access level value for this record. |
| `created_by` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `created_at` | `timestamptz` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamptz` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was last updated. |
| `revoked_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the revoked event. |

### station_playlist_slots

Stores station playlist slots records used by the MusikaLokal platform. Domain: **Playlists & Radio**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the station playlist slots row. |
| `station_id` | `uuid` | Yes | FK | -- | `stations.id` | -- | References `stations.id`. |
| `playlist_id` | `uuid` | Yes | FK | -- | `playlists.id` | -- | References `playlists.id`. |
| `position` | `integer` | Yes |  | `0` | -- | -- | Stores the position value for this record. |
| `label` | `text` | No |  | -- | -- | `(char_length(label) <= 200)` | Stores the label value for this record. |
| `starts_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the starts event. |
| `ends_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the ends event. |
| `is_active` | `boolean` | No |  | `true` | -- | -- | Boolean flag for is active. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### stations

Radio-style stations and their ownership, presentation, and rotation settings. Domain: **Playlists & Radio**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the stations row. |
| `creator_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `name` | `text` | Yes |  | -- | -- | `(char_length(name) BETWEEN 1 AND 200)` | Stores the name value for this record. |
| `description` | `text` | No |  | -- | -- | `(char_length(description) <= 2000)` | Human-readable description of the stations record. |
| `cover_image_url` | `text` | No |  | -- | -- | -- | URL for the cover image resource. |
| `genre` | `text` | No |  | -- | -- | -- | Stores the genre value for this record. |
| `is_active` | `boolean` | No |  | `true` | -- | -- | Boolean flag for is active. |
| `is_featured` | `boolean` | No |  | `false` | -- | -- | Boolean flag for is featured. |
| `listener_count` | `integer` | No |  | `0` | -- | `(listener_count >= 0)` | Stored count of listener. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was last updated. |
| `rotation_interval_minutes` | `integer` | Yes |  | `15` | -- | -- | Stores the rotation interval minutes value for this record. |
| `managed_group_id` | `uuid` | No | FK | -- | `groups.id` | -- | Group or duo whose radio station this row represents. Null means the station represents managed_profile_id directly. |
| `managed_profile_id` | `uuid` | No | FK | -- | `profiles.id` | -- | Profile whose radio station this row represents. Admins may manage the row while creator_id points at the admin account. |
| `stream_url` | `text` | No |  | -- | -- | -- | Public listener URL for a real continuous station stream, such as Icecast, HLS, or managed radio output. |
| `stream_status` | `text` | Yes |  | `'offline'` | -- | -- | Current broadcast state for stream_url stations: offline, live, or autoplay fallback. |
| `now_playing_title` | `text` | No |  | -- | -- | -- | Stores the now playing title value for this record. |
| `now_playing_artist` | `text` | No |  | -- | -- | -- | Stores the now playing artist value for this record. |
| `last_seen_live_at` | `timestamptz` | No |  | -- | -- | -- | Last time the station was confirmed live by the broadcast/control plane. |

### studio_amenities

Stores studio amenities records used by the MusikaLokal platform. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the studio amenities row. |
| `studio_id` | `UUID` | Yes | FK | -- | `studios.id` | -- | References `studios.id`. |
| `amenity` | `TEXT` | Yes |  | -- | -- | -- | Stores the amenity value for this record. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | Yes |  | `TIMEZONE('utc'::TEXT, NOW())` | -- | -- | Timestamp when the row was created. |

### studio_availability_slots

Stores studio availability slots records used by the MusikaLokal platform. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the studio availability slots row. |
| `studio_id` | `UUID` | Yes | FK | -- | `studios.id` | -- | References `studios.id`. |
| `day_of_week` | `SMALLINT` | No |  | -- | -- | -- | Stores the day of week value for this record. |
| `slot_date` | `DATE` | No |  | -- | -- | -- | Calendar date for slot. |
| `start_time` | `TIME` | Yes |  | -- | -- | -- | Stores the start time value for this record. |
| `end_time` | `TIME` | Yes |  | -- | -- | -- | Stores the end time value for this record. |
| `is_open` | `BOOLEAN` | Yes |  | `TRUE` | -- | -- | Boolean flag for is open. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | Yes |  | `TIMEZONE('utc'::TEXT, NOW())` | -- | -- | Timestamp when the row was created. |

### studio_booking_slots

Stores studio booking slots records used by the MusikaLokal platform. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the studio booking slots row. |
| `booking_id` | `uuid` | Yes | FK | -- | `studio_bookings.id` | -- | References `studio_bookings.id`. |
| `start_time` | `time` | Yes |  | -- | -- | -- | Stores the start time value for this record. |
| `end_time` | `time` | Yes |  | -- | -- | -- | Stores the end time value for this record. |
| `sort_order` | `integer` | Yes |  | `0` | -- | -- | Stores the sort order value for this record. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### studio_bookings

Studio reservation requests, payment state, schedule, attendance, cancellation, relocation, and completion data. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the studio bookings row. |
| `user_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `studio_id` | `uuid` | Yes | FK | -- | `studios.id` | -- | References `studios.id`. |
| `booking_date` | `date` | Yes |  | -- | -- | -- | Calendar date for booking. |
| `start_time` | `time without time zone` | Yes |  | -- | -- | -- | Stores the start time value for this record. |
| `end_time` | `time without time zone` | Yes |  | -- | -- | -- | Stores the end time value for this record. |
| `base_rate` | `numeric` | Yes |  | -- | -- | -- | Monetary or rate value for base rate. |
| `hours` | `numeric` | Yes |  | -- | -- | -- | Stores the hours value for this record. |
| `subtotal` | `numeric` | Yes |  | -- | -- | -- | Stores the subtotal value for this record. |
| `modifiers_applied` | `jsonb` | No |  | `'{}'::jsonb` | -- | -- | Stores the modifiers applied value for this record. |
| `final_price` | `numeric` | Yes |  | -- | -- | -- | Monetary or rate value for final price. |
| `notes` | `text` | No |  | -- | -- | -- | Free-form notes about this record. |
| `status` | `text` | No |  | `'pending'::text` | -- | -- | Current lifecycle state of this record. |
| `buffer_minutes` | `integer` | No |  | `30` | -- | -- | Stores the buffer minutes value for this record. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was last updated. |
| `proof_url` | `text` | No |  | -- | -- | -- | URL for the proof resource. |
| `reviewed_by_customer` | `boolean` | No |  | `false` | -- | -- | Stores the reviewed by customer value for this record. |
| `reviewed_by_owner` | `boolean` | No |  | `false` | -- | -- | Stores the reviewed by owner value for this record. |
| `cancellation_reason` | `text` | No |  | -- | -- | -- | Stores the cancellation reason value for this record. |
| `check_in_time` | `timestamptz` | No |  | -- | -- | -- | Stores the check in time value for this record. |
| `payment_status` | `text` | No |  | `'unpaid'::text` | -- | -- | Payment status: unpaid, pending, paid, failed, refunded |
| `payment_intent_id` | `text` | No |  | -- | -- | -- | PayMongo payment intent ID |
| `checkout_session_id` | `text` | No |  | -- | -- | -- | PayMongo checkout session ID |
| `payment_method` | `text` | No |  | -- | -- | -- | Payment method used (gcash, card, maya, etc.) |
| `paid_at` | `timestamp with time zone` | No |  | -- | -- | -- | Timestamp when payment was completed |
| `payment_amount` | `numeric` | No |  | -- | -- | -- | Amount paid in PHP |
| `refund_amount` | `numeric(10,2)` | No |  | -- | -- | -- | Monetary or rate value for refund amount. |
| `refund_id` | `text` | No |  | -- | -- | -- | Stores the refund id value for this record. |
| `refunded_at` | `timestamp with time zone` | No |  | -- | -- | -- | Timestamp for the refunded event. |
| `payment_type` | `text` | No |  | `'full'::text` | -- | -- | Type of payment: full (100%), downpayment (50%), or balance (remaining amount) |
| `remaining_balance` | `numeric` | No |  | `0` | -- | -- | Remaining amount to be paid (for downpayments) |
| `session_type` | `TEXT` | No |  | `'rehearsal'` | -- | `(session_type IN ('rehearsal', 'recording'))` | Stores the session type value for this record. |
| `relocation_requested_at` | `TIMESTAMPTZ` | No |  | -- | -- | -- | Timestamp for the relocation requested event. |
| `relocation_expires_at` | `TIMESTAMPTZ` | No |  | -- | -- | -- | Timestamp for the relocation expires event. |
| `relocation_proposed_date` | `DATE` | No |  | -- | -- | -- | Calendar date for relocation proposed. |
| `relocation_proposed_start_time` | `TIME` | No |  | -- | -- | -- | Stores the relocation proposed start time value for this record. |
| `relocation_proposed_end_time` | `TIME` | No |  | -- | -- | -- | Stores the relocation proposed end time value for this record. |
| `payout_hold` | `boolean` | Yes |  | `false` | -- | -- | Stores the payout hold value for this record. |
| `payout_hold_reason` | `text` | No |  | -- | -- | -- | Stores the payout hold reason value for this record. |
| `payout_hold_at` | `timestamp with time zone` | No |  | -- | -- | -- | Timestamp for the payout hold event. |
| `payout_released_at` | `timestamp with time zone` | No |  | -- | -- | -- | Timestamp for the payout released event. |
| `cancellation_policy_id` | `uuid` | No | FK | -- | `booking_cancellation_policies.id` | -- | References `booking_cancellation_policies.id`. |
| `cancellation_policy_snapshot` | `jsonb` | No |  | -- | -- | -- | Stores the cancellation policy snapshot value for this record. |

### studio_date_overrides

Date-specific exceptions (3NF) Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the studio date overrides row. |
| `studio_id` | `uuid` | Yes | FK | -- | `studios.id` | -- | References `studios.id`. |
| `override_date` | `date` | Yes |  | -- | -- | -- | Calendar date for override. |
| `is_open` | `boolean` | Yes |  | `false` | -- | -- | Boolean flag for is open. |
| `open_time` | `time without time zone` | No |  | -- | -- | -- | Stores the open time value for this record. |
| `close_time` | `time without time zone` | No |  | -- | -- | -- | Stores the close time value for this record. |
| `reason` | `text` | No |  | -- | -- | -- | Stores the reason value for this record. |
| `slot_order` | `integer` | Yes |  | `0` | -- | -- | Stores the slot order value for this record. |

### studio_deletion_audit

Audit history for studio deletion operations. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the studio deletion audit row. |
| `studio_id` | `UUID` | Yes |  | -- | -- | -- | Stores the studio id value for this record. |
| `owner_id` | `UUID` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `deleted_by` | `UUID` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `deleted_at` | `TIMESTAMPTZ` | Yes |  | `timezone('utc'::TEXT, now())` | -- | -- | Soft-deletion timestamp; null while active. |
| `studio_snapshot` | `JSONB` | Yes |  | -- | -- | -- | Stores the studio snapshot value for this record. |
| `related_counts` | `JSONB` | Yes |  | -- | -- | -- | Stores the related counts value for this record. |
| `storage_cleanup` | `JSONB` | No |  | -- | -- | -- | Stores the storage cleanup value for this record. |
| `reason` | `TEXT` | No |  | -- | -- | -- | Stores the reason value for this record. |

### studio_instruments

Stores studio instruments records used by the MusikaLokal platform. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the studio instruments row. |
| `studio_id` | `UUID` | Yes | FK | -- | `studios.id` | -- | References `studios.id`. |
| `instrument_name` | `TEXT` | Yes |  | -- | -- | -- | Stores the instrument name value for this record. |
| `image_url` | `TEXT` | No |  | -- | -- | -- | URL for the image resource. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | Yes |  | `TIMEZONE('utc'::TEXT, NOW())` | -- | -- | Timestamp when the row was created. |
| `quantity` | `integer` | No |  | -- | -- | -- | Stores the quantity value for this record. |
| `description` | `text` | No |  | -- | -- | -- | Human-readable description of the studio instruments record. |

### studio_media

Media assets attached to studio records. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the studio media row. |
| `studio_id` | `UUID` | Yes | FK | -- | `studios.id` | -- | References `studios.id`. |
| `media_type` | `TEXT` | Yes |  | -- | -- | `(media_type IN ('image'))` | Stores the media type value for this record. |
| `media_url` | `TEXT` | Yes |  | -- | -- | -- | URL for the media resource. |
| `sort_order` | `INTEGER` | Yes |  | `0` | -- | -- | Stores the sort order value for this record. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | Yes |  | `TIMEZONE('utc'::TEXT, NOW())` | -- | -- | Timestamp when the row was created. |

### studio_open_dates

Stores studio open dates records used by the MusikaLokal platform. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the studio open dates row. |
| `studio_id` | `UUID` | Yes | FK | -- | `studios.id` | -- | References `studios.id`. |
| `open_date` | `DATE` | Yes |  | -- | -- | -- | Calendar date for open. |
| `is_open` | `BOOLEAN` | Yes |  | `TRUE` | -- | -- | Boolean flag for is open. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | Yes |  | `TIMEZONE('utc'::TEXT, NOW())` | -- | -- | Timestamp when the row was created. |

### studio_operating_hours

Weekly operating hours template (3NF) Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the studio operating hours row. |
| `studio_id` | `uuid` | Yes | FK | -- | `studios.id` | -- | References `studios.id`. |
| `day_of_week` | `integer` | Yes |  | -- | -- | -- | Stores the day of week value for this record. |
| `is_open` | `boolean` | Yes |  | `true` | -- | -- | Boolean flag for is open. |
| `open_time` | `time without time zone` | No |  | -- | -- | -- | Stores the open time value for this record. |
| `close_time` | `time without time zone` | No |  | -- | -- | -- | Stores the close time value for this record. |
| `slot_order` | `integer` | No |  | `0` | -- | -- | Stores the slot order value for this record. |
| `reason` | `text` | No |  | -- | -- | -- | Stores the reason value for this record. |
| `weekly_schedule_scope` | `text` | No |  | -- | -- | -- | Stores the weekly schedule scope value for this record. |
| `weekly_schedule_end_date` | `date` | No |  | -- | -- | -- | Calendar date for weekly schedule end. |
| `weekly_schedule_dates` | `jsonb` | No |  | -- | -- | -- | Stores the weekly schedule dates value for this record. |

### studio_owner_penalties

Stores studio owner penalties records used by the MusikaLokal platform. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the studio owner penalties row. |
| `owner_id` | `UUID` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `studio_id` | `UUID` | Yes | FK | -- | `studios.id` | -- | References `studios.id`. |
| `booking_id` | `UUID` | Yes | FK | -- | `studio_bookings.id` | -- | References `studio_bookings.id`. |
| `penalty_type` | `TEXT` | Yes |  | -- | -- | `(penalty_type IN ('forced_relocation_expired'))` | Stores the penalty type value for this record. |
| `penalty_points` | `INTEGER` | Yes |  | `1` | -- | `(penalty_points > 0)` | Stores the penalty points value for this record. |
| `reason` | `TEXT` | Yes |  | -- | -- | -- | Stores the reason value for this record. |
| `created_at` | `TIMESTAMPTZ` | Yes |  | `timezone('utc'::TEXT, now())` | -- | -- | Timestamp when the row was created. |

### studio_promotions

Stores studio promotions records used by the MusikaLokal platform. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the studio promotions row. |
| `studio_id` | `UUID` | Yes | FK | -- | `studios.id` | -- | References `studios.id`. |
| `name` | `TEXT` | Yes |  | -- | -- | -- | Stores the name value for this record. |
| `description` | `TEXT` | No |  | -- | -- | -- | Human-readable description of the studio promotions record. |
| `discount_type` | `TEXT` | Yes |  | -- | -- | `(discount_type IN ('percentage', 'fixed_amount'))` | Stores the discount type value for this record. |
| `discount_value` | `NUMERIC(10,2)` | Yes |  | -- | -- | `(discount_value > 0)` | Stores the discount value value for this record. |
| `is_permanent` | `BOOLEAN` | Yes |  | `false` | -- | -- | Boolean flag for is permanent. |
| `start_date` | `DATE` | No |  | -- | -- | -- | Calendar date for start. |
| `end_date` | `DATE` | No |  | -- | -- | -- | Calendar date for end. |
| `applies_to` | `TEXT` | Yes |  | `'both'` | -- | `(applies_to IN ('rehearsal', 'recording', 'both'))` | Stores the applies to value for this record. |
| `is_active` | `BOOLEAN` | Yes |  | `true` | -- | -- | Boolean flag for is active. |
| `created_at` | `TIMESTAMPTZ` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `TIMESTAMPTZ` | Yes |  | `now()` | -- | -- | Timestamp when the row was last updated. |
| `criteria` | `TEXT` | No |  | -- | -- | -- | Stores the criteria value for this record. |
| `minimum_booking_hours` | `NUMERIC(10,2)` | No |  | -- | -- | -- | Stores the minimum booking hours value for this record. |
| `minimum_spend` | `NUMERIC(12,2)` | No |  | -- | -- | -- | Stores the minimum spend value for this record. |

### studio_settings

Booking rules and pricing modifiers (3NF) Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the studio settings row. |
| `studio_id` | `uuid` | Yes | FK, UQ | -- | `studios.id` | -- | References `studios.id`. |
| `time_zone` | `text` | Yes |  | `'Asia/Manila'::text` | -- | -- | Stores the time zone value for this record. |
| `slot_increment_minutes` | `integer` | No |  | `30` | -- | -- | Stores the slot increment minutes value for this record. |
| `min_booking_duration_hours` | `numeric` | No |  | `2.0` | -- | -- | Stores the min booking duration hours value for this record. |
| `max_booking_duration_hours` | `numeric` | No |  | `12.0` | -- | -- | Stores the max booking duration hours value for this record. |
| `buffer_minutes` | `integer` | No |  | `30` | -- | -- | Stores the buffer minutes value for this record. |
| `lead_time_hours` | `integer` | No |  | `24` | -- | -- | Stores the lead time hours value for this record. |
| `booking_horizon_days` | `integer` | No |  | `90` | -- | -- | Stores the booking horizon days value for this record. |
| `weekend_multiplier` | `numeric` | No |  | `1.0` | -- | -- | Stores the weekend multiplier value for this record. |
| `late_night_multiplier` | `numeric` | No |  | `1.0` | -- | -- | Stores the late night multiplier value for this record. |
| `bulk_discount_threshold_hours` | `integer` | No |  | `10` | -- | -- | Stores the bulk discount threshold hours value for this record. |
| `bulk_discount_percentage` | `numeric` | No |  | `0` | -- | -- | Stores the bulk discount percentage value for this record. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was last updated. |
| `peak_season_multiplier` | `numeric` | No |  | `1.0` | -- | -- | Multiplier for peak season dates (e.g., 1.2 = 20% increase) |
| `peak_season_dates` | `jsonb` | No |  | `'[]'::jsonb` | -- | -- | Array of date ranges for peak season. Format: [{start: "YYYY-MM-DD", end: "YYYY-MM-DD"}] |
| `off_peak_multiplier` | `numeric` | No |  | `1.0` | -- | -- | Discount multiplier for off-peak dates (e.g., 0.8 = 20% discount) |
| `off_peak_dates` | `jsonb` | No |  | `'[]'::jsonb` | -- | -- | Array of date ranges for off-peak season. Format: [{start: "YYYY-MM-DD", end: "YYYY-MM-DD"}] |
| `holiday_multiplier` | `numeric` | No |  | `1.0` | -- | -- | Multiplier for holidays (e.g., 1.5 = 50% increase) |
| `recording_songs_per_block` | `integer` | Yes |  | `1` | -- | -- | Stores the recording songs per block value for this record. |
| `recording_hours_per_block` | `numeric` | Yes |  | `3` | -- | -- | Stores the recording hours per block value for this record. |
| `recording_rate_negotiable` | `boolean` | Yes |  | `false` | -- | -- | Monetary or rate value for recording rate negotiable. |
| `weekly_schedule_scope` | `text` | Yes |  | `'indefinite'` | -- | -- | Stores the weekly schedule scope value for this record. |
| `weekly_schedule_end_date` | `date` | No |  | -- | -- | -- | Calendar date for weekly schedule end. |
| `weekly_schedule_dates` | `jsonb` | Yes |  | `'[]'::jsonb` | -- | -- | Stores the weekly schedule dates value for this record. |

### studio_types

Stores studio types records used by the MusikaLokal platform. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the studio types row. |
| `studio_id` | `UUID` | Yes | FK | -- | `studios.id` | -- | References `studios.id`. |
| `studio_type` | `TEXT` | Yes |  | -- | -- | -- | Stores the studio type value for this record. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | Yes |  | `TIMEZONE('utc'::TEXT, NOW())` | -- | -- | Timestamp when the row was created. |

### studios

Bookable studio listings, addresses, rates, verification state, and owner-facing configuration. Domain: **Listings & Bookings**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the studios row. |
| `owner_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `name` | `text` | Yes |  | -- | -- | -- | Stores the name value for this record. |
| `address` | `text` | No |  | -- | -- | -- | Stores the address value for this record. |
| `hourly_rate` | `numeric` | No |  | -- | -- | -- | Monetary or rate value for hourly rate. |
| `description` | `text` | No |  | -- | -- | -- | Human-readable description of the studios record. |
| `latitude` | `double precision` | No |  | -- | -- | -- | Stores the latitude value for this record. |
| `longitude` | `double precision` | No |  | -- | -- | -- | Stores the longitude value for this record. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |
| `embedding` | `vector(384)` | No |  | -- | -- | -- | Stores the embedding value for this record. |
| `rate` | `numeric` | No |  | -- | -- | -- | Monetary or rate value for rate. |
| `contract_url` | `text` | No |  | -- | -- | -- | URL to contract document in Supabase storage |
| `rehearsal_rate` | `numeric` | No |  | -- | -- | -- | Monetary or rate value for rehearsal rate. |
| `recording_rate` | `numeric` | No |  | -- | -- | -- | Monetary or rate value for recording rate. |
| `pax` | `integer` | No |  | -- | -- | -- | Maximum number of people/capacity for the studio |
| `address_verification_status` | `TEXT` | No |  | `'NOT_STARTED'` | -- | `(address_verification_status IN ('NOT_STARTED', 'PENDING', 'APPROVED', 'DECLINED', 'ABANDONED', 'MANUAL_REVIEW', 'PENDING_REVIEW'))` | Status of address verification: NOT_STARTED, PENDING, APPROVED, DECLINED, ABANDONED, MANUAL_REVIEW, PENDING_REVIEW |
| `address_verification_session_id` | `TEXT` | No |  | -- | -- | -- | Stores the address verification session id value for this record. |
| `address_verified_at` | `TIMESTAMP WITH TIME ZONE` | No |  | -- | -- | -- | Timestamp for the address verified event. |
| `verified_address` | `TEXT` | No |  | -- | -- | -- | Address extracted and verified from utility bill |
| `address_verification_completed_at` | `TIMESTAMP WITH TIME ZONE` | No |  | -- | -- | -- | Timestamp when address verification was completed |
| `business_permit_url` | `TEXT` | No |  | -- | -- | -- | URL to the uploaded business permit document (PDF or image) |
| `permit_status` | `text` | No |  | `'approved'` | -- | -- | Lifecycle state for permit. |
| `permit_reviewed_by` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `permit_reviewed_at` | `timestamp with time zone` | No |  | -- | -- | -- | Timestamp for the permit reviewed event. |
| `permit_admin_notes` | `text` | No |  | -- | -- | -- | Free-form notes about permit admin. |
| `permit_rejection_reason` | `text` | No |  | -- | -- | -- | Stores the permit rejection reason value for this record. |
| `permit_resubmissions_used` | `integer` | Yes |  | `0` | -- | -- | Number of permit resubmissions used after rejection. Capped at 1. |
| `studio_type` | `text` | No |  | -- | -- | -- | Stores the studio type value for this record. |

### upload_moderation_cases

Current automated or manual moderation case for an uploaded media object. Domain: **Moderation & Audit**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the upload moderation cases row. |
| `user_id` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `uploader_name` | `text` | No |  | -- | -- | -- | Stores the uploader name value for this record. |
| `uploader_email` | `text` | No |  | -- | -- | -- | Stores the uploader email value for this record. |
| `content_hash` | `text` | Yes |  | -- | -- | -- | Stores the content hash value for this record. |
| `context` | `text` | Yes |  | -- | -- | -- | Stores the context value for this record. |
| `related_type` | `text` | No |  | -- | -- | -- | Stores the related type value for this record. |
| `related_id` | `uuid` | No |  | -- | -- | -- | Stores the related id value for this record. |
| `file_name` | `text` | Yes |  | -- | -- | -- | Stores the file name value for this record. |
| `media_kind` | `text` | Yes |  | -- | -- | `(media_kind in ('photo', 'video', 'document'))` | Stores the media kind value for this record. |
| `preview_path` | `text` | No |  | -- | -- | -- | Stores the preview path value for this record. |
| `media_path` | `text` | No |  | -- | -- | -- | Stores the media path value for this record. |
| `mime_type` | `text` | No |  | -- | -- | -- | Stores the mime type value for this record. |
| `categories` | `jsonb` | Yes |  | `'[]'` | -- | -- | Stores the categories value for this record. |
| `confidence` | `double precision` | No |  | -- | -- | `(confidence between 0 and 1)` | Stores the confidence value for this record. |
| `provider` | `text` | No |  | -- | -- | -- | Stores the provider value for this record. |
| `reason` | `text` | Yes |  | -- | -- | -- | Stores the reason value for this record. |
| `status` | `text` | Yes |  | `'pending_review'` | -- | `(status in ('pending_review', 'approved', 'rejected'))` | Current lifecycle state of this record. |
| `version` | `integer` | Yes |  | `0` | -- | -- | Stores the version value for this record. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `reviewed_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the reviewed event. |
| `reviewed_by` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `evidence_delete_after` | `timestamptz` | No |  | -- | -- | -- | Stores the evidence delete after value for this record. |
| `evidence_deleted_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the evidence deleted event. |

### upload_moderation_history

Append-only status history for upload moderation decisions. Domain: **Moderation & Audit**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the upload moderation history row. |
| `case_id` | `uuid` | Yes | FK | -- | `upload_moderation_cases.id` | -- | References `upload_moderation_cases.id`. |
| `actor_id` | `uuid` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `actor_name` | `text` | No |  | -- | -- | -- | Stores the actor name value for this record. |
| `action` | `text` | Yes |  | -- | -- | -- | Stores the action value for this record. |
| `previous_status` | `text` | No |  | -- | -- | -- | Lifecycle state for previous. |
| `new_status` | `text` | Yes |  | -- | -- | -- | Lifecycle state for new. |
| `notes` | `text` | No |  | -- | -- | -- | Free-form notes about this record. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### upload_moderation_restrictions

Upload restrictions imposed on a user after moderation outcomes. Domain: **Moderation & Audit**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `user_id` | `uuid` | Yes | PK, FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `restricted_until` | `timestamptz` | Yes |  | -- | -- | -- | Stores the restricted until value for this record. |
| `case_id` | `uuid` | Yes | FK | -- | `upload_moderation_cases.id` | -- | References `upload_moderation_cases.id`. |
| `restriction_scopes` | `text[]` | Yes |  | `array['media_upload']::text[]` | -- | -- | Active capabilities blocked for the user: media_upload and/or social_posting. |

### user_entitlements

Stores user entitlements records used by the MusikaLokal platform. Domain: **Marketplace**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the user entitlements row. |
| `user_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `entitlement_type` | `text` | Yes |  | -- | -- | `(entitlement_type IN ('exclusive_song', 'exclusive_playlist', 'premium_content', 'merch_access'))` | Stores the entitlement type value for this record. |
| `resource_id` | `uuid` | Yes |  | -- | -- | -- | Stores the resource id value for this record. |
| `resource_type` | `text` | Yes |  | -- | -- | `(resource_type IN ('playlist', 'product', 'station'))` | Stores the resource type value for this record. |
| `granted_by` | `text` | Yes |  | `'purchase'` | -- | `(granted_by IN ('purchase', 'promotion', 'subscription', 'gift'))` | Stores the granted by value for this record. |
| `order_id` | `uuid` | No | FK | -- | `orders.id` | -- | References `orders.id`. |
| `expires_at` | `timestamptz` | No |  | -- | -- | -- | Timestamp for the expires event. |
| `is_active` | `boolean` | No |  | `true` | -- | -- | Boolean flag for is active. |
| `created_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |

### verification_sessions

Stores verification sessions records used by the MusikaLokal platform. Domain: **Identity & Profiles**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `session_ref` | `text` | Yes | PK | -- | -- | -- | Primary identifier for the verification sessions row. |
| `verification_data` | `jsonb` | No |  | -- | -- | -- | Stores the verification data value for this record. |
| `status` | `text` | No |  | -- | -- | -- | Current lifecycle state of this record. |
| `created_at` | `timestamp with time zone` | No |  | `now()` | -- | -- | Timestamp when the row was created. |

### wallet_deposits

Stores wallet deposits records used by the MusikaLokal platform. Domain: **Wallet & Payments**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `gen_random_uuid()` | -- | -- | Primary identifier for the wallet deposits row. |
| `user_id` | `uuid` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `checkout_session_id` | `text` | Yes | UQ | -- | -- | -- | Stores the checkout session id value for this record. |
| `amount` | `numeric` | Yes |  | `0` | -- | -- | Monetary or rate value for amount. |
| `status` | `text` | Yes |  | `'pending'` | -- | -- | Current lifecycle state of this record. |
| `created_at` | `timestamp with time zone` | Yes |  | `now()` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `timestamptz` | Yes |  | `now()` | -- | -- | Timestamp when the row was last updated. |

### wallet_transactions

Immutable-style wallet ledger entries for earnings, deposits, deductions, and withdrawals. Domain: **Wallet & Payments**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the wallet transactions row. |
| `wallet_id` | `uuid` | Yes | FK | -- | `wallets.id` | -- | References `wallets.id`. |
| `amount` | `numeric` | Yes |  | -- | -- | -- | Monetary or rate value for amount. |
| `type` | `text` | Yes |  | -- | -- | -- | Stores the type value for this record. |
| `description` | `text` | No |  | -- | -- | -- | Human-readable description of the wallet transactions record. |
| `reference_id` | `uuid` | No |  | -- | -- | -- | Stores the reference id value for this record. |
| `is_credit` | `boolean` | No |  | `true` | -- | -- | Boolean flag for is credit. |
| `status` | `text` | No |  | `'completed'::text` | -- | -- | Current lifecycle state of this record. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |
| `reference_type` | `text` | No |  | -- | -- | -- | Stores the reference type value for this record. |

### wallets

Current in-app balance state by owner profile. Domain: **Wallet & Payments**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `uuid` | Yes | PK | `extensions.uuid_generate_v4()` | -- | -- | Primary identifier for the wallets row. |
| `user_id` | `uuid` | Yes | FK, UQ | -- | `profiles.id` | -- | References `profiles.id`. |
| `balance` | `numeric` | No |  | `0.00` | -- | -- | Monetary or rate value for balance. |
| `currency` | `text` | No |  | `'PHP'::text` | -- | -- | Stores the currency value for this record. |
| `updated_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was last updated. |
| `created_at` | `timestamp with time zone` | Yes |  | `timezone('utc'::text, now())` | -- | -- | Timestamp when the row was created. |

### withdrawal_requests

Stores withdrawal requests records used by the MusikaLokal platform. Domain: **Wallet & Payments**. RLS: **enabled**.

| Column | Type | Required | Key | Default | References | Rules | Description |
|---|---|:---:|---|---|---|---|---|
| `id` | `UUID` | Yes | PK | `uuid_generate_v4()` | -- | -- | Primary identifier for the withdrawal requests row. |
| `user_id` | `UUID` | Yes | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `wallet_id` | `UUID` | Yes | FK | -- | `wallets.id` | -- | References `wallets.id`. |
| `payout_method_id` | `UUID` | No | FK | -- | `payout_methods.id` | -- | Relational source of truth for payout routing. |
| `amount` | `NUMERIC` | Yes |  | -- | -- | `(amount > 0)` | Monetary or rate value for amount. |
| `fee` | `NUMERIC` | No |  | `0` | -- | -- | Monetary or rate value for fee. |
| `net_amount` | `NUMERIC` | Yes |  | -- | -- | -- | Monetary or rate value for net amount. |
| `status` | `text` | Yes |  | `'pending'::text` | -- | -- | Current lifecycle state of this record. |
| `payout_type` | `TEXT` | No |  | -- | -- | -- | Optional immutable snapshot for audit display only. |
| `payout_account_name` | `text` | No |  | -- | -- | -- | Optional immutable snapshot for audit display only. |
| `payout_account_number` | `TEXT` | No |  | -- | -- | -- | Optional immutable snapshot for audit display only. |
| `payout_bank_name` | `TEXT` | No |  | -- | -- | -- | Optional immutable snapshot for audit display only. |
| `reference_number` | `TEXT` | No |  | -- | -- | -- | Stores the reference number value for this record. |
| `notes` | `text` | No |  | -- | -- | -- | Free-form notes about this record. |
| `processed_at` | `TIMESTAMP WITH TIME ZONE` | No |  | -- | -- | -- | Timestamp for the processed event. |
| `processed_by` | `UUID` | No | FK | -- | `profiles.id` | -- | References `profiles.id`. |
| `failure_reason` | `TEXT` | No |  | -- | -- | -- | Stores the failure reason value for this record. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | Yes |  | `TIMEZONE('utc'::TEXT, NOW())` | -- | -- | Timestamp when the row was created. |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | Yes |  | `TIMEZONE('utc'::TEXT, NOW())` | -- | -- | Timestamp when the row was last updated. |

## Application-facing views

These relations are queried by the application but are not expanded into column definitions because their output is computed from underlying tables and may change when the view SQL changes.

| View | Purpose |
|---|---|
| `conversations_display_projection` | Chat conversation display projection with participant-derived names and avatars. |
| `gigs_legacy_projection` | Compatibility projection that rebuilds legacy gig fields from normalized tables. |
| `gigs_with_stats` | Gig listing projection enriched with application, review, and permit statistics. |
| `groups_legacy_projection` | Compatibility projection that rebuilds legacy group members and media fields. |
| `groups_with_stats` | Group listing projection enriched with membership, review, and completion statistics. |
| `profiles_legacy_projection` | Compatibility projection that rebuilds profile skills, genres, and portfolio fields. |
| `profiles_with_stats` | Profile projection enriched with review and performance statistics. |
| `studios_legacy_projection` | Compatibility projection that rebuilds legacy studio types, amenities, media, and instrument fields. |
| `studios_with_stats` | Studio listing projection enriched with review, booking, and permit statistics. |

The additional application reference `listings` is a Supabase Storage bucket name, not a database relation.

## Maintenance

Regenerate after schema changes with:

```powershell
node scripts/generate-data-dictionary.mjs
```

For a release-grade database audit, compare this file with a fresh `information_schema.columns`, `pg_constraint`, and `pg_policies` export from the intended MusikaLokal Supabase project.
