-- Live public schema export from Supabase MCP

-- Project: https://aefldxegsvzecshlayza.supabase.co

-- Generated: 2026-05-05

-- Types

create type public.verification_status_enum as enum ('NOT_STARTED', 'PENDING', 'PENDING_REVIEW', 'APPROVED', 'DECLINED', 'ABANDONED');

-- Tables

create table public.address_verification_sessions (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    session_id text NOT NULL,
    user_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    expected_address text,
    expected_name text,
    extracted_address text,
    extracted_name text,
    issuer text,
    issue_date text,
    name_matches boolean,
    address_matches boolean,
    status text DEFAULT 'PENDING'::text,
    notes text,
    verified_at timestamp with time zone,
    raw_response jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    smile_user_id text,
    archive_id text,
    provider text DEFAULT 'smile'::text,
    verification_result jsonb,
    error_code text,
    error_message text,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT address_verification_sessions_entity_type_check CHECK (entity_type = ANY (ARRAY['studio'::text, 'gig'::text])),
    CONSTRAINT address_verification_sessions_pkey PRIMARY KEY (id),
    CONSTRAINT address_verification_sessions_session_id_key UNIQUE (session_id),
    CONSTRAINT address_verification_sessions_status_check CHECK (status = ANY (ARRAY['PENDING'::text, 'SUBMITTED'::text, 'PROCESSING'::text, 'ANALYZED'::text, 'VERIFIED'::text, 'APPROVED'::text, 'DECLINED'::text, 'FAILED'::text, 'REVOKED'::text, 'ABANDONED'::text, 'MANUAL_REVIEW'::text, 'PENDING_REVIEW'::text])),
    CONSTRAINT address_verification_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.booking_attendance_events (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    booking_id uuid NOT NULL,
    reporter_user_id uuid,
    event_type text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT booking_attendance_events_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio_bookings(id) ON DELETE CASCADE,
    CONSTRAINT booking_attendance_events_event_type_check CHECK (event_type = ANY (ARRAY['booking_started'::text, 'checked_in'::text, 'late'::text, 'not_attending'::text, 'no_show'::text])),
    CONSTRAINT booking_attendance_events_pkey PRIMARY KEY (id),
    CONSTRAINT booking_attendance_events_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES profiles(id) ON DELETE SET NULL
);

create table public.booking_cancellation_policies (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    name text DEFAULT 'Standard Policy'::text NOT NULL,
    full_refund_hours_before integer DEFAULT 48 NOT NULL,
    partial_refund_hours_before integer DEFAULT 24 NOT NULL,
    partial_refund_pct numeric DEFAULT 50 NOT NULL,
    no_show_penalty_pct numeric DEFAULT 100 NOT NULL,
    late_cancel_penalty_pct numeric DEFAULT 50 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT booking_cancellation_policies_check CHECK (full_refund_hours_before > partial_refund_hours_before),
    CONSTRAINT booking_cancellation_policies_full_refund_hours_before_check CHECK (full_refund_hours_before > 0),
    CONSTRAINT booking_cancellation_policies_late_cancel_penalty_pct_check CHECK (late_cancel_penalty_pct >= 0::numeric AND late_cancel_penalty_pct <= 100::numeric),
    CONSTRAINT booking_cancellation_policies_no_show_penalty_pct_check CHECK (no_show_penalty_pct >= 0::numeric AND no_show_penalty_pct <= 100::numeric),
    CONSTRAINT booking_cancellation_policies_partial_refund_hours_before_check CHECK (partial_refund_hours_before > 0),
    CONSTRAINT booking_cancellation_policies_partial_refund_pct_check CHECK (partial_refund_pct >= 0::numeric AND partial_refund_pct <= 100::numeric),
    CONSTRAINT booking_cancellation_policies_pkey PRIMARY KEY (id),
    CONSTRAINT booking_cancellation_policies_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
);

create table public.booking_holds (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    studio_id uuid NOT NULL,
    booking_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT booking_holds_check CHECK (end_time > start_time),
    CONSTRAINT booking_holds_pkey PRIMARY KEY (id),
    CONSTRAINT booking_holds_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    CONSTRAINT booking_holds_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.booking_incidents (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    booking_id uuid NOT NULL,
    reporter_user_id uuid NOT NULL,
    counterparty_user_id uuid NOT NULL,
    issue_type text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    reporter_notes text,
    counterparty_notes text,
    response_deadline_at timestamp with time zone NOT NULL,
    responded_at timestamp with time zone,
    resolved_at timestamp with time zone,
    resolved_by_user_id uuid,
    resolution text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    penalty_event_id uuid,
    CONSTRAINT booking_incidents_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio_bookings(id) ON DELETE CASCADE,
    CONSTRAINT booking_incidents_counterparty_user_id_fkey FOREIGN KEY (counterparty_user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT booking_incidents_issue_type_check CHECK (issue_type = ANY (ARRAY['cannot_access_studio'::text, 'entry_denied'::text, 'no_show_claim'::text, 'other'::text])),
    CONSTRAINT booking_incidents_penalty_event_id_fkey FOREIGN KEY (penalty_event_id) REFERENCES booking_penalty_events(id) ON DELETE SET NULL,
    CONSTRAINT booking_incidents_pkey PRIMARY KEY (id),
    CONSTRAINT booking_incidents_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT booking_incidents_resolved_by_user_id_fkey FOREIGN KEY (resolved_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
    CONSTRAINT booking_incidents_status_check CHECK (status = ANY (ARRAY['open'::text, 'responded'::text, 'manual_review'::text, 'resolved_refund'::text, 'resolved_no_refund'::text, 'dismissed'::text]))
);

create table public.booking_penalty_events (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    booking_id uuid NOT NULL,
    policy_snapshot jsonb NOT NULL,
    penalty_type text NOT NULL,
    penalty_amount numeric NOT NULL,
    refund_amount numeric DEFAULT 0 NOT NULL,
    booking_total numeric NOT NULL,
    penalized_user_id uuid NOT NULL,
    beneficiary_user_id uuid,
    wallet_transaction_id uuid,
    refund_transaction_id uuid,
    notes text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT booking_penalty_events_beneficiary_user_id_fkey FOREIGN KEY (beneficiary_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
    CONSTRAINT booking_penalty_events_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio_bookings(id) ON DELETE CASCADE,
    CONSTRAINT booking_penalty_events_booking_total_check CHECK (booking_total >= 0::numeric),
    CONSTRAINT booking_penalty_events_penalized_user_id_fkey FOREIGN KEY (penalized_user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT booking_penalty_events_penalty_amount_check CHECK (penalty_amount >= 0::numeric),
    CONSTRAINT booking_penalty_events_penalty_type_check CHECK (penalty_type = ANY (ARRAY['late_cancellation'::text, 'no_show'::text, 'deal_cancellation'::text])),
    CONSTRAINT booking_penalty_events_pkey PRIMARY KEY (id),
    CONSTRAINT booking_penalty_events_refund_amount_check CHECK (refund_amount >= 0::numeric),
    CONSTRAINT booking_penalty_events_refund_transaction_id_fkey FOREIGN KEY (refund_transaction_id) REFERENCES wallet_transactions(id),
    CONSTRAINT booking_penalty_events_wallet_transaction_id_fkey FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id)
);

create table public.booking_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid,
    group_id uuid,
    message text,
    status text DEFAULT 'pending'::text,
    event_details jsonb,
    attachment_url text,
    studio_id uuid,
    CONSTRAINT booking_requests_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id),
    CONSTRAINT booking_requests_pkey PRIMARY KEY (id),
    CONSTRAINT booking_requests_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id),
    CONSTRAINT booking_requests_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id),
    CONSTRAINT booking_requests_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id)
);

create table public.conversation_participants (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text,
    joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    last_read_at timestamp with time zone,
    is_muted boolean DEFAULT false NOT NULL,
    muted_until timestamp with time zone,
    CONSTRAINT conversation_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT conversation_participants_conversation_id_user_id_key UNIQUE (conversation_id, user_id),
    CONSTRAINT conversation_participants_muted_until_requires_mute CHECK (is_muted OR muted_until IS NULL),
    CONSTRAINT conversation_participants_pkey PRIMARY KEY (id),
    CONSTRAINT conversation_participants_role_check CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])),
    CONSTRAINT conversation_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.conversations (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    studio_booking_id uuid,
    gig_application_id uuid,
    gig_id uuid,
    group_id uuid,
    studio_id uuid,
    is_group boolean DEFAULT false,
    CONSTRAINT conversations_gig_application_id_fkey FOREIGN KEY (gig_application_id) REFERENCES gig_applications(id) ON DELETE SET NULL,
    CONSTRAINT conversations_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE SET NULL,
    CONSTRAINT conversations_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL,
    CONSTRAINT conversations_pkey PRIMARY KEY (id),
    CONSTRAINT conversations_studio_booking_id_fkey FOREIGN KEY (studio_booking_id) REFERENCES studio_bookings(id) ON DELETE SET NULL,
    CONSTRAINT conversations_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE SET NULL
);

create table public.email_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_email text NOT NULL,
    recipient_name text,
    subject text NOT NULL,
    html_content text,
    template_type text,
    status text DEFAULT 'pending'::text,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT email_notifications_pkey PRIMARY KEY (id)
);

create table public.external_platform_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    platform text NOT NULL,
    url text NOT NULL,
    label text,
    linked_playlist_id uuid,
    linked_item_id uuid,
    click_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT external_platform_links_click_count_check CHECK (click_count >= 0),
    CONSTRAINT external_platform_links_label_check CHECK (char_length(label) <= 200),
    CONSTRAINT external_platform_links_linked_item_id_fkey FOREIGN KEY (linked_item_id) REFERENCES playlist_items(id) ON DELETE SET NULL,
    CONSTRAINT external_platform_links_linked_playlist_id_fkey FOREIGN KEY (linked_playlist_id) REFERENCES playlists(id) ON DELETE SET NULL,
    CONSTRAINT external_platform_links_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT external_platform_links_pkey PRIMARY KEY (id),
    CONSTRAINT external_platform_links_platform_check CHECK (platform = ANY (ARRAY['spotify'::text, 'apple_music'::text, 'youtube_music'::text, 'soundcloud'::text, 'bandcamp'::text, 'deezer'::text, 'tidal'::text, 'other'::text])),
    CONSTRAINT external_platform_links_url_check CHECK (char_length(url) >= 1 AND char_length(url) <= 2000)
);

create table public.favorites (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    group_id uuid,
    studio_id uuid,
    gig_id uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    profile_id uuid,
    CONSTRAINT fav_one_target CHECK (((group_id IS NOT NULL)::integer + (studio_id IS NOT NULL)::integer + (gig_id IS NOT NULL)::integer + (profile_id IS NOT NULL)::integer) = 1),
    CONSTRAINT favorites_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE,
    CONSTRAINT favorites_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT favorites_pkey PRIMARY KEY (id),
    CONSTRAINT favorites_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT favorites_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.feed_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    author_id uuid NOT NULL,
    post_type text DEFAULT 'text'::text NOT NULL,
    content text,
    visibility text DEFAULT 'public'::text NOT NULL,
    is_pinned boolean DEFAULT false,
    linked_playlist_id uuid,
    linked_product_id uuid,
    reaction_count integer DEFAULT 0,
    comment_count integer DEFAULT 0,
    share_count integer DEFAULT 0,
    is_reported boolean DEFAULT false,
    is_hidden boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT feed_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT feed_posts_comment_count_check CHECK (comment_count >= 0),
    CONSTRAINT feed_posts_content_check CHECK (char_length(content) <= 5000),
    CONSTRAINT feed_posts_pkey PRIMARY KEY (id),
    CONSTRAINT feed_posts_post_type_check CHECK (post_type = ANY (ARRAY['text'::text, 'announcement'::text, 'release'::text, 'project_update'::text, 'merch_drop'::text, 'playlist_share'::text, 'station_share'::text])),
    CONSTRAINT feed_posts_reaction_count_check CHECK (reaction_count >= 0),
    CONSTRAINT feed_posts_share_count_check CHECK (share_count >= 0),
    CONSTRAINT feed_posts_visibility_check CHECK (visibility = ANY (ARRAY['public'::text, 'followers'::text, 'unlisted'::text])),
    CONSTRAINT fk_feed_posts_linked_playlist FOREIGN KEY (linked_playlist_id) REFERENCES playlists(id) ON DELETE SET NULL,
    CONSTRAINT fk_feed_posts_linked_product FOREIGN KEY (linked_product_id) REFERENCES products(id) ON DELETE SET NULL
);

create table public.follows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    follower_id uuid NOT NULL,
    followed_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    followed_type text DEFAULT 'profile'::text NOT NULL,
    CONSTRAINT follows_followed_type_check CHECK (followed_type = ANY (ARRAY['profile'::text, 'group'::text])),
    CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT follows_pkey PRIMARY KEY (id),
    CONSTRAINT follows_profile_self_check CHECK (followed_type <> 'profile'::text OR follower_id <> followed_id)
);

create table public.gig_applications (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    applicant_id uuid NOT NULL,
    group_id uuid,
    gig_id uuid NOT NULL,
    pitch_message text,
    video_url text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    reviewed_by_applicant boolean DEFAULT false,
    reviewed_by_organizer boolean DEFAULT false,
    cancellation_reason text,
    note text,
    cv_url text,
    is_solo_application boolean DEFAULT false,
    rejected_at timestamp with time zone,
    slot_type text,
    submitted_by_user_id uuid,
    leader_approval_status text,
    leader_reviewed_at timestamp with time zone,
    reconfirmation_required_at timestamp with time zone,
    reconfirmation_due_at timestamp with time zone,
    system_status_reason text,
    show_on_profile boolean DEFAULT true NOT NULL,
    production_team_id uuid,
    production_roster_id uuid,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT gig_applications_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT gig_applications_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE,
    CONSTRAINT gig_applications_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT gig_applications_leader_approval_status_check CHECK (leader_approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
    CONSTRAINT gig_applications_pkey PRIMARY KEY (id),
    CONSTRAINT gig_applications_production_pair_check CHECK (production_team_id IS NULL AND production_roster_id IS NULL OR production_team_id IS NOT NULL AND production_roster_id IS NOT NULL),
    CONSTRAINT gig_applications_production_roster_id_fkey FOREIGN KEY (production_roster_id) REFERENCES production_team_roster(id) ON DELETE SET NULL,
    CONSTRAINT gig_applications_production_team_id_fkey FOREIGN KEY (production_team_id) REFERENCES production_teams(id) ON DELETE SET NULL,
    CONSTRAINT gig_applications_slot_type_check CHECK (slot_type = ANY (ARRAY['solo'::text, 'duo'::text, 'band'::text])),
    CONSTRAINT gig_applications_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'accepted'::text, 'rejected'::text, 'declined'::text, 'cancelled'::text, 'resigned'::text, 'fired'::text, 'completed'::text])),
    CONSTRAINT gig_applications_submitted_by_user_id_fkey FOREIGN KEY (submitted_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL
);

create table public.gig_availability_slots (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    gig_id uuid NOT NULL,
    day_of_week smallint,
    slot_date date,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_available boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT gig_availability_slots_check CHECK (end_time > start_time),
    CONSTRAINT gig_availability_slots_check1 CHECK (day_of_week IS NOT NULL AND day_of_week >= 0 AND day_of_week <= 6 OR slot_date IS NOT NULL),
    CONSTRAINT gig_availability_slots_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE,
    CONSTRAINT gig_availability_slots_pkey PRIMARY KEY (id)
);

create table public.gig_deletion_audit (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    gig_id uuid NOT NULL,
    organizer_id uuid,
    deleted_by uuid,
    deleted_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    gig_snapshot jsonb NOT NULL,
    related_counts jsonb NOT NULL,
    applicant_counts jsonb NOT NULL,
    storage_cleanup jsonb,
    reason text,
    CONSTRAINT gig_deletion_audit_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES profiles(id) ON DELETE SET NULL,
    CONSTRAINT gig_deletion_audit_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES profiles(id) ON DELETE SET NULL,
    CONSTRAINT gig_deletion_audit_pkey PRIMARY KEY (id)
);

create table public.gig_media (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    gig_id uuid NOT NULL,
    media_type text NOT NULL,
    media_url text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT gig_media_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE,
    CONSTRAINT gig_media_gig_id_media_type_media_url_key UNIQUE (gig_id, media_type, media_url),
    CONSTRAINT gig_media_media_type_check CHECK (media_type = ANY (ARRAY['image'::text, 'document'::text])),
    CONSTRAINT gig_media_pkey PRIMARY KEY (id)
);

create table public.gig_requirements (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    gig_id uuid NOT NULL,
    requirement_key text NOT NULL,
    requirement_value jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT gig_requirements_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE,
    CONSTRAINT gig_requirements_gig_id_requirement_key_key UNIQUE (gig_id, requirement_key),
    CONSTRAINT gig_requirements_pkey PRIMARY KEY (id)
);

create table public.gig_slot_fill_applicants (
    gig_id uuid NOT NULL,
    slot_type text NOT NULL,
    applicant_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gig_slot_fill_applicants_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE,
    CONSTRAINT gig_slot_fill_applicants_pkey PRIMARY KEY (gig_id, slot_type, applicant_id),
    CONSTRAINT gig_slot_fill_applicants_slot_type_check CHECK (slot_type = ANY (ARRAY['solo'::text, 'duo'::text, 'band'::text]))
);

create table public.gig_slot_fill_summary (
    gig_id uuid NOT NULL,
    slot_type text NOT NULL,
    accepted_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gig_slot_fill_summary_accepted_count_check CHECK (accepted_count >= 0),
    CONSTRAINT gig_slot_fill_summary_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE,
    CONSTRAINT gig_slot_fill_summary_pkey PRIMARY KEY (gig_id, slot_type),
    CONSTRAINT gig_slot_fill_summary_slot_type_check CHECK (slot_type = ANY (ARRAY['solo'::text, 'duo'::text, 'band'::text]))
);

create table public.gigs (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    organizer_id uuid NOT NULL,
    name text NOT NULL,
    location text,
    budget numeric,
    description text,
    event_date timestamp with time zone,
    status text DEFAULT 'open'::text,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    embedding vector(384),
    rate numeric,
    contract_url text,
    address_verification_status text DEFAULT 'NOT_STARTED'::text,
    address_verification_session_id text,
    address_verified_at timestamp with time zone,
    verified_address text,
    address_verification_completed_at timestamp with time zone,
    business_permit_url text,
    reapplication_cooldown_days integer DEFAULT 30,
    total_slots_filled integer DEFAULT 0,
    permit_status text DEFAULT 'pending_review'::text NOT NULL,
    permit_reviewed_by uuid,
    permit_reviewed_at timestamp with time zone,
    permit_admin_notes text,
    permit_rejection_reason text,
    permit_resubmissions_used integer DEFAULT 0 NOT NULL,
    CONSTRAINT gigs_address_verification_status_check CHECK (address_verification_status = ANY (ARRAY['NOT_STARTED'::text, 'PENDING'::text, 'PROCESSING'::text, 'VERIFIED'::text, 'APPROVED'::text, 'DECLINED'::text, 'FAILED'::text, 'ABANDONED'::text, 'MANUAL_REVIEW'::text, 'PENDING_REVIEW'::text])),
    CONSTRAINT gigs_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT gigs_permit_resubmissions_used_check CHECK (permit_resubmissions_used >= 0 AND permit_resubmissions_used <= 1),
    CONSTRAINT gigs_permit_reviewed_by_fkey FOREIGN KEY (permit_reviewed_by) REFERENCES profiles(id),
    CONSTRAINT gigs_permit_status_check CHECK (permit_status = ANY (ARRAY['pending_review'::text, 'approved'::text, 'rejected'::text, 'resubmitted'::text])),
    CONSTRAINT gigs_pkey PRIMARY KEY (id),
    CONSTRAINT gigs_reapplication_cooldown_days_check CHECK (reapplication_cooldown_days >= 0 AND reapplication_cooldown_days <= 365),
    CONSTRAINT gigs_status_check CHECK (status = ANY (ARRAY['open'::text, 'closed'::text, 'cancelled'::text]))
);

create table public.group_availability_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    day_of_week smallint,
    slot_date date,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_available boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT group_availability_slots_check CHECK (end_time > start_time),
    CONSTRAINT group_availability_slots_check1 CHECK (day_of_week IS NOT NULL AND day_of_week >= 0 AND day_of_week <= 6 OR slot_date IS NOT NULL),
    CONSTRAINT group_availability_slots_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT group_availability_slots_pkey PRIMARY KEY (id)
);

create table public.group_deletion_audit (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    group_id uuid NOT NULL,
    owner_id uuid,
    deleted_by uuid,
    deleted_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    group_snapshot jsonb NOT NULL,
    related_counts jsonb NOT NULL,
    application_counts jsonb NOT NULL,
    reason text,
    CONSTRAINT group_deletion_audit_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES profiles(id) ON DELETE SET NULL,
    CONSTRAINT group_deletion_audit_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE SET NULL,
    CONSTRAINT group_deletion_audit_pkey PRIMARY KEY (id)
);

create table public.group_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    media_type text DEFAULT 'image'::text NOT NULL,
    media_url text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT group_media_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT group_media_group_id_media_type_media_url_key UNIQUE (group_id, media_type, media_url),
    CONSTRAINT group_media_media_type_check CHECK (media_type = 'image'::text),
    CONSTRAINT group_media_pkey PRIMARY KEY (id)
);

create table public.group_members (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text,
    joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT group_members_group_id_user_id_key UNIQUE (group_id, user_id),
    CONSTRAINT group_members_pkey PRIMARY KEY (id),
    CONSTRAINT group_members_role_check CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])),
    CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.group_playlists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    playlist_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT group_playlists_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT group_playlists_group_id_playlist_id_key UNIQUE (group_id, playlist_id),
    CONSTRAINT group_playlists_pkey PRIMARY KEY (id),
    CONSTRAINT group_playlists_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    CONSTRAINT group_playlists_position_check CHECK ("position" >= 0)
);

create table public.group_roster_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid,
    member_name text NOT NULL,
    member_role text,
    instrument text,
    avatar_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    raw_member jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT group_roster_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT group_roster_members_pkey PRIMARY KEY (id),
    CONSTRAINT group_roster_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL
);

create table public.groups (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    genre text,
    description text,
    location text,
    latitude double precision,
    longitude double precision,
    rate numeric,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    embedding vector(384),
    group_type text DEFAULT 'band'::text,
    open_group_applications boolean DEFAULT true NOT NULL,
    CONSTRAINT groups_group_type_check CHECK (group_type = ANY (ARRAY['duo'::text, 'band'::text])),
    CONSTRAINT groups_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT groups_pkey PRIMARY KEY (id)
);

create table public.leadership_transfer_requests (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    group_id uuid NOT NULL,
    from_user_id uuid NOT NULL,
    to_user_id uuid NOT NULL,
    status text DEFAULT 'pending'::text,
    message text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    responded_at timestamp with time zone,
    CONSTRAINT leadership_transfer_requests_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT leadership_transfer_requests_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT leadership_transfer_requests_pkey PRIMARY KEY (id),
    CONSTRAINT leadership_transfer_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'cancelled'::text])),
    CONSTRAINT leadership_transfer_requests_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.manual_identity_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    submitted_by_email text NOT NULL,
    document_type text NOT NULL,
    document_type_key text,
    document_country text DEFAULT 'PHL'::text NOT NULL,
    source text DEFAULT 'MANUAL_UPLOAD'::text NOT NULL,
    status text DEFAULT 'PENDING_REVIEW'::text NOT NULL,
    front_image_path text,
    back_image_path text,
    selfie_image_path text,
    review_notes text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    decision_email_sent_at timestamp with time zone,
    expected_decision_by timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT manual_identity_reviews_pkey PRIMARY KEY (id),
    CONSTRAINT manual_identity_reviews_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL,
    CONSTRAINT manual_identity_reviews_source_check CHECK (source = ANY (ARRAY['MANUAL_UPLOAD'::text, 'DIDIT_PENDING'::text])),
    CONSTRAINT manual_identity_reviews_status_check CHECK (status = ANY (ARRAY['PENDING_REVIEW'::text, 'APPROVED'::text, 'DECLINED'::text])),
    CONSTRAINT manual_identity_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.message_reactions (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    CONSTRAINT message_reactions_message_id_user_id_key UNIQUE (message_id, user_id),
    CONSTRAINT message_reactions_pkey PRIMARY KEY (id),
    CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.messages (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text NOT NULL,
    message_type text DEFAULT 'text'::text,
    attachment_url text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT messages_message_type_check CHECK (message_type = ANY (ARRAY['text'::text, 'image'::text, 'file'::text, 'system'::text])),
    CONSTRAINT messages_pkey PRIMARY KEY (id),
    CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.normalization_exceptions (
    table_name text NOT NULL,
    column_name text NOT NULL,
    rationale text NOT NULL,
    approved_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_by_user_id uuid,
    CONSTRAINT normalization_exceptions_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
    CONSTRAINT normalization_exceptions_pkey PRIMARY KEY (table_name, column_name)
);

create table public.notification_preferences (
    user_id uuid NOT NULL,
    booking_confirmed boolean DEFAULT true NOT NULL,
    awaiting_confirmation boolean DEFAULT true NOT NULL,
    upload_required boolean DEFAULT false NOT NULL,
    event_reminder boolean DEFAULT true NOT NULL,
    leave_review boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    push_enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id),
    CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.notifications (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    type text,
    title text NOT NULL,
    message text NOT NULL,
    read boolean DEFAULT false,
    image text,
    meta jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT notifications_pkey PRIMARY KEY (id),
    CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY['success'::text, 'info'::text, 'warning'::text, 'error'::text])),
    CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.order_fulfillments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    fulfillment_type text DEFAULT 'shipment'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    tracking_number text,
    carrier text,
    shipped_at timestamp with time zone,
    delivered_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_fulfillments_carrier_check CHECK (char_length(carrier) <= 100),
    CONSTRAINT order_fulfillments_fulfillment_type_check CHECK (fulfillment_type = ANY (ARRAY['shipment'::text, 'digital_release'::text, 'pickup'::text])),
    CONSTRAINT order_fulfillments_notes_check CHECK (char_length(notes) <= 1000),
    CONSTRAINT order_fulfillments_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT order_fulfillments_pkey PRIMARY KEY (id),
    CONSTRAINT order_fulfillments_status_check CHECK (status = ANY (ARRAY['pending'::text, 'preparing'::text, 'shipped'::text, 'in_transit'::text, 'delivered'::text, 'failed'::text, 'returned'::text])),
    CONSTRAINT order_fulfillments_tracking_number_check CHECK (char_length(tracking_number) <= 100)
);

create table public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    variant_id uuid,
    product_title text NOT NULL,
    variant_label text,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric NOT NULL,
    line_total numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_items_line_total_check CHECK (line_total >= 0::numeric),
    CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT order_items_pkey PRIMARY KEY (id),
    CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    CONSTRAINT order_items_quantity_check CHECK (quantity > 0),
    CONSTRAINT order_items_unit_price_check CHECK (unit_price >= 0::numeric),
    CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
);

create table public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    buyer_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    order_number text DEFAULT ('ORD-'::text || upper(substr((gen_random_uuid())::text, 1, 8))) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    subtotal numeric NOT NULL,
    shipping_fee numeric DEFAULT 0,
    total_amount numeric NOT NULL,
    currency text DEFAULT 'PHP'::text NOT NULL,
    shipping_profile_id uuid,
    shipping_address jsonb,
    payment_reference text,
    wallet_transaction_id uuid,
    notes text,
    confirmed_at timestamp with time zone,
    shipped_at timestamp with time zone,
    delivered_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT orders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT orders_notes_check CHECK (char_length(notes) <= 1000),
    CONSTRAINT orders_order_number_key UNIQUE (order_number),
    CONSTRAINT orders_pkey PRIMARY KEY (id),
    CONSTRAINT orders_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT orders_shipping_fee_check CHECK (shipping_fee >= 0::numeric),
    CONSTRAINT orders_shipping_profile_id_fkey FOREIGN KEY (shipping_profile_id) REFERENCES shipping_profiles(id) ON DELETE SET NULL,
    CONSTRAINT orders_status_check CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text, 'delivered'::text, 'cancelled'::text, 'refunded'::text, 'disputed'::text])),
    CONSTRAINT orders_subtotal_check CHECK (subtotal >= 0::numeric),
    CONSTRAINT orders_total_amount_check CHECK (total_amount >= 0::numeric),
    CONSTRAINT orders_wallet_transaction_id_fkey FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id) ON DELETE SET NULL
);

create table public.payout_methods (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    account_name text NOT NULL,
    account_number text NOT NULL,
    bank_name text,
    is_default boolean DEFAULT false,
    is_verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT payout_methods_pkey PRIMARY KEY (id),
    CONSTRAINT payout_methods_type_check CHECK (type = ANY (ARRAY['bank'::text, 'gcash'::text, 'maya'::text, 'paypal'::text])),
    CONSTRAINT payout_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.permit_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    action text NOT NULL,
    performed_by uuid NOT NULL,
    reason text,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    previous_status text,
    new_status text,
    rejection_reason text,
    admin_notes text,
    CONSTRAINT permit_audit_log_action_check CHECK (action = ANY (ARRAY['submitted'::text, 'approved'::text, 'rejected'::text, 'resubmitted'::text])),
    CONSTRAINT permit_audit_log_entity_type_check CHECK (entity_type = ANY (ARRAY['studio'::text, 'gig'::text])),
    CONSTRAINT permit_audit_log_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES profiles(id),
    CONSTRAINT permit_audit_log_pkey PRIMARY KEY (id)
);

create table public.playlist_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    playlist_id uuid NOT NULL,
    title text NOT NULL,
    artist_name text,
    duration_seconds numeric,
    "position" integer DEFAULT 0 NOT NULL,
    teaser_asset_id uuid,
    external_link_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    audio_url text,
    CONSTRAINT fk_playlist_items_external_link FOREIGN KEY (external_link_id) REFERENCES external_platform_links(id) ON DELETE SET NULL,
    CONSTRAINT fk_playlist_items_teaser_asset FOREIGN KEY (teaser_asset_id) REFERENCES playlist_teaser_assets(id) ON DELETE SET NULL,
    CONSTRAINT playlist_items_artist_name_check CHECK (char_length(artist_name) <= 200),
    CONSTRAINT playlist_items_pkey PRIMARY KEY (id),
    CONSTRAINT playlist_items_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    CONSTRAINT playlist_items_title_check CHECK (char_length(title) >= 1 AND char_length(title) <= 200)
);

create table public.playlist_play_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    playlist_id uuid,
    item_id uuid,
    station_id uuid,
    user_id uuid,
    event_type text NOT NULL,
    platform text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT playlist_play_events_event_type_check CHECK (event_type = ANY (ARRAY['teaser_play'::text, 'outbound_click'::text, 'station_tune_in'::text, 'station_tune_out'::text])),
    CONSTRAINT playlist_play_events_item_id_fkey FOREIGN KEY (item_id) REFERENCES playlist_items(id) ON DELETE SET NULL,
    CONSTRAINT playlist_play_events_pkey PRIMARY KEY (id),
    CONSTRAINT playlist_play_events_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE SET NULL,
    CONSTRAINT playlist_play_events_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE SET NULL,
    CONSTRAINT playlist_play_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL
);

create table public.playlist_teaser_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    playlist_id uuid NOT NULL,
    uploader_id uuid NOT NULL,
    asset_type text NOT NULL,
    storage_path text NOT NULL,
    mime_type text,
    duration_seconds numeric,
    file_size_bytes bigint,
    screen_result text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT playlist_teaser_assets_asset_type_check CHECK (asset_type = ANY (ARRAY['teaser_clip'::text, 'cover_art'::text, 'track_preview'::text])),
    CONSTRAINT playlist_teaser_assets_pkey PRIMARY KEY (id),
    CONSTRAINT playlist_teaser_assets_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    CONSTRAINT playlist_teaser_assets_screen_result_check CHECK (screen_result = ANY (ARRAY['passed'::text, 'failed'::text, 'pending'::text])),
    CONSTRAINT playlist_teaser_assets_uploader_id_fkey FOREIGN KEY (uploader_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.playlists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    cover_image_url text,
    visibility text DEFAULT 'public'::text NOT NULL,
    genre text,
    track_count integer DEFAULT 0,
    total_duration_seconds numeric DEFAULT 0,
    is_featured boolean DEFAULT false,
    is_hidden boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT playlists_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT playlists_description_check CHECK (char_length(description) <= 2000),
    CONSTRAINT playlists_pkey PRIMARY KEY (id),
    CONSTRAINT playlists_title_check CHECK (char_length(title) >= 1 AND char_length(title) <= 200),
    CONSTRAINT playlists_track_count_check CHECK (track_count >= 0),
    CONSTRAINT playlists_visibility_check CHECK (visibility = ANY (ARRAY['public'::text, 'unlisted'::text, 'promotional'::text]))
);

create table public.post_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    author_id uuid NOT NULL,
    parent_comment_id uuid,
    content text NOT NULL,
    is_hidden boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT post_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT post_comments_content_check CHECK (char_length(content) >= 1 AND char_length(content) <= 2000),
    CONSTRAINT post_comments_parent_comment_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES post_comments(id) ON DELETE CASCADE,
    CONSTRAINT post_comments_pkey PRIMARY KEY (id),
    CONSTRAINT post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES feed_posts(id) ON DELETE CASCADE
);

create table public.post_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    media_type text NOT NULL,
    storage_path text NOT NULL,
    mime_type text,
    width integer,
    height integer,
    duration_seconds numeric,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT post_media_media_type_check CHECK (media_type = ANY (ARRAY['image'::text, 'teaser_clip'::text, 'cover_art'::text])),
    CONSTRAINT post_media_pkey PRIMARY KEY (id),
    CONSTRAINT post_media_post_id_fkey FOREIGN KEY (post_id) REFERENCES feed_posts(id) ON DELETE CASCADE
);

create table public.post_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reaction_type text DEFAULT 'like'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT post_reactions_pkey PRIMARY KEY (id),
    CONSTRAINT post_reactions_post_id_fkey FOREIGN KEY (post_id) REFERENCES feed_posts(id) ON DELETE CASCADE,
    CONSTRAINT post_reactions_post_id_user_id_reaction_type_key UNIQUE (post_id, user_id, reaction_type),
    CONSTRAINT post_reactions_reaction_type_check CHECK (reaction_type = ANY (ARRAY['like'::text, 'love'::text, 'fire'::text, 'clap'::text, 'sad'::text])),
    CONSTRAINT post_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.product_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    media_type text DEFAULT 'image'::text NOT NULL,
    storage_path text NOT NULL,
    mime_type text,
    display_order integer DEFAULT 0,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_media_media_type_check CHECK (media_type = ANY (ARRAY['image'::text, 'video'::text, 'promo_clip'::text])),
    CONSTRAINT product_media_pkey PRIMARY KEY (id),
    CONSTRAINT product_media_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

create table public.product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    variant_label text NOT NULL,
    variant_type text DEFAULT 'size'::text NOT NULL,
    price_override numeric,
    sku text,
    stock_quantity integer DEFAULT 0,
    is_available boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_variants_pkey PRIMARY KEY (id),
    CONSTRAINT product_variants_price_override_check CHECK (price_override IS NULL OR price_override >= 0::numeric),
    CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT product_variants_sku_check CHECK (char_length(sku) <= 50),
    CONSTRAINT product_variants_stock_quantity_check CHECK (stock_quantity >= 0),
    CONSTRAINT product_variants_variant_label_check CHECK (char_length(variant_label) >= 1 AND char_length(variant_label) <= 100),
    CONSTRAINT product_variants_variant_type_check CHECK (variant_type = ANY (ARRAY['size'::text, 'color'::text, 'format'::text, 'edition'::text, 'other'::text]))
);

