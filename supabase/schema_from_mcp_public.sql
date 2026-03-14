CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.address_verification_sessions (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
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
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    smile_user_id text,
    archive_id text,
    provider text DEFAULT 'smile'::text,
    verification_result jsonb,
    error_code text,
    error_message text,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT address_verification_sessions_pkey PRIMARY KEY (id),
    CONSTRAINT address_verification_sessions_session_id_key UNIQUE (session_id),
    CONSTRAINT address_verification_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT address_verification_sessions_entity_type_check CHECK (entity_type = ANY (ARRAY['studio'::text, 'gig'::text])),
    CONSTRAINT address_verification_sessions_status_check CHECK (status = ANY (ARRAY['PENDING'::text, 'SUBMITTED'::text, 'PROCESSING'::text, 'ANALYZED'::text, 'VERIFIED'::text, 'APPROVED'::text, 'DECLINED'::text, 'FAILED'::text, 'REVOKED'::text, 'ABANDONED'::text, 'MANUAL_REVIEW'::text, 'PENDING_REVIEW'::text]))
);
CREATE INDEX IF NOT EXISTS idx_address_verification_sessions_archive ON public.address_verification_sessions USING btree (archive_id);
CREATE INDEX IF NOT EXISTS idx_address_verification_sessions_entity ON public.address_verification_sessions USING btree (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_address_verification_sessions_session_id ON public.address_verification_sessions USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_address_verification_sessions_smile_user ON public.address_verification_sessions USING btree (smile_user_id);
CREATE INDEX IF NOT EXISTS idx_address_verification_sessions_user ON public.address_verification_sessions USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.booking_attendance_events (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    booking_id uuid NOT NULL,
    reporter_user_id uuid,
    event_type text NOT NULL,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT booking_attendance_events_pkey PRIMARY KEY (id),
    CONSTRAINT booking_attendance_events_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio_bookings(id) ON DELETE CASCADE,
    CONSTRAINT booking_attendance_events_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
    CONSTRAINT booking_attendance_events_event_type_check CHECK (event_type = ANY (ARRAY['booking_started'::text, 'checked_in'::text, 'late'::text, 'not_attending'::text, 'no_show'::text]))
);
CREATE UNIQUE INDEX booking_attendance_events_unique_report ON public.booking_attendance_events USING btree (booking_id, event_type, COALESCE(reporter_user_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE IF NOT EXISTS public.booking_holds (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL,
    studio_id uuid NOT NULL,
    booking_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT booking_holds_pkey PRIMARY KEY (id),
    CONSTRAINT booking_holds_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    CONSTRAINT booking_holds_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT booking_holds_check CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_booking_holds_expiry ON public.booking_holds USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_booking_holds_studio_date ON public.booking_holds USING btree (studio_id, booking_date);

CREATE TABLE IF NOT EXISTS public.booking_requests (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    sender_id uuid NOT NULL,
    receiver_id uuid,
    group_id uuid,
    message text,
    status text DEFAULT 'pending'::text,
    event_details jsonb,
    attachment_url text,
    studio_id uuid,
    CONSTRAINT booking_requests_pkey PRIMARY KEY (id),
    CONSTRAINT booking_requests_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id),
    CONSTRAINT booking_requests_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id),
    CONSTRAINT booking_requests_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id),
    CONSTRAINT booking_requests_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id)
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text,
    joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    last_read_at timestamp with time zone,
    is_muted boolean DEFAULT false,
    CONSTRAINT conversation_participants_pkey PRIMARY KEY (id),
    CONSTRAINT conversation_participants_conversation_id_user_id_key UNIQUE (conversation_id, user_id),
    CONSTRAINT conversation_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT conversation_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT conversation_participants_role_check CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]))
);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_id ON public.conversation_participants USING btree (conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON public.conversation_participants USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.conversations (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    studio_booking_id uuid,
    gig_application_id uuid,
    gig_id uuid,
    group_id uuid,
    studio_id uuid,
    is_group boolean DEFAULT false,
    CONSTRAINT conversations_pkey PRIMARY KEY (id),
    CONSTRAINT conversations_gig_application_id_fkey FOREIGN KEY (gig_application_id) REFERENCES gig_applications(id) ON DELETE SET NULL,
    CONSTRAINT conversations_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE SET NULL,
    CONSTRAINT conversations_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL,
    CONSTRAINT conversations_studio_booking_id_fkey FOREIGN KEY (studio_booking_id) REFERENCES studio_bookings(id) ON DELETE SET NULL,
    CONSTRAINT conversations_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_group_id_is_group ON public.conversations USING btree (group_id) WHERE (group_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_conversations_is_group ON public.conversations USING btree (is_group) WHERE (is_group = true);

CREATE TABLE IF NOT EXISTS public.email_notifications (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    recipient_email text NOT NULL,
    recipient_name text,
    subject text NOT NULL,
    html_content text,
    text_content text,
    template_type text,
    status text DEFAULT 'pending'::text,
    sent_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT email_notifications_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_email_notifications_status ON public.email_notifications USING btree (status) WHERE (status = 'pending'::text);

CREATE TABLE IF NOT EXISTS public.favorites (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL,
    group_id uuid,
    studio_id uuid,
    gig_id uuid,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT favorites_pkey PRIMARY KEY (id),
    CONSTRAINT favorites_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE,
    CONSTRAINT favorites_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT favorites_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT fav_one_target CHECK (((group_id IS NOT NULL)::integer + (studio_id IS NOT NULL)::integer + (gig_id IS NOT NULL)::integer) = 1)
);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.gig_applications (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    applicant_id uuid NOT NULL,
    group_id uuid,
    gig_id uuid NOT NULL,
    pitch_message text,
    video_url text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
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
    show_on_profile boolean NOT NULL DEFAULT true,
    CONSTRAINT gig_applications_pkey PRIMARY KEY (id),
    CONSTRAINT unique_applicant_per_gig UNIQUE (applicant_id, gig_id),
    CONSTRAINT gig_applications_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT gig_applications_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE,
    CONSTRAINT gig_applications_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT gig_applications_submitted_by_user_id_fkey FOREIGN KEY (submitted_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
    CONSTRAINT gig_applications_leader_approval_status_check CHECK (leader_approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
    CONSTRAINT gig_applications_slot_type_check CHECK (slot_type = ANY (ARRAY['solo'::text, 'duo'::text, 'band'::text])),
    CONSTRAINT gig_applications_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'accepted'::text, 'rejected'::text, 'declined'::text, 'cancelled'::text, 'fired'::text, 'completed'::text]))
);
CREATE INDEX IF NOT EXISTS idx_gig_applications_applicant_id ON public.gig_applications USING btree (applicant_id);
CREATE INDEX IF NOT EXISTS idx_gig_applications_gig_applicant ON public.gig_applications USING btree (gig_id, applicant_id);
CREATE INDEX IF NOT EXISTS idx_gig_applications_gig_id ON public.gig_applications USING btree (gig_id);
CREATE INDEX IF NOT EXISTS idx_gig_applications_group_leader_approval ON public.gig_applications USING btree (group_id, leader_approval_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gig_applications_reconfirm_due ON public.gig_applications USING btree (gig_id, reconfirmation_due_at) WHERE ((status = 'pending'::text) AND (reconfirmation_due_at IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_gig_applications_rejected_at ON public.gig_applications USING btree (gig_id, applicant_id, rejected_at) WHERE (status = 'rejected'::text);
CREATE INDEX IF NOT EXISTS idx_gig_applications_status ON public.gig_applications USING btree (status);
CREATE UNIQUE INDEX idx_gig_applications_unique_group ON public.gig_applications USING btree (gig_id, group_id) WHERE ((group_id IS NOT NULL) AND (status <> 'rejected'::text));

CREATE TABLE IF NOT EXISTS public.gig_availability_slots (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    gig_id uuid NOT NULL,
    day_of_week smallint,
    slot_date date,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_available boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT gig_availability_slots_pkey PRIMARY KEY (id),
    CONSTRAINT gig_availability_slots_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE,
    CONSTRAINT gig_availability_slots_check CHECK (end_time > start_time),
    CONSTRAINT gig_availability_slots_check1 CHECK (day_of_week IS NOT NULL AND day_of_week >= 0 AND day_of_week <= 6 OR slot_date IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_gig_availability_slots_gig_id ON public.gig_availability_slots USING btree (gig_id);

CREATE TABLE IF NOT EXISTS public.gig_deletion_audit (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    gig_id uuid NOT NULL,
    organizer_id uuid,
    deleted_by uuid,
    deleted_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    gig_snapshot jsonb NOT NULL,
    related_counts jsonb NOT NULL,
    applicant_counts jsonb NOT NULL,
    storage_cleanup jsonb,
    reason text,
    CONSTRAINT gig_deletion_audit_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.gig_media (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    gig_id uuid NOT NULL,
    media_type text NOT NULL,
    media_url text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT gig_media_pkey PRIMARY KEY (id),
    CONSTRAINT gig_media_gig_id_media_type_media_url_key UNIQUE (gig_id, media_type, media_url),
    CONSTRAINT gig_media_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE,
    CONSTRAINT gig_media_media_type_check CHECK (media_type = ANY (ARRAY['image'::text, 'document'::text]))
);
CREATE INDEX IF NOT EXISTS idx_gig_media_gig_id ON public.gig_media USING btree (gig_id);

CREATE TABLE IF NOT EXISTS public.gig_requirements (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    gig_id uuid NOT NULL,
    requirement_key text NOT NULL,
    requirement_value jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT gig_requirements_pkey PRIMARY KEY (id),
    CONSTRAINT gig_requirements_gig_id_requirement_key_key UNIQUE (gig_id, requirement_key),
    CONSTRAINT gig_requirements_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_gig_requirements_gig_id ON public.gig_requirements USING btree (gig_id);

CREATE TABLE IF NOT EXISTS public.gig_slot_fill_applicants (
    gig_id uuid NOT NULL,
    slot_type text NOT NULL,
    applicant_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT gig_slot_fill_applicants_pkey PRIMARY KEY (gig_id, slot_type, applicant_id),
    CONSTRAINT gig_slot_fill_applicants_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE,
    CONSTRAINT gig_slot_fill_applicants_slot_type_check CHECK (slot_type = ANY (ARRAY['solo'::text, 'duo'::text, 'band'::text]))
);
CREATE INDEX IF NOT EXISTS idx_gig_slot_fill_applicants_gig_id ON public.gig_slot_fill_applicants USING btree (gig_id);

CREATE TABLE IF NOT EXISTS public.gig_slot_fill_summary (
    gig_id uuid NOT NULL,
    slot_type text NOT NULL,
    accepted_count integer NOT NULL DEFAULT 0,
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT gig_slot_fill_summary_pkey PRIMARY KEY (gig_id, slot_type),
    CONSTRAINT gig_slot_fill_summary_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE,
    CONSTRAINT gig_slot_fill_summary_accepted_count_check CHECK (accepted_count >= 0),
    CONSTRAINT gig_slot_fill_summary_slot_type_check CHECK (slot_type = ANY (ARRAY['solo'::text, 'duo'::text, 'band'::text]))
);

CREATE TABLE IF NOT EXISTS public.gigs (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    organizer_id uuid NOT NULL,
    name text NOT NULL,
    location text,
    budget numeric,
    description text,
    event_date timestamp with time zone,
    status text DEFAULT 'open'::text,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
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
    CONSTRAINT gigs_pkey PRIMARY KEY (id),
    CONSTRAINT gigs_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT gigs_address_verification_status_check CHECK (address_verification_status = ANY (ARRAY['NOT_STARTED'::text, 'PENDING'::text, 'PROCESSING'::text, 'VERIFIED'::text, 'APPROVED'::text, 'DECLINED'::text, 'FAILED'::text, 'ABANDONED'::text, 'MANUAL_REVIEW'::text, 'PENDING_REVIEW'::text])),
    CONSTRAINT gigs_reapplication_cooldown_days_check CHECK (reapplication_cooldown_days >= 0 AND reapplication_cooldown_days <= 365),
    CONSTRAINT gigs_status_check CHECK (status = ANY (ARRAY['open'::text, 'closed'::text, 'cancelled'::text]))
);
CREATE INDEX IF NOT EXISTS idx_gigs_slots_status ON public.gigs USING btree (status) WHERE (status = 'open'::text);

CREATE TABLE IF NOT EXISTS public.group_availability_slots (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL,
    day_of_week smallint,
    slot_date date,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_available boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT group_availability_slots_pkey PRIMARY KEY (id),
    CONSTRAINT group_availability_slots_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT group_availability_slots_check CHECK (end_time > start_time),
    CONSTRAINT group_availability_slots_check1 CHECK (day_of_week IS NOT NULL AND day_of_week >= 0 AND day_of_week <= 6 OR slot_date IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_group_availability_slots_group_id ON public.group_availability_slots USING btree (group_id);

CREATE TABLE IF NOT EXISTS public.group_deletion_audit (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    group_id uuid NOT NULL,
    owner_id uuid,
    deleted_by uuid,
    deleted_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    group_snapshot jsonb NOT NULL,
    related_counts jsonb NOT NULL,
    application_counts jsonb NOT NULL,
    reason text,
    CONSTRAINT group_deletion_audit_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.group_media (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL,
    media_type text NOT NULL DEFAULT 'image'::text,
    media_url text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT group_media_pkey PRIMARY KEY (id),
    CONSTRAINT group_media_group_id_media_type_media_url_key UNIQUE (group_id, media_type, media_url),
    CONSTRAINT group_media_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT group_media_media_type_check CHECK (media_type = 'image'::text)
);
CREATE INDEX IF NOT EXISTS idx_group_media_group_id ON public.group_media USING btree (group_id);

CREATE TABLE IF NOT EXISTS public.group_members (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text,
    joined_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT group_members_pkey PRIMARY KEY (id),
    CONSTRAINT group_members_group_id_user_id_key UNIQUE (group_id, user_id),
    CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT group_members_role_check CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]))
);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON public.group_members USING btree (group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON public.group_members USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.group_roster_members (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL,
    user_id uuid,
    member_name text NOT NULL,
    member_role text,
    instrument text,
    avatar_url text,
    sort_order integer NOT NULL DEFAULT 0,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    raw_member jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT group_roster_members_pkey PRIMARY KEY (id),
    CONSTRAINT group_roster_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT group_roster_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_group_roster_members_group_id ON public.group_roster_members USING btree (group_id);
CREATE INDEX IF NOT EXISTS idx_group_roster_members_user_id ON public.group_roster_members USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.groups (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    owner_id uuid NOT NULL,
    name text NOT NULL,
    genre text,
    description text,
    location text,
    latitude double precision,
    longitude double precision,
    rate numeric,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    embedding vector(384),
    group_type text DEFAULT 'band'::text,
    open_group_applications boolean NOT NULL DEFAULT true,
    CONSTRAINT groups_pkey PRIMARY KEY (id),
    CONSTRAINT groups_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT groups_group_type_check CHECK (group_type = ANY (ARRAY['duo'::text, 'band'::text]))
);

CREATE TABLE IF NOT EXISTS public.leadership_transfer_requests (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    group_id uuid NOT NULL,
    from_user_id uuid NOT NULL,
    to_user_id uuid NOT NULL,
    status text DEFAULT 'pending'::text,
    message text,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    responded_at timestamp with time zone,
    CONSTRAINT leadership_transfer_requests_pkey PRIMARY KEY (id),
    CONSTRAINT leadership_transfer_requests_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT leadership_transfer_requests_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT leadership_transfer_requests_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT leadership_transfer_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'cancelled'::text]))
);
CREATE INDEX IF NOT EXISTS idx_leadership_transfer_from ON public.leadership_transfer_requests USING btree (from_user_id);
CREATE INDEX IF NOT EXISTS idx_leadership_transfer_group ON public.leadership_transfer_requests USING btree (group_id);
CREATE UNIQUE INDEX idx_leadership_transfer_pending ON public.leadership_transfer_requests USING btree (group_id) WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS idx_leadership_transfer_status ON public.leadership_transfer_requests USING btree (status);
CREATE INDEX IF NOT EXISTS idx_leadership_transfer_to ON public.leadership_transfer_requests USING btree (to_user_id);
CREATE INDEX IF NOT EXISTS idx_leadership_transfer_to_user ON public.leadership_transfer_requests USING btree (to_user_id);

CREATE TABLE IF NOT EXISTS public.message_reactions (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT message_reactions_pkey PRIMARY KEY (id),
    CONSTRAINT message_reactions_message_id_user_id_key UNIQUE (message_id, user_id),
    CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON public.message_reactions USING btree (message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user_id ON public.message_reactions USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.messages (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text NOT NULL,
    message_type text DEFAULT 'text'::text,
    attachment_url text,
    read_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT messages_pkey PRIMARY KEY (id),
    CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT messages_message_type_check CHECK (message_type = ANY (ARRAY['text'::text, 'image'::text, 'file'::text, 'system'::text]))
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages USING btree (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages USING btree (sender_id);

CREATE TABLE IF NOT EXISTS public.normalization_exceptions (
    table_name text NOT NULL,
    column_name text NOT NULL,
    rationale text NOT NULL,
    approved_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT normalization_exceptions_pkey PRIMARY KEY (table_name, column_name)
);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
    user_id uuid NOT NULL,
    booking_confirmed boolean NOT NULL DEFAULT true,
    awaiting_confirmation boolean NOT NULL DEFAULT true,
    upload_required boolean NOT NULL DEFAULT false,
    event_reminder boolean NOT NULL DEFAULT true,
    leave_review boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id),
    CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL,
    type text,
    title text NOT NULL,
    message text NOT NULL,
    read boolean DEFAULT false,
    image text,
    meta jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT notifications_pkey PRIMARY KEY (id),
    CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY['success'::text, 'info'::text, 'warning'::text, 'error'::text]))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.payout_methods (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL,
    type text NOT NULL,
    account_name text NOT NULL,
    account_number text NOT NULL,
    bank_name text,
    is_default boolean DEFAULT false,
    is_verified boolean DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT payout_methods_pkey PRIMARY KEY (id),
    CONSTRAINT payout_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT payout_methods_type_check CHECK (type = ANY (ARRAY['bank'::text, 'gcash'::text, 'maya'::text, 'paypal'::text]))
);
CREATE INDEX IF NOT EXISTS idx_payout_methods_user ON public.payout_methods USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.profile_genres (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    profile_id uuid NOT NULL,
    genre text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT profile_genres_pkey PRIMARY KEY (id),
    CONSTRAINT profile_genres_profile_id_genre_key UNIQUE (profile_id, genre),
    CONSTRAINT profile_genres_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_profile_genres_profile_id ON public.profile_genres USING btree (profile_id);

CREATE TABLE IF NOT EXISTS public.profile_portfolio_urls (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    profile_id uuid NOT NULL,
    portfolio_url text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT profile_portfolio_urls_pkey PRIMARY KEY (id),
    CONSTRAINT profile_portfolio_urls_profile_id_portfolio_url_key UNIQUE (profile_id, portfolio_url),
    CONSTRAINT profile_portfolio_urls_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_profile_portfolio_urls_profile_id ON public.profile_portfolio_urls USING btree (profile_id);

CREATE TABLE IF NOT EXISTS public.profile_skills (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    profile_id uuid NOT NULL,
    skill text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT profile_skills_pkey PRIMARY KEY (id),
    CONSTRAINT profile_skills_profile_id_skill_key UNIQUE (profile_id, skill),
    CONSTRAINT profile_skills_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_profile_skills_profile_id ON public.profile_skills USING btree (profile_id);

CREATE TABLE IF NOT EXISTS public.profiles (
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
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    interest_vector vector(384),
    contact_number text,
    address text,
    subscription_status text DEFAULT 'none'::text,
    subscription_expires_at timestamp with time zone,
    resume_url text,
    smile_user_id text,
    subscription_plan_id uuid,
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_email_key UNIQUE (email),
    CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT profiles_subscription_plan_id_fkey FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL,
    CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['musician'::text, 'studio-owner'::text, 'venue-owner'::text])),
    CONSTRAINT profiles_subscription_status_check CHECK (subscription_status = ANY (ARRAY['none'::text, 'active'::text, 'expired'::text, 'cancelled'::text])),
    CONSTRAINT profiles_verification_status_check CHECK (verification_status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'DECLINED'::text, 'ABANDONED'::text, 'PENDING_REVIEW'::text]))
);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles USING btree (email);
CREATE INDEX IF NOT EXISTS idx_profiles_smile_user_id ON public.profiles USING btree (smile_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_verification_status ON public.profiles USING btree (verification_status);

CREATE TABLE IF NOT EXISTS public.reports (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    reporter_id uuid,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    reason text NOT NULL,
    details text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT reports_pkey PRIMARY KEY (id),
    CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE SET NULL,
    CONSTRAINT reports_status_check CHECK (status = ANY (ARRAY['pending'::text, 'resolved'::text, 'dismissed'::text]))
);

CREATE TABLE IF NOT EXISTS public.review_comments (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL,
    review_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT review_comments_pkey PRIMARY KEY (id),
    CONSTRAINT review_comments_review_id_fkey FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
    CONSTRAINT review_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.review_likes (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL,
    review_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT review_likes_pkey PRIMARY KEY (id),
    CONSTRAINT review_likes_user_id_review_id_key UNIQUE (user_id, review_id),
    CONSTRAINT review_likes_review_id_fkey FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
    CONSTRAINT review_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_review_likes_review_id ON public.review_likes USING btree (review_id);

CREATE TABLE IF NOT EXISTS public.reviews (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    author_id uuid NOT NULL,
    group_id uuid,
    studio_id uuid,
    gig_id uuid,
    user_id uuid,
    rating integer NOT NULL,
    content text,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    studio_booking_id uuid,
    gig_application_id uuid,
    CONSTRAINT reviews_pkey PRIMARY KEY (id),
    CONSTRAINT reviews_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT reviews_gig_application_id_fkey FOREIGN KEY (gig_application_id) REFERENCES gig_applications(id) ON DELETE SET NULL,
    CONSTRAINT reviews_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE,
    CONSTRAINT reviews_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    CONSTRAINT reviews_studio_booking_id_fkey FOREIGN KEY (studio_booking_id) REFERENCES studio_bookings(id) ON DELETE SET NULL,
    CONSTRAINT reviews_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    CONSTRAINT reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT one_target_only CHECK (((group_id IS NOT NULL)::integer + (studio_id IS NOT NULL)::integer + (gig_id IS NOT NULL)::integer + (user_id IS NOT NULL)::integer) = 1),
    CONSTRAINT reviews_rating_check CHECK (rating >= 1 AND rating <= 5)
);
CREATE INDEX IF NOT EXISTS idx_reviews_gig_application_id ON public.reviews USING btree (gig_application_id);
CREATE INDEX IF NOT EXISTS idx_reviews_gig_id ON public.reviews USING btree (gig_id);
CREATE INDEX IF NOT EXISTS idx_reviews_group_id ON public.reviews USING btree (group_id);
CREATE INDEX IF NOT EXISTS idx_reviews_studio_booking_id ON public.reviews USING btree (studio_booking_id);
CREATE INDEX IF NOT EXISTS idx_reviews_studio_id ON public.reviews USING btree (studio_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON public.reviews USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.studio_amenities (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    studio_id uuid NOT NULL,
    amenity text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT studio_amenities_pkey PRIMARY KEY (id),
    CONSTRAINT studio_amenities_studio_id_amenity_key UNIQUE (studio_id, amenity),
    CONSTRAINT studio_amenities_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_studio_amenities_studio_id ON public.studio_amenities USING btree (studio_id);

CREATE TABLE IF NOT EXISTS public.studio_availability_slots (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    studio_id uuid NOT NULL,
    day_of_week smallint,
    slot_date date,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_open boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT studio_availability_slots_pkey PRIMARY KEY (id),
    CONSTRAINT studio_availability_slots_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    CONSTRAINT studio_availability_slots_check CHECK (end_time > start_time),
    CONSTRAINT studio_availability_slots_check1 CHECK (day_of_week IS NOT NULL AND day_of_week >= 0 AND day_of_week <= 6 OR slot_date IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_studio_availability_slots_studio_id ON public.studio_availability_slots USING btree (studio_id);

CREATE TABLE IF NOT EXISTS public.studio_booking_slots (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT studio_booking_slots_pkey PRIMARY KEY (id),
    CONSTRAINT studio_booking_slots_booking_id_start_time_end_time_key UNIQUE (booking_id, start_time, end_time),
    CONSTRAINT studio_booking_slots_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio_bookings(id) ON DELETE CASCADE,
    CONSTRAINT studio_booking_slots_time_check CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_studio_booking_slots_booking_id ON public.studio_booking_slots USING btree (booking_id);

CREATE TABLE IF NOT EXISTS public.studio_bookings (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
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
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
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
    CONSTRAINT studio_bookings_pkey PRIMARY KEY (id),
    CONSTRAINT studio_bookings_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    CONSTRAINT studio_bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT studio_bookings_check CHECK (end_time > start_time),
    CONSTRAINT studio_bookings_final_price_check CHECK (final_price >= 0::numeric),
    CONSTRAINT studio_bookings_hours_check CHECK (hours > 0::numeric),
    CONSTRAINT studio_bookings_payment_status_check CHECK (payment_status = ANY (ARRAY['unpaid'::text, 'pending'::text, 'paid'::text, 'partial'::text, 'failed'::text, 'refunded'::text, 'refund_pending'::text])),
    CONSTRAINT studio_bookings_payment_type_check CHECK (payment_type = ANY (ARRAY['full'::text, 'downpayment'::text, 'balance'::text])),
    CONSTRAINT studio_bookings_remaining_balance_check CHECK (remaining_balance >= 0::numeric),
    CONSTRAINT studio_bookings_session_type_check CHECK (session_type = ANY (ARRAY['rehearsal'::text, 'recording'::text])),
    CONSTRAINT studio_bookings_status_check CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text, 'checked_in'::text, 'pending_relocation'::text]))
);
CREATE INDEX IF NOT EXISTS idx_studio_bookings_checkout_session ON public.studio_bookings USING btree (checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_studio_bookings_date_status ON public.studio_bookings USING btree (studio_id, booking_date, status);
CREATE INDEX IF NOT EXISTS idx_studio_bookings_payment_status ON public.studio_bookings USING btree (payment_status);
CREATE INDEX IF NOT EXISTS idx_studio_bookings_studio_id ON public.studio_bookings USING btree (studio_id);
CREATE INDEX IF NOT EXISTS idx_studio_bookings_user_id ON public.studio_bookings USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_studio_bookings_user_studio_status ON public.studio_bookings USING btree (user_id, studio_id, status);
CREATE UNIQUE INDEX idx_unique_pending_studio_booking_per_day ON public.studio_bookings USING btree (user_id, studio_id, booking_date) WHERE (status = 'pending'::text);

CREATE TABLE IF NOT EXISTS public.studio_date_overrides (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    studio_id uuid NOT NULL,
    override_date date NOT NULL,
    is_open boolean NOT NULL DEFAULT false,
    open_time time without time zone,
    close_time time without time zone,
    reason text,
    CONSTRAINT studio_date_overrides_pkey PRIMARY KEY (id),
    CONSTRAINT studio_date_overrides_studio_id_override_date_key UNIQUE (studio_id, override_date),
    CONSTRAINT studio_date_overrides_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    CONSTRAINT studio_date_overrides_check CHECK (is_open = false OR open_time IS NOT NULL AND close_time IS NOT NULL),
    CONSTRAINT studio_date_overrides_check1 CHECK (NOT is_open OR close_time > open_time)
);

CREATE TABLE IF NOT EXISTS public.studio_deletion_audit (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    studio_id uuid NOT NULL,
    owner_id uuid,
    deleted_by uuid,
    deleted_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    studio_snapshot jsonb NOT NULL,
    related_counts jsonb NOT NULL,
    storage_cleanup jsonb,
    reason text,
    CONSTRAINT studio_deletion_audit_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.studio_instruments (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    studio_id uuid NOT NULL,
    instrument_name text NOT NULL,
    image_url text,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT studio_instruments_pkey PRIMARY KEY (id),
    CONSTRAINT studio_instruments_studio_id_instrument_name_image_url_key UNIQUE (studio_id, instrument_name, image_url),
    CONSTRAINT studio_instruments_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_studio_instruments_studio_id ON public.studio_instruments USING btree (studio_id);

CREATE TABLE IF NOT EXISTS public.studio_media (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    studio_id uuid NOT NULL,
    media_type text NOT NULL,
    media_url text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT studio_media_pkey PRIMARY KEY (id),
    CONSTRAINT studio_media_studio_id_media_type_media_url_key UNIQUE (studio_id, media_type, media_url),
    CONSTRAINT studio_media_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    CONSTRAINT studio_media_media_type_check CHECK (media_type = 'image'::text)
);
CREATE INDEX IF NOT EXISTS idx_studio_media_studio_id ON public.studio_media USING btree (studio_id);

CREATE TABLE IF NOT EXISTS public.studio_open_dates (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    studio_id uuid NOT NULL,
    open_date date NOT NULL,
    is_open boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT studio_open_dates_pkey PRIMARY KEY (id),
    CONSTRAINT studio_open_dates_studio_id_open_date_key UNIQUE (studio_id, open_date),
    CONSTRAINT studio_open_dates_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_studio_open_dates_studio_id ON public.studio_open_dates USING btree (studio_id);

CREATE TABLE IF NOT EXISTS public.studio_operating_hours (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    studio_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    is_open boolean NOT NULL DEFAULT true,
    open_time time without time zone,
    close_time time without time zone,
    slot_order integer DEFAULT 0,
    CONSTRAINT studio_operating_hours_pkey PRIMARY KEY (id),
    CONSTRAINT studio_operating_hours_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    CONSTRAINT studio_operating_hours_check CHECK (is_open = false OR open_time IS NOT NULL AND close_time IS NOT NULL),
    CONSTRAINT studio_operating_hours_check1 CHECK (NOT is_open OR close_time > open_time),
    CONSTRAINT studio_operating_hours_day_of_week_check CHECK (day_of_week >= 0 AND day_of_week <= 6)
);
CREATE INDEX IF NOT EXISTS idx_studio_operating_hours_lookup ON public.studio_operating_hours USING btree (studio_id, day_of_week, slot_order);

CREATE TABLE IF NOT EXISTS public.studio_owner_penalties (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    owner_id uuid NOT NULL,
    studio_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    penalty_type text NOT NULL,
    penalty_points integer NOT NULL DEFAULT 1,
    reason text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT studio_owner_penalties_pkey PRIMARY KEY (id),
    CONSTRAINT studio_owner_penalties_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio_bookings(id) ON DELETE CASCADE,
    CONSTRAINT studio_owner_penalties_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT studio_owner_penalties_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
    CONSTRAINT studio_owner_penalties_penalty_points_check CHECK (penalty_points > 0),
    CONSTRAINT studio_owner_penalties_penalty_type_check CHECK (penalty_type = 'forced_relocation_expired'::text)
);
CREATE INDEX IF NOT EXISTS idx_owner_penalties_owner_created ON public.studio_owner_penalties USING btree (owner_id, created_at DESC);
CREATE UNIQUE INDEX idx_owner_penalties_unique_booking_type ON public.studio_owner_penalties USING btree (booking_id, penalty_type);

CREATE TABLE IF NOT EXISTS public.studio_settings (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    studio_id uuid NOT NULL,
    time_zone text NOT NULL DEFAULT 'Asia/Manila'::text,
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
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    peak_season_multiplier numeric DEFAULT 1.0,
    peak_season_dates jsonb DEFAULT '[]'::jsonb,
    off_peak_multiplier numeric DEFAULT 1.0,
    off_peak_dates jsonb DEFAULT '[]'::jsonb,
    holiday_multiplier numeric DEFAULT 1.0,
    CONSTRAINT studio_settings_pkey PRIMARY KEY (id),
    CONSTRAINT studio_settings_studio_id_key UNIQUE (studio_id),
    CONSTRAINT studio_settings_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
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
    CONSTRAINT studio_settings_slot_increment_minutes_check CHECK (slot_increment_minutes = ANY (ARRAY[15, 30, 60])),
    CONSTRAINT studio_settings_weekend_multiplier_check CHECK (weekend_multiplier >= 1.0)
);

CREATE TABLE IF NOT EXISTS public.studio_types (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    studio_id uuid NOT NULL,
    studio_type text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT studio_types_pkey PRIMARY KEY (id),
    CONSTRAINT studio_types_studio_id_studio_type_key UNIQUE (studio_id, studio_type),
    CONSTRAINT studio_types_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_studio_types_studio_id ON public.studio_types USING btree (studio_id);

CREATE TABLE IF NOT EXISTS public.studios (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    owner_id uuid NOT NULL,
    name text NOT NULL,
    address text,
    hourly_rate numeric,
    description text,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
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
    CONSTRAINT studios_pkey PRIMARY KEY (id),
    CONSTRAINT studios_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT studios_address_verification_status_check CHECK (address_verification_status = ANY (ARRAY['NOT_STARTED'::text, 'PENDING'::text, 'PROCESSING'::text, 'VERIFIED'::text, 'APPROVED'::text, 'DECLINED'::text, 'FAILED'::text, 'ABANDONED'::text, 'MANUAL_REVIEW'::text, 'PENDING_REVIEW'::text]))
);

CREATE TABLE IF NOT EXISTS public.subscription_payments (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    subscription_id uuid NOT NULL,
    user_id uuid NOT NULL,
    amount numeric NOT NULL,
    status text NOT NULL DEFAULT 'pending'::text,
    payment_method text,
    payment_intent_id text,
    checkout_session_id text,
    billing_period_start timestamp with time zone NOT NULL,
    billing_period_end timestamp with time zone NOT NULL,
    paid_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT subscription_payments_pkey PRIMARY KEY (id),
    CONSTRAINT subscription_payments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE,
    CONSTRAINT subscription_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT subscription_payments_status_check CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text]))
);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_subscription_id ON public.subscription_payments USING btree (subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_user_id ON public.subscription_payments USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    name text NOT NULL,
    description text,
    price numeric NOT NULL,
    features jsonb DEFAULT '[]'::jsonb,
    duration_days integer DEFAULT 30,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT subscription_plans_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'active'::text,
    current_period_start timestamp with time zone NOT NULL,
    current_period_end timestamp with time zone NOT NULL,
    cancelled_at timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false,
    payment_method text,
    last_payment_date timestamp with time zone,
    last_payment_amount numeric,
    checkout_session_id text,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
    CONSTRAINT unique_active_subscription UNIQUE (user_id),
    CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT subscriptions_status_check CHECK (status = ANY (ARRAY['active'::text, 'cancelled'::text, 'expired'::text, 'pending'::text, 'past_due'::text]))
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON public.subscriptions USING btree (current_period_end);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions USING btree (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions USING btree (user_id);

CREATE TABLE IF NOT EXISTS public.verification_sessions (
    session_ref text NOT NULL,
    verification_data jsonb,
    status text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT verification_sessions_pkey PRIMARY KEY (session_ref)
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    wallet_id uuid NOT NULL,
    amount numeric NOT NULL,
    type text NOT NULL,
    description text,
    reference_id uuid,
    is_credit boolean DEFAULT true,
    status text DEFAULT 'completed'::text,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id),
    CONSTRAINT wallet_transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
    CONSTRAINT wallet_transactions_status_check CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text])),
    CONSTRAINT wallet_transactions_type_check CHECK (type = ANY (ARRAY['deposit'::text, 'withdrawal'::text, 'payment'::text, 'refund'::text, 'earning'::text]))
);

CREATE TABLE IF NOT EXISTS public.wallets (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL,
    balance numeric DEFAULT 0.00,
    currency text DEFAULT 'PHP'::text,
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT wallets_pkey PRIMARY KEY (id),
    CONSTRAINT wallets_user_id_key UNIQUE (user_id),
    CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL,
    wallet_id uuid NOT NULL,
    payout_method_id uuid,
    amount numeric NOT NULL,
    fee numeric DEFAULT 0,
    net_amount numeric NOT NULL,
    status text NOT NULL DEFAULT 'pending'::text,
    payout_type text,
    payout_account_name text,
    payout_account_number text,
    payout_bank_name text,
    reference_number text,
    notes text,
    processed_at timestamp with time zone,
    processed_by uuid,
    failure_reason text,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT withdrawal_requests_pkey PRIMARY KEY (id),
    CONSTRAINT withdrawal_requests_payout_method_id_fkey FOREIGN KEY (payout_method_id) REFERENCES payout_methods(id) ON DELETE SET NULL,
    CONSTRAINT withdrawal_requests_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES profiles(id),
    CONSTRAINT withdrawal_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT withdrawal_requests_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
    CONSTRAINT withdrawal_requests_amount_check CHECK (amount > 0::numeric),
    CONSTRAINT withdrawal_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))
);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON public.withdrawal_requests USING btree (status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user ON public.withdrawal_requests USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_wallet ON public.withdrawal_requests USING btree (wallet_id);