create table public.production_team_members (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT production_team_members_pkey PRIMARY KEY (id),
    CONSTRAINT production_team_members_role_check CHECK (role = ANY (ARRAY['owner'::text, 'manager'::text, 'member'::text])),
    CONSTRAINT production_team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES production_teams(id) ON DELETE CASCADE,
    CONSTRAINT production_team_members_team_id_user_id_key UNIQUE (team_id, user_id),
    CONSTRAINT production_team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.production_team_roster (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    entity_kind text NOT NULL,
    profile_id uuid,
    group_id uuid,
    added_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT production_team_roster_added_by_user_id_fkey FOREIGN KEY (added_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
    CONSTRAINT production_team_roster_entity_kind_check CHECK (entity_kind = ANY (ARRAY['musician'::text, 'duo'::text, 'group'::text])),
    CONSTRAINT production_team_roster_exactly_one_target CHECK (((profile_id IS NOT NULL)::integer + (group_id IS NOT NULL)::integer) = 1),
    CONSTRAINT production_team_roster_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT production_team_roster_pkey PRIMARY KEY (id),
    CONSTRAINT production_team_roster_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT production_team_roster_team_id_fkey FOREIGN KEY (team_id) REFERENCES production_teams(id) ON DELETE CASCADE
);

create table public.production_teams (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    logo_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT production_teams_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT production_teams_pkey PRIMARY KEY (id)
);

create table public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id uuid NOT NULL,
    group_id uuid,
    title text NOT NULL,
    description text,
    product_type text DEFAULT 'merch'::text NOT NULL,
    category text,
    base_price numeric NOT NULL,
    currency text DEFAULT 'PHP'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    is_featured boolean DEFAULT false,
    is_limited_edition boolean DEFAULT false,
    limited_quantity integer,
    total_sold integer DEFAULT 0,
    average_rating numeric DEFAULT 0,
    review_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT products_base_price_check CHECK (base_price >= 0::numeric),
    CONSTRAINT products_category_check CHECK (category = ANY (ARRAY['apparel'::text, 'accessories'::text, 'vinyl'::text, 'cd'::text, 'poster'::text, 'sticker'::text, 'digital'::text, 'bundle'::text, 'other'::text])),
    CONSTRAINT products_currency_check CHECK (char_length(currency) = 3),
    CONSTRAINT products_description_check CHECK (char_length(description) <= 5000),
    CONSTRAINT products_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL,
    CONSTRAINT products_limited_quantity_check CHECK (limited_quantity IS NULL OR limited_quantity > 0),
    CONSTRAINT products_pkey PRIMARY KEY (id),
    CONSTRAINT products_product_type_check CHECK (product_type = ANY (ARRAY['merch'::text, 'digital_drop'::text, 'exclusive_content'::text])),
    CONSTRAINT products_review_count_check CHECK (review_count >= 0),
    CONSTRAINT products_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT products_status_check CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'sold_out'::text, 'archived'::text, 'suspended'::text])),
    CONSTRAINT products_title_check CHECK (char_length(title) >= 1 AND char_length(title) <= 200),
    CONSTRAINT products_total_sold_check CHECK (total_sold >= 0)
);

create table public.profile_genres (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    profile_id uuid NOT NULL,
    genre text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT profile_genres_pkey PRIMARY KEY (id),
    CONSTRAINT profile_genres_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT profile_genres_profile_id_genre_key UNIQUE (profile_id, genre)
);

create table public.profile_portfolio_urls (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    profile_id uuid NOT NULL,
    portfolio_url text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT profile_portfolio_urls_pkey PRIMARY KEY (id),
    CONSTRAINT profile_portfolio_urls_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT profile_portfolio_urls_profile_id_portfolio_url_key UNIQUE (profile_id, portfolio_url)
);

create table public.profile_skills (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    profile_id uuid NOT NULL,
    skill text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT profile_skills_pkey PRIMARY KEY (id),
    CONSTRAINT profile_skills_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT profile_skills_profile_id_skill_key UNIQUE (profile_id, skill)
);

create table public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    avatar_url text,
    role text NOT NULL,
    bio text,
    location text,
    is_verified boolean DEFAULT false,
    verification_status text,
    didit_session_id text,
    id_document_expiry date,
    id_verified_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    interest_vector vector(384),
    contact_number text,
    address text,
    subscription_status text DEFAULT 'none'::text,
    subscription_expires_at timestamp with time zone,
    smile_user_id text,
    subscription_plan_id uuid,
    show_gig_statuses boolean DEFAULT true NOT NULL,
    CONSTRAINT profiles_email_key UNIQUE (email),
    CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['musician'::text, 'studio-owner'::text, 'venue-owner'::text, 'producer'::text, 'admin'::text])),
    CONSTRAINT profiles_subscription_plan_id_fkey FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL,
    CONSTRAINT profiles_subscription_status_check CHECK (subscription_status = ANY (ARRAY['none'::text, 'active'::text, 'expired'::text, 'cancelled'::text])),
    CONSTRAINT profiles_verification_status_check CHECK (verification_status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'DECLINED'::text, 'ABANDONED'::text, 'PENDING_REVIEW'::text]))
);

create table public.push_notification_devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    installation_id text NOT NULL,
    push_token text NOT NULL,
    token_type text DEFAULT 'expo'::text NOT NULL,
    platform text,
    device_name text,
    app_version text,
    project_id text,
    is_active boolean DEFAULT true NOT NULL,
    last_seen_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    disabled_at timestamp with time zone,
    disabled_reason text,
    CONSTRAINT push_notification_devices_pkey PRIMARY KEY (id),
    CONSTRAINT push_notification_devices_platform_check CHECK (platform = ANY (ARRAY['android'::text, 'ios'::text])),
    CONSTRAINT push_notification_devices_token_type_check CHECK (token_type = 'expo'::text),
    CONSTRAINT push_notification_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.reports (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    reporter_id uuid,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    reason text NOT NULL,
    details text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    moderation_action text DEFAULT 'none'::text NOT NULL,
    moderation_notes text,
    escalation_status text DEFAULT 'none'::text NOT NULL,
    escalated_at timestamp with time zone,
    escalation_reason text,
    CONSTRAINT reports_escalation_status_check CHECK (escalation_status = ANY (ARRAY['none'::text, 'manual_review'::text])),
    CONSTRAINT reports_moderation_action_check CHECK (moderation_action = ANY (ARRAY['none'::text, 'warn_reporter'::text, 'warn_target_owner'::text, 'warn_both'::text, 'manual_review'::text])),
    CONSTRAINT reports_pkey PRIMARY KEY (id),
    CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE SET NULL,
    CONSTRAINT reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL,
    CONSTRAINT reports_status_check CHECK (status = ANY (ARRAY['pending'::text, 'resolved'::text, 'dismissed'::text])),
    CONSTRAINT reports_target_type_check CHECK (target_type = ANY (ARRAY['group'::text, 'studio'::text, 'gig'::text, 'profile'::text, 'product'::text, 'playlist'::text]))
);

create table public.review_likes (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    review_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT review_likes_pkey PRIMARY KEY (id),
    CONSTRAINT review_likes_review_id_fkey FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
    CONSTRAINT review_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT review_likes_user_id_review_id_key UNIQUE (user_id, review_id)
);

create table public.reviews (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    author_id uuid NOT NULL,
    group_id uuid,
    studio_id uuid,
    gig_id uuid,
    user_id uuid,
    rating integer NOT NULL,
    content text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    studio_booking_id uuid,
    gig_application_id uuid,
    CONSTRAINT one_target_only CHECK (((group_id IS NOT NULL)::integer + (studio_id IS NOT NULL)::integer + (gig_id IS NOT NULL)::integer + (user_id IS NOT NULL)::integer) = 1),
    CONSTRAINT reviews_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT reviews_gig_application_id_fkey FOREIGN KEY (gig_application_id) REFERENCES gig_applications(id) ON DELETE SET NULL,
    CONSTRAINT reviews_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE,
    CONSTRAINT reviews_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT reviews_pkey PRIMARY KEY (id),
    CONSTRAINT reviews_rating_check CHECK (rating >= 1 AND rating <= 5),
    CONSTRAINT reviews_studio_booking_id_fkey FOREIGN KEY (studio_booking_id) REFERENCES studio_bookings(id) ON DELETE SET NULL,
    CONSTRAINT reviews_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    CONSTRAINT reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.shipping_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    seller_id uuid NOT NULL,
    name text NOT NULL,
    shipping_type text DEFAULT 'standard'::text NOT NULL,
    base_fee numeric DEFAULT 0,
    currency text DEFAULT 'PHP'::text NOT NULL,
    estimated_days_min integer DEFAULT 3,
    estimated_days_max integer DEFAULT 7,
    regions text[] DEFAULT ARRAY['PH'::text],
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shipping_profiles_base_fee_check CHECK (base_fee >= 0::numeric),
    CONSTRAINT shipping_profiles_name_check CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
    CONSTRAINT shipping_profiles_pkey PRIMARY KEY (id),
    CONSTRAINT shipping_profiles_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT shipping_profiles_shipping_type_check CHECK (shipping_type = ANY (ARRAY['standard'::text, 'express'::text, 'pickup'::text, 'digital'::text]))
);

create table public.social_activity_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    actor_id uuid NOT NULL,
    target_user_id uuid,
    post_id uuid,
    comment_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT social_activity_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT social_activity_events_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES post_comments(id) ON DELETE SET NULL,
    CONSTRAINT social_activity_events_event_type_check CHECK (event_type = ANY (ARRAY['follow'::text, 'unfollow'::text, 'post_created'::text, 'post_updated'::text, 'post_deleted'::text, 'reaction_added'::text, 'reaction_removed'::text, 'comment_added'::text, 'comment_deleted'::text, 'post_reported'::text, 'post_hidden'::text, 'post_restored'::text])),
    CONSTRAINT social_activity_events_pkey PRIMARY KEY (id),
    CONSTRAINT social_activity_events_post_id_fkey FOREIGN KEY (post_id) REFERENCES feed_posts(id) ON DELETE SET NULL,
    CONSTRAINT social_activity_events_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES profiles(id) ON DELETE SET NULL
);

create table public.station_playlist_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    playlist_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    label text,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT station_playlist_slots_label_check CHECK (char_length(label) <= 200),
    CONSTRAINT station_playlist_slots_pkey PRIMARY KEY (id),
    CONSTRAINT station_playlist_slots_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    CONSTRAINT station_playlist_slots_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
);

create table public.stations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    cover_image_url text,
    genre text,
    is_active boolean DEFAULT true,
    is_featured boolean DEFAULT false,
    listener_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    rotation_interval_minutes integer DEFAULT 15 NOT NULL,
    managed_group_id uuid,
    managed_profile_id uuid,
    CONSTRAINT stations_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT stations_description_check CHECK (char_length(description) <= 2000),
    CONSTRAINT stations_listener_count_check CHECK (listener_count >= 0),
    CONSTRAINT stations_managed_group_id_fkey FOREIGN KEY (managed_group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT stations_managed_profile_id_fkey FOREIGN KEY (managed_profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT stations_name_check CHECK (char_length(name) >= 1 AND char_length(name) <= 200),
    CONSTRAINT stations_pkey PRIMARY KEY (id),
    CONSTRAINT stations_rotation_interval_minutes_check CHECK (rotation_interval_minutes >= 5 AND rotation_interval_minutes <= 120)
);

create table public.studio_amenities (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    amenity text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT studio_amenities_pkey PRIMARY KEY (id),
    CONSTRAINT studio_amenities_studio_id_amenity_key UNIQUE (studio_id, amenity),
    CONSTRAINT studio_amenities_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
);

create table public.studio_availability_slots (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    day_of_week smallint,
    slot_date date,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_open boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT studio_availability_slots_check CHECK (end_time > start_time),
    CONSTRAINT studio_availability_slots_check1 CHECK (day_of_week IS NOT NULL AND day_of_week >= 0 AND day_of_week <= 6 OR slot_date IS NOT NULL),
    CONSTRAINT studio_availability_slots_pkey PRIMARY KEY (id),
    CONSTRAINT studio_availability_slots_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
);

create table public.studio_booking_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT studio_booking_slots_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio_bookings(id) ON DELETE CASCADE,
    CONSTRAINT studio_booking_slots_booking_id_start_time_end_time_key UNIQUE (booking_id, start_time, end_time),
    CONSTRAINT studio_booking_slots_pkey PRIMARY KEY (id),
    CONSTRAINT studio_booking_slots_time_check CHECK (end_time > start_time)
);

create table public.studio_bookings (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    studio_id uuid NOT NULL,
    booking_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    base_rate numeric NOT NULL,
    hours numeric NOT NULL,
    subtotal numeric NOT NULL,
    modifiers_applied jsonb DEFAULT '{}'::jsonb,
    final_price numeric NOT NULL,
    notes text,
    status text DEFAULT 'pending'::text,
    buffer_minutes integer DEFAULT 30,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    proof_url text,
    reviewed_by_customer boolean DEFAULT false,
    reviewed_by_owner boolean DEFAULT false,
    cancellation_reason text,
    check_in_time timestamp with time zone,
    payment_status text DEFAULT 'unpaid'::text,
    payment_intent_id text,
    checkout_session_id text,
    payment_method text,
    paid_at timestamp with time zone,
    payment_amount numeric,
    refund_amount numeric(10,2),
    refund_id text,
    refunded_at timestamp with time zone,
    payment_type text DEFAULT 'full'::text,
    remaining_balance numeric DEFAULT 0,
    session_type text,
    relocation_requested_at timestamp with time zone,
    relocation_expires_at timestamp with time zone,
    relocation_proposed_date date,
    relocation_proposed_start_time time without time zone,
    relocation_proposed_end_time time without time zone,
    payout_hold boolean DEFAULT false NOT NULL,
    payout_hold_reason text,
    payout_hold_at timestamp with time zone,
    payout_released_at timestamp with time zone,
    cancellation_policy_id uuid,
    cancellation_policy_snapshot jsonb,
    CONSTRAINT no_overlapping_bookings EXCLUDE USING gist (studio_id WITH =, booking_date WITH =, tsrange(booking_date + start_time, booking_date + end_time, '[)'::text) WITH &&) WHERE (status <> 'cancelled'::text AND status <> 'rejected'::text),
    CONSTRAINT studio_bookings_cancellation_policy_id_fkey FOREIGN KEY (cancellation_policy_id) REFERENCES booking_cancellation_policies(id) ON DELETE SET NULL,
    CONSTRAINT studio_bookings_check CHECK (end_time > start_time),
    CONSTRAINT studio_bookings_final_price_check CHECK (final_price >= 0::numeric),
    CONSTRAINT studio_bookings_hours_check CHECK (hours > 0::numeric),
    CONSTRAINT studio_bookings_payment_status_check CHECK (payment_status = ANY (ARRAY['unpaid'::text, 'pending'::text, 'paid'::text, 'partial'::text, 'failed'::text, 'refunded'::text, 'refund_pending'::text])),
    CONSTRAINT studio_bookings_payment_type_check CHECK (payment_type = ANY (ARRAY['full'::text, 'downpayment'::text, 'balance'::text])),
    CONSTRAINT studio_bookings_pkey PRIMARY KEY (id),
    CONSTRAINT studio_bookings_remaining_balance_check CHECK (remaining_balance >= 0::numeric),
    CONSTRAINT studio_bookings_session_type_check CHECK (session_type = ANY (ARRAY['rehearsal'::text, 'recording'::text])),
    CONSTRAINT studio_bookings_status_check CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text, 'checked_in'::text, 'pending_relocation'::text])),
    CONSTRAINT studio_bookings_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    CONSTRAINT studio_bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.studio_date_overrides (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    override_date date NOT NULL,
    is_open boolean DEFAULT false NOT NULL,
    open_time time without time zone,
    close_time time without time zone,
    reason text,
    slot_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT studio_date_overrides_check CHECK (is_open = false OR open_time IS NOT NULL AND close_time IS NOT NULL),
    CONSTRAINT studio_date_overrides_check1 CHECK (NOT is_open OR close_time > open_time),
    CONSTRAINT studio_date_overrides_pkey PRIMARY KEY (id),
    CONSTRAINT studio_date_overrides_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    CONSTRAINT studio_date_overrides_studio_id_override_date_slot_order_key UNIQUE (studio_id, override_date, slot_order)
);

create table public.studio_deletion_audit (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    owner_id uuid,
    deleted_by uuid,
    deleted_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    studio_snapshot jsonb NOT NULL,
    related_counts jsonb NOT NULL,
    storage_cleanup jsonb,
    reason text,
    CONSTRAINT studio_deletion_audit_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES profiles(id) ON DELETE SET NULL,
    CONSTRAINT studio_deletion_audit_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE SET NULL,
    CONSTRAINT studio_deletion_audit_pkey PRIMARY KEY (id)
);

create table public.studio_instruments (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    instrument_name text NOT NULL,
    image_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT studio_instruments_pkey PRIMARY KEY (id),
    CONSTRAINT studio_instruments_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    CONSTRAINT studio_instruments_studio_id_instrument_name_image_url_key UNIQUE (studio_id, instrument_name, image_url)
);

create table public.studio_media (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    media_type text NOT NULL,
    media_url text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT studio_media_media_type_check CHECK (media_type = 'image'::text),
    CONSTRAINT studio_media_pkey PRIMARY KEY (id),
    CONSTRAINT studio_media_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    CONSTRAINT studio_media_studio_id_media_type_media_url_key UNIQUE (studio_id, media_type, media_url)
);

create table public.studio_open_dates (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    open_date date NOT NULL,
    is_open boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT studio_open_dates_pkey PRIMARY KEY (id),
    CONSTRAINT studio_open_dates_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    CONSTRAINT studio_open_dates_studio_id_open_date_key UNIQUE (studio_id, open_date)
);

create table public.studio_operating_hours (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    is_open boolean DEFAULT true NOT NULL,
    open_time time without time zone,
    close_time time without time zone,
    slot_order integer DEFAULT 0,
    reason text,
    CONSTRAINT studio_operating_hours_check CHECK (is_open = false OR open_time IS NOT NULL AND close_time IS NOT NULL),
    CONSTRAINT studio_operating_hours_check1 CHECK (NOT is_open OR close_time > open_time),
    CONSTRAINT studio_operating_hours_day_of_week_check CHECK (day_of_week >= 0 AND day_of_week <= 6),
    CONSTRAINT studio_operating_hours_pkey PRIMARY KEY (id),
    CONSTRAINT studio_operating_hours_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
);

create table public.studio_owner_penalties (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    owner_id uuid NOT NULL,
    studio_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    penalty_type text NOT NULL,
    penalty_points integer DEFAULT 1 NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT studio_owner_penalties_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio_bookings(id) ON DELETE CASCADE,
    CONSTRAINT studio_owner_penalties_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT studio_owner_penalties_penalty_points_check CHECK (penalty_points > 0),
    CONSTRAINT studio_owner_penalties_penalty_type_check CHECK (penalty_type = 'forced_relocation_expired'::text),
    CONSTRAINT studio_owner_penalties_pkey PRIMARY KEY (id),
    CONSTRAINT studio_owner_penalties_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
);

create table public.studio_promotions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    studio_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    discount_type text NOT NULL,
    discount_value numeric(10,2) NOT NULL,
    is_permanent boolean DEFAULT false NOT NULL,
    start_date date,
    end_date date,
    applies_to text DEFAULT 'both'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    criteria text,
    minimum_booking_hours numeric(10,2),
    minimum_spend numeric(12,2),
    CONSTRAINT chk_date_range CHECK (is_permanent = true OR start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date),
    CONSTRAINT chk_percentage_range CHECK (discount_type <> 'percentage'::text OR discount_value > 0::numeric AND discount_value <= 100::numeric),
    CONSTRAINT studio_promotions_applies_to_check CHECK (applies_to = ANY (ARRAY['rehearsal'::text, 'recording'::text, 'both'::text])),
    CONSTRAINT studio_promotions_discount_type_check CHECK (discount_type = ANY (ARRAY['percentage'::text, 'fixed_amount'::text])),
    CONSTRAINT studio_promotions_discount_value_check CHECK (discount_value > 0::numeric),
    CONSTRAINT studio_promotions_minimum_booking_hours_check CHECK (minimum_booking_hours IS NULL OR minimum_booking_hours > 0::numeric),
    CONSTRAINT studio_promotions_minimum_spend_check CHECK (minimum_spend IS NULL OR minimum_spend > 0::numeric),
    CONSTRAINT studio_promotions_pkey PRIMARY KEY (id),
    CONSTRAINT studio_promotions_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
);

create table public.studio_settings (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    time_zone text DEFAULT 'Asia/Manila'::text NOT NULL,
    slot_increment_minutes integer DEFAULT 30,
    min_booking_duration_hours numeric DEFAULT 2.0,
    max_booking_duration_hours numeric DEFAULT 12.0,
    buffer_minutes integer DEFAULT 30,
    lead_time_hours integer DEFAULT 24,
    booking_horizon_days integer DEFAULT 90,
    weekend_multiplier numeric DEFAULT 1.0,
    late_night_multiplier numeric DEFAULT 1.0,
    bulk_discount_threshold_hours integer DEFAULT 10,
    bulk_discount_percentage numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    peak_season_multiplier numeric DEFAULT 1.0,
    peak_season_dates jsonb DEFAULT '[]'::jsonb,
    off_peak_multiplier numeric DEFAULT 1.0,
    off_peak_dates jsonb DEFAULT '[]'::jsonb,
    holiday_multiplier numeric DEFAULT 1.0,
    recording_songs_per_block integer DEFAULT 1 NOT NULL,
    recording_hours_per_block numeric DEFAULT 3 NOT NULL,
    recording_rate_negotiable boolean DEFAULT false NOT NULL,
    CONSTRAINT studio_settings_booking_horizon_days_check CHECK (booking_horizon_days > 0),
    CONSTRAINT studio_settings_buffer_minutes_check CHECK (buffer_minutes >= 0),
    CONSTRAINT studio_settings_bulk_discount_percentage_check CHECK (bulk_discount_percentage >= 0::numeric AND bulk_discount_percentage <= 100::numeric),
    CONSTRAINT studio_settings_holiday_multiplier_check CHECK (holiday_multiplier >= 1.0),
    CONSTRAINT studio_settings_late_night_multiplier_check CHECK (late_night_multiplier >= 1.0),
    CONSTRAINT studio_settings_lead_time_hours_check CHECK (lead_time_hours >= 0),
    CONSTRAINT studio_settings_max_booking_duration_hours_check CHECK (max_booking_duration_hours <= 24::numeric),
    CONSTRAINT studio_settings_min_booking_duration_hours_check CHECK (min_booking_duration_hours > 0::numeric),
    CONSTRAINT studio_settings_off_peak_multiplier_check CHECK (off_peak_multiplier >= 0.5 AND off_peak_multiplier <= 1.0),
    CONSTRAINT studio_settings_peak_season_multiplier_check CHECK (peak_season_multiplier >= 1.0),
    CONSTRAINT studio_settings_pkey PRIMARY KEY (id),
    CONSTRAINT studio_settings_recording_hours_per_block_check CHECK (recording_hours_per_block > 0::numeric),
    CONSTRAINT studio_settings_recording_songs_per_block_check CHECK (recording_songs_per_block > 0),
    CONSTRAINT studio_settings_slot_increment_minutes_check CHECK (slot_increment_minutes = ANY (ARRAY[15, 30, 60])),
    CONSTRAINT studio_settings_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    CONSTRAINT studio_settings_studio_id_key UNIQUE (studio_id),
    CONSTRAINT studio_settings_weekend_multiplier_check CHECK (weekend_multiplier >= 1.0)
);

create table public.studio_types (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    studio_type text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT studio_types_pkey PRIMARY KEY (id),
    CONSTRAINT studio_types_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    CONSTRAINT studio_types_studio_id_studio_type_key UNIQUE (studio_id, studio_type)
);

create table public.studios (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    address text,
    hourly_rate numeric,
    description text,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    embedding vector(384),
    rate numeric,
    contract_url text,
    rehearsal_rate numeric,
    recording_rate numeric,
    pax integer,
    address_verification_status text DEFAULT 'NOT_STARTED'::text,
    address_verification_session_id text,
    address_verified_at timestamp with time zone,
    verified_address text,
    address_verification_completed_at timestamp with time zone,
    business_permit_url text,
    permit_status text DEFAULT 'approved'::text NOT NULL,
    permit_reviewed_by uuid,
    permit_reviewed_at timestamp with time zone,
    permit_admin_notes text,
    permit_rejection_reason text,
    permit_resubmissions_used integer DEFAULT 0 NOT NULL,
    studio_type text,
    CONSTRAINT studios_address_verification_status_check CHECK (address_verification_status = ANY (ARRAY['NOT_STARTED'::text, 'PENDING'::text, 'PROCESSING'::text, 'VERIFIED'::text, 'APPROVED'::text, 'DECLINED'::text, 'FAILED'::text, 'ABANDONED'::text, 'MANUAL_REVIEW'::text, 'PENDING_REVIEW'::text])),
    CONSTRAINT studios_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT studios_permit_resubmissions_used_check CHECK (permit_resubmissions_used >= 0 AND permit_resubmissions_used <= 1),
    CONSTRAINT studios_permit_reviewed_by_fkey FOREIGN KEY (permit_reviewed_by) REFERENCES profiles(id),
    CONSTRAINT studios_permit_status_check CHECK (permit_status = ANY (ARRAY['pending_review'::text, 'approved'::text, 'rejected'::text, 'resubmitted'::text])),
    CONSTRAINT studios_pkey PRIMARY KEY (id)
);

create table public.subscription_payments (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    subscription_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount numeric NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    payment_method text,
    payment_intent_id text,
    checkout_session_id text,
    billing_period_start timestamp with time zone NOT NULL,
    billing_period_end timestamp with time zone NOT NULL,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT subscription_payments_pkey PRIMARY KEY (id),
    CONSTRAINT subscription_payments_status_check CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text])),
    CONSTRAINT subscription_payments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    CONSTRAINT subscription_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.subscription_plans (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text,
    price numeric NOT NULL,
    features jsonb DEFAULT '[]'::jsonb,
    duration_days integer DEFAULT 30,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT subscription_plans_pkey PRIMARY KEY (id)
);

create table public.subscriptions (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    current_period_start timestamp with time zone NOT NULL,
    current_period_end timestamp with time zone NOT NULL,
    cancelled_at timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false,
    payment_method text,
    last_payment_date timestamp with time zone,
    last_payment_amount numeric,
    checkout_session_id text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
    CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    CONSTRAINT subscriptions_status_check CHECK (status = ANY (ARRAY['active'::text, 'cancelled'::text, 'expired'::text, 'pending'::text, 'past_due'::text])),
    CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT unique_active_subscription UNIQUE (user_id)
);

create table public.verification_sessions (
    session_ref text NOT NULL,
    verification_data jsonb,
    status text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT verification_sessions_pkey PRIMARY KEY (session_ref)
);

create table public.wallet_deposits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    checkout_session_id text NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wallet_deposits_checkout_session_id_key UNIQUE (checkout_session_id),
    CONSTRAINT wallet_deposits_pkey PRIMARY KEY (id),
    CONSTRAINT wallet_deposits_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

create table public.wallet_transactions (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    wallet_id uuid NOT NULL,
    amount numeric NOT NULL,
    type text NOT NULL,
    description text,
    reference_id uuid,
    is_credit boolean DEFAULT true,
    status text DEFAULT 'completed'::text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    reference_type text,
    CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id),
    CONSTRAINT wallet_transactions_reference_type_check CHECK (reference_type = ANY (ARRAY['booking'::text, 'booking_payment'::text, 'booking_downpayment'::text, 'booking_balance'::text, 'deal_deposit'::text, 'deal_settlement'::text, 'penalty'::text, 'refund'::text, 'withdrawal'::text, 'deposit'::text])),
    CONSTRAINT wallet_transactions_status_check CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text])),
    CONSTRAINT wallet_transactions_type_check CHECK (type = ANY (ARRAY['deposit'::text, 'withdrawal'::text, 'payment'::text, 'refund'::text, 'earning'::text])),
    CONSTRAINT wallet_transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
);

create table public.wallets (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    balance numeric DEFAULT 0.00,
    currency text DEFAULT 'PHP'::text,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT wallets_pkey PRIMARY KEY (id),
    CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT wallets_user_id_key UNIQUE (user_id)
);

create table public.withdrawal_requests (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    wallet_id uuid NOT NULL,
    payout_method_id uuid,
    amount numeric NOT NULL,
    fee numeric DEFAULT 0,
    net_amount numeric NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    payout_type text,
    payout_account_name text,
    payout_account_number text,
    payout_bank_name text,
    reference_number text,
    notes text,
    processed_at timestamp with time zone,
    processed_by uuid,
    failure_reason text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT withdrawal_requests_amount_check CHECK (amount > 0::numeric),
    CONSTRAINT withdrawal_requests_payout_method_id_fkey FOREIGN KEY (payout_method_id) REFERENCES payout_methods(id) ON DELETE SET NULL,
    CONSTRAINT withdrawal_requests_pkey PRIMARY KEY (id),
    CONSTRAINT withdrawal_requests_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES profiles(id),
    CONSTRAINT withdrawal_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])),
    CONSTRAINT withdrawal_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT withdrawal_requests_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
);

-- Indexes

CREATE INDEX idx_address_verification_sessions_archive ON address_verification_sessions USING btree (archive_id);

CREATE INDEX idx_address_verification_sessions_entity ON address_verification_sessions USING btree (entity_type, entity_id);

CREATE INDEX idx_address_verification_sessions_session_id ON address_verification_sessions USING btree (session_id);

CREATE INDEX idx_address_verification_sessions_smile_user ON address_verification_sessions USING btree (smile_user_id);

CREATE INDEX idx_address_verification_sessions_user ON address_verification_sessions USING btree (user_id);

CREATE UNIQUE INDEX booking_attendance_events_unique_report ON booking_attendance_events USING btree (booking_id, event_type, COALESCE(reporter_user_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX idx_booking_attendance_events_booking_late_created ON booking_attendance_events USING btree (booking_id, created_at DESC) WHERE event_type = 'late'::text;

CREATE INDEX idx_bcp_studio ON booking_cancellation_policies USING btree (studio_id);

CREATE INDEX idx_bcp_studio_active ON booking_cancellation_policies USING btree (studio_id) WHERE is_active = true;

CREATE INDEX idx_booking_holds_expiry ON booking_holds USING btree (expires_at);

CREATE INDEX idx_booking_holds_studio_date ON booking_holds USING btree (studio_id, booking_date);

CREATE INDEX idx_bi_penalty ON booking_incidents USING btree (penalty_event_id) WHERE penalty_event_id IS NOT NULL;

CREATE INDEX idx_booking_incidents_booking_status ON booking_incidents USING btree (booking_id, status, created_at DESC);

CREATE INDEX idx_booking_incidents_counterparty_deadline ON booking_incidents USING btree (counterparty_user_id, status, response_deadline_at);

CREATE UNIQUE INDEX idx_booking_incidents_single_open_per_booking ON booking_incidents USING btree (booking_id) WHERE status = ANY (ARRAY['open'::text, 'responded'::text, 'manual_review'::text]);

CREATE INDEX idx_bpe_beneficiary ON booking_penalty_events USING btree (beneficiary_user_id) WHERE beneficiary_user_id IS NOT NULL;

CREATE INDEX idx_bpe_booking ON booking_penalty_events USING btree (booking_id);

CREATE INDEX idx_bpe_penalized ON booking_penalty_events USING btree (penalized_user_id);

CREATE INDEX idx_booking_requests_group_member_applications ON booking_requests USING btree (group_id, status, created_at DESC) WHERE group_id IS NOT NULL AND event_details @> '{"type": "listing_connection_request", "request_kind": "application", "application_scope": "group_member"}'::jsonb;

CREATE INDEX idx_booking_requests_group_status_created ON booking_requests USING btree (group_id, status, created_at DESC) WHERE group_id IS NOT NULL;

CREATE INDEX idx_booking_requests_receiver_status_created ON booking_requests USING btree (receiver_id, status, created_at DESC);

CREATE INDEX idx_booking_requests_sender_status_created ON booking_requests USING btree (sender_id, status, created_at DESC);

CREATE UNIQUE INDEX idx_booking_requests_unique_active_listing_request ON booking_requests USING btree (sender_id, receiver_id, COALESCE(group_id::text, ''::text), COALESCE(studio_id::text, ''::text), COALESCE(event_details ->> 'sender_entity_type'::text, ''::text), COALESCE(event_details ->> 'sender_entity_id'::text, ''::text), COALESCE(event_details ->> 'receiver_entity_type'::text, ''::text), COALESCE(event_details ->> 'receiver_entity_id'::text, ''::text), COALESCE(event_details ->> 'production_team_id'::text, ''::text), COALESCE(event_details ->> 'request_kind'::text, ''::text), COALESCE(event_details ->> 'application_scope'::text, ''::text)) WHERE (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'approved'::text, 'connected'::text])) AND created_at >= '2026-05-04 12:00:00+00'::timestamp with time zone AND event_details @> '{"type": "listing_connection_request"}'::jsonb;

CREATE INDEX idx_conversation_participants_conversation_id ON conversation_participants USING btree (conversation_id);

CREATE INDEX idx_conversation_participants_conversation_user ON conversation_participants USING btree (conversation_id, user_id);

CREATE INDEX idx_conversation_participants_muted_by_user ON conversation_participants USING btree (user_id, conversation_id, muted_until) WHERE is_muted = true;

CREATE INDEX idx_conversation_participants_user_conversation ON conversation_participants USING btree (user_id, conversation_id);

CREATE INDEX idx_conversation_participants_user_id ON conversation_participants USING btree (user_id);

CREATE INDEX idx_conversations_group_id_is_group ON conversations USING btree (group_id) WHERE group_id IS NOT NULL;

CREATE INDEX idx_conversations_is_group ON conversations USING btree (is_group) WHERE is_group = true;

CREATE INDEX idx_email_notifications_status ON email_notifications USING btree (status) WHERE status = 'pending'::text;

CREATE INDEX idx_external_links_owner ON external_platform_links USING btree (owner_id);

CREATE INDEX idx_external_links_playlist ON external_platform_links USING btree (linked_playlist_id) WHERE linked_playlist_id IS NOT NULL;

CREATE INDEX idx_favorites_profile_id ON favorites USING btree (profile_id);

CREATE INDEX idx_favorites_user_id ON favorites USING btree (user_id);

CREATE INDEX idx_feed_posts_author ON feed_posts USING btree (author_id);

CREATE INDEX idx_feed_posts_author_visible_created_desc ON feed_posts USING btree (author_id, created_at DESC) WHERE is_hidden = false;

CREATE INDEX idx_feed_posts_created ON feed_posts USING btree (created_at DESC) WHERE is_hidden = false;

CREATE INDEX idx_feed_posts_public_created_desc ON feed_posts USING btree (created_at DESC) WHERE visibility = 'public'::text AND is_hidden = false;

CREATE INDEX idx_feed_posts_public_feed ON feed_posts USING btree (created_at DESC) WHERE visibility = 'public'::text AND is_hidden = false;

CREATE INDEX idx_feed_posts_type ON feed_posts USING btree (post_type);

CREATE INDEX idx_follows_followed ON follows USING btree (followed_id);

CREATE INDEX idx_follows_follower ON follows USING btree (follower_id);

CREATE INDEX idx_follows_follower_type_followed ON follows USING btree (follower_id, followed_type, followed_id);

CREATE INDEX idx_follows_target_type_follower ON follows USING btree (followed_type, followed_id, follower_id);

CREATE UNIQUE INDEX idx_follows_unique_target ON follows USING btree (follower_id, followed_type, followed_id);

CREATE INDEX idx_gig_applications_applicant_created_desc ON gig_applications USING btree (applicant_id, created_at DESC);

CREATE INDEX idx_gig_applications_applicant_id ON gig_applications USING btree (applicant_id);

CREATE INDEX idx_gig_applications_cancelled_recent ON gig_applications USING btree (applicant_id, gig_id, updated_at DESC) WHERE status = 'cancelled'::text;

CREATE INDEX idx_gig_applications_gig_applicant ON gig_applications USING btree (gig_id, applicant_id);

CREATE INDEX idx_gig_applications_gig_id ON gig_applications USING btree (gig_id);

CREATE INDEX idx_gig_applications_gig_status_created_desc ON gig_applications USING btree (gig_id, status, created_at DESC);

CREATE INDEX idx_gig_applications_group_completion_perf ON gig_applications USING btree (group_id, status) WHERE group_id IS NOT NULL AND (status = ANY (ARRAY['completed'::text, 'cancelled'::text, 'fired'::text]));

CREATE INDEX idx_gig_applications_group_leader_approval ON gig_applications USING btree (group_id, leader_approval_status, created_at DESC);

CREATE INDEX idx_gig_applications_production_roster_id ON gig_applications USING btree (production_roster_id) WHERE production_roster_id IS NOT NULL;

CREATE INDEX idx_gig_applications_production_team_id ON gig_applications USING btree (production_team_id) WHERE production_team_id IS NOT NULL;

CREATE INDEX idx_gig_applications_reconfirm_due ON gig_applications USING btree (gig_id, reconfirmation_due_at) WHERE status = 'pending'::text AND reconfirmation_due_at IS NOT NULL;

CREATE INDEX idx_gig_applications_rejected_at ON gig_applications USING btree (gig_id, applicant_id, rejected_at) WHERE status = 'rejected'::text;

CREATE INDEX idx_gig_applications_solo_completion_perf ON gig_applications USING btree (applicant_id, status) WHERE group_id IS NULL AND (status = ANY (ARRAY['completed'::text, 'cancelled'::text, 'fired'::text]));

CREATE INDEX idx_gig_applications_status ON gig_applications USING btree (status);

CREATE INDEX idx_gig_applications_submitted_leader_created_desc ON gig_applications USING btree (submitted_by_user_id, leader_approval_status, created_at DESC);

CREATE UNIQUE INDEX idx_gig_applications_unique_active_group_application ON gig_applications USING btree (gig_id, group_id) WHERE group_id IS NOT NULL AND production_team_id IS NULL AND (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'approved'::text])) AND created_at >= '2026-05-04 12:00:00+00'::timestamp with time zone;

CREATE UNIQUE INDEX idx_gig_applications_unique_direct_applicant ON gig_applications USING btree (gig_id, applicant_id) WHERE production_team_id IS NULL;

CREATE UNIQUE INDEX idx_gig_applications_unique_group ON gig_applications USING btree (gig_id, group_id) WHERE group_id IS NOT NULL AND status <> 'rejected'::text;

CREATE UNIQUE INDEX idx_gig_applications_unique_production_team ON gig_applications USING btree (gig_id, production_team_id) WHERE production_team_id IS NOT NULL AND status <> 'rejected'::text;

CREATE INDEX idx_gig_availability_slots_gig_id ON gig_availability_slots USING btree (gig_id);

CREATE INDEX idx_gig_media_gig_id ON gig_media USING btree (gig_id);

CREATE INDEX idx_gig_requirements_gig_id ON gig_requirements USING btree (gig_id);

CREATE INDEX idx_gig_slot_fill_applicants_gig_id ON gig_slot_fill_applicants USING btree (gig_id);

CREATE INDEX idx_gigs_organizer_created_desc ON gigs USING btree (organizer_id, created_at DESC);

CREATE INDEX idx_gigs_permit_pending ON gigs USING btree (created_at DESC) WHERE permit_status = ANY (ARRAY['pending'::text, 'resubmitted'::text]);

CREATE INDEX idx_gigs_permit_queue ON gigs USING btree (permit_status, created_at DESC);

CREATE INDEX idx_gigs_permit_status ON gigs USING btree (permit_status);

CREATE INDEX idx_gigs_permit_status_created ON gigs USING btree (permit_status, created_at DESC);

CREATE INDEX idx_gigs_slots_status ON gigs USING btree (status) WHERE status = 'open'::text;

CREATE INDEX idx_group_availability_slots_group_id ON group_availability_slots USING btree (group_id);

CREATE INDEX idx_group_media_group_id ON group_media USING btree (group_id);

CREATE INDEX idx_group_members_group ON group_members USING btree (group_id);

CREATE INDEX idx_group_members_user ON group_members USING btree (user_id);

CREATE INDEX idx_group_playlists_group ON group_playlists USING btree (group_id, "position");

CREATE INDEX idx_group_playlists_playlist ON group_playlists USING btree (playlist_id);

CREATE INDEX idx_group_roster_members_group_id ON group_roster_members USING btree (group_id);

CREATE INDEX idx_group_roster_members_user_id ON group_roster_members USING btree (user_id);

CREATE INDEX idx_groups_owner_id ON groups USING btree (owner_id);

CREATE INDEX idx_leadership_transfer_from ON leadership_transfer_requests USING btree (from_user_id);

CREATE INDEX idx_leadership_transfer_group ON leadership_transfer_requests USING btree (group_id);

CREATE UNIQUE INDEX idx_leadership_transfer_pending ON leadership_transfer_requests USING btree (group_id) WHERE status = 'pending'::text;

CREATE INDEX idx_leadership_transfer_status ON leadership_transfer_requests USING btree (status);

CREATE INDEX idx_leadership_transfer_to ON leadership_transfer_requests USING btree (to_user_id);

CREATE INDEX idx_leadership_transfer_to_user ON leadership_transfer_requests USING btree (to_user_id);

CREATE UNIQUE INDEX idx_manual_identity_reviews_pending_manual_unique ON manual_identity_reviews USING btree (user_id) WHERE status = 'PENDING_REVIEW'::text AND source = 'MANUAL_UPLOAD'::text;

CREATE INDEX idx_manual_identity_reviews_status_created ON manual_identity_reviews USING btree (status, created_at DESC);

CREATE INDEX idx_manual_identity_reviews_user_status ON manual_identity_reviews USING btree (user_id, status, created_at DESC);

CREATE INDEX idx_message_reactions_message_id ON message_reactions USING btree (message_id);

CREATE INDEX idx_message_reactions_user_id ON message_reactions USING btree (user_id);

CREATE INDEX idx_messages_conversation_id ON messages USING btree (conversation_id);

CREATE INDEX idx_messages_created_at ON messages USING btree (created_at DESC);

CREATE INDEX idx_messages_sender_id ON messages USING btree (sender_id);

CREATE INDEX idx_notifications_user_created_desc ON notifications USING btree (user_id, created_at DESC);

CREATE INDEX idx_notifications_user_id ON notifications USING btree (user_id);

CREATE INDEX idx_notifications_user_unread_created_desc ON notifications USING btree (user_id, created_at DESC) WHERE read = false;

CREATE INDEX idx_fulfillments_order ON order_fulfillments USING btree (order_id);

CREATE INDEX idx_fulfillments_status ON order_fulfillments USING btree (status);

CREATE INDEX idx_order_items_order ON order_items USING btree (order_id);

CREATE INDEX idx_order_items_product ON order_items USING btree (product_id);

CREATE INDEX idx_orders_buyer ON orders USING btree (buyer_id);

CREATE INDEX idx_orders_created ON orders USING btree (created_at DESC);

CREATE INDEX idx_orders_number ON orders USING btree (order_number);

CREATE INDEX idx_orders_seller ON orders USING btree (seller_id);

CREATE INDEX idx_orders_status ON orders USING btree (status);

CREATE INDEX idx_payout_methods_user ON payout_methods USING btree (user_id);

CREATE INDEX idx_permit_audit_created ON permit_audit_log USING btree (created_at DESC);

CREATE INDEX idx_permit_audit_entity ON permit_audit_log USING btree (entity_type, entity_id);

CREATE INDEX idx_permit_audit_performed_by ON permit_audit_log USING btree (performed_by);

CREATE INDEX idx_playlist_items_playlist ON playlist_items USING btree (playlist_id, "position");

CREATE INDEX idx_play_events_playlist ON playlist_play_events USING btree (playlist_id) WHERE playlist_id IS NOT NULL;

CREATE INDEX idx_play_events_station ON playlist_play_events USING btree (station_id) WHERE station_id IS NOT NULL;

CREATE INDEX idx_play_events_type ON playlist_play_events USING btree (event_type, created_at DESC);

CREATE INDEX idx_play_events_user ON playlist_play_events USING btree (user_id) WHERE user_id IS NOT NULL;

CREATE INDEX idx_teaser_assets_playlist ON playlist_teaser_assets USING btree (playlist_id);

CREATE INDEX idx_teaser_assets_uploader ON playlist_teaser_assets USING btree (uploader_id);

CREATE INDEX idx_playlists_creator ON playlists USING btree (creator_id);

CREATE INDEX idx_playlists_featured ON playlists USING btree (created_at DESC) WHERE is_featured = true AND is_hidden = false;

CREATE INDEX idx_playlists_genre ON playlists USING btree (genre) WHERE genre IS NOT NULL;

CREATE INDEX idx_playlists_public ON playlists USING btree (created_at DESC) WHERE visibility = 'public'::text AND is_hidden = false;

CREATE INDEX idx_post_comments_author ON post_comments USING btree (author_id);

CREATE INDEX idx_post_comments_parent ON post_comments USING btree (parent_comment_id) WHERE parent_comment_id IS NOT NULL;

CREATE INDEX idx_post_comments_post ON post_comments USING btree (post_id);

CREATE INDEX idx_post_media_post ON post_media USING btree (post_id);

CREATE INDEX idx_post_reactions_post ON post_reactions USING btree (post_id);

CREATE INDEX idx_post_reactions_user ON post_reactions USING btree (user_id);

CREATE INDEX idx_post_reactions_user_post ON post_reactions USING btree (user_id, post_id);

CREATE INDEX idx_product_media_product ON product_media USING btree (product_id);

CREATE INDEX idx_product_variants_available ON product_variants USING btree (product_id) WHERE is_available = true AND stock_quantity > 0;

CREATE INDEX idx_product_variants_product ON product_variants USING btree (product_id);

CREATE INDEX idx_production_team_members_team ON production_team_members USING btree (team_id);

CREATE INDEX idx_production_team_members_user ON production_team_members USING btree (user_id);

CREATE INDEX idx_production_team_roster_group ON production_team_roster USING btree (group_id) WHERE group_id IS NOT NULL;

CREATE INDEX idx_production_team_roster_profile ON production_team_roster USING btree (profile_id) WHERE profile_id IS NOT NULL;

CREATE INDEX idx_production_team_roster_team ON production_team_roster USING btree (team_id);

CREATE INDEX idx_production_team_roster_team_kind ON production_team_roster USING btree (team_id, entity_kind);

CREATE UNIQUE INDEX idx_production_team_roster_unique_group ON production_team_roster USING btree (team_id, group_id) WHERE group_id IS NOT NULL;

CREATE UNIQUE INDEX idx_production_team_roster_unique_profile ON production_team_roster USING btree (team_id, profile_id) WHERE profile_id IS NOT NULL;

CREATE INDEX idx_production_teams_owner ON production_teams USING btree (owner_id);

CREATE INDEX idx_products_active ON products USING btree (created_at DESC) WHERE status = 'active'::text;

CREATE INDEX idx_products_category ON products USING btree (category) WHERE category IS NOT NULL;

CREATE INDEX idx_products_featured ON products USING btree (created_at DESC) WHERE is_featured = true AND status = 'active'::text;

CREATE INDEX idx_products_group ON products USING btree (group_id) WHERE group_id IS NOT NULL;

CREATE INDEX idx_products_seller ON products USING btree (seller_id);

CREATE INDEX idx_products_status ON products USING btree (status);

CREATE INDEX idx_products_type ON products USING btree (product_type);

CREATE INDEX idx_profile_genres_profile_id ON profile_genres USING btree (profile_id);

CREATE INDEX idx_profile_portfolio_urls_profile_id ON profile_portfolio_urls USING btree (profile_id);

CREATE INDEX idx_profile_skills_profile_id ON profile_skills USING btree (profile_id);

CREATE INDEX idx_profiles_email ON profiles USING btree (email);

CREATE INDEX idx_profiles_smile_user_id ON profiles USING btree (smile_user_id);

CREATE INDEX idx_profiles_verification_status ON profiles USING btree (verification_status);

CREATE INDEX idx_push_notification_devices_token_active ON push_notification_devices USING btree (push_token) WHERE is_active = true;

CREATE INDEX idx_push_notification_devices_user_active ON push_notification_devices USING btree (user_id, last_seen_at DESC) WHERE is_active = true;

CREATE UNIQUE INDEX push_notification_devices_installation_id_key ON push_notification_devices USING btree (installation_id);

CREATE INDEX idx_reports_escalation_status_created_at ON reports USING btree (escalation_status, created_at DESC);

CREATE INDEX idx_reports_reviewed_at ON reports USING btree (reviewed_at DESC);

CREATE INDEX idx_reports_reviewed_by ON reports USING btree (reviewed_by);

CREATE INDEX idx_reports_status_created_at ON reports USING btree (status, created_at DESC);

CREATE UNIQUE INDEX idx_reports_unique_pending_by_reporter_target_reason ON reports USING btree (COALESCE(reporter_id, '00000000-0000-0000-0000-000000000000'::uuid), target_type, target_id, lower(reason)) WHERE lower(COALESCE(status, 'pending'::text)) = 'pending'::text;

CREATE INDEX idx_review_likes_review_id ON review_likes USING btree (review_id);

CREATE INDEX idx_reviews_gig_application_id ON reviews USING btree (gig_application_id);

CREATE INDEX idx_reviews_gig_id ON reviews USING btree (gig_id);

CREATE INDEX idx_reviews_group_id ON reviews USING btree (group_id);

CREATE INDEX idx_reviews_studio_booking_id ON reviews USING btree (studio_booking_id);

CREATE INDEX idx_reviews_studio_id ON reviews USING btree (studio_id);

CREATE INDEX idx_reviews_user_id ON reviews USING btree (user_id);

CREATE INDEX idx_shipping_profiles_seller ON shipping_profiles USING btree (seller_id);

CREATE INDEX idx_social_events_actor ON social_activity_events USING btree (actor_id);

CREATE INDEX idx_social_events_post ON social_activity_events USING btree (post_id) WHERE post_id IS NOT NULL;

CREATE INDEX idx_social_events_target ON social_activity_events USING btree (target_user_id) WHERE target_user_id IS NOT NULL;

CREATE INDEX idx_social_events_type ON social_activity_events USING btree (event_type, created_at DESC);

CREATE INDEX idx_station_slots_active ON station_playlist_slots USING btree (station_id) WHERE is_active = true;

CREATE INDEX idx_station_slots_playlist ON station_playlist_slots USING btree (playlist_id);

CREATE INDEX idx_station_slots_station ON station_playlist_slots USING btree (station_id, "position");

CREATE INDEX idx_stations_active ON stations USING btree (created_at DESC) WHERE is_active = true;

CREATE INDEX idx_stations_creator ON stations USING btree (creator_id);

CREATE INDEX idx_stations_featured ON stations USING btree (created_at DESC) WHERE is_featured = true AND is_active = true;

CREATE INDEX idx_stations_group_station ON stations USING btree (managed_group_id) WHERE managed_group_id IS NOT NULL;

CREATE INDEX idx_stations_managed_group ON stations USING btree (managed_group_id) WHERE managed_group_id IS NOT NULL;

CREATE INDEX idx_stations_managed_profile ON stations USING btree (managed_profile_id);

CREATE INDEX idx_stations_profile_station ON stations USING btree (managed_profile_id) WHERE managed_profile_id IS NOT NULL AND managed_group_id IS NULL;

CREATE INDEX idx_studio_amenities_studio_id ON studio_amenities USING btree (studio_id);

CREATE INDEX idx_studio_availability_slots_studio_id ON studio_availability_slots USING btree (studio_id);

CREATE INDEX idx_studio_booking_slots_booking_id ON studio_booking_slots USING btree (booking_id);

CREATE INDEX idx_sb_cancellation_policy ON studio_bookings USING btree (cancellation_policy_id) WHERE cancellation_policy_id IS NOT NULL;

CREATE INDEX idx_studio_bookings_checkout_session ON studio_bookings USING btree (checkout_session_id);

CREATE INDEX idx_studio_bookings_date_status ON studio_bookings USING btree (studio_id, booking_date, status);

CREATE INDEX idx_studio_bookings_payment_status ON studio_bookings USING btree (payment_status);

CREATE INDEX idx_studio_bookings_studio_id ON studio_bookings USING btree (studio_id);

CREATE INDEX idx_studio_bookings_studio_status_date ON studio_bookings USING btree (studio_id, status, booking_date DESC);

CREATE INDEX idx_studio_bookings_unpaid_user ON studio_bookings USING btree (user_id, booking_date) WHERE remaining_balance > 0::numeric AND (status = ANY (ARRAY['pending'::text, 'confirmed'::text]));

CREATE INDEX idx_studio_bookings_user_id ON studio_bookings USING btree (user_id);

CREATE INDEX idx_studio_bookings_user_status_date ON studio_bookings USING btree (user_id, status, booking_date DESC);

CREATE INDEX idx_studio_bookings_user_studio_status ON studio_bookings USING btree (user_id, studio_id, status);

CREATE INDEX idx_studio_date_overrides_lookup ON studio_date_overrides USING btree (studio_id, override_date, slot_order);

CREATE INDEX idx_studio_date_overrides_studio_date_slot ON studio_date_overrides USING btree (studio_id, override_date, slot_order);

CREATE INDEX idx_studio_instruments_studio_id ON studio_instruments USING btree (studio_id);

CREATE INDEX idx_studio_media_studio_id ON studio_media USING btree (studio_id);

CREATE INDEX idx_studio_open_dates_studio_id ON studio_open_dates USING btree (studio_id);

CREATE INDEX idx_studio_operating_hours_lookup ON studio_operating_hours USING btree (studio_id, day_of_week, slot_order);

CREATE INDEX idx_owner_penalties_owner_created ON studio_owner_penalties USING btree (owner_id, created_at DESC);

CREATE UNIQUE INDEX idx_owner_penalties_unique_booking_type ON studio_owner_penalties USING btree (booking_id, penalty_type);

CREATE INDEX idx_studio_promotions_active_lookup ON studio_promotions USING btree (studio_id, start_date, end_date) WHERE is_active = true;

CREATE INDEX idx_studio_promotions_studio_active ON studio_promotions USING btree (studio_id, is_active) WHERE is_active = true;

CREATE INDEX idx_studio_types_studio_id ON studio_types USING btree (studio_id);

CREATE INDEX idx_studios_permit_pending ON studios USING btree (created_at DESC) WHERE permit_status = ANY (ARRAY['pending'::text, 'resubmitted'::text]);

CREATE INDEX idx_studios_permit_queue ON studios USING btree (permit_status, created_at DESC);

CREATE INDEX idx_studios_permit_status ON studios USING btree (permit_status);

CREATE INDEX idx_studios_permit_status_created ON studios USING btree (permit_status, created_at DESC);

CREATE INDEX idx_subscription_payments_subscription_id ON subscription_payments USING btree (subscription_id);

CREATE INDEX idx_subscription_payments_user_id ON subscription_payments USING btree (user_id);

CREATE INDEX idx_subscriptions_period_end ON subscriptions USING btree (current_period_end);

CREATE INDEX idx_subscriptions_status ON subscriptions USING btree (status);

CREATE INDEX idx_subscriptions_user_id ON subscriptions USING btree (user_id);

CREATE INDEX idx_wallet_deposits_session ON wallet_deposits USING btree (checkout_session_id);

CREATE INDEX idx_wallet_deposits_user_id ON wallet_deposits USING btree (user_id);

CREATE INDEX idx_wallet_transactions_booking_earnings ON wallet_transactions USING btree (wallet_id, created_at DESC) WHERE type = 'earning'::text AND (reference_type IS NULL OR (reference_type = ANY (ARRAY['booking'::text, 'booking_payment'::text, 'booking_downpayment'::text, 'booking_balance'::text])));

CREATE INDEX idx_wallet_transactions_wallet_created_desc ON wallet_transactions USING btree (wallet_id, created_at DESC);

CREATE INDEX idx_withdrawal_requests_status ON withdrawal_requests USING btree (status);

CREATE INDEX idx_withdrawal_requests_user ON withdrawal_requests USING btree (user_id);

CREATE INDEX idx_withdrawal_requests_wallet ON withdrawal_requests USING btree (wallet_id);

-- Views

create or replace view public.admin_permit_metrics as
 SELECT ( SELECT count(*) AS count
           FROM studios
          WHERE studios.permit_status = 'pending_review'::text) AS studios_pending,
    ( SELECT count(*) AS count
           FROM studios
          WHERE studios.permit_status = 'approved'::text) AS studios_approved,
    ( SELECT count(*) AS count
           FROM studios
          WHERE studios.permit_status = 'rejected'::text) AS studios_rejected,
    ( SELECT count(*) AS count
           FROM studios
          WHERE studios.permit_status = 'resubmitted'::text) AS studios_resubmitted,
    ( SELECT count(*) AS count
           FROM gigs
          WHERE gigs.permit_status = 'pending_review'::text) AS gigs_pending,
    ( SELECT count(*) AS count
           FROM gigs
          WHERE gigs.permit_status = 'approved'::text) AS gigs_approved,
    ( SELECT count(*) AS count
           FROM gigs
          WHERE gigs.permit_status = 'rejected'::text) AS gigs_rejected,
    ( SELECT count(*) AS count
           FROM gigs
          WHERE gigs.permit_status = 'resubmitted'::text) AS gigs_resubmitted,
    ( SELECT count(*) AS count
           FROM profiles) AS total_users,
    ( SELECT count(*) AS count
           FROM profiles
          WHERE profiles.role = 'studio-owner'::text) AS studio_owners,
    ( SELECT count(*) AS count
           FROM profiles
          WHERE profiles.role = 'venue-owner'::text) AS venue_owners,
    ( SELECT count(*) AS count
           FROM profiles
          WHERE profiles.role = 'musician'::text) AS musicians,
    ( SELECT count(*) AS count
           FROM profiles
          WHERE profiles.role = 'admin'::text) AS admins,
    ( SELECT count(*) AS count
           FROM permit_audit_log
          WHERE permit_audit_log.created_at > (now() - '24:00:00'::interval)) AS recent_audit_actions,
    ( SELECT count(*) AS count
           FROM studios
          WHERE studios.created_at > (now() - '24:00:00'::interval)) AS new_studios_24h,
    ( SELECT count(*) AS count
           FROM gigs
          WHERE gigs.created_at > (now() - '24:00:00'::interval)) AS new_gigs_24h;;

create or replace view public.booking_penalty_events_with_summary as
 SELECT bpe.id,
    bpe.booking_id,
    bpe.policy_snapshot,
    bpe.penalty_type,
    bpe.penalty_amount,
    bpe.refund_amount,
    bpe.booking_total,
    bpe.penalized_user_id,
    bpe.beneficiary_user_id,
    bpe.wallet_transaction_id,
    bpe.refund_transaction_id,
    bpe.notes,
    bpe.created_at,
    sb.booking_date,
    sb.start_time,
    sb.end_time,
    sb.session_type,
    s.name AS studio_name,
    pu.full_name AS penalized_user_name,
    bu.full_name AS beneficiary_user_name
   FROM booking_penalty_events bpe
     JOIN studio_bookings sb ON sb.id = bpe.booking_id
     JOIN studios s ON s.id = sb.studio_id
     JOIN profiles pu ON pu.id = bpe.penalized_user_id
     LEFT JOIN profiles bu ON bu.id = bpe.beneficiary_user_id;;

create or replace view public.conversations_display_projection as
 SELECT c.id,
    c.group_id,
    c.is_group,
        CASE
            WHEN c.group_id IS NOT NULL THEN g.name
            ELSE NULL::text
        END AS group_name,
        CASE
            WHEN c.group_id IS NOT NULL THEN glp.images[1]
            ELSE NULL::text
        END AS group_avatar_url
   FROM conversations c
     LEFT JOIN groups g ON g.id = c.group_id
     LEFT JOIN groups_legacy_projection glp ON glp.id = c.group_id;;

create or replace view public.follow_counts as
 SELECT id AS user_id,
    ( SELECT count(*) AS count
           FROM follows f
          WHERE f.followed_type = 'profile'::text AND f.followed_id = p.id) AS follower_count,
    ( SELECT count(*) AS count
           FROM follows f
          WHERE f.follower_id = p.id) AS following_count
   FROM profiles p;;

create or replace view public.gigs_availability_projection as
 SELECT id AS gig_id,
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('day_of_week', gas.day_of_week, 'date', gas.slot_date, 'start', to_char(gas.start_time::interval, 'HH24:MI'::text), 'end', to_char(gas.end_time::interval, 'HH24:MI'::text), 'is_available', gas.is_available)) ORDER BY gas.day_of_week, gas.slot_date, gas.start_time) AS jsonb_agg
           FROM gig_availability_slots gas
          WHERE gas.gig_id = g.id), '[]'::jsonb) AS availability
   FROM gigs g;;

create or replace view public.gigs_legacy_projection as
 SELECT id,
    COALESCE(( SELECT jsonb_object_agg(gr.requirement_key, gr.requirement_value) AS jsonb_object_agg
           FROM gig_requirements gr
          WHERE gr.gig_id = g.id), '{}'::jsonb) AS requirements,
    COALESCE(( SELECT array_agg(gm.media_url ORDER BY gm.sort_order, gm.created_at) AS array_agg
           FROM gig_media gm
          WHERE gm.gig_id = g.id AND gm.media_type = 'image'::text), ARRAY[]::text[]) AS images,
    COALESCE(( SELECT array_agg(gm.media_url ORDER BY gm.sort_order, gm.created_at) AS array_agg
           FROM gig_media gm
          WHERE gm.gig_id = g.id AND gm.media_type = 'document'::text), ARRAY[]::text[]) AS documents
   FROM gigs g;;

create or replace view public.gigs_slots_filled_projection as
 SELECT id AS gig_id,
    jsonb_build_object('solo', jsonb_build_object('accepted', COALESCE(( SELECT s.accepted_count
           FROM gig_slot_fill_summary s
          WHERE s.gig_id = g.id AND s.slot_type = 'solo'::text), 0), 'applicant_ids', COALESCE(( SELECT jsonb_agg(a.applicant_id ORDER BY a.applicant_id) AS jsonb_agg
           FROM gig_slot_fill_applicants a
          WHERE a.gig_id = g.id AND a.slot_type = 'solo'::text), '[]'::jsonb)), 'duo', jsonb_build_object('accepted', COALESCE(( SELECT s.accepted_count
           FROM gig_slot_fill_summary s
          WHERE s.gig_id = g.id AND s.slot_type = 'duo'::text), 0), 'applicant_ids', COALESCE(( SELECT jsonb_agg(a.applicant_id ORDER BY a.applicant_id) AS jsonb_agg
           FROM gig_slot_fill_applicants a
          WHERE a.gig_id = g.id AND a.slot_type = 'duo'::text), '[]'::jsonb)), 'band', jsonb_build_object('accepted', COALESCE(( SELECT s.accepted_count
           FROM gig_slot_fill_summary s
          WHERE s.gig_id = g.id AND s.slot_type = 'band'::text), 0), 'applicant_ids', COALESCE(( SELECT jsonb_agg(a.applicant_id ORDER BY a.applicant_id) AS jsonb_agg
           FROM gig_slot_fill_applicants a
          WHERE a.gig_id = g.id AND a.slot_type = 'band'::text), '[]'::jsonb))) AS slots_filled
   FROM gigs g;;

create or replace view public.gigs_with_stats as
 SELECT g.id,
    g.organizer_id,
    g.name,
    g.location,
    g.budget,
    g.description,
    g.event_date,
    glp.requirements,
    glp.images,
    glp.documents,
    g.status,
    g.latitude,
    g.longitude,
    g.created_at,
    g.embedding,
    g.rate,
    g.contract_url,
    g.business_permit_url,
    COALESCE(gap.availability, '[]'::jsonb) AS availability,
    g.address_verification_status,
    g.address_verification_session_id,
    g.address_verified_at,
    g.verified_address,
    g.address_verification_completed_at,
    COALESCE(avg(r.rating), 0::numeric) AS rating,
    count(r.id) AS review_count,
    g.permit_status,
    g.permit_rejection_reason,
    g.permit_admin_notes,
    g.permit_reviewed_by,
    g.permit_reviewed_at,
    g.permit_resubmissions_used
   FROM gigs g
     LEFT JOIN reviews r ON r.gig_id = g.id
     LEFT JOIN gigs_legacy_projection glp ON glp.id = g.id
     LEFT JOIN gigs_availability_projection gap ON gap.gig_id = g.id
  GROUP BY g.id, g.organizer_id, g.name, g.location, g.budget, g.description, g.event_date, glp.requirements, glp.images, glp.documents, g.status, g.latitude, g.longitude, g.created_at, g.embedding, g.rate, g.contract_url, g.business_permit_url, gap.availability, g.address_verification_status, g.address_verification_session_id, g.address_verified_at, g.verified_address, g.address_verification_completed_at, g.permit_status, g.permit_rejection_reason, g.permit_admin_notes, g.permit_reviewed_by, g.permit_reviewed_at, g.permit_resubmissions_used;;

create or replace view public.gigs_with_verification as
 SELECT g.id,
    g.organizer_id,
    g.name,
    g.location,
    g.budget,
    g.description,
    g.event_date,
    g.status,
    g.latitude,
    g.longitude,
    g.created_at,
    g.embedding,
    g.rate,
    g.contract_url,
    g.address_verification_status,
    g.address_verification_session_id,
    g.address_verified_at,
    g.verified_address,
    g.address_verification_completed_at,
    g.business_permit_url,
    g.reapplication_cooldown_days,
    g.total_slots_filled,
    g.permit_status,
    g.permit_reviewed_by,
    g.permit_reviewed_at,
    g.permit_admin_notes,
    g.permit_rejection_reason,
    g.permit_resubmissions_used,
        CASE
            WHEN g.address_verification_status = 'APPROVED'::text THEN true
            ELSE false
        END AS is_address_verified,
    avs.extracted_address,
    avs.extracted_name,
    avs.issuer AS verification_issuer,
    avs.notes AS verification_notes
   FROM gigs g
     LEFT JOIN address_verification_sessions avs ON avs.entity_type = 'gig'::text AND avs.entity_id = g.id AND avs.status = g.address_verification_status;;

create or replace view public.groups_availability_projection as
 SELECT id AS group_id,
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('day_of_week', gas.day_of_week, 'date', gas.slot_date, 'start', to_char(gas.start_time::interval, 'HH24:MI'::text), 'end', to_char(gas.end_time::interval, 'HH24:MI'::text), 'is_available', gas.is_available)) ORDER BY gas.day_of_week, gas.slot_date, gas.start_time) AS jsonb_agg
           FROM group_availability_slots gas
          WHERE gas.group_id = g.id), '[]'::jsonb) AS availability
   FROM groups g;;

create or replace view public.groups_legacy_projection as
 SELECT id,
    COALESCE(( SELECT jsonb_agg(COALESCE(rm.raw_member, jsonb_strip_nulls(jsonb_build_object('name', rm.member_name, 'role', rm.member_role, 'user_id', rm.user_id, 'avatar_url', rm.avatar_url, 'instrument', rm.instrument) || COALESCE(rm.metadata, '{}'::jsonb))) ORDER BY rm.sort_order, rm.created_at) AS jsonb_agg
           FROM group_roster_members rm
          WHERE rm.group_id = g.id), '[]'::jsonb) AS members,
    COALESCE(( SELECT array_agg(gm.media_url ORDER BY gm.sort_order, gm.created_at) AS array_agg
           FROM group_media gm
          WHERE gm.group_id = g.id AND gm.media_type = 'image'::text), ARRAY[]::text[]) AS images
   FROM groups g;;

create or replace view public.groups_with_stats as
 SELECT g.id,
    g.owner_id,
    g.name,
    g.genre,
    g.description,
    glp.members,
    g.location,
    glp.images,
    g.latitude,
    g.longitude,
    g.rate,
    g.created_at,
    g.group_type,
    COALESCE(gap.availability, '[]'::jsonb) AS availability,
    COALESCE(avg(r.rating), 0::numeric) AS rating,
    count(r.id) AS review_count,
    gc.completion_rate
   FROM groups g
     LEFT JOIN reviews r ON r.group_id = g.id
     LEFT JOIN groups_legacy_projection glp ON glp.id = g.id
     LEFT JOIN groups_availability_projection gap ON gap.group_id = g.id
     LEFT JOIN ( SELECT ga.group_id,
            round(count(*) FILTER (WHERE ga.status = 'completed'::text)::numeric / NULLIF(count(*), 0)::numeric * 100::numeric, 0) AS completion_rate
           FROM gig_applications ga
          WHERE ga.group_id IS NOT NULL AND (ga.status = ANY (ARRAY['completed'::text, 'cancelled'::text, 'fired'::text]))
          GROUP BY ga.group_id) gc ON gc.group_id = g.id
  GROUP BY g.id, g.owner_id, g.name, g.genre, g.description, glp.members, g.location, glp.images, g.latitude, g.longitude, g.rate, g.created_at, g.group_type, gap.availability, gc.completion_rate;;

create or replace view public.musician_performed_gigs as
 SELECT ga.id AS application_id,
    ga.applicant_id AS musician_id,
    ga.group_id,
    ga.gig_id,
    ga.show_on_profile,
    ga.created_at AS applied_at,
    g.name AS gig_name,
    g.location AS gig_location,
    g.budget AS gig_budget,
    g.event_date,
    g.status AS gig_status,
        CASE
            WHEN g.event_date IS NULL THEN 'unknown'::text
            WHEN g.event_date::date = CURRENT_DATE THEN 'active'::text
            WHEN g.event_date > now() THEN 'upcoming'::text
            ELSE 'done'::text
        END AS performance_status,
    p.full_name AS musician_name,
    p.avatar_url AS musician_avatar,
    p.role AS musician_role,
    grp.name AS group_name
   FROM gig_applications ga
     JOIN gigs g ON g.id = ga.gig_id
     JOIN profiles p ON p.id = ga.applicant_id
     LEFT JOIN groups grp ON grp.id = ga.group_id
  WHERE ga.status = 'accepted'::text;;

create or replace view public.orders_with_summary as
 SELECT o.id,
    o.buyer_id,
    o.seller_id,
    o.order_number,
    o.status,
    o.subtotal,
    o.shipping_fee,
    o.total_amount,
    o.currency,
    o.shipping_profile_id,
    o.shipping_address,
    o.payment_reference,
    o.wallet_transaction_id,
    o.notes,
    o.confirmed_at,
    o.shipped_at,
    o.delivered_at,
    o.cancelled_at,
    o.created_at,
    o.updated_at,
    bp.full_name AS buyer_name,
    bp.avatar_url AS buyer_avatar,
    sp.full_name AS seller_name,
    ( SELECT count(*) AS count
           FROM order_items oi
          WHERE oi.order_id = o.id) AS item_count,
    ( SELECT COALESCE(sum(oi.quantity), 0::bigint) AS "coalesce"
           FROM order_items oi
          WHERE oi.order_id = o.id) AS total_quantity
   FROM orders o
     JOIN profiles bp ON bp.id = o.buyer_id
     JOIN profiles sp ON sp.id = o.seller_id;;

create or replace view public.products_with_summary as
 SELECT p.id,
    p.seller_id,
    p.group_id,
    p.title,
    p.description,
    p.product_type,
    p.category,
    p.base_price,
    p.currency,
    p.status,
    p.is_featured,
    p.is_limited_edition,
    p.limited_quantity,
    p.total_sold,
    p.average_rating,
    p.review_count,
    p.created_at,
    p.updated_at,
    pr.full_name AS seller_name,
    pr.avatar_url AS seller_avatar,
    g.name AS group_name,
    ( SELECT count(*) AS count
           FROM product_variants pv
          WHERE pv.product_id = p.id AND pv.is_available = true AND pv.stock_quantity > 0) AS available_variants,
    ( SELECT COALESCE(sum(pv.stock_quantity), 0::bigint) AS "coalesce"
           FROM product_variants pv
          WHERE pv.product_id = p.id) AS total_stock,
    ( SELECT pm2.storage_path
           FROM product_media pm2
          WHERE pm2.product_id = p.id AND pm2.is_primary = true
         LIMIT 1) AS primary_image
   FROM products p
     JOIN profiles pr ON pr.id = p.seller_id
     LEFT JOIN groups g ON g.id = p.group_id;;

create or replace view public.profiles_legacy_projection as
 SELECT id,
    COALESCE(( SELECT array_agg(ps.skill ORDER BY ps.skill) AS array_agg
           FROM profile_skills ps
          WHERE ps.profile_id = p.id), ARRAY[]::text[]) AS skills,
    COALESCE(( SELECT array_agg(pg.genre ORDER BY pg.genre) AS array_agg
           FROM profile_genres pg
          WHERE pg.profile_id = p.id), ARRAY[]::text[]) AS genres,
    COALESCE(( SELECT array_agg(ppu.portfolio_url ORDER BY ppu.sort_order, ppu.created_at) AS array_agg
           FROM profile_portfolio_urls ppu
          WHERE ppu.profile_id = p.id), ARRAY[]::text[]) AS portfolio_urls
   FROM profiles p;;

create or replace view public.profiles_with_stats as
 SELECT p.id,
    p.email,
    p.full_name,
    p.avatar_url,
    p.role,
    p.bio,
    p.location,
    plp.skills,
    plp.genres,
    plp.portfolio_urls,
    p.is_verified,
    p.verification_status,
    p.didit_session_id,
    p.id_document_expiry,
    p.id_verified_at,
    p.created_at,
    COALESCE(avg(r.rating), 0::numeric) AS rating,
    count(r.id) AS review_count,
    pc.completion_rate
   FROM profiles p
     LEFT JOIN reviews r ON r.user_id = p.id
     LEFT JOIN profiles_legacy_projection plp ON plp.id = p.id
     LEFT JOIN ( SELECT ga.applicant_id,
            round(count(*) FILTER (WHERE ga.status = 'completed'::text)::numeric / NULLIF(count(*), 0)::numeric * 100::numeric, 0) AS completion_rate
           FROM gig_applications ga
          WHERE ga.group_id IS NULL AND (ga.status = ANY (ARRAY['completed'::text, 'cancelled'::text, 'fired'::text]))
          GROUP BY ga.applicant_id) pc ON pc.applicant_id = p.id
  GROUP BY p.id, p.email, p.full_name, p.avatar_url, p.role, p.bio, p.location, plp.skills, plp.genres, plp.portfolio_urls, p.is_verified, p.verification_status, p.didit_session_id, p.id_document_expiry, p.id_verified_at, p.created_at, pc.completion_rate;;

create or replace view public.reviews_with_stats as
 SELECT r.id,
    r.author_id,
    r.group_id,
    r.studio_id,
    r.gig_id,
    r.user_id,
    r.rating,
    r.content,
    r.created_at,
    count(rl.id) AS likes_count
   FROM reviews r
     LEFT JOIN review_likes rl ON rl.review_id = r.id
  GROUP BY r.id;;

create or replace view public.studio_bookings_legacy_projection as
 SELECT id,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('start', to_char(sbs.start_time::interval, 'HH24:MI'::text), 'end', to_char(sbs.end_time::interval, 'HH24:MI'::text)) ORDER BY sbs.sort_order, sbs.created_at) AS jsonb_agg
           FROM studio_booking_slots sbs
          WHERE sbs.booking_id = sb.id), '[]'::jsonb) AS time_slots
   FROM studio_bookings sb;;

create or replace view public.studio_bookings_with_cost as
 SELECT sb.id,
    sb.user_id,
    sb.studio_id,
    sb.booking_date,
    sb.start_time,
    sb.end_time,
    sb.base_rate,
    sb.hours,
    sb.subtotal,
    sb.modifiers_applied,
    sb.final_price,
    sb.notes,
    sb.status,
    sb.buffer_minutes,
    sb.created_at,
    sb.updated_at,
    EXTRACT(epoch FROM sb.end_time - sb.start_time) / 3600::numeric AS duration_hours,
    EXTRACT(epoch FROM sb.end_time - sb.start_time) / 3600::numeric * s.hourly_rate AS total_cost,
    s.name AS studio_name,
    slp.images AS studio_images,
    s.owner_id AS studio_owner_id,
    p.email AS user_email,
    p.full_name AS user_full_name
   FROM studio_bookings sb
     JOIN studios s ON s.id = sb.studio_id
     LEFT JOIN studios_legacy_projection slp ON slp.id = s.id
     JOIN profiles p ON p.id = sb.user_id;;

create or replace view public.studios_availability_projection as
 SELECT id AS studio_id,
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('day_of_week', soh.day_of_week, 'start', to_char(soh.open_time::interval, 'HH24:MI'::text), 'end', to_char(soh.close_time::interval, 'HH24:MI'::text), 'is_open', soh.is_open, 'session_type', lower(COALESCE("substring"(soh.reason, 'session_type:([a-z]+)'::text), 'both'::text)))) ORDER BY soh.day_of_week, soh.slot_order, soh.open_time) AS jsonb_agg
           FROM studio_operating_hours soh
          WHERE soh.studio_id = s.id AND soh.is_open = true), '[]'::jsonb) AS availability,
    COALESCE(( SELECT jsonb_agg(open_day.open_date ORDER BY open_day.open_date) AS jsonb_agg
           FROM ( SELECT sod.open_date
                   FROM studio_open_dates sod
                  WHERE sod.studio_id = s.id AND sod.is_open = true
                UNION
                 SELECT sdo.override_date AS open_date
                   FROM studio_date_overrides sdo
                  WHERE sdo.studio_id = s.id AND sdo.is_open = true) open_day), '[]'::jsonb) AS open_dates
   FROM studios s;;

create or replace view public.studios_legacy_projection as
 SELECT id,
    COALESCE(( SELECT array_agg(sa.amenity ORDER BY sa.amenity) AS array_agg
           FROM studio_amenities sa
          WHERE sa.studio_id = s.id), ARRAY[]::text[]) AS amenities,
    COALESCE(( SELECT array_agg(sm.media_url ORDER BY sm.sort_order, sm.created_at) AS array_agg
           FROM studio_media sm
          WHERE sm.studio_id = s.id AND sm.media_type = 'image'::text), ARRAY[]::text[]) AS images,
    COALESCE(( SELECT array_agg(st.studio_type ORDER BY st.studio_type) AS array_agg
           FROM studio_types st
          WHERE st.studio_id = s.id), ARRAY[]::text[]) AS types,
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('name', si.instrument_name, 'image', si.image_url)) ORDER BY si.instrument_name) AS jsonb_agg
           FROM studio_instruments si
          WHERE si.studio_id = s.id), '[]'::jsonb) AS instruments
   FROM studios s;;

create or replace view public.studios_with_stats as
 SELECT s.id,
    s.owner_id,
    s.name,
    s.address,
    s.hourly_rate,
    s.description,
    slp.amenities,
    slp.images,
    s.latitude,
    s.longitude,
    s.created_at,
    s.embedding,
    s.rate,
    s.contract_url,
    COALESCE(sap.availability, '[]'::jsonb) AS availability,
    slp.instruments,
        CASE
            WHEN COALESCE(array_length(slp.types, 1), 0) > 0 THEN slp.types[1]
            ELSE NULL::text
        END AS type,
    slp.types,
    s.rehearsal_rate,
    s.recording_rate,
    COALESCE(sap.open_dates, '[]'::jsonb) AS open_dates,
    s.pax,
    COALESCE(r.rating, 0::numeric) AS rating,
    COALESCE(r.review_count, 0::bigint) AS review_count,
    COALESCE(b.completion_rate, 100::numeric) AS completion_rate,
    COALESCE(ss.lead_time_hours, 24) AS lead_time_hours,
    COALESCE(ss.weekend_multiplier, 1.0) AS weekend_multiplier,
    COALESCE(ss.peak_season_multiplier, 1.0) AS peak_season_multiplier,
    COALESCE(ss.peak_season_dates, '[]'::jsonb) AS peak_season_dates,
    COALESCE(ss.off_peak_multiplier, 1.0) AS off_peak_multiplier,
    COALESCE(ss.off_peak_dates, '[]'::jsonb) AS off_peak_dates,
    COALESCE(ss.holiday_multiplier, 1.0) AS holiday_multiplier,
        CASE
            WHEN ss.peak_season_multiplier IS NOT NULL AND ss.peak_season_multiplier <> 1.0 THEN true
            WHEN ss.off_peak_multiplier IS NOT NULL AND ss.off_peak_multiplier <> 1.0 THEN true
            WHEN ss.weekend_multiplier IS NOT NULL AND ss.weekend_multiplier <> 1.0 THEN true
            ELSE false
        END AS has_seasonal_pricing,
    (EXISTS ( SELECT 1
           FROM studio_date_overrides sdo
          WHERE sdo.studio_id = s.id)) AS has_special_dates,
    s.permit_status,
    s.permit_rejection_reason,
    s.permit_admin_notes,
    s.permit_reviewed_by,
    s.permit_reviewed_at,
    s.permit_resubmissions_used,
    s.address AS location
   FROM studios s
     LEFT JOIN ( SELECT rv.studio_id,
            avg(rv.rating) AS rating,
            count(rv.id) AS review_count
           FROM reviews rv
          GROUP BY rv.studio_id) r ON r.studio_id = s.id
     LEFT JOIN ( SELECT sb.studio_id,
                CASE
                    WHEN count(sb.id) = 0 THEN 100::numeric
                    ELSE round(count(
                    CASE
                        WHEN sb.status = 'completed'::text THEN 1
                        ELSE NULL::integer
                    END)::numeric / count(sb.id)::numeric * 100::numeric, 0)
                END AS completion_rate
           FROM studio_bookings sb
          WHERE sb.status = ANY (ARRAY['completed'::text, 'cancelled'::text])
          GROUP BY sb.studio_id) b ON b.studio_id = s.id
     LEFT JOIN studio_settings ss ON ss.studio_id = s.id
     LEFT JOIN studios_legacy_projection slp ON slp.id = s.id
     LEFT JOIN studios_availability_projection sap ON sap.studio_id = s.id;;

create or replace view public.studios_with_verification as
 SELECT s.id,
    s.owner_id,
    s.name,
    s.address,
    s.hourly_rate,
    s.description,
    s.latitude,
    s.longitude,
    s.created_at,
    s.embedding,
    s.rate,
    s.contract_url,
    s.rehearsal_rate,
    s.recording_rate,
    s.pax,
    s.address_verification_status,
    s.address_verification_session_id,
    s.address_verified_at,
    s.verified_address,
    s.address_verification_completed_at,
    s.business_permit_url,
    s.permit_status,
    s.permit_reviewed_by,
    s.permit_reviewed_at,
    s.permit_admin_notes,
    s.permit_rejection_reason,
    s.permit_resubmissions_used,
        CASE
            WHEN s.address_verification_status = 'APPROVED'::text THEN true
            ELSE false
        END AS is_address_verified,
    avs.extracted_address,
    avs.extracted_name,
    avs.issuer AS verification_issuer,
    avs.notes AS verification_notes
   FROM studios s
     LEFT JOIN address_verification_sessions avs ON avs.entity_type = 'studio'::text AND avs.entity_id = s.id AND avs.status = s.address_verification_status;;

-- Functions

CREATE OR REPLACE FUNCTION public.accept_leadership_transfer(request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  req RECORD;
BEGIN
  -- Get request details
  SELECT * INTO req FROM leadership_transfer_requests WHERE id = request_id;
  
  IF req IS NULL THEN
    RAISE EXCEPTION 'Transfer request not found';
  END IF;
  
  IF req.status != 'pending' THEN
    RAISE EXCEPTION 'Transfer is no longer pending';
  END IF;
  
  IF req.to_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the recipient can accept this transfer';
  END IF;
  
  -- Update request status
  UPDATE leadership_transfer_requests 
  SET status = 'accepted', responded_at = NOW() 
  WHERE id = request_id;
  
  -- Transfer ownership in groups table
  UPDATE groups SET owner_id = req.to_user_id WHERE id = req.group_id;
  
  -- Update roles in group_members: demote old owner to member (ensure they are in table)
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (req.group_id, req.from_user_id, 'member')
  ON CONFLICT (group_id, user_id) 
  DO UPDATE SET role = 'member';
  
  -- Promote new owner
  UPDATE group_members SET role = 'owner' 
  WHERE group_id = req.group_id AND user_id = req.to_user_id;
  
  -- If new owner wasn't in group_members, add them
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (req.group_id, req.to_user_id, 'owner')
  ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'owner';
  
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_fetch_booking_incidents(p_status_filter text DEFAULT 'all'::text, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Forbidden: admin role required' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', bi.id,
          'booking_id', bi.booking_id,
          'reporter_user_id', bi.reporter_user_id,
          'counterparty_user_id', bi.counterparty_user_id,
          'issue_type', bi.issue_type,
          'status', bi.status,
          'reporter_notes', bi.reporter_notes,
          'counterparty_notes', bi.counterparty_notes,
          'response_deadline_at', bi.response_deadline_at,
          'responded_at', bi.responded_at,
          'resolved_at', bi.resolved_at,
          'resolved_by_user_id', bi.resolved_by_user_id,
          'resolution', bi.resolution,
          'created_at', bi.created_at,
          'studio_name', s.name,
          'booking_date', sb.booking_date,
          'booking_start_time', sb.start_time,
          'booking_end_time', sb.end_time,
          'reporter_name', COALESCE(rp.full_name, 'Unknown'),
          'reporter_email', COALESCE(rp.email, ''),
          'counterparty_name', COALESCE(cp.full_name, 'Unknown'),
          'counterparty_email', COALESCE(cp.email, '')
        )
        ORDER BY bi.created_at DESC
      ),
      '[]'::jsonb
    )
    FROM booking_incidents bi
    LEFT JOIN studio_bookings sb ON sb.id = bi.booking_id
    LEFT JOIN studios s ON s.id = sb.studio_id
    LEFT JOIN profiles rp ON rp.id = bi.reporter_user_id
    LEFT JOIN profiles cp ON cp.id = bi.counterparty_user_id
    WHERE p_status_filter = 'all' OR bi.status = p_status_filter
    LIMIT LEAST(GREATEST(p_limit, 1), 200)
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.admin_resolve_booking_incident(p_incident_id uuid, p_resolution text, p_admin_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_incident record;
  v_notes text;
  v_updated record;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  SELECT role INTO v_role FROM profiles WHERE id = v_user_id;
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Forbidden: admin role required' USING ERRCODE = '42501';
  END IF;

  IF p_resolution NOT IN ('resolved_refund', 'resolved_no_refund', 'dismissed') THEN
    RAISE EXCEPTION 'Invalid resolution. Must be: resolved_refund, resolved_no_refund, or dismissed';
  END IF;

  SELECT * INTO v_incident FROM booking_incidents WHERE id = p_incident_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident not found';
  END IF;

  IF v_incident.status NOT IN ('open', 'responded', 'manual_review') THEN
    RAISE EXCEPTION 'This incident is already resolved';
  END IF;

  v_notes := COALESCE(
    NULLIF(TRIM(COALESCE(p_admin_notes, '')), ''),
    CASE p_resolution
      WHEN 'resolved_refund'    THEN 'Admin resolved incident with refund outcome.'
      WHEN 'resolved_no_refund' THEN 'Admin resolved incident with no-refund outcome.'
      ELSE                           'Admin dismissed incident.'
    END
  );

  UPDATE booking_incidents
  SET
    status             = p_resolution,
    resolved_at        = NOW(),
    resolved_by_user_id = v_user_id,
    resolution         = v_notes
  WHERE id = p_incident_id
  RETURNING * INTO v_updated;

  -- Notify participants
  INSERT INTO notifications (user_id, type, title, message, is_read, meta)
  SELECT
    uid,
    'info',
    'Booking Incident Resolved',
    'An admin resolved your booking incident as ' || REPLACE(p_resolution, '_', ' ') || '.',
    false,
    jsonb_build_object(
      'incident_id',  p_incident_id,
      'booking_id',   v_incident.booking_id,
      'resolution',   p_resolution,
      'event_type',   'booking_incident_resolved_by_admin'
    )
  FROM unnest(ARRAY[v_incident.reporter_user_id, v_incident.counterparty_user_id]) AS uid
  WHERE uid IS NOT NULL;

  RETURN jsonb_build_object('success', true, 'incident', row_to_json(v_updated));
END;
$function$


CREATE OR REPLACE FUNCTION public.apply_booking_penalty(p_booking_id uuid, p_penalty_type text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_calc JSONB;
  v_booking RECORD;
  v_penalty_event_id UUID;
  v_penalty_tx_id UUID;
  v_refund_tx_id UUID;
  v_penalized_wallet_id UUID;
  v_beneficiary_wallet_id UUID;
BEGIN
  -- Calculate the penalty
  v_calc := calculate_booking_cancellation_penalty(p_booking_id);

  IF v_calc ? 'error' THEN
    RETURN v_calc;
  END IF;

  SELECT sb.*, s.owner_id AS studio_owner_id
  INTO v_booking
  FROM studio_bookings sb
  JOIN studios s ON s.id = sb.studio_id
  WHERE sb.id = p_booking_id;

  -- Determine who pays the penalty (canceller = booker for user cancel)
  -- Get wallets
  SELECT id INTO v_penalized_wallet_id FROM wallets WHERE user_id = v_booking.user_id;
  SELECT id INTO v_beneficiary_wallet_id FROM wallets WHERE user_id = v_booking.studio_owner_id;

  -- Create penalty wallet transaction if penalty > 0
  IF (v_calc->>'penalty_amount')::numeric > 0 AND v_beneficiary_wallet_id IS NOT NULL THEN
    INSERT INTO wallet_transactions (wallet_id, amount, type, description, reference_id, is_credit, reference_type, status)
    VALUES (
      v_beneficiary_wallet_id,
      (v_calc->>'penalty_amount')::numeric,
      'earning',
      'Cancellation penalty for booking ' || p_booking_id::text,
      p_booking_id,
      true,
      'penalty',
      'completed'
    )
    RETURNING id INTO v_penalty_tx_id;

    -- Credit beneficiary wallet
    UPDATE wallets SET balance = balance + (v_calc->>'penalty_amount')::numeric, updated_at = now()
    WHERE id = v_beneficiary_wallet_id;
  END IF;

  -- Create refund wallet transaction if refund > 0
  IF (v_calc->>'refund_amount')::numeric > 0 AND v_penalized_wallet_id IS NOT NULL THEN
    INSERT INTO wallet_transactions (wallet_id, amount, type, description, reference_id, is_credit, reference_type, status)
    VALUES (
      v_penalized_wallet_id,
      (v_calc->>'refund_amount')::numeric,
      'refund',
      'Cancellation refund for booking ' || p_booking_id::text,
      p_booking_id,
      true,
      'refund',
      'completed'
    )
    RETURNING id INTO v_refund_tx_id;

    -- Credit refund to user wallet
    UPDATE wallets SET balance = balance + (v_calc->>'refund_amount')::numeric, updated_at = now()
    WHERE id = v_penalized_wallet_id;
  END IF;

  -- Create immutable penalty event
  INSERT INTO booking_penalty_events (
    booking_id, policy_snapshot, penalty_type, penalty_amount, refund_amount,
    booking_total, penalized_user_id, beneficiary_user_id,
    wallet_transaction_id, refund_transaction_id, notes
  )
  VALUES (
    p_booking_id,
    COALESCE(v_calc->'policy_snapshot', '{}'::jsonb),
    COALESCE(p_penalty_type, v_calc->>'penalty_type'),
    (v_calc->>'penalty_amount')::numeric,
    (v_calc->>'refund_amount')::numeric,
    (v_calc->>'booking_total')::numeric,
    v_booking.user_id,
    v_booking.studio_owner_id,
    v_penalty_tx_id,
    v_refund_tx_id,
    p_notes
  )
  RETURNING id INTO v_penalty_event_id;

  RETURN jsonb_build_object(
    'success', true,
    'penalty_event_id', v_penalty_event_id,
    'penalty_amount', (v_calc->>'penalty_amount')::numeric,
    'refund_amount', (v_calc->>'refund_amount')::numeric,
    'penalty_type', v_calc->>'penalty_type'
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.apply_studio_promotion(p_studio_id uuid, p_booking_date date, p_session_type text DEFAULT 'rehearsal'::text, p_base_price numeric DEFAULT 0, p_hours numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_promo RECORD;
  v_discount_amount NUMERIC := 0;
  v_result JSONB := '{}'::JSONB;
BEGIN
  SELECT *
  INTO v_promo
  FROM public.studio_promotions
  WHERE studio_id = p_studio_id
    AND is_active = true
    AND (
      is_permanent = true
      OR (p_booking_date >= start_date AND p_booking_date <= end_date)
    )
    AND (
      applies_to = 'both'
      OR applies_to = p_session_type
    )
    AND (
      minimum_booking_hours IS NULL
      OR p_hours >= minimum_booking_hours
    )
    AND (
      minimum_spend IS NULL
      OR p_base_price >= minimum_spend
    )
  ORDER BY
    CASE
      WHEN discount_type = 'percentage' THEN p_base_price * (discount_value / 100)
      WHEN discount_type = 'fixed_amount' THEN discount_value * p_hours
      ELSE 0
    END DESC,
    created_at DESC
  LIMIT 1;

  IF v_promo IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_promo.discount_type = 'percentage' THEN
    v_discount_amount := p_base_price * (v_promo.discount_value / 100);
  ELSIF v_promo.discount_type = 'fixed_amount' THEN
    v_discount_amount := v_promo.discount_value * p_hours;
  END IF;

  IF v_discount_amount > p_base_price THEN
    v_discount_amount := p_base_price;
  END IF;

  v_result := jsonb_build_object(
    'id', v_promo.id,
    'name', v_promo.name,
    'discount_type', v_promo.discount_type,
    'discount_value', v_promo.discount_value,
    'discount_amount', ROUND(v_discount_amount, 2),
    'final_price_after_promo', ROUND(p_base_price - v_discount_amount, 2),
    'criteria', v_promo.criteria,
    'minimum_booking_hours', v_promo.minimum_booking_hours,
    'minimum_spend', v_promo.minimum_spend,
    'applies_to', v_promo.applies_to
  );

  RETURN v_result;
END;
$function$


CREATE OR REPLACE FUNCTION public.are_slots_available(p_studio_id uuid, p_booking_date date, p_time_slots jsonb, p_user_id uuid DEFAULT NULL::uuid, p_exclude_booking_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  slot jsonb;
  slot_start time;
  slot_end time;
  v_day_of_week integer;
  v_has_override boolean;
BEGIN
  v_day_of_week := EXTRACT(DOW FROM p_booking_date)::integer;

  SELECT EXISTS (
    SELECT 1
    FROM public.studio_date_overrides
    WHERE studio_id = p_studio_id
      AND override_date = p_booking_date
  )
  INTO v_has_override;

  FOR slot IN SELECT * FROM jsonb_array_elements(p_time_slots)
  LOOP
    BEGIN
      slot_start := (slot->>'start')::time;
      slot_end := (slot->>'end')::time;
    EXCEPTION WHEN OTHERS THEN
      RETURN FALSE;
    END;

    IF slot_end <= slot_start THEN
      RETURN FALSE;
    END IF;

    IF v_has_override THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.studio_date_overrides sdo
        WHERE sdo.studio_id = p_studio_id
          AND sdo.override_date = p_booking_date
          AND sdo.is_open = true
          AND sdo.open_time <= slot_start
          AND sdo.close_time >= slot_end
      ) THEN
        RETURN FALSE;
      END IF;
    ELSE
      IF NOT EXISTS (
        SELECT 1
        FROM public.studio_operating_hours soh
        WHERE soh.studio_id = p_studio_id
          AND soh.day_of_week = v_day_of_week
          AND soh.is_open = true
          AND soh.open_time <= slot_start
          AND soh.close_time >= slot_end
      ) THEN
        RETURN FALSE;
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.studio_bookings sb
      JOIN public.studio_booking_slots sbs
        ON sbs.booking_id = sb.id
      WHERE sb.studio_id = p_studio_id
        AND sb.booking_date = p_booking_date
        AND sb.status NOT IN ('cancelled', 'rejected')
        AND (p_exclude_booking_id IS NULL OR sb.id <> p_exclude_booking_id)
        AND (sbs.start_time < slot_end AND sbs.end_time > slot_start)
    ) THEN
      RETURN FALSE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.booking_holds bh
      WHERE bh.studio_id = p_studio_id
        AND bh.booking_date = p_booking_date
        AND bh.expires_at > now()
        AND (p_user_id IS NULL OR bh.user_id <> p_user_id)
        AND (bh.start_time < slot_end AND bh.end_time > slot_start)
    ) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$function$


CREATE OR REPLACE FUNCTION public.auto_add_group_owner_to_members()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (NEW.id, NEW.owner_id, 'owner')
    ON CONFLICT DO NOTHING;
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.calculate_booking_cancellation_penalty(p_booking_id uuid, p_cancellation_time timestamp with time zone DEFAULT timezone('utc'::text, now()))
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking RECORD;
  v_policy RECORD;
  v_booking_start TIMESTAMPTZ;
  v_hours_before NUMERIC;
  v_penalty_pct NUMERIC;
  v_penalty_amount NUMERIC;
  v_refund_amount NUMERIC;
  v_penalty_type TEXT;
BEGIN
  SELECT sb.*, s.owner_id AS studio_owner_id
  INTO v_booking
  FROM studio_bookings sb
  JOIN studios s ON s.id = sb.studio_id
  WHERE sb.id = p_booking_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Booking not found');
  END IF;

  -- If no cancellation policy snapshot, check for active policy
  IF v_booking.cancellation_policy_snapshot IS NOT NULL THEN
    v_policy := jsonb_populate_record(null::booking_cancellation_policies, v_booking.cancellation_policy_snapshot);
  ELSE
    SELECT * INTO v_policy
    FROM booking_cancellation_policies
    WHERE studio_id = v_booking.studio_id AND is_active = true
    LIMIT 1;
  END IF;

  -- No policy = no penalty, full refund
  IF v_policy IS NULL OR v_policy.id IS NULL THEN
    RETURN jsonb_build_object(
      'penalty_type', 'none',
      'penalty_pct', 0,
      'penalty_amount', 0,
      'refund_amount', v_booking.final_price,
      'booking_total', v_booking.final_price
    );
  END IF;

  -- Calculate hours before booking start
  v_booking_start := (v_booking.booking_date || ' ' || v_booking.start_time)::timestamptz;
  v_hours_before := EXTRACT(EPOCH FROM (v_booking_start - p_cancellation_time)) / 3600.0;

  IF v_hours_before >= v_policy.full_refund_hours_before THEN
    -- Full refund window
    v_penalty_pct := 0;
    v_penalty_type := 'late_cancellation';
  ELSIF v_hours_before >= v_policy.partial_refund_hours_before THEN
    -- Partial refund window
    v_penalty_pct := v_policy.late_cancel_penalty_pct;
    v_penalty_type := 'late_cancellation';
  ELSIF v_hours_before > 0 THEN
    -- Late cancellation (inside penalty window)
    v_penalty_pct := v_policy.late_cancel_penalty_pct;
    v_penalty_type := 'late_cancellation';
  ELSE
    -- Past booking start = no-show
    v_penalty_pct := v_policy.no_show_penalty_pct;
    v_penalty_type := 'no_show';
  END IF;

  v_penalty_amount := ROUND((v_booking.final_price * v_penalty_pct / 100.0)::numeric, 2);
  v_refund_amount := v_booking.final_price - v_penalty_amount;

  RETURN jsonb_build_object(
    'penalty_type', v_penalty_type,
    'penalty_pct', v_penalty_pct,
    'penalty_amount', v_penalty_amount,
    'refund_amount', v_refund_amount,
    'booking_total', v_booking.final_price,
    'hours_before_booking', ROUND(v_hours_before::numeric, 2),
    'policy_snapshot', row_to_json(v_policy)
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.calculate_booking_cost(p_studio_id uuid, p_start_time time without time zone, p_end_time time without time zone)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_hourly_rate NUMERIC;
  v_duration NUMERIC;
BEGIN
  SELECT hourly_rate INTO v_hourly_rate FROM studios WHERE id = p_studio_id;
  v_duration := EXTRACT(EPOCH FROM (p_end_time - p_start_time)) / 3600;
  RETURN v_duration * COALESCE(v_hourly_rate, 0);
END;
$function$


CREATE OR REPLACE FUNCTION public.calculate_booking_price(p_studio_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_total_cart_hours numeric DEFAULT NULL::numeric)
 RETURNS TABLE(base_rate numeric, hours numeric, subtotal numeric, modifiers jsonb, final_price numeric)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_hourly_rate NUMERIC;
  v_duration NUMERIC;
  v_subtotal NUMERIC;
  v_final_price NUMERIC;
  v_modifiers JSONB := '{}'::jsonb;
  v_day_of_week INTEGER;
  v_settings RECORD;
  v_date_range RECORD;
  v_is_peak BOOLEAN := false;
  v_is_off_peak BOOLEAN := false;
BEGIN
  -- Get studio hourly rate
  SELECT hourly_rate INTO v_hourly_rate FROM studios WHERE id = p_studio_id;
  
  -- Calculate duration in hours
  v_duration := EXTRACT(EPOCH FROM (p_end_time - p_start_time)) / 3600;
  v_subtotal := v_hourly_rate * v_duration;
  v_final_price := v_subtotal;
  
  -- Get settings
  SELECT * INTO v_settings FROM studio_settings WHERE studio_id = p_studio_id;
  
  IF NOT FOUND THEN
    -- Return basic calculation if no settings
    RETURN QUERY SELECT v_hourly_rate, v_duration, v_subtotal, v_modifiers, v_final_price;
    RETURN;
  END IF;
  
  -- Get day of week
  v_day_of_week := EXTRACT(DOW FROM p_booking_date);
  
  -- Check for Peak Season dates (array of {start, end} objects)
  IF v_settings.peak_season_dates IS NOT NULL AND jsonb_array_length(v_settings.peak_season_dates) > 0 THEN
    FOR v_date_range IN SELECT * FROM jsonb_array_elements(v_settings.peak_season_dates) AS elem
    LOOP
      IF p_booking_date >= (v_date_range.elem->>'start')::DATE 
         AND p_booking_date <= (v_date_range.elem->>'end')::DATE THEN
        v_is_peak := true;
        EXIT;
      END IF;
    END LOOP;
  END IF;
  
  -- Check for Off-Peak Season dates
  IF NOT v_is_peak AND v_settings.off_peak_dates IS NOT NULL AND jsonb_array_length(v_settings.off_peak_dates) > 0 THEN
    FOR v_date_range IN SELECT * FROM jsonb_array_elements(v_settings.off_peak_dates) AS elem
    LOOP
      IF p_booking_date >= (v_date_range.elem->>'start')::DATE 
         AND p_booking_date <= (v_date_range.elem->>'end')::DATE THEN
        v_is_off_peak := true;
        EXIT;
      END IF;
    END LOOP;
  END IF;
  
  -- Apply Peak Season multiplier (takes priority over weekend)
  IF v_is_peak AND v_settings.peak_season_multiplier IS NOT NULL AND v_settings.peak_season_multiplier > 1.0 THEN
    v_final_price := v_final_price * v_settings.peak_season_multiplier;
    v_modifiers := jsonb_set(v_modifiers, '{peak_season_multiplier}', to_jsonb(v_settings.peak_season_multiplier));
  -- Apply Off-Peak Season multiplier (discount)
  ELSIF v_is_off_peak AND v_settings.off_peak_multiplier IS NOT NULL AND v_settings.off_peak_multiplier < 1.0 THEN
    v_final_price := v_final_price * v_settings.off_peak_multiplier;
    v_modifiers := jsonb_set(v_modifiers, '{off_peak_multiplier}', to_jsonb(v_settings.off_peak_multiplier));
  -- Apply weekend multiplier only if not in peak/off-peak season (Saturday=6, Sunday=0)
  ELSIF v_day_of_week IN (0, 6) AND v_settings.weekend_multiplier IS NOT NULL AND v_settings.weekend_multiplier > 1.0 THEN
    v_final_price := v_final_price * v_settings.weekend_multiplier;
    v_modifiers := jsonb_set(v_modifiers, '{weekend_multiplier}', to_jsonb(v_settings.weekend_multiplier));
  END IF;
  
  -- Apply late night multiplier (after 10 PM) - stacks with seasonal
  IF p_start_time >= '22:00'::TIME AND v_settings.late_night_multiplier IS NOT NULL AND v_settings.late_night_multiplier > 1.0 THEN
    v_final_price := v_final_price * v_settings.late_night_multiplier;
    v_modifiers := jsonb_set(v_modifiers, '{late_night_multiplier}', to_jsonb(v_settings.late_night_multiplier));
  END IF;
  
  -- Apply bulk discount (if cart total meets threshold)
  IF p_total_cart_hours IS NOT NULL 
     AND v_settings.bulk_discount_threshold_hours IS NOT NULL
     AND p_total_cart_hours >= v_settings.bulk_discount_threshold_hours 
     AND v_settings.bulk_discount_percentage IS NOT NULL
     AND v_settings.bulk_discount_percentage > 0 THEN
    v_final_price := v_final_price * (1 - v_settings.bulk_discount_percentage / 100.0);
    v_modifiers := jsonb_set(v_modifiers, '{bulk_discount}', to_jsonb(v_settings.bulk_discount_percentage));
  END IF;
  
  RETURN QUERY SELECT v_hourly_rate, v_duration, v_subtotal, v_modifiers, v_final_price;
END;
$function$


CREATE OR REPLACE FUNCTION public.calculate_multi_slot_price(p_studio_id uuid, p_booking_date date, p_time_slots jsonb)
 RETURNS TABLE(base_rate numeric, total_hours numeric, subtotal numeric, modifiers jsonb, final_price numeric, slot_breakdown jsonb)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_base_rate NUMERIC;
    v_total_hours NUMERIC := 0;
    v_subtotal NUMERIC := 0;
    v_final_price NUMERIC := 0;
    v_modifiers JSONB := '{}'::jsonb;
    v_slot_breakdown JSONB := '[]'::jsonb;
    v_settings RECORD;
    v_is_weekend BOOLEAN;
    v_is_peak BOOLEAN := false;
    v_is_off_peak BOOLEAN := false;
    v_date_range RECORD;
    slot JSONB;
    slot_hours NUMERIC;
    slot_start TIME;
    slot_end TIME;
BEGIN
    -- Get studio base rate
    SELECT hourly_rate INTO v_base_rate
    FROM studios
    WHERE id = p_studio_id;
    
    IF v_base_rate IS NULL THEN
        RAISE EXCEPTION 'Studio not found';
    END IF;
    
    -- Get studio settings for modifiers
    SELECT * INTO v_settings FROM studio_settings WHERE studio_id = p_studio_id;
    
    -- Check if booking date is weekend (Saturday=6, Sunday=0)
    v_is_weekend := EXTRACT(DOW FROM p_booking_date) IN (0, 6);
    
    -- Check for Peak Season dates
    IF v_settings.peak_season_dates IS NOT NULL AND jsonb_array_length(v_settings.peak_season_dates) > 0 THEN
        FOR v_date_range IN SELECT * FROM jsonb_array_elements(v_settings.peak_season_dates) AS elem
        LOOP
            IF p_booking_date >= (v_date_range.elem->>'start')::DATE 
               AND p_booking_date <= (v_date_range.elem->>'end')::DATE THEN
                v_is_peak := true;
                EXIT;
            END IF;
        END LOOP;
    END IF;
    
    -- Check for Off-Peak Season dates
    IF NOT v_is_peak AND v_settings.off_peak_dates IS NOT NULL AND jsonb_array_length(v_settings.off_peak_dates) > 0 THEN
        FOR v_date_range IN SELECT * FROM jsonb_array_elements(v_settings.off_peak_dates) AS elem
        LOOP
            IF p_booking_date >= (v_date_range.elem->>'start')::DATE 
               AND p_booking_date <= (v_date_range.elem->>'end')::DATE THEN
                v_is_off_peak := true;
                EXIT;
            END IF;
        END LOOP;
    END IF;
    
    -- Calculate hours for each slot
    FOR slot IN SELECT * FROM jsonb_array_elements(p_time_slots)
    LOOP
        slot_start := (slot->>'start')::TIME;
        slot_end := (slot->>'end')::TIME;
        slot_hours := EXTRACT(EPOCH FROM (slot_end - slot_start)) / 3600.0;
        
        v_total_hours := v_total_hours + slot_hours;
        
        -- Add to slot breakdown
        v_slot_breakdown := v_slot_breakdown || jsonb_build_object(
            'start', slot->>'start',
            'end', slot->>'end',
            'hours', slot_hours
        );
    END LOOP;
    
    -- Calculate subtotal
    v_subtotal := v_base_rate * v_total_hours;
    v_final_price := v_subtotal;
    
    -- Apply seasonal or weekend multiplier (mutually exclusive priority)
    IF v_is_peak AND v_settings.peak_season_multiplier IS NOT NULL AND v_settings.peak_season_multiplier > 1.0 THEN
        v_final_price := v_final_price * v_settings.peak_season_multiplier;
        v_modifiers := v_modifiers || jsonb_build_object('peak_season_multiplier', v_settings.peak_season_multiplier);
    ELSIF v_is_off_peak AND v_settings.off_peak_multiplier IS NOT NULL AND v_settings.off_peak_multiplier < 1.0 THEN
        v_final_price := v_final_price * v_settings.off_peak_multiplier;
        v_modifiers := v_modifiers || jsonb_build_object('off_peak_multiplier', v_settings.off_peak_multiplier);
    ELSIF v_is_weekend AND v_settings.weekend_multiplier IS NOT NULL AND v_settings.weekend_multiplier > 1.0 THEN
        v_final_price := v_final_price * v_settings.weekend_multiplier;
        v_modifiers := v_modifiers || jsonb_build_object('weekend_multiplier', v_settings.weekend_multiplier);
    END IF;
    
    -- Apply bulk discount if applicable
    IF v_settings.bulk_discount_threshold_hours IS NOT NULL 
       AND v_total_hours >= v_settings.bulk_discount_threshold_hours 
       AND v_settings.bulk_discount_percentage IS NOT NULL
       AND v_settings.bulk_discount_percentage > 0 THEN
        v_final_price := v_final_price * (1 - (v_settings.bulk_discount_percentage / 100.0));
        v_modifiers := v_modifiers || jsonb_build_object('bulk_discount_percentage', v_settings.bulk_discount_percentage);
    END IF;
    
    -- Round to 2 decimal places
    v_final_price := ROUND(v_final_price, 2);
    
    RETURN QUERY SELECT 
        v_base_rate,
        v_total_hours,
        v_subtotal,
        v_modifiers,
        v_final_price,
        v_slot_breakdown;
END;
$function$


CREATE OR REPLACE FUNCTION public.can_manage_production_team_members(target_team_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.production_teams pt
    where pt.id = target_team_id
      and pt.owner_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.production_team_members ptm
    where ptm.team_id = target_team_id
      and ptm.user_id = (select auth.uid())
      and ptm.role = any (array['owner'::text, 'manager'::text])
  );
$function$


CREATE OR REPLACE FUNCTION public.can_musician_reapply(p_gig_id uuid, p_applicant_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_cooldown_days INTEGER;
    v_last_rejection TIMESTAMP WITH TIME ZONE;
    v_rejection_count INTEGER;
BEGIN
    -- Get gig's cooldown setting
    SELECT COALESCE(reapplication_cooldown_days, 30)
    INTO v_cooldown_days
    FROM gigs WHERE id = p_gig_id;
    
    -- Check for recent rejections within cooldown period
    SELECT rejected_at, COUNT(*)
    INTO v_last_rejection, v_rejection_count
    FROM gig_applications
    WHERE gig_id = p_gig_id 
        AND applicant_id = p_applicant_id 
        AND status = 'rejected'
        AND rejected_at IS NOT NULL
    GROUP BY rejected_at
    ORDER BY rejected_at DESC
    LIMIT 1;
    
    -- If no rejections found, can apply
    IF v_last_rejection IS NULL THEN
        RETURN TRUE;
    END IF;
    
    -- If cooldown is 0, can always reapply immediately
    IF v_cooldown_days = 0 THEN
        RETURN TRUE;
    END IF;
    
    -- Check if cooldown period has passed
    IF NOW() >= v_last_rejection + (v_cooldown_days || ' days')::INTERVAL THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$function$


CREATE OR REPLACE FUNCTION public.can_view_gig_application_readonly_participant(p_application_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH target_application AS (
    SELECT
      ga.id,
      ga.group_id,
      ga.production_team_id,
      ptr.profile_id AS roster_profile_id,
      ptr.group_id AS roster_group_id
    FROM public.gig_applications ga
    LEFT JOIN public.production_team_roster ptr
      ON ptr.id = ga.production_roster_id
    WHERE ga.id = p_application_id
  ),
  visible_groups AS (
    SELECT COALESCE(roster_group_id, group_id) AS group_id
    FROM target_application
    WHERE COALESCE(roster_group_id, group_id) IS NOT NULL
  )
  SELECT EXISTS (
    SELECT 1
    FROM target_application ta
    WHERE ta.production_team_id IS NOT NULL
      AND ta.roster_profile_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM visible_groups vg
    JOIN public.groups g
      ON g.id = vg.group_id
    WHERE g.owner_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM visible_groups vg
    JOIN public.group_members gm
      ON gm.group_id = vg.group_id
    WHERE gm.user_id = (SELECT auth.uid())
  );
$function$


CREATE OR REPLACE FUNCTION public.cancel_leadership_transfer(request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  req RECORD;
BEGIN
  SELECT * INTO req FROM leadership_transfer_requests WHERE id = request_id;
  
  IF req IS NULL THEN
    RAISE EXCEPTION 'Transfer request not found';
  END IF;
  
  IF req.status != 'pending' THEN
    RAISE EXCEPTION 'Transfer is no longer pending';
  END IF;
  
  IF req.from_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the sender can cancel this transfer';
  END IF;
  
  UPDATE leadership_transfer_requests 
  SET status = 'cancelled', responded_at = NOW() 
  WHERE id = request_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.check_verification_session(p_session_ref text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_data JSONB;
    v_status TEXT;
BEGIN
    SELECT verification_data, status INTO v_data, v_status
    FROM verification_sessions
    WHERE session_ref = p_session_ref;

    IF v_status = 'APPROVED' THEN
        RETURN jsonb_build_object('valid', true, 'data', v_data);
    ELSE
        RETURN jsonb_build_object('valid', false);
    END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.cleanup_expired_holds()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM booking_holds
  WHERE expires_at <= NOW();
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$function$


CREATE OR REPLACE FUNCTION public.contract_3nf_preflight()
 RETURNS TABLE(metric text, value bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 'profiles_skills_nonempty'::text, 0::bigint
  UNION ALL SELECT 'profiles_genres_nonempty', 0::bigint
  UNION ALL SELECT 'profiles_portfolio_nonempty', 0::bigint
  UNION ALL SELECT 'gigs_requirements_nonempty', 0::bigint
  UNION ALL SELECT 'gigs_images_nonempty', 0::bigint
  UNION ALL SELECT 'gigs_documents_nonempty', 0::bigint
  UNION ALL SELECT 'studios_amenities_nonempty', 0::bigint
  UNION ALL SELECT 'studios_images_nonempty', 0::bigint
  UNION ALL SELECT 'studios_instruments_nonempty', 0::bigint
  UNION ALL SELECT 'studios_types_nonempty_or_scalar', 0::bigint
  UNION ALL
  SELECT 'dup_profile_skills', COUNT(*)::bigint
  FROM (
    SELECT profile_id, skill
    FROM public.profile_skills
    GROUP BY profile_id, skill
    HAVING COUNT(*) > 1
  ) d1
  UNION ALL
  SELECT 'dup_gig_requirements', COUNT(*)::bigint
  FROM (
    SELECT gig_id, requirement_key
    FROM public.gig_requirements
    GROUP BY gig_id, requirement_key
    HAVING COUNT(*) > 1
  ) d2
  UNION ALL
  SELECT 'dup_studio_amenities', COUNT(*)::bigint
  FROM (
    SELECT studio_id, amenity
    FROM public.studio_amenities
    GROUP BY studio_id, amenity
    HAVING COUNT(*) > 1
  ) d3
  UNION ALL
  SELECT 'orphan_profile_skills', COUNT(*)::bigint
  FROM public.profile_skills ps
  LEFT JOIN public.profiles p ON p.id = ps.profile_id
  WHERE p.id IS NULL
  UNION ALL
  SELECT 'orphan_gig_requirements', COUNT(*)::bigint
  FROM public.gig_requirements gr
  LEFT JOIN public.gigs g ON g.id = gr.gig_id
  WHERE g.id IS NULL
  UNION ALL
  SELECT 'orphan_studio_amenities', COUNT(*)::bigint
  FROM public.studio_amenities sa
  LEFT JOIN public.studios s ON s.id = sa.studio_id
  WHERE s.id IS NULL;
$function$


CREATE OR REPLACE FUNCTION public.contract_3nf_ready()
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(bool_and(failed_count = 0), false)
  from public.contract_3nf_preflight();
$function$


CREATE OR REPLACE FUNCTION public.create_group_conversation(p_group_id uuid, p_creator_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
    v_conversation_id uuid;
    v_member record;
begin
    select id into v_conversation_id
    from public.conversations
    where group_id = p_group_id and is_group = true
    limit 1;

    if v_conversation_id is not null then
        return v_conversation_id;
    end if;

    insert into public.conversations (is_group, group_id)
    values (true, p_group_id)
    returning id into v_conversation_id;

    for v_member in
        select user_id, role from public.group_members where group_id = p_group_id
    loop
        insert into public.conversation_participants (conversation_id, user_id, role)
        values (
            v_conversation_id,
            v_member.user_id,
            case when v_member.role = 'owner' then 'owner' else 'member' end
        )
        on conflict (conversation_id, user_id) do nothing;
    end loop;

    if p_creator_id is not null then
      insert into public.conversation_participants (conversation_id, user_id, role)
      values (v_conversation_id, p_creator_id, 'owner')
      on conflict (conversation_id, user_id) do nothing;
    end if;

    return v_conversation_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.decline_leadership_transfer(request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  req RECORD;
BEGIN
  SELECT * INTO req FROM leadership_transfer_requests WHERE id = request_id;
  
  IF req IS NULL THEN
    RAISE EXCEPTION 'Transfer request not found';
  END IF;
  
  IF req.status != 'pending' THEN
    RAISE EXCEPTION 'Transfer is no longer pending';
  END IF;
  
  IF req.to_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the recipient can decline this transfer';
  END IF;
  
  UPDATE leadership_transfer_requests 
  SET status = 'declined', responded_at = NOW() 
  WHERE id = request_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.delete_gig_safely(p_gig_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
DECLARE
  v_uid UUID;
  v_gig RECORD;
  v_pending_count INTEGER := 0;
  v_accepted_count INTEGER := 0;
  v_cancelled_count INTEGER := 0;
  v_related_counts JSONB;
  v_applicant_counts JSONB;
  v_storage_urls TEXT[] := ARRAY[]::TEXT[];
  v_storage_pairs JSONB := '[]'::JSONB;
  v_storage_objects_to_delete INTEGER := 0;
  v_storage_deleted_count INTEGER := 0;
  v_storage_cleanup JSONB;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF COALESCE(NULLIF(btrim(p_reason), ''), '') = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'CANCELLATION_REASON_REQUIRED',
      'message', 'A cancellation reason is required before deleting this gig.'
    );
  END IF;

  SELECT *
  INTO v_gig
  FROM public.gigs g
  WHERE g.id = p_gig_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'GIG_NOT_FOUND',
      'message', 'Gig not found.'
    );
  END IF;

  IF v_gig.organizer_id <> v_uid THEN
    RAISE EXCEPTION 'Not authorized to delete this gig';
  END IF;

  SELECT COUNT(*) FILTER (WHERE status = 'pending'),
         COUNT(*) FILTER (WHERE status = 'accepted')
  INTO v_pending_count, v_accepted_count
  FROM public.gig_applications ga
  WHERE ga.gig_id = p_gig_id;

  IF (v_pending_count + v_accepted_count) > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, message, meta)
    SELECT
      ga.applicant_id,
      CASE WHEN ga.status = 'accepted' THEN 'error' ELSE 'warning' END,
      'Gig Cancelled',
      COALESCE(v_gig.name, 'A gig') || ' was cancelled by the organizer. Reason: ' || p_reason,
      jsonb_build_object(
        'gig_id', p_gig_id,
        'event', 'gig_cancelled',
        'reason', p_reason,
        'previous_status', ga.status,
        'status_reason', 'gig_cancelled_by_organizer'
      )
    FROM public.gig_applications ga
    WHERE ga.gig_id = p_gig_id
      AND ga.status IN ('pending', 'accepted');

    UPDATE public.gig_applications
    SET
      status = 'cancelled',
      system_status_reason = 'gig_cancelled_by_organizer',
      reconfirmation_required_at = NULL,
      reconfirmation_due_at = NULL
    WHERE gig_id = p_gig_id
      AND status IN ('pending', 'accepted');

    GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;
  END IF;

  v_related_counts := jsonb_build_object(
    'gig_applications_total', (SELECT COUNT(*) FROM public.gig_applications WHERE gig_id = p_gig_id),
    'reviews', (SELECT COUNT(*) FROM public.reviews WHERE gig_id = p_gig_id),
    'favorites', (SELECT COUNT(*) FROM public.favorites WHERE gig_id = p_gig_id)
  );

  v_applicant_counts := jsonb_build_object(
    'pending', (SELECT COUNT(*) FROM public.gig_applications WHERE gig_id = p_gig_id AND status = 'pending'),
    'accepted', (SELECT COUNT(*) FROM public.gig_applications WHERE gig_id = p_gig_id AND status = 'accepted'),
    'cancelled', (SELECT COUNT(*) FROM public.gig_applications WHERE gig_id = p_gig_id AND status = 'cancelled'),
    'rejected', (SELECT COUNT(*) FROM public.gig_applications WHERE gig_id = p_gig_id AND status = 'rejected')
  );

  SELECT array_agg(gm.media_url)
  INTO v_storage_urls
  FROM public.gig_media gm
  WHERE gm.gig_id = p_gig_id
    AND gm.media_url IS NOT NULL
    AND btrim(gm.media_url) <> '';

  IF v_storage_urls IS NULL THEN
    v_storage_urls := ARRAY[]::TEXT[];
  END IF;

  IF v_gig.contract_url IS NOT NULL AND btrim(v_gig.contract_url) <> '' THEN
    v_storage_urls := v_storage_urls || v_gig.contract_url;
  END IF;

  IF v_gig.business_permit_url IS NOT NULL AND btrim(v_gig.business_permit_url) <> '' THEN
    v_storage_urls := v_storage_urls || v_gig.business_permit_url;
  END IF;

  WITH parsed AS (
    SELECT
      (m)[1] AS bucket_id,
      split_part((m)[2], '?', 1) AS object_path
    FROM (
      SELECT regexp_matches(
        u.url,
        '/storage/v1/object/(?:public|sign)/([^/]+)/(.+)$'
      ) AS m
      FROM unnest(v_storage_urls) AS u(url)
      WHERE u.url IS NOT NULL
    ) t
    WHERE m IS NOT NULL
  ), dedup AS (
    SELECT DISTINCT bucket_id, object_path
    FROM parsed
    WHERE object_path <> ''
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object('bucket_id', bucket_id, 'object_path', object_path)), '[]'::jsonb),
    COUNT(*)
  INTO v_storage_pairs, v_storage_objects_to_delete
  FROM dedup;

  v_storage_deleted_count := 0;

  v_storage_cleanup := jsonb_build_object(
    'candidate_urls', COALESCE(array_length(v_storage_urls, 1), 0),
    'parsed_objects', v_storage_objects_to_delete,
    'deleted_objects', v_storage_deleted_count,
    'requires_storage_api_cleanup', (v_storage_objects_to_delete > 0),
    'objects', v_storage_pairs
  );

  INSERT INTO public.gig_deletion_audit (
    gig_id,
    organizer_id,
    deleted_by,
    gig_snapshot,
    related_counts,
    applicant_counts,
    storage_cleanup,
    reason
  )
  VALUES (
    p_gig_id,
    v_gig.organizer_id,
    v_uid,
    to_jsonb(v_gig),
    v_related_counts,
    v_applicant_counts,
    v_storage_cleanup,
    p_reason
  );

  DELETE FROM public.gigs
  WHERE id = p_gig_id
    AND organizer_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to delete gig';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'gig_id', p_gig_id,
    'cancelled_applications', v_cancelled_count,
    'related_counts', v_related_counts,
    'applicant_counts', v_applicant_counts,
    'storage_cleanup', v_storage_cleanup
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.delete_group_safely(p_group_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID;
  v_group RECORD;
  v_pending_count INTEGER := 0;
  v_accepted_count INTEGER := 0;
  v_pending_transfer_count INTEGER := 0;
  v_related_counts JSONB;
  v_application_counts JSONB;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_group
  FROM public.groups g
  WHERE g.id = p_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'GROUP_NOT_FOUND',
      'message', 'Group not found.'
    );
  END IF;

  IF v_group.owner_id <> v_uid THEN
    RAISE EXCEPTION 'Not authorized to delete this group';
  END IF;

  SELECT COUNT(*)
  INTO v_pending_transfer_count
  FROM public.leadership_transfer_requests ltr
  WHERE ltr.group_id = p_group_id
    AND ltr.status = 'pending';

  IF v_pending_transfer_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'PENDING_LEADERSHIP_TRANSFER_EXISTS',
      'pending_transfer_count', v_pending_transfer_count,
      'message', 'Delete blocked. Cancel pending leadership transfer request(s) first.'
    );
  END IF;

  SELECT COUNT(*)
  INTO v_pending_count
  FROM public.gig_applications ga
  WHERE ga.group_id = p_group_id
    AND ga.status = 'pending';

  SELECT COUNT(*)
  INTO v_accepted_count
  FROM public.gig_applications ga
  WHERE ga.group_id = p_group_id
    AND ga.status = 'accepted';

  IF v_accepted_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ACTIVE_ACCEPTED_APPLICATIONS_EXIST',
      'accepted_application_count', v_accepted_count,
      'pending_application_count', v_pending_count,
      'message', 'Delete blocked. Resolve accepted gig applications first.'
    );
  END IF;

  IF v_pending_count > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, message, meta)
    SELECT
      ga.applicant_id,
      'warning',
      'Group Removed',
      COALESCE(v_group.name, 'A group') || ' was removed by the owner. Your pending gig application has been closed.',
      jsonb_build_object(
        'group_id', p_group_id,
        'event', 'group_deleted',
        'reason', p_reason,
        'previous_status', ga.status,
        'gig_id', ga.gig_id
      )
    FROM public.gig_applications ga
    WHERE ga.group_id = p_group_id
      AND ga.status = 'pending';
  END IF;

  v_related_counts := jsonb_build_object(
    'group_members', (SELECT COUNT(*) FROM public.group_members WHERE group_id = p_group_id),
    'reviews', (SELECT COUNT(*) FROM public.reviews WHERE group_id = p_group_id),
    'favorites', (SELECT COUNT(*) FROM public.favorites WHERE group_id = p_group_id),
    'leadership_transfer_requests_total', (SELECT COUNT(*) FROM public.leadership_transfer_requests WHERE group_id = p_group_id)
  );

  v_application_counts := jsonb_build_object(
    'pending', v_pending_count,
    'accepted', v_accepted_count,
    'rejected', (SELECT COUNT(*) FROM public.gig_applications WHERE group_id = p_group_id AND status = 'rejected')
  );

  INSERT INTO public.group_deletion_audit (
    group_id,
    owner_id,
    deleted_by,
    group_snapshot,
    related_counts,
    application_counts,
    reason
  )
  VALUES (
    p_group_id,
    v_group.owner_id,
    v_uid,
    to_jsonb(v_group),
    v_related_counts,
    v_application_counts,
    p_reason
  );

  DELETE FROM public.groups
  WHERE id = p_group_id
    AND owner_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to delete group';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'group_id', p_group_id,
    'related_counts', v_related_counts,
    'application_counts', v_application_counts
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.delete_studio_safely(p_studio_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
DECLARE
  v_uid UUID;
  v_studio RECORD;
  v_active_bookings_count INTEGER := 0;
  v_pending_relocation_count INTEGER := 0;
  v_storage_objects_to_delete INTEGER := 0;
  v_storage_deleted_count INTEGER := 0;
  v_related_counts JSONB;
  v_storage_cleanup JSONB;
  v_storage_urls TEXT[] := ARRAY[]::TEXT[];
  v_storage_pairs JSONB := '[]'::JSONB;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_studio
  FROM public.studios s
  WHERE s.id = p_studio_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'STUDIO_NOT_FOUND',
      'message', 'Studio not found.'
    );
  END IF;

  IF v_studio.owner_id <> v_uid THEN
    RAISE EXCEPTION 'Not authorized to delete this studio';
  END IF;

  SELECT COUNT(*)
  INTO v_active_bookings_count
  FROM public.studio_bookings sb
  WHERE sb.studio_id = p_studio_id
    AND sb.status IN ('pending', 'confirmed', 'checked_in', 'pending_relocation');

  SELECT COUNT(*)
  INTO v_pending_relocation_count
  FROM public.studio_bookings sb
  WHERE sb.studio_id = p_studio_id
    AND sb.status = 'pending_relocation';

  IF v_active_bookings_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ACTIVE_BOOKINGS_EXIST',
      'active_booking_count', v_active_bookings_count,
      'pending_relocation_count', v_pending_relocation_count,
      'message', 'Delete blocked. Resolve active bookings first (including relocation workflows) to preserve notifications/refund handling.'
    );
  END IF;

  v_related_counts := jsonb_build_object(
    'studio_settings', (SELECT COUNT(*) FROM public.studio_settings WHERE studio_id = p_studio_id),
    'studio_operating_hours', (SELECT COUNT(*) FROM public.studio_operating_hours WHERE studio_id = p_studio_id),
    'studio_date_overrides', (SELECT COUNT(*) FROM public.studio_date_overrides WHERE studio_id = p_studio_id),
    'studio_bookings_total', (SELECT COUNT(*) FROM public.studio_bookings WHERE studio_id = p_studio_id),
    'reviews', (SELECT COUNT(*) FROM public.reviews WHERE studio_id = p_studio_id),
    'favorites', (SELECT COUNT(*) FROM public.favorites WHERE studio_id = p_studio_id)
  );

  v_storage_urls := v_storage_urls || ARRAY(
    SELECT sm.media_url
    FROM public.studio_media sm
    WHERE sm.studio_id = p_studio_id
      AND sm.media_type = 'image'
    ORDER BY sm.sort_order, sm.created_at
  );

  IF v_studio.contract_url IS NOT NULL AND btrim(v_studio.contract_url) <> '' THEN
    v_storage_urls := v_storage_urls || v_studio.contract_url;
  END IF;

  IF v_studio.business_permit_url IS NOT NULL AND btrim(v_studio.business_permit_url) <> '' THEN
    v_storage_urls := v_storage_urls || v_studio.business_permit_url;
  END IF;

  WITH parsed AS (
    SELECT
      (m)[1] AS bucket_id,
      split_part((m)[2], '?', 1) AS object_path
    FROM (
      SELECT regexp_matches(
        u.url,
        '/storage/v1/object/(?:public|sign)/([^/]+)/(.+)$'
      ) AS m
      FROM unnest(v_storage_urls) AS u(url)
      WHERE u.url IS NOT NULL
    ) t
    WHERE m IS NOT NULL
  ), dedup AS (
    SELECT DISTINCT bucket_id, object_path
    FROM parsed
    WHERE object_path <> ''
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object('bucket_id', bucket_id, 'object_path', object_path)), '[]'::jsonb),
    COUNT(*)
  INTO v_storage_pairs, v_storage_objects_to_delete
  FROM dedup;

  v_storage_cleanup := jsonb_build_object(
    'candidate_urls', COALESCE(array_length(v_storage_urls, 1), 0),
    'parsed_objects', v_storage_objects_to_delete,
    'deleted_objects', v_storage_deleted_count,
    'delete_mode', 'skipped_direct_table_delete'
  );

  INSERT INTO public.studio_deletion_audit (
    studio_id,
    owner_id,
    deleted_by,
    studio_snapshot,
    related_counts,
    storage_cleanup,
    reason
  )
  VALUES (
    p_studio_id,
    v_studio.owner_id,
    v_uid,
    to_jsonb(v_studio),
    v_related_counts,
    v_storage_cleanup,
    p_reason
  );

  DELETE FROM public.studios
  WHERE id = p_studio_id
    AND owner_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to delete studio';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'studio_id', p_studio_id,
    'active_booking_count', 0,
    'related_counts', v_related_counts,
    'storage_cleanup', v_storage_cleanup
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.dismiss_reports_for_deleted_target()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target_types text[];
  v_entity_label text;
  v_set_clauses text[] := ARRAY['status = ''dismissed'''];
  v_sql text;
  v_note text;
  v_has_column boolean;
BEGIN
  IF to_regclass('public.reports') IS NULL THEN
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'groups' THEN
    v_target_types := ARRAY['group'];
    v_entity_label := 'group';
  ELSIF TG_TABLE_NAME = 'gigs' THEN
    v_target_types := ARRAY['gig'];
    v_entity_label := 'gig';
  ELSIF TG_TABLE_NAME = 'studios' THEN
    v_target_types := ARRAY['studio', 'venue'];
    v_entity_label := 'studio';
  ELSIF TG_TABLE_NAME = 'products' THEN
    v_target_types := ARRAY['product'];
    v_entity_label := 'marketplace item';
  ELSIF TG_TABLE_NAME = 'producer_projects' THEN
    v_target_types := ARRAY['project', 'producer project', 'producer_project'];
    v_entity_label := 'producer project';
  ELSIF TG_TABLE_NAME = 'playlists' THEN
    v_target_types := ARRAY['playlist', 'music'];
    v_entity_label := 'playlist';
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    v_target_types := ARRAY['profile', 'user', 'artist'];
    v_entity_label := 'profile';
  ELSE
    RETURN OLD;
  END IF;

  v_note := format(
    'Auto-dismissed because %s %s was deleted.',
    v_entity_label,
    OLD.id::text
  );

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'reviewed_by'
  ) INTO v_has_column;

  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'reviewed_by = NULL'::text);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'reviewed_at'
  ) INTO v_has_column;

  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'reviewed_at = timezone(''utc'', now())'::text);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'moderation_action'
  ) INTO v_has_column;

  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'moderation_action = ''none'''::text);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'moderation_notes'
  ) INTO v_has_column;

  IF v_has_column THEN
    v_set_clauses := array_append(
      v_set_clauses,
      'moderation_notes = CASE WHEN moderation_notes IS NULL OR btrim(moderation_notes) = '''' THEN $3 ELSE moderation_notes || E''\n'' || $3 END'::text
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'escalation_status'
  ) INTO v_has_column;

  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'escalation_status = ''none'''::text);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'escalated_at'
  ) INTO v_has_column;

  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'escalated_at = NULL'::text);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'escalation_reason'
  ) INTO v_has_column;

  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'escalation_reason = NULL'::text);
  END IF;

  v_sql :=
    'UPDATE public.reports SET ' || array_to_string(v_set_clauses, ', ') ||
    ' WHERE target_id = $1::uuid' ||
    '   AND lower(target_type) = ANY($2::text[])' ||
    '   AND lower(coalesce(status, ''pending'')) = ''pending''';

  EXECUTE v_sql USING OLD.id, v_target_types, v_note;

  RETURN OLD;
END;
$function$


CREATE OR REPLACE FUNCTION public.dispatch_push_notification_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  should_send_push boolean := true;
  notification_route text := coalesce(nullif(trim(coalesce(new.meta ->> 'route', '')), ''), '/notifications');
  notification_params jsonb := case
    when jsonb_typeof(new.meta -> 'route_params') = 'object' then new.meta -> 'route_params'
    else '{}'::jsonb
  end;
  active_device record;
begin
  if new.user_id is null or coalesce(new.read, false) = true then
    return new;
  end if;

  if nullif(trim(coalesce(new.message, '')), '') is null then
    return new;
  end if;

  select coalesce(
    (
      select notification_preferences.push_enabled
      from public.notification_preferences
      where notification_preferences.user_id = new.user_id
    ),
    true
  ) into should_send_push;

  if should_send_push is false then
    return new;
  end if;

  for active_device in
    select distinct on (push_token) push_token
    from public.push_notification_devices
    where user_id = new.user_id
      and is_active = true
      and (
        push_token like 'ExponentPushToken[%]'
        or push_token like 'ExpoPushToken[%]'
      )
  loop
    begin
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := jsonb_build_object(
          'to', active_device.push_token,
          'title', coalesce(nullif(trim(coalesce(new.title, '')), ''), 'Notification'),
          'body', new.message,
          'sound', 'default',
          'channelId', 'musika-lokal-alerts-v2',
          'priority', 'high',
          'data', jsonb_build_object(
            'notificationId', new.id,
            'route', notification_route,
            'params', notification_params,
            'meta', coalesce(new.meta, '{}'::jsonb)
          )
        ),
        params := '{}'::jsonb,
        headers := jsonb_build_object(
          'Accept', 'application/json',
          'Content-Type', 'application/json'
        ),
        timeout_milliseconds := 1000
      );
    exception
      when others then
        raise notice 'Push dispatch skipped for notification %: %', new.id, sqlerrm;
    end;
  end loop;

  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.drain_legacy_3nf(p_batch_size integer DEFAULT 1000)
 RETURNS TABLE(entity text, drained integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 'profiles'::text AS entity, 0::integer AS drained
  UNION ALL SELECT 'gigs'::text, 0::integer
  UNION ALL SELECT 'studios'::text, 0::integer
$function$


CREATE OR REPLACE FUNCTION public.enforce_single_permit_resubmission()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_old_status text;
  v_new_status text;
  v_old_used integer;
  v_new_used integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new_status := lower(coalesce(NEW.permit_status, 'pending_review'));

    IF v_new_status = 'pending' THEN
      v_new_status := 'pending_review';
    END IF;

    IF v_new_status NOT IN ('pending_review', 'approved', 'rejected', 'resubmitted') THEN
      v_new_status := 'pending_review';
    END IF;

    v_new_used := least(greatest(coalesce(NEW.permit_resubmissions_used, 0), 0), 1);

    IF v_new_status = 'resubmitted' THEN
      v_new_used := 1;
    END IF;

    NEW.permit_status := v_new_status;
    NEW.permit_resubmissions_used := v_new_used;
    RETURN NEW;
  END IF;

  v_old_status := lower(coalesce(OLD.permit_status, 'pending_review'));
  v_new_status := lower(coalesce(NEW.permit_status, v_old_status));

  IF v_new_status = 'pending' THEN
    v_new_status := 'pending_review';
  END IF;

  IF v_new_status NOT IN ('pending_review', 'approved', 'rejected', 'resubmitted') THEN
    RAISE EXCEPTION 'Invalid permit status: %', NEW.permit_status
      USING ERRCODE = '23514';
  END IF;

  v_old_used := coalesce(OLD.permit_resubmissions_used, 0);
  v_new_used := coalesce(NEW.permit_resubmissions_used, v_old_used);

  IF v_new_used < v_old_used THEN
    RAISE EXCEPTION 'permit_resubmissions_used cannot be decreased.'
      USING ERRCODE = '23514';
  END IF;

  IF v_new_status = 'resubmitted' AND v_old_status <> 'rejected' THEN
    RAISE EXCEPTION 'Permit can only be resubmitted after a rejection.'
      USING ERRCODE = '23514';
  END IF;

  IF v_old_status = 'rejected' AND v_new_status = 'resubmitted' THEN
    IF v_old_used >= 1 THEN
      RAISE EXCEPTION 'Permit resubmission limit reached. Only one resubmission is allowed after decline.'
        USING ERRCODE = '23514';
    END IF;
    v_new_used := 1;
  END IF;

  IF v_new_used > 1 THEN
    RAISE EXCEPTION 'Permit resubmission limit reached. Only one resubmission is allowed after decline.'
      USING ERRCODE = '23514';
  END IF;

  NEW.permit_status := v_new_status;
  NEW.permit_resubmissions_used := v_new_used;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.expire_stale_invites()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.producer_talent_invites
  SET status = 'expired', updated_at = now()
  WHERE status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_ai_recommendations(p_user_id uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, name text, type text, similarity double precision, images text[], rating numeric, review_count integer, location text, genre text, rate numeric, hourly_rate numeric, budget numeric, embedding vector, created_at timestamp with time zone, owner_id uuid, organizer_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_interest_vector vector(384);
  v_has_embeddings boolean;
BEGIN
  -- Get user's interest vector
  SELECT interest_vector INTO v_interest_vector 
  FROM profiles 
  WHERE profiles.id = p_user_id;
  
  -- Check if any items have embeddings
  SELECT EXISTS (
    SELECT 1 FROM groups WHERE groups.embedding IS NOT NULL
    UNION ALL
    SELECT 1 FROM studios WHERE studios.embedding IS NOT NULL
    UNION ALL  
    SELECT 1 FROM gigs WHERE gigs.embedding IS NOT NULL
  ) INTO v_has_embeddings;
  
  -- If no embeddings exist OR no interest vector, return by rating (popularity-based)
  IF NOT v_has_embeddings OR v_interest_vector IS NULL THEN
    RETURN QUERY
    (
      -- Groups sorted by rating
      SELECT 
        g.id,
        g.name,
        'Group'::text as type,
        COALESCE(gs.rating, 0)::float / 5.0 as similarity,
        g.images,
        COALESCE(gs.rating, 0) as rating,
        COALESCE(gs.review_count, 0)::int as review_count,
        g.location,
        g.genre,
        g.rate,
        NULL::numeric as hourly_rate,
        NULL::numeric as budget,
        g.embedding,
        g.created_at,
        g.owner_id,
        NULL::uuid as organizer_id
      FROM groups g
      LEFT JOIN groups_with_stats gs ON g.id = gs.id
    )
    UNION ALL
    (
      -- Studios sorted by rating
      SELECT 
        s.id,
        s.name,
        'Studio'::text as type,
        COALESCE(ss.rating, 0)::float / 5.0 as similarity,
        s.images,
        COALESCE(ss.rating, 0) as rating,
        COALESCE(ss.review_count, 0)::int as review_count,
        s.address as location,
        NULL::text as genre,
        s.rate,
        s.hourly_rate,
        NULL::numeric as budget,
        s.embedding,
        s.created_at,
        s.owner_id,
        NULL::uuid as organizer_id
      FROM studios s
      LEFT JOIN studios_with_stats ss ON s.id = ss.id
    )
    UNION ALL
    (
      -- Open Gigs sorted by rating (genre extracted from requirements)
      SELECT 
        gig.id,
        gig.name,
        'Gig'::text as type,
        COALESCE(gigs.rating, 0)::float / 5.0 as similarity,
        gig.images,
        COALESCE(gigs.rating, 0) as rating,
        COALESCE(gigs.review_count, 0)::int as review_count,
        gig.location,
        gig.requirements->>'genre' as genre,
        gig.rate,
        NULL::numeric as hourly_rate,
        gig.budget,
        gig.embedding,
        gig.created_at,
        NULL::uuid as owner_id,
        gig.organizer_id
      FROM gigs gig
      LEFT JOIN gigs_with_stats gigs ON gig.id = gigs.id
      WHERE gig.status = 'open'
    )
    ORDER BY similarity DESC, rating DESC
    LIMIT p_limit;
    RETURN;
  END IF;
  
  -- Full AI mode: Return items sorted by similarity to user's interest vector
  RETURN QUERY
  (
    -- Groups
    SELECT 
      g.id,
      g.name,
      'Group'::text as type,
      (1 - (g.embedding <=> v_interest_vector))::float as similarity,
      g.images,
      COALESCE(gs.rating, 0) as rating,
      COALESCE(gs.review_count, 0)::int as review_count,
      g.location,
      g.genre,
      g.rate,
      NULL::numeric as hourly_rate,
      NULL::numeric as budget,
      g.embedding,
      g.created_at,
      g.owner_id,
      NULL::uuid as organizer_id
    FROM groups g
    LEFT JOIN groups_with_stats gs ON g.id = gs.id
    WHERE g.embedding IS NOT NULL
  )
  UNION ALL
  (
    -- Studios
    SELECT 
      s.id,
      s.name,
      'Studio'::text as type,
      (1 - (s.embedding <=> v_interest_vector))::float as similarity,
      s.images,
      COALESCE(ss.rating, 0) as rating,
      COALESCE(ss.review_count, 0)::int as review_count,
      s.address as location,
      NULL::text as genre,
      s.rate,
      s.hourly_rate,
      NULL::numeric as budget,
      s.embedding,
      s.created_at,
      s.owner_id,
      NULL::uuid as organizer_id
    FROM studios s
    LEFT JOIN studios_with_stats ss ON s.id = ss.id
    WHERE s.embedding IS NOT NULL
  )
  UNION ALL
  (
    -- Gigs
    SELECT 
      gig.id,
      gig.name,
      'Gig'::text as type,
      (1 - (gig.embedding <=> v_interest_vector))::float as similarity,
      gig.images,
      COALESCE(gigs.rating, 0) as rating,
      COALESCE(gigs.review_count, 0)::int as review_count,
      gig.location,
      gig.requirements->>'genre' as genre,
      gig.rate,
      NULL::numeric as hourly_rate,
      gig.budget,
      gig.embedding,
      gig.created_at,
      NULL::uuid as owner_id,
      gig.organizer_id
    FROM gigs gig
    LEFT JOIN gigs_with_stats gigs ON gig.id = gigs.id
    WHERE gig.embedding IS NOT NULL
    AND gig.status = 'open'
  )
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$function$


CREATE OR REPLACE FUNCTION public.get_entity_rating(entity_type text, entity_id uuid)
 RETURNS TABLE(rating numeric, review_count bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF entity_type = 'profile' THEN
    RETURN QUERY SELECT COALESCE(AVG(r.rating), 0)::NUMERIC, COUNT(r.id) 
      FROM reviews r WHERE r.user_id = entity_id;
  ELSIF entity_type = 'group' THEN
    RETURN QUERY SELECT COALESCE(AVG(r.rating), 0)::NUMERIC, COUNT(r.id) 
      FROM reviews r WHERE r.group_id = entity_id;
  ELSIF entity_type = 'studio' THEN
    RETURN QUERY SELECT COALESCE(AVG(r.rating), 0)::NUMERIC, COUNT(r.id) 
      FROM reviews r WHERE r.studio_id = entity_id;
  ELSIF entity_type = 'gig' THEN
    RETURN QUERY SELECT COALESCE(AVG(r.rating), 0)::NUMERIC, COUNT(r.id) 
      FROM reviews r WHERE r.gig_id = entity_id;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.gig_has_available_slots(p_gig_id uuid, p_slot_type text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
declare
    v_requirements jsonb;
    v_total_needed integer;
    v_total_filled integer;
    v_type_needed integer;
    v_type_filled integer;
begin
    select requirements, coalesce(total_slots_filled, 0)
    into v_requirements, v_total_filled
    from public.gigs
    where id = p_gig_id;

    v_total_needed := coalesce((v_requirements->'total_slots_needed')::int, 999);
    if v_total_filled >= v_total_needed then
        return false;
    end if;

    if p_slot_type is not null then
        v_type_needed := coalesce((v_requirements->'slots'->p_slot_type->>'needed')::int, 0);
        select coalesce(s.accepted_count, 0)
        into v_type_filled
        from public.gig_slot_fill_summary s
        where s.gig_id = p_gig_id
          and s.slot_type = p_slot_type;

        if v_type_needed > 0 and coalesce(v_type_filled, 0) >= v_type_needed then
            return false;
        end if;
    end if;

    return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.hold_booking_payout(p_booking_id uuid, p_reason text DEFAULT NULL::text, p_reverse_existing boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tx record;
  v_hold_reverse_exists boolean := false;
BEGIN
  UPDATE public.studio_bookings
  SET
    payout_hold = true,
    payout_hold_reason = COALESCE(p_reason, payout_hold_reason, 'Payout hold requested.'),
    payout_hold_at = COALESCE(payout_hold_at, timezone('utc'::text, now())),
    payout_released_at = NULL,
    updated_at = timezone('utc'::text, now())
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF p_reverse_existing THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.wallet_transactions wt
      WHERE wt.reference_id = p_booking_id
        AND wt.type = 'withdrawal'
        AND wt.description ILIKE 'Payout hold reversal%'
    )
    INTO v_hold_reverse_exists;

    IF NOT v_hold_reverse_exists THEN
      SELECT wt.id, wt.wallet_id, wt.amount
      INTO v_tx
      FROM public.wallet_transactions wt
      WHERE wt.reference_id = p_booking_id
        AND wt.type = 'earning'
        AND wt.status = 'completed'
      ORDER BY wt.created_at DESC
      LIMIT 1;

      IF FOUND THEN
        UPDATE public.wallets
        SET
          balance = GREATEST(0, COALESCE(balance, 0) - COALESCE(v_tx.amount, 0)),
          updated_at = timezone('utc'::text, now())
        WHERE id = v_tx.wallet_id;

        INSERT INTO public.wallet_transactions (
          wallet_id,
          amount,
          type,
          description,
          reference_id,
          is_credit,
          status
        )
        VALUES (
          v_tx.wallet_id,
          COALESCE(v_tx.amount, 0),
          'withdrawal',
          'Payout hold reversal for booking incident workflow',
          p_booking_id,
          false,
          'completed'
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'payout_hold', true
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$function$


CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = user_id AND role = 'admin'
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.is_conversation_admin(conv_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants 
    WHERE conversation_id = conv_id 
      AND user_id = auth.uid() 
      AND role IN ('owner', 'admin')
  );
$function$


CREATE OR REPLACE FUNCTION public.is_conversation_member(conv_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = conv_id
      and cp.user_id = auth.uid()
  );
$function$


CREATE OR REPLACE FUNCTION public.is_slot_available(p_studio_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
AS $function$
  SELECT public.are_slots_available(
    p_studio_id,
    p_booking_date,
    jsonb_build_array(jsonb_build_object('start', p_start_time, 'end', p_end_time)),
    p_user_id,
    NULL::uuid
  );
$function$


CREATE OR REPLACE FUNCTION public.link_verification_session(p_session_ref text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_data JSONB;
BEGIN
    -- Input validation
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID required';
    END IF;

    -- Retrieve the verification data
    SELECT verification_data INTO v_data
    FROM verification_sessions
    WHERE session_ref = p_session_ref;

    IF v_data IS NULL THEN
        RAISE EXCEPTION 'Verification session not found or expired';
    END IF;

    -- Upsert the profile with the verified data and link to the providing user_id
    INSERT INTO profiles (
        id, 
        email, -- We attempt to lookup email, if not found (race condition), it might be null/empty initially
        full_name, 
        role, -- FIXED: Include role to satisfy NOT NULL constraint
        is_verified, 
        verification_status, 
        id_document_expiry, 
        id_verified_at,
        didit_session_id
    )
    VALUES (
        p_user_id,
        (SELECT email FROM auth.users WHERE id = p_user_id),
        v_data->>'full_name',
        COALESCE((SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = p_user_id), 'fan'), -- Fetch role from auth metadata
        TRUE,
        'APPROVED',
        (v_data->>'id_document_expiry')::DATE,
        NOW(),
        p_session_ref
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = CASE WHEN profiles.full_name IS NULL THEN EXCLUDED.full_name ELSE profiles.full_name END,
        is_verified = TRUE,
        verification_status = 'APPROVED',
        id_document_expiry = EXCLUDED.id_document_expiry,
        id_verified_at = EXCLUDED.id_verified_at,
        didit_session_id = EXCLUDED.didit_session_id;

    -- Clean up
    DELETE FROM verification_sessions WHERE session_ref = p_session_ref;

    RETURN jsonb_build_object('success', true);
END;
$function$


CREATE OR REPLACE FUNCTION public.match_listings(query_embedding vector, match_threshold double precision, match_count integer, listing_type text)
 RETURNS TABLE(id uuid, similarity double precision)
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF listing_type = 'Group' THEN
    RETURN QUERY
    SELECT
      groups.id,
      1 - (groups.embedding <=> query_embedding) AS similarity
    FROM groups
    WHERE 1 - (groups.embedding <=> query_embedding) > match_threshold
    ORDER BY groups.embedding <=> query_embedding
    LIMIT match_count;
  ELSIF listing_type = 'Studio' THEN
    RETURN QUERY
    SELECT
      studios.id,
      1 - (studios.embedding <=> query_embedding) AS similarity
    FROM studios
    WHERE 1 - (studios.embedding <=> query_embedding) > match_threshold
    ORDER BY studios.embedding <=> query_embedding
    LIMIT match_count;
  ELSIF listing_type = 'Gig' THEN
    RETURN QUERY
    SELECT
      gigs.id,
      1 - (gigs.embedding <=> query_embedding) AS similarity
    FROM gigs
    WHERE 1 - (gigs.embedding <=> query_embedding) > match_threshold
    ORDER BY gigs.embedding <=> query_embedding
    LIMIT match_count;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.migration_duplicate_check()
 RETURNS TABLE(domain text, duplicate_groups bigint)
 LANGUAGE sql
AS $function$
  SELECT 'profile_skills'::TEXT, COUNT(*)::BIGINT
  FROM (
    SELECT profile_id, skill FROM profile_skills GROUP BY profile_id, skill HAVING COUNT(*) > 1
  ) d
  UNION ALL
  SELECT 'profile_genres', COUNT(*)::BIGINT
  FROM (
    SELECT profile_id, genre FROM profile_genres GROUP BY profile_id, genre HAVING COUNT(*) > 1
  ) d
  UNION ALL
  SELECT 'profile_portfolio_urls', COUNT(*)::BIGINT
  FROM (
    SELECT profile_id, portfolio_url FROM profile_portfolio_urls GROUP BY profile_id, portfolio_url HAVING COUNT(*) > 1
  ) d
  UNION ALL
  SELECT 'gig_media', COUNT(*)::BIGINT
  FROM (
    SELECT gig_id, media_type, media_url FROM gig_media GROUP BY gig_id, media_type, media_url HAVING COUNT(*) > 1
  ) d
  UNION ALL
  SELECT 'studio_amenities', COUNT(*)::BIGINT
  FROM (
    SELECT studio_id, amenity FROM studio_amenities GROUP BY studio_id, amenity HAVING COUNT(*) > 1
  ) d
$function$


CREATE OR REPLACE FUNCTION public.migration_row_count_parity()
 RETURNS TABLE(domain text, legacy_count bigint, normalized_count bigint)
 LANGUAGE sql
AS $function$
  SELECT 'profiles.skills'::TEXT,
         COALESCE((SELECT SUM(COALESCE(array_length(skills, 1), 0)) FROM profiles), 0)::BIGINT,
         (SELECT COUNT(*) FROM profile_skills)::BIGINT
  UNION ALL
  SELECT 'profiles.genres',
         COALESCE((SELECT SUM(COALESCE(array_length(genres, 1), 0)) FROM profiles), 0)::BIGINT,
         (SELECT COUNT(*) FROM profile_genres)::BIGINT
  UNION ALL
  SELECT 'profiles.portfolio_urls',
         COALESCE((SELECT SUM(COALESCE(array_length(portfolio_urls, 1), 0)) FROM profiles), 0)::BIGINT,
         (SELECT COUNT(*) FROM profile_portfolio_urls)::BIGINT
  UNION ALL
  SELECT 'gigs.images',
         COALESCE((SELECT SUM(COALESCE(array_length(images, 1), 0)) FROM gigs), 0)::BIGINT,
         (SELECT COUNT(*) FROM gig_media WHERE media_type = 'image')::BIGINT
  UNION ALL
  SELECT 'gigs.documents',
         COALESCE((SELECT SUM(COALESCE(array_length(documents, 1), 0)) FROM gigs), 0)::BIGINT,
         (SELECT COUNT(*) FROM gig_media WHERE media_type = 'document')::BIGINT
  UNION ALL
  SELECT 'studios.amenities',
         COALESCE((SELECT SUM(COALESCE(array_length(amenities, 1), 0)) FROM studios), 0)::BIGINT,
         (SELECT COUNT(*) FROM studio_amenities)::BIGINT
  UNION ALL
  SELECT 'studios.images',
         COALESCE((SELECT SUM(COALESCE(array_length(images, 1), 0)) FROM studios), 0)::BIGINT,
         (SELECT COUNT(*) FROM studio_media WHERE media_type = 'image')::BIGINT
$function$


CREATE OR REPLACE FUNCTION public.normalize_report_target_type(raw_target_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE lower(btrim(coalesce(raw_target_type, '')))
    WHEN 'venue' THEN 'studio'
    WHEN 'artist' THEN 'profile'
    WHEN 'user' THEN 'profile'
    WHEN 'producer project' THEN 'project'
    WHEN 'producer_project' THEN 'project'
    WHEN 'music' THEN 'playlist'
    ELSE lower(btrim(coalesce(raw_target_type, '')))
  END;
$function$


CREATE OR REPLACE FUNCTION public.notify_booking_attendance_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking record;
  v_recipient uuid;
  v_title text;
  v_message text;
  v_image text;
BEGIN
  SELECT
    sb.id,
    sb.user_id,
    sb.studio_id,
    sb.booking_date,
    sb.start_time,
    s.owner_id,
    s.name AS studio_name,
    (
      SELECT sm.media_url
      FROM public.studio_media sm
      WHERE sm.studio_id = sb.studio_id
        AND sm.media_type = 'image'
      ORDER BY sm.sort_order NULLS LAST, sm.created_at ASC
      LIMIT 1
    ) AS studio_image
  INTO v_booking
  FROM public.studio_bookings sb
  JOIN public.studios s ON s.id = sb.studio_id
  WHERE sb.id = NEW.booking_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_image := v_booking.studio_image;

  CASE NEW.event_type
    WHEN 'booking_started' THEN
      v_title := 'Booking Started';
      v_message := format('Booking at %s has started.', COALESCE(v_booking.studio_name, 'the studio'));
    WHEN 'checked_in' THEN
      v_title := 'Check-in Confirmed';
      v_message := format('Check-in was confirmed for booking at %s on %s.', COALESCE(v_booking.studio_name, 'the studio'), v_booking.booking_date);
    WHEN 'late' THEN
      v_title := 'Late Arrival Alert';
      v_message := format('A participant reported they will be late for booking at %s on %s (%s).', COALESCE(v_booking.studio_name, 'the studio'), v_booking.booking_date, v_booking.start_time);
    WHEN 'not_attending' THEN
      v_title := 'Attendance Alert';
      v_message := format('A participant reported they cannot attend booking at %s on %s (%s).', COALESCE(v_booking.studio_name, 'the studio'), v_booking.booking_date, v_booking.start_time);
    WHEN 'no_show' THEN
      v_title := 'No-show Alert';
      v_message := format('A participant was marked as no-show for booking at %s on %s (%s).', COALESCE(v_booking.studio_name, 'the studio'), v_booking.booking_date, v_booking.start_time);
    ELSE
      RETURN NEW;
  END CASE;

  FOREACH v_recipient IN ARRAY ARRAY[v_booking.user_id, v_booking.owner_id]
  LOOP
    IF v_recipient IS NULL THEN
      CONTINUE;
    END IF;

    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM public.notifications n
        WHERE n.user_id = v_recipient
          AND n.meta->>'booking_id' = NEW.booking_id::text
          AND n.meta->>'event_type' = NEW.event_type
          AND n.created_at > now() - interval '12 hours'
      ) THEN
        INSERT INTO public.notifications (
          user_id,
          type,
          title,
          message,
          image,
          meta,
          read
        )
        VALUES (
          v_recipient,
          CASE WHEN NEW.event_type IN ('late', 'not_attending', 'no_show') THEN 'warning' ELSE 'info' END,
          v_title,
          v_message,
          v_image,
          jsonb_build_object(
            'booking_id', NEW.booking_id,
            'studio_id', v_booking.studio_id,
            'booking_date', v_booking.booking_date,
            'event_type', NEW.event_type,
            'reported_by_user_id', NEW.reporter_user_id
          ),
          false
        );
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'notify_booking_attendance_event failed to insert notification: %', SQLERRM;
    END;
  END LOOP;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.prevent_withdrawal_snapshot_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.payout_type IS DISTINCT FROM OLD.payout_type
     OR NEW.payout_account_name IS DISTINCT FROM OLD.payout_account_name
     OR NEW.payout_account_number IS DISTINCT FROM OLD.payout_account_number
     OR NEW.payout_bank_name IS DISTINCT FROM OLD.payout_bank_name THEN
    RAISE EXCEPTION 'Withdrawal payout snapshot fields are immutable after insert';
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.process_booking_auto_complete()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date;
  v_now_time time;
  v_count integer := 0;
BEGIN
  v_today := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_now_time := (now() AT TIME ZONE 'Asia/Manila')::time;

  UPDATE public.studio_bookings sb
  SET
    status = 'completed',
    updated_at = now()
  WHERE sb.status IN ('confirmed', 'checked_in')
    AND (
      sb.booking_date < v_today
      OR (
        sb.booking_date = v_today
        AND v_now_time >= sb.end_time
      )
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.process_release_eligible_booking_payouts();

  RETURN v_count;
END;
$function$


CREATE OR REPLACE FUNCTION public.process_booking_auto_start()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_today date;
  v_now_time time;
  v_count integer := 0;
BEGIN
  v_today := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_now_time := (now() AT TIME ZONE 'Asia/Manila')::time;

  WITH updated AS (
    UPDATE public.studio_bookings sb
    SET
      status = 'checked_in',
      check_in_time = COALESCE(check_in_time, now()),
      updated_at = now()
    WHERE sb.status = 'confirmed'
      AND sb.booking_date = v_today
      AND v_now_time >= sb.start_time
      AND v_now_time < sb.end_time
    RETURNING sb.id
  )
  INSERT INTO public.booking_attendance_events (
    booking_id,
    reporter_user_id,
    event_type,
    notes
  )
  SELECT
    u.id,
    NULL,
    'booking_started',
    'Auto-started when booking window began.'
  FROM updated u
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$


CREATE OR REPLACE FUNCTION public.process_expired_pending_relocations()
 RETURNS TABLE(cancelled_count integer, penalties_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec RECORD;
  v_cancelled_count INTEGER := 0;
  v_penalties_count INTEGER := 0;
BEGIN
  FOR rec IN
    SELECT
      sb.id,
      sb.user_id,
      sb.studio_id,
      sb.booking_date,
      sb.start_time,
      sb.end_time,
      sb.relocation_proposed_date,
      sb.relocation_proposed_start_time,
      sb.relocation_proposed_end_time,
      s.owner_id,
      s.name AS studio_name
    FROM public.studio_bookings sb
    JOIN public.studios s ON s.id = sb.studio_id
    WHERE sb.status = 'pending_relocation'
      AND sb.relocation_expires_at IS NOT NULL
      AND sb.relocation_expires_at <= timezone('utc'::TEXT, now())
  LOOP
    UPDATE public.studio_bookings
    SET
      status = 'cancelled',
      payment_status = CASE
        WHEN payment_status IN ('paid', 'partial') THEN 'refund_pending'
        ELSE payment_status
      END,
      cancellation_reason = COALESCE(cancellation_reason, '') ||
        CASE
          WHEN cancellation_reason IS NULL OR cancellation_reason = '' THEN ''
          ELSE ' '
        END ||
        'Relocation request expired without musician acceptance. Auto-cancelled with refund processing.',
      relocation_requested_at = NULL,
      relocation_expires_at = NULL,
      relocation_proposed_date = NULL,
      relocation_proposed_start_time = NULL,
      relocation_proposed_end_time = NULL,
      updated_at = timezone('utc'::TEXT, now())
    WHERE id = rec.id;

    v_cancelled_count := v_cancelled_count + 1;

    INSERT INTO public.notifications (user_id, type, title, message, meta)
    VALUES (
      rec.user_id,
      'warning',
      'Relocation Request Expired',
      'Your booking at ' || COALESCE(rec.studio_name, 'the studio') ||
      ' was cancelled because the relocation request expired. Refund processing has started.',
      jsonb_build_object(
        'bookingId', rec.id,
        'studioId', rec.studio_id,
        'trigger', 'relocation_expired_auto_cancel'
      )
    );

    INSERT INTO public.notifications (user_id, type, title, message, meta)
    VALUES (
      rec.owner_id,
      'warning',
      'Owner Penalty Applied',
      'A relocation request for booking ' || rec.id || ' expired and was auto-cancelled. A penalty has been recorded.',
      jsonb_build_object(
        'bookingId', rec.id,
        'studioId', rec.studio_id,
        'penaltyType', 'forced_relocation_expired'
      )
    );

    INSERT INTO public.studio_owner_penalties (
      owner_id,
      studio_id,
      booking_id,
      penalty_type,
      penalty_points,
      reason
    )
    VALUES (
      rec.owner_id,
      rec.studio_id,
      rec.id,
      'forced_relocation_expired',
      1,
      'Relocation request expired without acceptance; booking was auto-cancelled and refunded.'
    )
    ON CONFLICT (booking_id, penalty_type) DO NOTHING;

    IF FOUND THEN
      v_penalties_count := v_penalties_count + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_cancelled_count, v_penalties_count;
END;
$function$


CREATE OR REPLACE FUNCTION public.process_overdue_booking_incidents()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
  v_count integer := 0;
BEGIN
  FOR rec IN
    SELECT bi.id, bi.booking_id, bi.reporter_user_id, bi.counterparty_user_id
    FROM public.booking_incidents bi
    WHERE bi.status IN ('open', 'responded')
      AND bi.response_deadline_at <= timezone('utc'::text, now())
  LOOP
    UPDATE public.booking_incidents
    SET
      status = 'manual_review',
      resolution = COALESCE(resolution, 'Response deadline missed. Escalated for manual review.'),
      updated_at = timezone('utc'::text, now())
    WHERE id = rec.id;

    PERFORM public.hold_booking_payout(
      rec.booking_id,
      'Escalated to manual review after incident response deadline.',
      true
    );

    INSERT INTO public.notifications (user_id, type, title, message, meta)
    VALUES
      (
        rec.reporter_user_id,
        'warning',
        'Incident Escalated',
        'Your booking incident has been escalated for manual review.',
        jsonb_build_object('incident_id', rec.id, 'booking_id', rec.booking_id, 'event_type', 'incident_escalated_manual_review')
      ),
      (
        rec.counterparty_user_id,
        'warning',
        'Incident Escalated',
        'A booking incident has been escalated for manual review.',
        jsonb_build_object('incident_id', rec.id, 'booking_id', rec.booking_id, 'event_type', 'incident_escalated_manual_review')
      );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$


CREATE OR REPLACE FUNCTION public.process_release_eligible_booking_payouts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
  v_count integer := 0;
BEGIN
  FOR rec IN
    SELECT sb.id
    FROM public.studio_bookings sb
    WHERE sb.status = 'completed'
      AND sb.payment_status IN ('paid', 'partial')
      AND sb.payout_hold = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.booking_incidents bi
        WHERE bi.booking_id = sb.id
          AND bi.status IN ('open', 'responded', 'manual_review')
      )
  LOOP
    PERFORM public.release_booking_payout(rec.id, 'Auto-release after completed booking without active incidents.');
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$


CREATE OR REPLACE FUNCTION public.process_withdrawal_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- When withdrawal is completed, the balance was already deducted at request time
  -- This function handles status changes
  IF NEW.status = 'failed' OR NEW.status = 'cancelled' THEN
    -- Refund the amount back to wallet
    UPDATE wallets 
    SET balance = balance + NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.wallet_id;
    
    -- Create refund transaction
    INSERT INTO wallet_transactions (wallet_id, amount, type, description, reference_id, is_credit, status)
    VALUES (NEW.wallet_id, NEW.amount, 'refund', 
            CASE 
              WHEN NEW.status = 'failed' THEN 'Withdrawal failed - ' || COALESCE(NEW.failure_reason, 'Unknown error')
              ELSE 'Withdrawal cancelled'
            END,
            NEW.id, TRUE, 'completed');
  END IF;
  
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.record_booking_attendance(p_booking_id uuid, p_event_type text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_booking record;
  v_inserted_count integer := 0;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_event_type NOT IN ('checked_in', 'late', 'not_attending', 'no_show') THEN
    RAISE EXCEPTION 'Unsupported attendance event type: %', p_event_type;
  END IF;

  SELECT sb.id, sb.user_id, sb.studio_id, sb.booking_date, sb.start_time, sb.status, s.owner_id
  INTO v_booking
  FROM public.studio_bookings sb
  JOIN public.studios s ON s.id = sb.studio_id
  WHERE sb.id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_uid <> v_booking.user_id AND v_uid <> v_booking.owner_id THEN
    RAISE EXCEPTION 'Not authorized for this booking';
  END IF;

  IF p_event_type = 'checked_in' THEN
    UPDATE public.studio_bookings
    SET
      status = 'checked_in',
      check_in_time = COALESCE(check_in_time, now()),
      updated_at = now()
    WHERE id = p_booking_id
      AND status IN ('confirmed', 'checked_in');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cannot check in. Booking must be confirmed.';
    END IF;
  END IF;

  INSERT INTO public.booking_attendance_events (
    booking_id,
    reporter_user_id,
    event_type,
    notes
  )
  VALUES (
    p_booking_id,
    v_uid,
    p_event_type,
    p_notes
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'event_type', p_event_type,
    'inserted', (v_inserted_count > 0)
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.register_push_device(p_installation_id text, p_push_token text, p_platform text DEFAULT NULL::text, p_device_name text DEFAULT NULL::text, p_app_version text DEFAULT NULL::text, p_project_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  requesting_user_id uuid := auth.uid();
  normalized_installation_id text := nullif(trim(coalesce(p_installation_id, '')), '');
  normalized_push_token text := nullif(trim(coalesce(p_push_token, '')), '');
  normalized_platform text := lower(nullif(trim(coalesce(p_platform, '')), ''));
  registered_device_id uuid;
begin
  if requesting_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if normalized_installation_id is null then
    raise exception 'installation_id is required'
      using errcode = '22023';
  end if;

  if normalized_push_token is null then
    raise exception 'push_token is required'
      using errcode = '22023';
  end if;

  if normalized_platform is not null and normalized_platform not in ('android', 'ios') then
    normalized_platform := null;
  end if;

  update public.push_notification_devices
  set is_active = false,
      disabled_at = timezone('utc', now()),
      disabled_reason = 'superseded_token',
      updated_at = timezone('utc', now())
  where push_token = normalized_push_token
    and installation_id <> normalized_installation_id
    and is_active = true;

  insert into public.push_notification_devices (
    user_id,
    installation_id,
    push_token,
    token_type,
    platform,
    device_name,
    app_version,
    project_id,
    is_active,
    last_seen_at,
    updated_at,
    disabled_at,
    disabled_reason
  )
  values (
    requesting_user_id,
    normalized_installation_id,
    normalized_push_token,
    'expo',
    normalized_platform,
    nullif(trim(coalesce(p_device_name, '')), ''),
    nullif(trim(coalesce(p_app_version, '')), ''),
    nullif(trim(coalesce(p_project_id, '')), ''),
    true,
    timezone('utc', now()),
    timezone('utc', now()),
    null,
    null
  )
  on conflict (installation_id) do update
  set user_id = excluded.user_id,
      push_token = excluded.push_token,
      token_type = excluded.token_type,
      platform = excluded.platform,
      device_name = excluded.device_name,
      app_version = excluded.app_version,
      project_id = excluded.project_id,
      is_active = true,
      last_seen_at = timezone('utc', now()),
      updated_at = timezone('utc', now()),
      disabled_at = null,
      disabled_reason = null
  returning id into registered_device_id;

  return registered_device_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.release_booking_payout(p_booking_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking record;
  v_wallet record;
  v_amount numeric := 0;
  v_existing_earning boolean := false;
BEGIN
  SELECT
    sb.id,
    sb.status,
    sb.payment_status,
    sb.payment_amount,
    sb.final_price,
    sb.payout_hold,
    sb.studio_id,
    s.owner_id
  INTO v_booking
  FROM public.studio_bookings sb
  JOIN public.studios s ON s.id = sb.studio_id
  WHERE sb.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.booking_incidents bi
    WHERE bi.booking_id = p_booking_id
      AND bi.status IN ('open', 'responded', 'manual_review')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'booking_id', p_booking_id,
      'blocked', true,
      'reason', 'Active incident exists'
    );
  END IF;

  IF v_booking.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', false,
      'booking_id', p_booking_id,
      'blocked', true,
      'reason', 'Booking is cancelled'
    );
  END IF;

  IF v_booking.payment_status NOT IN ('paid', 'partial') THEN
    UPDATE public.studio_bookings
    SET
      payout_hold = false,
      payout_hold_reason = NULL,
      payout_released_at = timezone('utc'::text, now()),
      updated_at = timezone('utc'::text, now())
    WHERE id = p_booking_id;

    RETURN jsonb_build_object(
      'success', true,
      'booking_id', p_booking_id,
      'credited', false,
      'reason', 'Payment not settled'
    );
  END IF;

  v_amount := COALESCE(v_booking.payment_amount, v_booking.final_price, 0);

  SELECT EXISTS (
    SELECT 1
    FROM public.wallet_transactions wt
    WHERE wt.reference_id = p_booking_id
      AND wt.type = 'earning'
      AND wt.status = 'completed'
  )
  INTO v_existing_earning;

  IF NOT v_existing_earning AND v_amount > 0 THEN
    SELECT id, balance
    INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_booking.owner_id
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO public.wallets (user_id, balance)
      VALUES (v_booking.owner_id, 0)
      RETURNING id, balance INTO v_wallet;
    END IF;

    UPDATE public.wallets
    SET
      balance = COALESCE(balance, 0) + v_amount,
      updated_at = timezone('utc'::text, now())
    WHERE id = v_wallet.id;

    INSERT INTO public.wallet_transactions (
      wallet_id,
      amount,
      type,
      description,
      reference_id,
      is_credit,
      status
    )
    VALUES (
      v_wallet.id,
      v_amount,
      'earning',
      COALESCE(p_reason, 'Booking payout released after completion and no active incidents.'),
      p_booking_id,
      true,
      'completed'
    );
  END IF;

  UPDATE public.studio_bookings
  SET
    payout_hold = false,
    payout_hold_reason = NULL,
    payout_released_at = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'credited', NOT v_existing_earning,
    'amount', v_amount
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.send_verification_email(p_email text, p_name text, p_subject text, p_html text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Just log for now - actual email sending is handled by Edge Function
    RAISE NOTICE 'Email requested for % with subject: %', p_email, p_subject;
    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error in send_verification_email: %', SQLERRM;
    RETURN FALSE;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_conversation_mute(p_conversation_id uuid, p_muted boolean, p_muted_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(conversation_id uuid, user_id uuid, is_muted boolean, muted_until timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_conversation_id is null then
    raise exception 'conversation_id is required' using errcode = '22023';
  end if;

  return query
  update public.conversation_participants cp
  set
    is_muted = coalesce(p_muted, false),
    muted_until = case
      when coalesce(p_muted, false) then p_muted_until
      else null
    end
  where cp.conversation_id = p_conversation_id
    and cp.user_id = v_user_id
  returning cp.conversation_id, cp.user_id, cp.is_muted, cp.muted_until;

  if not found then
    raise exception 'Conversation participant not found' using errcode = 'P0002';
  end if;
end;
$function$


CREATE OR REPLACE FUNCTION public.set_gig_applications_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_manual_identity_reviews_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.set_notification_preferences_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_updated_at_booking_incidents()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.set_updated_at_studio_promotions()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.sync_didit_profile_after_email_confirmation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.email_confirmed_at is not null
    and (
      tg_op = 'INSERT'
      or old.email_confirmed_at is distinct from new.email_confirmed_at
    )
    and (
      lower(coalesce(new.raw_user_meta_data ->> 'is_verified', 'false')) in ('true', '1', 'yes')
      or upper(coalesce(new.raw_user_meta_data ->> 'verification_status', '')) = 'APPROVED'
    )
  then
    insert into public.profiles (
      id,
      email,
      full_name,
      role,
      is_verified,
      verification_status,
      didit_session_id,
      id_verified_at
    )
    values (
      new.id,
      new.email,
      coalesce(
        nullif(new.raw_user_meta_data ->> 'full_name', ''),
        nullif(new.raw_user_meta_data ->> 'name', ''),
        split_part(new.email, '@', 1)
      ),
      coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'musician'),
      true,
      'APPROVED',
      nullif(
        coalesce(
          new.raw_user_meta_data ->> 'didit_session_id',
          new.raw_user_meta_data ->> 'diditSessionId'
        ),
        ''
      ),
      coalesce(new.email_confirmed_at, now())
    )
    on conflict (id) do update
      set email = excluded.email,
          full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
          role = coalesce(nullif(public.profiles.role, ''), excluded.role),
          is_verified = true,
          verification_status = 'APPROVED',
          didit_session_id = coalesce(public.profiles.didit_session_id, excluded.didit_session_id),
          id_verified_at = coalesce(public.profiles.id_verified_at, excluded.id_verified_at);
  end if;

  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.sync_gig_3nf(p_gig_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM 1
  FROM public.gigs g
  WHERE g.id = p_gig_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gig not found';
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.sync_group_3nf(p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM 1
  FROM public.groups g
  WHERE g.id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.sync_group_conversation_members()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_conversation_id UUID;
BEGIN
    -- Find the group conversation
    SELECT id INTO v_conversation_id
    FROM conversations
    WHERE group_id = COALESCE(NEW.group_id, OLD.group_id) AND is_group = true
    LIMIT 1;
    
    IF v_conversation_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    IF TG_OP = 'INSERT' THEN
        -- Add new member to conversation
        INSERT INTO conversation_participants (conversation_id, user_id, role)
        VALUES (
            v_conversation_id, 
            NEW.user_id, 
            CASE WHEN NEW.role = 'owner' THEN 'owner' ELSE 'member' END
        )
        ON CONFLICT (conversation_id, user_id) DO UPDATE SET role = EXCLUDED.role;
        
    ELSIF TG_OP = 'DELETE' THEN
        -- Remove member from conversation
        DELETE FROM conversation_participants 
        WHERE conversation_id = v_conversation_id AND user_id = OLD.user_id;
        
    ELSIF TG_OP = 'UPDATE' THEN
        -- Update member role
        UPDATE conversation_participants 
        SET role = CASE WHEN NEW.role = 'owner' THEN 'owner' ELSE 'member' END
        WHERE conversation_id = v_conversation_id AND user_id = NEW.user_id;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$function$


CREATE OR REPLACE FUNCTION public.sync_profile_3nf(p_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM 1
  FROM public.profiles p
  WHERE p.id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.sync_studio_3nf(p_studio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM 1
  FROM public.studios s
  WHERE s.id = p_studio_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Studio not found';
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.sync_studio_booking_slots_3nf(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM 1
  FROM public.studio_bookings sb
  WHERE sb.id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Studio booking not found';
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION public.trigger_verification_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_email TEXT;
    v_display_name TEXT;
BEGIN
    -- Only trigger when is_verified changes from false to true
    IF NEW.is_verified = TRUE AND (OLD.is_verified IS NULL OR OLD.is_verified = FALSE) THEN
        -- Use full_name only (first_name and display_name don't exist in profiles table)
        v_display_name := COALESCE(NEW.full_name, 'there');
        
        -- Get email from auth.users
        SELECT email INTO v_user_email 
        FROM auth.users 
        WHERE id = NEW.id;
        
        IF v_user_email IS NOT NULL THEN
            -- Insert into email queue (if table exists)
            BEGIN
                INSERT INTO email_notifications (
                    recipient_email,
                    recipient_name,
                    subject,
                    html_content,
                    template_type,
                    status
                ) VALUES (
                    v_user_email,
                    v_display_name,
                    'âœ… Your Identity Has Been Verified - MusikaLokal',
                    format(
                        '<h1>ðŸŽµ MusikaLokal</h1>
                        <p>Hi %s,</p>
                        <p>Great news! Your identity has been successfully verified. 
                        You now have full access to all MusikaLokal features.</p>
                        <p><a href="musikalokal://login?verified=true">Open MusikaLokal App</a></p>',
                        v_display_name
                    ),
                    'verification_complete',
                    'pending'
                );
                
                RAISE NOTICE 'Verification email queued for %', v_user_email;
            EXCEPTION WHEN undefined_table THEN
                RAISE NOTICE 'email_notifications table does not exist, skipping email queue';
            END;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.unregister_push_device(p_installation_id text, p_reason text DEFAULT 'signed_out'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  requesting_user_id uuid := auth.uid();
  normalized_installation_id text := nullif(trim(coalesce(p_installation_id, '')), '');
  normalized_reason text := coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'disabled');
begin
  if requesting_user_id is null then
    raise exception 'Authentication required'
      using errcode = '42501';
  end if;

  if normalized_installation_id is null then
    return;
  end if;

  update public.push_notification_devices
  set is_active = false,
      disabled_at = timezone('utc', now()),
      disabled_reason = normalized_reason,
      updated_at = timezone('utc', now())
  where installation_id = normalized_installation_id
    and user_id = requesting_user_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.update_application_rejected_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
        NEW.rejected_at := NOW();
    END IF;
    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_gig_safely(p_gig_id uuid, p_payload jsonb, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
DECLARE
  v_uid UUID;
  v_gig RECORD;
  v_updated_gig RECORD;
  v_existing_requirements JSONB;
  v_new_requirements JSONB;
  v_updated_requirements JSONB;
  v_updated_images TEXT[];
  v_updated_documents TEXT[];
  v_existing_event_start TEXT;
  v_existing_event_end TEXT;
  v_new_event_start TEXT;
  v_new_event_end TEXT;
  v_existing_total_slots INTEGER;
  v_new_total_slots INTEGER;
  v_accepted_total INTEGER := 0;
  v_pending_count INTEGER := 0;
  v_accepted_count INTEGER := 0;
  v_accepted_solo INTEGER := 0;
  v_accepted_duo INTEGER := 0;
  v_accepted_band INTEGER := 0;
  v_needed_solo INTEGER;
  v_needed_duo INTEGER;
  v_needed_band INTEGER;
  v_major_change BOOLEAN := false;
  v_old_urls TEXT[] := ARRAY[]::TEXT[];
  v_new_urls TEXT[] := ARRAY[]::TEXT[];
  v_removed_urls TEXT[] := ARRAY[]::TEXT[];
  v_storage_pairs JSONB := '[]'::JSONB;
  v_storage_objects_to_delete INTEGER := 0;
  v_storage_deleted_count INTEGER := 0;
  v_storage_cleanup JSONB;
  v_reconfirm_window_hours INTEGER := 24;
  v_reconfirm_due_at TIMESTAMPTZ;
  v_reconfirmation_required_count INTEGER := 0;
  v_system_rejected_pending_count INTEGER := 0;
  v_reconfirm_expired_count INTEGER := 0;
  v_soft_closed BOOLEAN := false;
  v_soft_closed_rejected_count INTEGER := 0;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT
    g.*,
    COALESCE(glp.requirements, '{}'::jsonb) AS legacy_requirements,
    COALESCE(glp.images, ARRAY[]::text[]) AS legacy_images,
    COALESCE(glp.documents, ARRAY[]::text[]) AS legacy_documents
  INTO v_gig
  FROM public.gigs g
  LEFT JOIN public.gigs_legacy_projection glp ON glp.id = g.id
  WHERE g.id = p_gig_id
  FOR UPDATE OF g;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'GIG_NOT_FOUND',
      'message', 'Gig not found.'
    );
  END IF;

  IF v_gig.organizer_id <> v_uid THEN
    RAISE EXCEPTION 'Not authorized to update this gig';
  END IF;

  IF p_payload ? 'reconfirm_window_hours' THEN
    v_reconfirm_window_hours := GREATEST(1, LEAST(168, COALESCE((p_payload->>'reconfirm_window_hours')::INTEGER, 24)));
  END IF;
  v_reconfirm_due_at := NOW() + make_interval(hours => v_reconfirm_window_hours);

  WITH expired AS (
    UPDATE public.gig_applications
    SET
      status = 'rejected',
      system_status_reason = 'system_reconfirm_timeout'
    WHERE gig_id = p_gig_id
      AND status = 'pending'
      AND reconfirmation_due_at IS NOT NULL
      AND reconfirmation_due_at <= NOW()
    RETURNING applicant_id
  )
  INSERT INTO public.notifications (user_id, type, title, message, meta)
  SELECT
    e.applicant_id,
    'warning',
    'Reconfirmation Window Expired',
    COALESCE(v_gig.name, 'A gig') || ' required reconfirmation after updated terms, and your slot was released when the response window expired.',
    jsonb_build_object(
      'gig_id', p_gig_id,
      'event', 'gig_reconfirm_expired',
      'status_reason', 'system_reconfirm_timeout'
    )
  FROM expired e;

  GET DIAGNOSTICS v_reconfirm_expired_count = ROW_COUNT;

  v_existing_requirements := COALESCE(v_gig.legacy_requirements, '{}'::JSONB);
  v_new_requirements := CASE WHEN p_payload ? 'requirements' THEN COALESCE(p_payload->'requirements', '{}'::JSONB) ELSE v_existing_requirements END;

  v_existing_event_start := v_existing_requirements->>'event_start_time';
  v_existing_event_end := v_existing_requirements->>'event_end_time';
  v_new_event_start := v_new_requirements->>'event_start_time';
  v_new_event_end := v_new_requirements->>'event_end_time';

  v_existing_total_slots := COALESCE((v_existing_requirements->>'total_slots_needed')::INTEGER, 0);
  v_new_total_slots := COALESCE((v_new_requirements->>'total_slots_needed')::INTEGER, 0);

  SELECT
    COUNT(*) FILTER (WHERE status = 'accepted'),
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*) FILTER (WHERE status = 'accepted' AND COALESCE(slot_type, 'solo') = 'solo'),
    COUNT(*) FILTER (WHERE status = 'accepted' AND COALESCE(slot_type, 'solo') = 'duo'),
    COUNT(*) FILTER (WHERE status = 'accepted' AND COALESCE(slot_type, 'solo') = 'band')
  INTO
    v_accepted_total,
    v_pending_count,
    v_accepted_solo,
    v_accepted_duo,
    v_accepted_band
  FROM public.gig_applications
  WHERE gig_id = p_gig_id;

  v_needed_solo := COALESCE((v_new_requirements->'slots'->'solo'->>'needed')::INTEGER, NULL);
  v_needed_duo := COALESCE((v_new_requirements->'slots'->'duo'->>'needed')::INTEGER, NULL);
  v_needed_band := COALESCE((v_new_requirements->'slots'->'band'->>'needed')::INTEGER, NULL);

  IF v_new_total_slots <= 0 THEN
    v_new_total_slots := COALESCE(v_needed_solo, 0) + COALESCE(v_needed_duo, 0) + COALESCE(v_needed_band, 0);
  END IF;

  IF v_new_total_slots > 0 AND v_accepted_total > v_new_total_slots THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'SLOT_CONFLICT_TOTAL',
      'accepted_total', v_accepted_total,
      'new_total_slots_needed', v_new_total_slots,
      'message', 'Update blocked. Accepted applications exceed the new total slot capacity.'
    );
  END IF;

  IF v_needed_solo IS NOT NULL AND v_accepted_solo > v_needed_solo THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'SLOT_CONFLICT_SOLO',
      'accepted_solo', v_accepted_solo,
      'new_solo_slots_needed', v_needed_solo,
      'message', 'Update blocked. Accepted solo applications exceed the new solo slot capacity.'
    );
  END IF;

  IF v_needed_duo IS NOT NULL AND v_accepted_duo > v_needed_duo THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'SLOT_CONFLICT_DUO',
      'accepted_duo', v_accepted_duo,
      'new_duo_slots_needed', v_needed_duo,
      'message', 'Update blocked. Accepted duo applications exceed the new duo slot capacity.'
    );
  END IF;

  IF v_needed_band IS NOT NULL AND v_accepted_band > v_needed_band THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'SLOT_CONFLICT_BAND',
      'accepted_band', v_accepted_band,
      'new_band_slots_needed', v_needed_band,
      'message', 'Update blocked. Accepted band applications exceed the new band slot capacity.'
    );
  END IF;

  v_major_change := (
    (CASE WHEN p_payload ? 'event_date' THEN (p_payload->>'event_date')::timestamptz ELSE v_gig.event_date END) IS DISTINCT FROM v_gig.event_date
    OR (CASE WHEN p_payload ? 'location' THEN p_payload->>'location' ELSE v_gig.location END) IS DISTINCT FROM v_gig.location
    OR v_new_event_start IS DISTINCT FROM v_existing_event_start
    OR v_new_event_end IS DISTINCT FROM v_existing_event_end
    OR COALESCE(v_new_requirements->'slots', '{}'::jsonb) IS DISTINCT FROM COALESCE(v_existing_requirements->'slots', '{}'::jsonb)
    OR COALESCE(v_new_requirements->'instruments', '[]'::jsonb) IS DISTINCT FROM COALESCE(v_existing_requirements->'instruments', '[]'::jsonb)
    OR COALESCE(v_new_requirements->'genres', '[]'::jsonb) IS DISTINCT FROM COALESCE(v_existing_requirements->'genres', '[]'::jsonb)
    OR (v_new_requirements->>'musician_type') IS DISTINCT FROM (v_existing_requirements->>'musician_type')
    OR (v_new_requirements->>'experience_level') IS DISTINCT FROM (v_existing_requirements->>'experience_level')
    OR v_new_total_slots IS DISTINCT FROM v_existing_total_slots
  );

  IF v_major_change AND v_accepted_total > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, message, meta)
    SELECT
      ga.applicant_id,
      'warning',
      'Gig Terms Updated â€” Reconfirmation Required',
      COALESCE(v_gig.name, 'A gig') || ' changed key details. Please reconfirm within ' || v_reconfirm_window_hours || ' hours to keep your slot.',
      jsonb_build_object(
        'gig_id', p_gig_id,
        'event', 'gig_major_change_reconfirm_required',
        'reason', p_reason,
        'reconfirm_window_hours', v_reconfirm_window_hours,
        'reconfirm_due_at', v_reconfirm_due_at,
        'previous_status', ga.status
      )
    FROM public.gig_applications ga
    WHERE ga.gig_id = p_gig_id
      AND ga.status = 'accepted';

    UPDATE public.gig_applications
    SET
      status = 'pending',
      system_status_reason = 'system_reconfirm_required_terms_changed',
      reconfirmation_required_at = NOW(),
      reconfirmation_due_at = v_reconfirm_due_at
    WHERE gig_id = p_gig_id
      AND status = 'accepted';

    GET DIAGNOSTICS v_reconfirmation_required_count = ROW_COUNT;
  END IF;

  IF v_major_change AND v_pending_count > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, message, meta)
    SELECT
      ga.applicant_id,
      'warning',
      'Application Closed: Gig Requirements Changed',
      COALESCE(v_gig.name, 'A gig') || ' changed key details, so your pending application was system-closed. You can reapply if you still match the updated requirements.',
      jsonb_build_object(
        'gig_id', p_gig_id,
        'event', 'gig_major_change_system_reject',
        'reason', p_reason,
        'status_reason', 'system_requirements_changed',
        'previous_status', ga.status
      )
    FROM public.gig_applications ga
    WHERE ga.gig_id = p_gig_id
      AND ga.status = 'pending'
      AND ga.reconfirmation_due_at IS NULL;

    UPDATE public.gig_applications
    SET
      status = 'rejected',
      system_status_reason = 'system_requirements_changed'
    WHERE gig_id = p_gig_id
      AND status = 'pending'
      AND reconfirmation_due_at IS NULL;

    GET DIAGNOSTICS v_system_rejected_pending_count = ROW_COUNT;
  END IF;

  IF v_gig.legacy_images IS NOT NULL THEN
    v_old_urls := v_old_urls || v_gig.legacy_images;
  END IF;
  IF v_gig.legacy_documents IS NOT NULL THEN
    v_old_urls := v_old_urls || v_gig.legacy_documents;
  END IF;
  IF v_gig.contract_url IS NOT NULL AND btrim(v_gig.contract_url) <> '' THEN
    v_old_urls := v_old_urls || v_gig.contract_url;
  END IF;
  IF v_gig.business_permit_url IS NOT NULL AND btrim(v_gig.business_permit_url) <> '' THEN
    v_old_urls := v_old_urls || v_gig.business_permit_url;
  END IF;

  UPDATE public.gigs
  SET
    name = CASE WHEN p_payload ? 'name' THEN p_payload->>'name' ELSE name END,
    description = CASE WHEN p_payload ? 'description' THEN p_payload->>'description' ELSE description END,
    location = CASE WHEN p_payload ? 'location' THEN p_payload->>'location' ELSE location END,
    budget = CASE WHEN p_payload ? 'budget' THEN (p_payload->>'budget')::numeric ELSE budget END,
    contract_url = CASE
      WHEN p_payload ? 'contract_url' THEN NULLIF(p_payload->>'contract_url', '')
      ELSE contract_url
    END,
    business_permit_url = CASE
      WHEN p_payload ? 'business_permit_url' THEN NULLIF(p_payload->>'business_permit_url', '')
      ELSE business_permit_url
    END,
    latitude = CASE WHEN p_payload ? 'latitude' THEN (p_payload->>'latitude')::double precision ELSE latitude END,
    longitude = CASE WHEN p_payload ? 'longitude' THEN (p_payload->>'longitude')::double precision ELSE longitude END,
    event_date = CASE WHEN p_payload ? 'event_date' THEN (p_payload->>'event_date')::timestamptz ELSE event_date END,
    reapplication_cooldown_days = CASE
      WHEN p_payload ? 'reapplication_cooldown_days' THEN (p_payload->>'reapplication_cooldown_days')::integer
      ELSE reapplication_cooldown_days
    END
  WHERE id = p_gig_id
    AND organizer_id = v_uid
  RETURNING * INTO v_updated_gig;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to update gig';
  END IF;

  IF p_payload ? 'requirements' THEN
    DELETE FROM public.gig_requirements
    WHERE gig_id = p_gig_id;

    INSERT INTO public.gig_requirements (gig_id, requirement_key, requirement_value)
    SELECT p_gig_id, kv.key, kv.value
    FROM jsonb_each(COALESCE(v_new_requirements, '{}'::jsonb)) AS kv(key, value);
  END IF;

  IF p_payload ? 'images' THEN
    DELETE FROM public.gig_media
    WHERE gig_id = p_gig_id
      AND media_type = 'image';

    INSERT INTO public.gig_media (gig_id, media_type, media_url, sort_order)
    SELECT
      p_gig_id,
      'image',
      elem.url,
      elem.ord::integer - 1
    FROM jsonb_array_elements_text(COALESCE(p_payload->'images', '[]'::jsonb)) WITH ORDINALITY AS elem(url, ord)
    WHERE NULLIF(btrim(elem.url), '') IS NOT NULL;
  END IF;

  IF p_payload ? 'documents' THEN
    DELETE FROM public.gig_media
    WHERE gig_id = p_gig_id
      AND media_type = 'document';

    INSERT INTO public.gig_media (gig_id, media_type, media_url, sort_order)
    SELECT
      p_gig_id,
      'document',
      elem.url,
      elem.ord::integer - 1
    FROM jsonb_array_elements_text(COALESCE(p_payload->'documents', '[]'::jsonb)) WITH ORDINALITY AS elem(url, ord)
    WHERE NULLIF(btrim(elem.url), '') IS NOT NULL;
  END IF;

  SELECT
    COALESCE(glp.requirements, '{}'::jsonb),
    COALESCE(glp.images, ARRAY[]::text[]),
    COALESCE(glp.documents, ARRAY[]::text[])
  INTO
    v_updated_requirements,
    v_updated_images,
    v_updated_documents
  FROM public.gigs_legacy_projection glp
  WHERE glp.id = p_gig_id;

  IF v_updated_images IS NOT NULL THEN
    v_new_urls := v_new_urls || v_updated_images;
  END IF;
  IF v_updated_documents IS NOT NULL THEN
    v_new_urls := v_new_urls || v_updated_documents;
  END IF;
  IF v_updated_gig.contract_url IS NOT NULL AND btrim(v_updated_gig.contract_url) <> '' THEN
    v_new_urls := v_new_urls || v_updated_gig.contract_url;
  END IF;
  IF v_updated_gig.business_permit_url IS NOT NULL AND btrim(v_updated_gig.business_permit_url) <> '' THEN
    v_new_urls := v_new_urls || v_updated_gig.business_permit_url;
  END IF;

  WITH old_set AS (
    SELECT DISTINCT u AS url
    FROM unnest(v_old_urls) AS t(u)
    WHERE u IS NOT NULL AND btrim(u) <> ''
  ),
  new_set AS (
    SELECT DISTINCT u AS url
    FROM unnest(v_new_urls) AS t(u)
    WHERE u IS NOT NULL AND btrim(u) <> ''
  )
  SELECT COALESCE(array_agg(o.url), ARRAY[]::TEXT[])
  INTO v_removed_urls
  FROM old_set o
  LEFT JOIN new_set n ON n.url = o.url
  WHERE n.url IS NULL;

  WITH parsed AS (
    SELECT
      (m)[1] AS bucket_id,
      split_part((m)[2], '?', 1) AS object_path
    FROM (
      SELECT regexp_matches(
        u.url,
        '/storage/v1/object/(?:public|sign)/([^/]+)/(.+)$'
      ) AS m
      FROM unnest(v_removed_urls) AS u(url)
      WHERE u.url IS NOT NULL
    ) t
    WHERE m IS NOT NULL
  ), dedup AS (
    SELECT DISTINCT bucket_id, object_path
    FROM parsed
    WHERE object_path <> ''
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object('bucket_id', bucket_id, 'object_path', object_path)), '[]'::jsonb),
    COUNT(*)
  INTO v_storage_pairs, v_storage_objects_to_delete
  FROM dedup;

  IF v_storage_objects_to_delete > 0 THEN
    WITH targets AS (
      SELECT
        elem->>'bucket_id' AS bucket_id,
        elem->>'object_path' AS object_path
      FROM jsonb_array_elements(v_storage_pairs) AS elem
    ), deleted AS (
      DELETE FROM storage.objects so
      USING targets t
      WHERE so.bucket_id = t.bucket_id
        AND so.name = t.object_path
      RETURNING so.id
    )
    SELECT COUNT(*) INTO v_storage_deleted_count FROM deleted;
  END IF;

  v_storage_cleanup := jsonb_build_object(
    'removed_url_count', COALESCE(array_length(v_removed_urls, 1), 0),
    'parsed_objects', v_storage_objects_to_delete,
    'deleted_objects', v_storage_deleted_count
  );

  SELECT COUNT(*) FILTER (WHERE status = 'accepted'),
         COUNT(*) FILTER (WHERE status = 'pending')
  INTO v_accepted_count, v_pending_count
  FROM public.gig_applications
  WHERE gig_id = p_gig_id;

  IF v_new_total_slots > 0 AND v_accepted_count >= v_new_total_slots THEN
    v_soft_closed := true;

    INSERT INTO public.notifications (user_id, type, title, message, meta)
    SELECT
      ga.applicant_id,
      'info',
      'Application Closed: Slots Filled',
      COALESCE(v_updated_gig.name, 'This gig') || ' has filled all available slots. Your pending application has been closed.',
      jsonb_build_object(
        'gig_id', p_gig_id,
        'event', 'gig_soft_closed_slots_filled',
        'status_reason', 'system_slots_filled',
        'previous_status', ga.status
      )
    FROM public.gig_applications ga
    WHERE ga.gig_id = p_gig_id
      AND ga.status = 'pending';

    UPDATE public.gig_applications
    SET
      status = 'rejected',
      system_status_reason = 'system_slots_filled'
    WHERE gig_id = p_gig_id
      AND status = 'pending';

    GET DIAGNOSTICS v_soft_closed_rejected_count = ROW_COUNT;

    UPDATE public.gigs
    SET status = 'closed'
    WHERE id = p_gig_id;
  ELSE
    UPDATE public.gigs
    SET status = 'open'
    WHERE id = p_gig_id
      AND status = 'closed';
  END IF;

  SELECT COUNT(*) FILTER (WHERE status = 'accepted'),
         COUNT(*) FILTER (WHERE status = 'pending')
  INTO v_accepted_count, v_pending_count
  FROM public.gig_applications
  WHERE gig_id = p_gig_id;

  RETURN jsonb_build_object(
    'success', true,
    'gig', to_jsonb(v_updated_gig) || jsonb_build_object(
      'requirements', v_updated_requirements,
      'images', to_jsonb(v_updated_images),
      'documents', to_jsonb(v_updated_documents)
    ),
    'major_change', v_major_change,
    'storage_cleanup', v_storage_cleanup,
    'reconfirmation', jsonb_build_object(
      'window_hours', v_reconfirm_window_hours,
      'required_count', v_reconfirmation_required_count,
      'expired_count', v_reconfirm_expired_count
    ),
    'system_rejected_pending_count', v_system_rejected_pending_count,
    'soft_closed', v_soft_closed,
    'soft_closed_rejected_count', v_soft_closed_rejected_count,
    'application_counts', jsonb_build_object(
      'accepted', v_accepted_count,
      'pending', v_pending_count
    )
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.update_gig_slot_counts()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
    v_slot_type text;
    v_total_needed integer;
    v_new_total integer;
    v_applicant_id uuid;
begin
    if new.status = 'accepted' and (old.status is null or old.status <> 'accepted') then
        v_slot_type := coalesce(new.slot_type, 'solo');
        v_applicant_id := new.applicant_id;

        insert into public.gig_slot_fill_summary (gig_id, slot_type, accepted_count)
        values (new.gig_id, v_slot_type, 1)
        on conflict (gig_id, slot_type)
        do update set
            accepted_count = public.gig_slot_fill_summary.accepted_count + 1,
            updated_at = now();

        insert into public.gig_slot_fill_applicants (gig_id, slot_type, applicant_id)
        values (new.gig_id, v_slot_type, v_applicant_id)
        on conflict (gig_id, slot_type, applicant_id) do nothing;

        select coalesce(sum(accepted_count), 0)
        into v_new_total
        from public.gig_slot_fill_summary
        where gig_id = new.gig_id;

        select coalesce((gr.requirement_value)::text::int, 999)
        into v_total_needed
        from public.gig_requirements gr
        where gr.gig_id = new.gig_id
          and gr.requirement_key = 'total_slots_needed'
        order by gr.created_at desc
        limit 1;

        v_total_needed := coalesce(v_total_needed, 999);

        update public.gigs g
        set total_slots_filled = v_new_total,
            status = case when v_new_total >= v_total_needed then 'closed' else g.status end
        where g.id = new.gig_id;

    elsif old.status = 'accepted' and new.status <> 'accepted' then
        v_slot_type := coalesce(old.slot_type, 'solo');
        v_applicant_id := old.applicant_id;

        update public.gig_slot_fill_summary
        set accepted_count = greatest(accepted_count - 1, 0),
            updated_at = now()
        where gig_id = old.gig_id
          and slot_type = v_slot_type;

        delete from public.gig_slot_fill_applicants
        where gig_id = old.gig_id
          and slot_type = v_slot_type
          and applicant_id = v_applicant_id;

        select coalesce(sum(accepted_count), 0)
        into v_new_total
        from public.gig_slot_fill_summary
        where gig_id = old.gig_id;

        update public.gigs g
        set total_slots_filled = v_new_total,
            status = case when g.status = 'closed' then 'open' else g.status end
        where g.id = old.gig_id;
    end if;

    return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.update_playlist_track_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.playlists SET track_count = track_count + 1 WHERE id = NEW.playlist_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.playlists SET track_count = GREATEST(track_count - 1, 0) WHERE id = OLD.playlist_id;
    END IF;
    RETURN NULL;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_post_comment_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.feed_posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.feed_posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_post_reaction_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.feed_posts SET reaction_count = reaction_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.feed_posts SET reaction_count = GREATEST(reaction_count - 1, 0) WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$function$


CREATE OR REPLACE FUNCTION public.update_user_interest(p_user_id uuid, p_item_vector vector, p_weight double precision DEFAULT 0.1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_current_vector vector(384);
  v_new_vector vector(384);
BEGIN
  -- Get current vector
  SELECT interest_vector INTO v_current_vector FROM profiles WHERE id = p_user_id;
  
  IF v_current_vector IS NULL THEN
    -- If no history, just adopt the new item's vector
    v_new_vector := p_item_vector;
  ELSE
    -- Calculate weighted average
    -- Note: pgvector supports vector arithmetic: + - *
    -- We want: v_current * (1-w) + p_item * w
    -- But pgvector operators might be limited depending on version.
    -- Standard linear interpolation:
    -- v_current + (p_item - v_current) * w
    v_new_vector := v_current_vector + (p_item_vector - v_current_vector) * p_weight;
  END IF;

  -- Update profile
  UPDATE profiles SET interest_vector = v_new_vector WHERE id = p_user_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.validate_production_gig_application()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    roster_record public.production_team_roster%ROWTYPE;
BEGIN
    IF NEW.production_team_id IS NULL AND NEW.production_roster_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.production_team_id IS NULL OR NEW.production_roster_id IS NULL THEN
        IF TG_OP = 'UPDATE' THEN
            IF OLD.production_team_id IS NOT NULL AND OLD.production_roster_id IS NOT NULL THEN
                NEW.production_team_id := NULL;
                NEW.production_roster_id := NULL;
                RETURN NEW;
            END IF;
        END IF;

        RAISE EXCEPTION 'production_team_id and production_roster_id must both be provided';
    END IF;

    SELECT *
    INTO roster_record
    FROM public.production_team_roster
    WHERE id = NEW.production_roster_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected production roster entry does not exist';
    END IF;

    IF roster_record.team_id <> NEW.production_team_id THEN
        RAISE EXCEPTION 'Selected production roster entry does not belong to the provided production team';
    END IF;

    IF roster_record.profile_id IS NOT NULL AND NEW.group_id IS NOT NULL THEN
        RAISE EXCEPTION 'Solo production roster entries cannot submit with a group_id';
    END IF;

    IF roster_record.group_id IS NOT NULL AND NEW.group_id IS DISTINCT FROM roster_record.group_id THEN
        RAISE EXCEPTION 'Production group applications must use the group stored in the selected roster entry';
    END IF;

    RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.validate_report_target_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target_type text;
  v_target_exists boolean := false;
BEGIN
  v_target_type := public.normalize_report_target_type(NEW.target_type);

  IF v_target_type NOT IN ('group', 'studio', 'gig', 'profile', 'product', 'playlist') THEN
    RAISE EXCEPTION 'Invalid report target_type: %', NEW.target_type
      USING ERRCODE = '23514';
  END IF;

  NEW.target_type := v_target_type;
  NEW.reason := btrim(coalesce(NEW.reason, ''));

  IF NEW.reason = '' THEN
    RAISE EXCEPTION 'Report reason is required.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.target_id IS NULL THEN
    RAISE EXCEPTION 'Report target_id is required.'
      USING ERRCODE = '23502';
  END IF;

  IF v_target_type = 'group' THEN
    SELECT EXISTS (SELECT 1 FROM public.groups WHERE id = NEW.target_id) INTO v_target_exists;
  ELSIF v_target_type = 'studio' THEN
    SELECT EXISTS (SELECT 1 FROM public.studios WHERE id = NEW.target_id) INTO v_target_exists;
  ELSIF v_target_type = 'gig' THEN
    SELECT EXISTS (SELECT 1 FROM public.gigs WHERE id = NEW.target_id) INTO v_target_exists;
  ELSIF v_target_type = 'profile' THEN
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.target_id) INTO v_target_exists;
  ELSIF v_target_type = 'product' THEN
    SELECT EXISTS (SELECT 1 FROM public.products WHERE id = NEW.target_id) INTO v_target_exists;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.playlists WHERE id = NEW.target_id) INTO v_target_exists;
  END IF;

  IF NOT v_target_exists THEN
    RAISE EXCEPTION 'Cannot report missing target: % %', v_target_type, NEW.target_id
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.validate_time_slots(slots jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
    slot JSONB;
    slot_start TIME;
    slot_end TIME;
BEGIN
    -- Empty slots array is invalid
    IF jsonb_array_length(slots) = 0 THEN
        RETURN FALSE;
    END IF;
    
    -- Validate each slot
    FOR slot IN SELECT * FROM jsonb_array_elements(slots)
    LOOP
        -- Check required fields exist
        IF NOT (slot ? 'start' AND slot ? 'end') THEN
            RETURN FALSE;
        END IF;
        
        -- Parse times
        BEGIN
            slot_start := (slot->>'start')::TIME;
            slot_end := (slot->>'end')::TIME;
        EXCEPTION WHEN OTHERS THEN
            RETURN FALSE;
        END;
        
        -- Validate end > start
        IF slot_end <= slot_start THEN
            RETURN FALSE;
        END IF;
    END LOOP;
    
    RETURN TRUE;
END;
$function$


-- Triggers

CREATE TRIGGER trg_notify_booking_attendance_event AFTER INSERT ON booking_attendance_events FOR EACH ROW EXECUTE FUNCTION notify_booking_attendance_event();

CREATE TRIGGER trg_booking_cancellation_policies_updated_at BEFORE UPDATE ON booking_cancellation_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_booking_incidents_updated_at BEFORE UPDATE ON booking_incidents FOR EACH ROW EXECUTE FUNCTION set_updated_at_booking_incidents();

CREATE TRIGGER trg_feed_posts_updated_at BEFORE UPDATE ON feed_posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_gig_applications_updated_at BEFORE UPDATE ON gig_applications FOR EACH ROW EXECUTE FUNCTION set_gig_applications_updated_at();

CREATE TRIGGER trigger_insert_slot_counts AFTER INSERT ON gig_applications FOR EACH ROW WHEN (new.status = 'accepted'::text) EXECUTE FUNCTION update_gig_slot_counts();

CREATE TRIGGER trigger_update_rejected_at BEFORE UPDATE ON gig_applications FOR EACH ROW EXECUTE FUNCTION update_application_rejected_at();

CREATE TRIGGER trigger_update_slot_counts AFTER UPDATE ON gig_applications FOR EACH ROW EXECUTE FUNCTION update_gig_slot_counts();

CREATE TRIGGER trigger_validate_production_gig_application BEFORE INSERT OR UPDATE OF production_team_id, production_roster_id, group_id ON gig_applications FOR EACH ROW EXECUTE FUNCTION validate_production_gig_application();

CREATE TRIGGER trg_enforce_single_permit_resubmission_on_gigs BEFORE INSERT OR UPDATE OF permit_status, permit_resubmissions_used ON gigs FOR EACH ROW EXECUTE FUNCTION enforce_single_permit_resubmission();

CREATE TRIGGER trg_reports_cleanup_on_gig_delete AFTER DELETE ON gigs FOR EACH ROW EXECUTE FUNCTION dismiss_reports_for_deleted_target();

CREATE TRIGGER sync_group_conversation_on_member_change AFTER INSERT OR DELETE OR UPDATE ON group_members FOR EACH ROW EXECUTE FUNCTION sync_group_conversation_members();

CREATE TRIGGER auto_add_group_owner_trigger AFTER INSERT ON groups FOR EACH ROW EXECUTE FUNCTION auto_add_group_owner_to_members();

CREATE TRIGGER trg_reports_cleanup_on_group_delete AFTER DELETE ON groups FOR EACH ROW EXECUTE FUNCTION dismiss_reports_for_deleted_target();

CREATE TRIGGER trg_manual_identity_reviews_updated_at BEFORE UPDATE ON manual_identity_reviews FOR EACH ROW EXECUTE FUNCTION set_manual_identity_reviews_updated_at();

CREATE TRIGGER trigger_update_conversation_timestamp AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION update_conversation_timestamp();

CREATE TRIGGER trg_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION set_notification_preferences_updated_at();

CREATE TRIGGER trg_dispatch_push_notification_on_insert AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION dispatch_push_notification_on_insert();

CREATE TRIGGER trg_fulfillments_updated_at BEFORE UPDATE ON order_fulfillments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_playlist_items_count AFTER INSERT OR DELETE ON playlist_items FOR EACH ROW EXECUTE FUNCTION update_playlist_track_count();

CREATE TRIGGER trg_playlists_updated_at BEFORE UPDATE ON playlists FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_reports_cleanup_on_playlist_delete AFTER DELETE ON playlists FOR EACH ROW EXECUTE FUNCTION dismiss_reports_for_deleted_target();

CREATE TRIGGER trg_post_comments_count AFTER INSERT OR DELETE ON post_comments FOR EACH ROW EXECUTE FUNCTION update_post_comment_count();

CREATE TRIGGER trg_post_comments_updated_at BEFORE UPDATE ON post_comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_post_reactions_count AFTER INSERT OR DELETE ON post_reactions FOR EACH ROW EXECUTE FUNCTION update_post_reaction_count();

CREATE TRIGGER trg_production_teams_updated_at BEFORE UPDATE ON production_teams FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_reports_cleanup_on_product_delete AFTER DELETE ON products FOR EACH ROW EXECUTE FUNCTION dismiss_reports_for_deleted_target();

CREATE TRIGGER trg_reports_cleanup_on_profile_delete AFTER DELETE ON profiles FOR EACH ROW EXECUTE FUNCTION dismiss_reports_for_deleted_target();

CREATE TRIGGER trg_validate_report_target_before_write BEFORE INSERT OR UPDATE OF target_type, target_id, reason ON reports FOR EACH ROW EXECUTE FUNCTION validate_report_target_before_write();

CREATE TRIGGER trg_stations_updated_at BEFORE UPDATE ON stations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_studio_promotions_updated_at BEFORE UPDATE ON studio_promotions FOR EACH ROW EXECUTE FUNCTION set_updated_at_studio_promotions();

CREATE TRIGGER trg_enforce_single_permit_resubmission_on_studios BEFORE INSERT OR UPDATE OF permit_status, permit_resubmissions_used ON studios FOR EACH ROW EXECUTE FUNCTION enforce_single_permit_resubmission();

CREATE TRIGGER trg_reports_cleanup_on_studio_delete AFTER DELETE ON studios FOR EACH ROW EXECUTE FUNCTION dismiss_reports_for_deleted_target();

CREATE TRIGGER on_withdrawal_status_change AFTER UPDATE OF status ON withdrawal_requests FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION process_withdrawal_balance();

CREATE TRIGGER trg_prevent_withdrawal_snapshot_mutation BEFORE UPDATE ON withdrawal_requests FOR EACH ROW EXECUTE FUNCTION prevent_withdrawal_snapshot_mutation();

-- Row level security

alter table public.address_verification_sessions enable row level security;

alter table public.booking_attendance_events enable row level security;

alter table public.booking_cancellation_policies enable row level security;

alter table public.booking_incidents enable row level security;

alter table public.booking_penalty_events enable row level security;

alter table public.booking_requests enable row level security;

alter table public.conversation_participants enable row level security;

alter table public.conversations enable row level security;

alter table public.external_platform_links enable row level security;

alter table public.favorites enable row level security;

alter table public.feed_posts enable row level security;

alter table public.follows enable row level security;

alter table public.gig_applications enable row level security;

alter table public.gig_deletion_audit enable row level security;

alter table public.gigs enable row level security;

alter table public.group_deletion_audit enable row level security;

alter table public.group_members enable row level security;

alter table public.group_playlists enable row level security;

alter table public.groups enable row level security;

alter table public.leadership_transfer_requests enable row level security;

alter table public.manual_identity_reviews enable row level security;

alter table public.message_reactions enable row level security;

alter table public.messages enable row level security;

alter table public.notification_preferences enable row level security;

alter table public.notifications enable row level security;

alter table public.order_fulfillments enable row level security;

alter table public.order_items enable row level security;

alter table public.orders enable row level security;

alter table public.payout_methods enable row level security;

alter table public.permit_audit_log enable row level security;

alter table public.playlist_items enable row level security;

alter table public.playlist_play_events enable row level security;

alter table public.playlist_teaser_assets enable row level security;

alter table public.playlists enable row level security;

alter table public.post_comments enable row level security;

alter table public.post_media enable row level security;

alter table public.post_reactions enable row level security;

alter table public.product_media enable row level security;

alter table public.product_variants enable row level security;

alter table public.production_team_members enable row level security;

alter table public.production_team_roster enable row level security;

alter table public.production_teams enable row level security;

alter table public.products enable row level security;

alter table public.profiles enable row level security;

alter table public.push_notification_devices enable row level security;

alter table public.reports enable row level security;

alter table public.review_likes enable row level security;

alter table public.reviews enable row level security;

alter table public.shipping_profiles enable row level security;

alter table public.social_activity_events enable row level security;

alter table public.station_playlist_slots enable row level security;

alter table public.stations enable row level security;

alter table public.studio_bookings enable row level security;

alter table public.studio_deletion_audit enable row level security;

alter table public.studios enable row level security;

alter table public.subscription_payments enable row level security;

alter table public.subscription_plans enable row level security;

alter table public.subscriptions enable row level security;

alter table public.verification_sessions enable row level security;

alter table public.wallet_deposits enable row level security;

alter table public.withdrawal_requests enable row level security;

-- Policies

create policy "Service role can manage address verification sessions" on public.address_verification_sessions as permissive for all to public
  using ((auth.role() = 'service_role'::text));

create policy "Users can view own address verification sessions" on public.address_verification_sessions as permissive for select to public
  using ((auth.uid() = user_id));

create policy "Participants can insert attendance events" on public.booking_attendance_events as permissive for insert to authenticated
  with check (((reporter_user_id = auth.uid()) AND (event_type = ANY (ARRAY['checked_in'::text, 'late'::text, 'not_attending'::text, 'no_show'::text])) AND (EXISTS ( SELECT 1
   FROM (studio_bookings sb
     JOIN studios s ON ((s.id = sb.studio_id)))
  WHERE ((sb.id = booking_attendance_events.booking_id) AND ((sb.user_id = auth.uid()) OR (s.owner_id = auth.uid())))))));

create policy "Participants can view attendance events" on public.booking_attendance_events as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (studio_bookings sb
     JOIN studios s ON ((s.id = sb.studio_id)))
  WHERE ((sb.id = booking_attendance_events.booking_id) AND ((sb.user_id = auth.uid()) OR (s.owner_id = auth.uid()))))));

create policy "Anyone can view active cancellation policies" on public.booking_cancellation_policies as permissive for select to authenticated
  using ((is_active = true));

create policy "Studio owners can manage cancellation policies" on public.booking_cancellation_policies as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = booking_cancellation_policies.studio_id) AND (s.owner_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = booking_cancellation_policies.studio_id) AND (s.owner_id = auth.uid())))));

create policy "Admin can update booking incidents" on public.booking_incidents as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Admin can view all booking incidents" on public.booking_incidents as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Participants can insert booking incidents" on public.booking_incidents as permissive for insert to authenticated
  with check ((auth.uid() = reporter_user_id));

create policy "Participants can update booking incidents" on public.booking_incidents as permissive for update to authenticated
  using (((auth.uid() = reporter_user_id) OR (auth.uid() = counterparty_user_id)))
  with check (((auth.uid() = reporter_user_id) OR (auth.uid() = counterparty_user_id)));

create policy "Participants can view booking incidents" on public.booking_incidents as permissive for select to authenticated
  using (((auth.uid() = reporter_user_id) OR (auth.uid() = counterparty_user_id)));

create policy "Booking participants can view penalties" on public.booking_penalty_events as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM studio_bookings sb
  WHERE ((sb.id = booking_penalty_events.booking_id) AND ((sb.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM studios s
          WHERE ((s.id = sb.studio_id) AND (s.owner_id = auth.uid())))))))));

create policy "Penalized users can view their penalties" on public.booking_penalty_events as permissive for select to authenticated
  using (((penalized_user_id = auth.uid()) OR (beneficiary_user_id = auth.uid())));

create policy "Receivers can update status" on public.booking_requests as permissive for update to public
  using (((auth.uid() = receiver_id) OR (auth.uid() IN ( SELECT groups.owner_id
   FROM groups
  WHERE (groups.id = booking_requests.group_id)))));

create policy "Users can insert requests" on public.booking_requests as permissive for insert to public
  with check ((auth.uid() = sender_id));

create policy "Users can view requests for their studios" on public.booking_requests as permissive for select to public
  using (((auth.uid() = sender_id) OR (auth.uid() = receiver_id) OR (auth.uid() IN ( SELECT studios.owner_id
   FROM studios
  WHERE (studios.id = booking_requests.studio_id)))));

create policy "Users can view their own sent or received requests" on public.booking_requests as permissive for select to public
  using (((auth.uid() = sender_id) OR (auth.uid() = receiver_id) OR (auth.uid() IN ( SELECT groups.owner_id
   FROM groups
  WHERE (groups.id = booking_requests.group_id)))));

create policy "Conversation admins can remove participants" on public.conversation_participants as permissive for delete to public
  using (((user_id = auth.uid()) OR is_conversation_admin(conversation_id)));

create policy "Users can insert into conversation participants" on public.conversation_participants as permissive for insert to public
  with check (((user_id = auth.uid()) OR is_conversation_admin(conversation_id)));

create policy "Users can update own participation" on public.conversation_participants as permissive for update to public
  using ((user_id = auth.uid()))
  with check ((user_id = auth.uid()));

create policy "Users can view conversation participants" on public.conversation_participants as permissive for select to public
  using (((user_id = auth.uid()) OR is_conversation_member(conversation_id)));

create policy "Users can create conversations" on public.conversations as permissive for insert to public
  with check ((auth.uid() IS NOT NULL));

create policy "Users can update their conversations" on public.conversations as permissive for update to public
  using (is_conversation_member(id));

create policy "Users can view their conversations" on public.conversations as permissive for select to public
  using (is_conversation_member(id));

create policy external_links_delete on public.external_platform_links as permissive for delete to public
  using ((owner_id = auth.uid()));

create policy external_links_insert on public.external_platform_links as permissive for insert to public
  with check ((owner_id = auth.uid()));

create policy external_links_select on public.external_platform_links as permissive for select to public
  using (true);

create policy external_links_update on public.external_platform_links as permissive for update to public
  using ((owner_id = auth.uid()));

create policy "Users can delete own favorites" on public.favorites as permissive for delete to authenticated
  using ((auth.uid() = user_id));

create policy "Users can insert own favorites" on public.favorites as permissive for insert to authenticated
  with check ((auth.uid() = user_id));

create policy "Users can view own favorites" on public.favorites as permissive for select to authenticated
  using ((auth.uid() = user_id));

create policy feed_posts_delete on public.feed_posts as permissive for delete to public
  using (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy feed_posts_insert on public.feed_posts as permissive for insert to public
  with check ((author_id = auth.uid()));

create policy feed_posts_select on public.feed_posts as permissive for select to public
  using ((((visibility = 'public'::text) AND (is_hidden = false)) OR (author_id = auth.uid()) OR ((visibility = 'followers'::text) AND (is_hidden = false) AND (EXISTS ( SELECT 1
   FROM follows f
  WHERE ((f.follower_id = auth.uid()) AND (f.followed_type = 'profile'::text) AND (f.followed_id = feed_posts.author_id))))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy feed_posts_update on public.feed_posts as permissive for update to public
  using (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy follows_delete on public.follows as permissive for delete to public
  using ((follower_id = auth.uid()));

create policy follows_insert on public.follows as permissive for insert to public
  with check ((follower_id = auth.uid()));

create policy follows_select on public.follows as permissive for select to public
  using (true);

create policy "Accepted profile timeline applications are publicly visible" on public.gig_applications as permissive for select to public
  using (((status = 'accepted'::text) AND (show_on_profile = true)));

create policy "Applicants can update own applications" on public.gig_applications as permissive for update to authenticated
  using ((auth.uid() = applicant_id));

create policy "Applicants can view own applications" on public.gig_applications as permissive for select to authenticated
  using ((auth.uid() = applicant_id));

create policy "Gig organizers can update applications" on public.gig_applications as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM gigs
  WHERE ((gigs.id = gig_applications.gig_id) AND (gigs.organizer_id = auth.uid())))));

create policy "Gig organizers can view applications" on public.gig_applications as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM gigs
  WHERE ((gigs.id = gig_applications.gig_id) AND (gigs.organizer_id = auth.uid())))));

create policy "Selected performers and group members can view applications" on public.gig_applications as permissive for select to authenticated
  using (( SELECT can_view_gig_application_readonly_participant(gig_applications.id) AS can_view_gig_application_readonly_participant));

create policy "Users can create applications" on public.gig_applications as permissive for insert to authenticated
  with check ((auth.uid() = applicant_id));

create policy "Admins can read all gigs" on public.gigs as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Admins can update gig permit status" on public.gigs as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Gigs are viewable by everyone" on public.gigs as permissive for select to public
  using (true);

create policy "Organizers can delete their gigs" on public.gigs as permissive for delete to public
  using ((auth.uid() = organizer_id));

create policy "Organizers can update their gigs" on public.gigs as permissive for update to public
  using ((auth.uid() = organizer_id));

create policy "Users can create gigs" on public.gigs as permissive for insert to public
  with check ((auth.uid() = organizer_id));

create policy gigs_permit_resubmit_owner on public.gigs as permissive for update to public
  using ((organizer_id = auth.uid()))
  with check ((organizer_id = auth.uid()));

create policy gigs_permit_update_admin on public.gigs as permissive for update to public
  using (is_admin());

create policy "Anyone can view group memberships" on public.group_members as permissive for select to authenticated
  using (true);

create policy "Owners can update member roles" on public.group_members as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM groups
  WHERE ((groups.id = group_members.group_id) AND (groups.owner_id = auth.uid())))));

create policy "Users can join groups or owners can add members" on public.group_members as permissive for insert to authenticated
  with check (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM groups
  WHERE ((groups.id = group_members.group_id) AND (groups.owner_id = auth.uid()))))));

create policy "Users can leave or owners can remove members" on public.group_members as permissive for delete to authenticated
  using (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM groups
  WHERE ((groups.id = group_members.group_id) AND (groups.owner_id = auth.uid()))))));

create policy group_playlists_delete on public.group_playlists as permissive for delete to public
  using (((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_playlists.group_id) AND (g.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = group_playlists.playlist_id) AND (pl.creator_id = auth.uid()))))));

create policy group_playlists_insert on public.group_playlists as permissive for insert to public
  with check (((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_playlists.group_id) AND (g.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = group_playlists.playlist_id) AND (pl.creator_id = auth.uid()))))));

create policy group_playlists_select on public.group_playlists as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = group_playlists.playlist_id) AND ((pl.creator_id = auth.uid()) OR ((pl.visibility = 'public'::text) AND (COALESCE(pl.is_hidden, false) = false)) OR (EXISTS ( SELECT 1
           FROM profiles profile
          WHERE ((profile.id = auth.uid()) AND (profile.role = 'admin'::text)))))))));

create policy group_playlists_update on public.group_playlists as permissive for update to public
  using (((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_playlists.group_id) AND (g.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = group_playlists.playlist_id) AND (pl.creator_id = auth.uid()))))))
  with check (((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_playlists.group_id) AND (g.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = group_playlists.playlist_id) AND (pl.creator_id = auth.uid()))))));

create policy "Groups are viewable by everyone" on public.groups as permissive for select to public
  using (true);

create policy "Owners can delete their groups" on public.groups as permissive for delete to public
  using ((auth.uid() = owner_id));

create policy "Owners can update their groups" on public.groups as permissive for update to public
  using ((auth.uid() = owner_id));

create policy "Users can create groups" on public.groups as permissive for insert to public
  with check ((auth.uid() = owner_id));

create policy "Group owners can create transfer requests" on public.leadership_transfer_requests as permissive for insert to public
  with check (((auth.uid() = from_user_id) AND (EXISTS ( SELECT 1
   FROM groups
  WHERE ((groups.id = leadership_transfer_requests.group_id) AND (groups.owner_id = auth.uid()))))));

create policy "Owners can create transfer requests" on public.leadership_transfer_requests as permissive for insert to authenticated
  with check (((from_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM groups
  WHERE ((groups.id = leadership_transfer_requests.group_id) AND (groups.owner_id = auth.uid()))))));

create policy "Recipient can respond to transfer" on public.leadership_transfer_requests as permissive for update to authenticated
  using ((((to_user_id = auth.uid()) AND (status = 'pending'::text)) OR ((from_user_id = auth.uid()) AND (status = 'pending'::text))));

create policy "Users can update requests they are part of" on public.leadership_transfer_requests as permissive for update to public
  using (((auth.uid() = from_user_id) OR (auth.uid() = to_user_id)));

create policy "Users can view their own transfer requests" on public.leadership_transfer_requests as permissive for select to public
  using (((auth.uid() = from_user_id) OR (auth.uid() = to_user_id)));

create policy "Users can view their transfer requests" on public.leadership_transfer_requests as permissive for select to authenticated
  using (((from_user_id = auth.uid()) OR (to_user_id = auth.uid())));

create policy manual_identity_reviews_insert_own on public.manual_identity_reviews as permissive for insert to authenticated
  with check ((auth.uid() = user_id));

create policy manual_identity_reviews_select_own on public.manual_identity_reviews as permissive for select to authenticated
  using ((auth.uid() = user_id));

create policy manual_identity_reviews_update_own_pending on public.manual_identity_reviews as permissive for update to authenticated
  using (((auth.uid() = user_id) AND (status = 'PENDING_REVIEW'::text)))
  with check (((auth.uid() = user_id) AND (status = 'PENDING_REVIEW'::text)));

create policy "Users can add reactions" on public.message_reactions as permissive for insert to public
  with check (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM (messages m
     JOIN conversation_participants cp ON ((cp.conversation_id = m.conversation_id)))
  WHERE ((m.id = message_reactions.message_id) AND (cp.user_id = auth.uid()))))));

create policy "Users can delete own reactions" on public.message_reactions as permissive for delete to public
  using ((auth.uid() = user_id));

create policy "Users can update own reactions" on public.message_reactions as permissive for update to public
  using ((auth.uid() = user_id));

create policy "Users can view reactions in their conversations" on public.message_reactions as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM (messages m
     JOIN conversation_participants cp ON ((cp.conversation_id = m.conversation_id)))
  WHERE ((m.id = message_reactions.message_id) AND (cp.user_id = auth.uid())))));

create policy "Users can send messages in their conversations" on public.messages as permissive for insert to public
  with check (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM conversation_participants cp
  WHERE ((cp.conversation_id = messages.conversation_id) AND (cp.user_id = auth.uid()))))));

create policy "Users can send messages to their conversations" on public.messages as permissive for insert to public
  with check (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM conversation_participants cp
  WHERE ((cp.conversation_id = messages.conversation_id) AND (cp.user_id = auth.uid()))))));

create policy "Users can update messages" on public.messages as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM conversation_participants cp
  WHERE ((cp.conversation_id = messages.conversation_id) AND (cp.user_id = auth.uid())))));

create policy "Users can update their own messages" on public.messages as permissive for update to public
  using ((sender_id = auth.uid()));

create policy "Users can view messages in their conversations" on public.messages as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM conversation_participants cp
  WHERE ((cp.conversation_id = messages.conversation_id) AND (cp.user_id = auth.uid())))));

create policy notification_preferences_insert_own on public.notification_preferences as permissive for insert to authenticated
  with check ((auth.uid() = user_id));

create policy notification_preferences_select_own on public.notification_preferences as permissive for select to authenticated
  using ((auth.uid() = user_id));

create policy notification_preferences_update_own on public.notification_preferences as permissive for update to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy "Users can insert own notifications" on public.notifications as permissive for insert to authenticated
  with check ((auth.uid() = user_id));

create policy "Users can update own notifications" on public.notifications as permissive for update to authenticated
  using ((auth.uid() = user_id));

create policy "Users can view own notifications" on public.notifications as permissive for select to authenticated
  using ((auth.uid() = user_id));

create policy fulfillments_insert on public.order_fulfillments as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_fulfillments.order_id) AND (o.seller_id = auth.uid())))));

create policy fulfillments_select on public.order_fulfillments as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_fulfillments.order_id) AND ((o.buyer_id = auth.uid()) OR (o.seller_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))))));

create policy fulfillments_update on public.order_fulfillments as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_fulfillments.order_id) AND (o.seller_id = auth.uid())))));

create policy order_items_insert on public.order_items as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND (o.buyer_id = auth.uid())))));

create policy order_items_select on public.order_items as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND ((o.buyer_id = auth.uid()) OR (o.seller_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))))));

create policy orders_insert on public.orders as permissive for insert to public
  with check ((buyer_id = auth.uid()));

create policy orders_select on public.orders as permissive for select to public
  using (((buyer_id = auth.uid()) OR (seller_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy orders_update on public.orders as permissive for update to public
  using (((buyer_id = auth.uid()) OR (seller_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy "Users can delete their own payout methods" on public.payout_methods as permissive for delete to public
  using ((auth.uid() = user_id));

create policy "Users can insert their own payout methods" on public.payout_methods as permissive for insert to public
  with check ((auth.uid() = user_id));

create policy "Users can update their own payout methods" on public.payout_methods as permissive for update to public
  using ((auth.uid() = user_id));

create policy "Users can view their own payout methods" on public.payout_methods as permissive for select to public
  using ((auth.uid() = user_id));

create policy "Admins can insert permit audit logs" on public.permit_audit_log as permissive for insert to authenticated
  with check (is_admin(auth.uid()));

create policy "Admins can read all permit audit logs" on public.permit_audit_log as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Owners can read their permit audit logs" on public.permit_audit_log as permissive for select to public
  using ((((entity_type = 'studio'::text) AND (entity_id IN ( SELECT studios.id
   FROM studios
  WHERE (studios.owner_id = auth.uid())))) OR ((entity_type = 'gig'::text) AND (entity_id IN ( SELECT gigs.id
   FROM gigs
  WHERE (gigs.organizer_id = auth.uid()))))));

create policy playlist_items_delete on public.playlist_items as permissive for delete to public
  using ((EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = playlist_items.playlist_id) AND (pl.creator_id = auth.uid())))));

create policy playlist_items_insert on public.playlist_items as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = playlist_items.playlist_id) AND (pl.creator_id = auth.uid())))));

create policy playlist_items_select on public.playlist_items as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = playlist_items.playlist_id) AND ((pl.visibility = 'public'::text) OR (pl.creator_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))))));

create policy playlist_items_update on public.playlist_items as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = playlist_items.playlist_id) AND (pl.creator_id = auth.uid())))));

create policy play_events_insert on public.playlist_play_events as permissive for insert to public
  with check (true);

create policy play_events_select on public.playlist_play_events as permissive for select to public
  using (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy teaser_assets_delete on public.playlist_teaser_assets as permissive for delete to public
  using ((uploader_id = auth.uid()));

create policy teaser_assets_insert on public.playlist_teaser_assets as permissive for insert to public
  with check ((uploader_id = auth.uid()));

create policy teaser_assets_select on public.playlist_teaser_assets as permissive for select to public
  using (((uploader_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = playlist_teaser_assets.playlist_id) AND ((pl.visibility = 'public'::text) OR (pl.creator_id = auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy playlists_delete on public.playlists as permissive for delete to public
  using ((creator_id = auth.uid()));

create policy playlists_insert on public.playlists as permissive for insert to public
  with check ((creator_id = auth.uid()));

create policy playlists_select on public.playlists as permissive for select to public
  using ((((visibility = 'public'::text) AND (is_hidden = false)) OR (creator_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy playlists_update on public.playlists as permissive for update to public
  using (((creator_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy post_comments_delete on public.post_comments as permissive for delete to public
  using (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy post_comments_insert on public.post_comments as permissive for insert to public
  with check ((author_id = auth.uid()));

create policy post_comments_select on public.post_comments as permissive for select to public
  using (((is_hidden = false) OR (author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy post_comments_update on public.post_comments as permissive for update to public
  using (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy post_media_delete on public.post_media as permissive for delete to public
  using ((EXISTS ( SELECT 1
   FROM feed_posts fp
  WHERE ((fp.id = post_media.post_id) AND (fp.author_id = auth.uid())))));

create policy post_media_insert on public.post_media as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM feed_posts fp
  WHERE ((fp.id = post_media.post_id) AND (fp.author_id = auth.uid())))));

create policy post_media_select on public.post_media as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM feed_posts fp
  WHERE ((fp.id = post_media.post_id) AND ((fp.visibility = 'public'::text) OR (fp.author_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))))));

create policy post_reactions_delete on public.post_reactions as permissive for delete to public
  using ((user_id = auth.uid()));

create policy post_reactions_insert on public.post_reactions as permissive for insert to public
  with check ((user_id = auth.uid()));

create policy post_reactions_select on public.post_reactions as permissive for select to public
  using (true);

create policy product_media_delete on public.product_media as permissive for delete to public
  using ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_media.product_id) AND (p.seller_id = auth.uid())))));

create policy product_media_insert on public.product_media as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_media.product_id) AND (p.seller_id = auth.uid())))));

create policy product_media_select on public.product_media as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_media.product_id) AND ((p.status = 'active'::text) OR (p.seller_id = auth.uid()))))));

create policy product_variants_delete on public.product_variants as permissive for delete to public
  using ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_variants.product_id) AND (p.seller_id = auth.uid())))));

create policy product_variants_insert on public.product_variants as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_variants.product_id) AND (p.seller_id = auth.uid())))));

create policy product_variants_select on public.product_variants as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_variants.product_id) AND ((p.status = 'active'::text) OR (p.seller_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))))));

create policy product_variants_update on public.product_variants as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_variants.product_id) AND (p.seller_id = auth.uid())))));

create policy "Authenticated users can browse team members" on public.production_team_members as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM production_teams pt
  WHERE (pt.id = production_team_members.team_id))));

create policy "Members can view their own team memberships" on public.production_team_members as permissive for select to authenticated
  using ((user_id = auth.uid()));

create policy "Team owner insert bootstrap" on public.production_team_members as permissive for insert to authenticated
  with check ((EXISTS ( SELECT 1
   FROM production_teams pt
  WHERE ((pt.id = production_team_members.team_id) AND (pt.owner_id = auth.uid())))));

create policy "Team owners and managers can delete members" on public.production_team_members as permissive for delete to authenticated
  using (( SELECT can_manage_production_team_members(production_team_members.team_id) AS can_manage_production_team_members));

create policy "Team owners and managers can insert members" on public.production_team_members as permissive for insert to authenticated
  with check (( SELECT can_manage_production_team_members(production_team_members.team_id) AS can_manage_production_team_members));

create policy "Team owners and managers can update members" on public.production_team_members as permissive for update to authenticated
  using (( SELECT can_manage_production_team_members(production_team_members.team_id) AS can_manage_production_team_members))
  with check (( SELECT can_manage_production_team_members(production_team_members.team_id) AS can_manage_production_team_members));

create policy "Team managers can manage production roster" on public.production_team_roster as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM production_team_members ptm
  WHERE ((ptm.team_id = production_team_roster.team_id) AND (ptm.user_id = auth.uid()) AND (ptm.role = ANY (ARRAY['owner'::text, 'manager'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM production_team_members ptm
  WHERE ((ptm.team_id = production_team_roster.team_id) AND (ptm.user_id = auth.uid()) AND (ptm.role = ANY (ARRAY['owner'::text, 'manager'::text]))))));

create policy "Team members can view production roster" on public.production_team_roster as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM production_team_members ptm
  WHERE ((ptm.team_id = production_team_roster.team_id) AND (ptm.user_id = auth.uid())))));

create policy "Authenticated users can browse teams" on public.production_teams as permissive for select to authenticated
  using (true);

create policy "Team owners can manage their teams" on public.production_teams as permissive for all to authenticated
  using ((auth.uid() = owner_id))
  with check ((auth.uid() = owner_id));

create policy products_delete on public.products as permissive for delete to public
  using ((seller_id = auth.uid()));

create policy products_insert on public.products as permissive for insert to public
  with check ((seller_id = auth.uid()));

create policy products_select on public.products as permissive for select to public
  using (((status = 'active'::text) OR (seller_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy products_update on public.products as permissive for update to public
  using (((seller_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy "Public profiles are viewable by everyone" on public.profiles as permissive for select to public
  using (true);

create policy "Users can insert their own profile" on public.profiles as permissive for insert to public
  with check ((auth.uid() = id));

create policy "Users can update own profile" on public.profiles as permissive for update to public
  using ((auth.uid() = id));

create policy "Users can view their push devices" on public.push_notification_devices as permissive for select to authenticated
  using ((auth.uid() = user_id));

create policy "Users can insert reports" on public.reports as permissive for insert to authenticated
  with check ((auth.uid() = reporter_id));

create policy "Users can view own reports" on public.reports as permissive for select to authenticated
  using ((auth.uid() = reporter_id));

create policy "Review likes are public" on public.review_likes as permissive for select to public
  using (true);

create policy "Users can remove review likes" on public.review_likes as permissive for delete to authenticated
  using ((auth.uid() = user_id));

create policy "Users can toggle review likes" on public.review_likes as permissive for insert to authenticated
  with check ((auth.uid() = user_id));

create policy "Authors can delete their reviews" on public.reviews as permissive for delete to public
  using ((auth.uid() = author_id));

create policy "Authors can update their reviews" on public.reviews as permissive for update to public
  using ((auth.uid() = author_id));

create policy "Reviews are viewable by everyone" on public.reviews as permissive for select to public
  using (true);

create policy "Users can create reviews" on public.reviews as permissive for insert to public
  with check ((auth.uid() = author_id));

create policy shipping_profiles_delete on public.shipping_profiles as permissive for delete to public
  using ((seller_id = auth.uid()));

create policy shipping_profiles_insert on public.shipping_profiles as permissive for insert to public
  with check ((seller_id = auth.uid()));

create policy shipping_profiles_select on public.shipping_profiles as permissive for select to public
  using (((seller_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy shipping_profiles_update on public.shipping_profiles as permissive for update to public
  using ((seller_id = auth.uid()));

create policy social_events_insert on public.social_activity_events as permissive for insert to public
  with check ((actor_id = auth.uid()));

create policy social_events_select on public.social_activity_events as permissive for select to public
  using (((actor_id = auth.uid()) OR (target_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy station_slots_delete on public.station_playlist_slots as permissive for delete to public
  using ((EXISTS ( SELECT 1
   FROM stations s
  WHERE ((s.id = station_playlist_slots.station_id) AND (s.creator_id = auth.uid())))));

create policy station_slots_insert on public.station_playlist_slots as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM stations s
  WHERE ((s.id = station_playlist_slots.station_id) AND (s.creator_id = auth.uid())))));

create policy station_slots_select on public.station_playlist_slots as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM stations s
  WHERE ((s.id = station_playlist_slots.station_id) AND ((s.is_active = true) OR (s.creator_id = auth.uid()) OR (s.managed_profile_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))))));

create policy station_slots_update on public.station_playlist_slots as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM stations s
  WHERE ((s.id = station_playlist_slots.station_id) AND (s.creator_id = auth.uid())))));

create policy stations_delete on public.stations as permissive for delete to public
  using ((creator_id = auth.uid()));

create policy stations_insert on public.stations as permissive for insert to public
  with check ((creator_id = auth.uid()));

create policy stations_select on public.stations as permissive for select to public
  using (((is_active = true) OR (creator_id = auth.uid()) OR (managed_profile_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy stations_update on public.stations as permissive for update to public
  using (((creator_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

create policy "Studio owners can update bookings for their studios" on public.studio_bookings as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM studios
  WHERE ((studios.id = studio_bookings.studio_id) AND (studios.owner_id = auth.uid())))));

create policy "Studio owners can view bookings for their studios" on public.studio_bookings as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM studios
  WHERE ((studios.id = studio_bookings.studio_id) AND (studios.owner_id = auth.uid())))));

create policy "Users can create bookings" on public.studio_bookings as permissive for insert to authenticated
  with check ((auth.uid() = user_id));

create policy "Users can update own bookings" on public.studio_bookings as permissive for update to authenticated
  using ((auth.uid() = user_id));

create policy "Users can view own bookings" on public.studio_bookings as permissive for select to authenticated
  using ((auth.uid() = user_id));

create policy "Admins can read all studios" on public.studios as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Admins can update studio permit status" on public.studios as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

create policy "Owners can delete their studios" on public.studios as permissive for delete to public
  using ((auth.uid() = owner_id));

create policy "Owners can update their studios" on public.studios as permissive for update to public
  using ((auth.uid() = owner_id));

create policy "Studios are viewable by everyone" on public.studios as permissive for select to public
  using (true);

create policy "Users can create studios" on public.studios as permissive for insert to public
  with check ((auth.uid() = owner_id));

create policy studios_permit_resubmit_owner on public.studios as permissive for update to public
  using ((owner_id = auth.uid()))
  with check ((owner_id = auth.uid()));

create policy studios_permit_update_admin on public.studios as permissive for update to public
  using (is_admin());

create policy "Service role can manage subscription payments" on public.subscription_payments as permissive for all to public
  using ((auth.role() = 'service_role'::text));

create policy "Users can view own subscription payments" on public.subscription_payments as permissive for select to public
  using ((auth.uid() = user_id));

create policy "Anyone can view active subscription plans" on public.subscription_plans as permissive for select to public
  using ((is_active = true));

create policy "Service role can manage subscriptions" on public.subscriptions as permissive for all to public
  using ((auth.role() = 'service_role'::text));

create policy "Users can update own subscription" on public.subscriptions as permissive for update to public
  using ((auth.uid() = user_id));

create policy "Users can view own subscription" on public.subscriptions as permissive for select to public
  using ((auth.uid() = user_id));

create policy "Service role can manage deposits" on public.wallet_deposits as permissive for all to public
  using (true)
  with check (true);

create policy "Users can view own deposits" on public.wallet_deposits as permissive for select to public
  using ((auth.uid() = user_id));

create policy "Users can cancel their pending withdrawal requests" on public.withdrawal_requests as permissive for update to public
  using (((auth.uid() = user_id) AND (status = 'pending'::text)));

create policy "Users can create withdrawal requests" on public.withdrawal_requests as permissive for insert to public
  with check ((auth.uid() = user_id));

create policy "Users can view their own withdrawal requests" on public.withdrawal_requests as permissive for select to public
  using ((auth.uid() = user_id));