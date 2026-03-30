-- Live schema dump reconstructed from Supabase MCP

set check_function_bodies = off;


-- Schemas

create schema if not exists auth;

create schema if not exists cron;

create schema if not exists extensions;

create schema if not exists graphql;

create schema if not exists graphql_public;

create schema if not exists net;

create schema if not exists pgbouncer;

create schema if not exists public;

create schema if not exists realtime;

create schema if not exists storage;

create schema if not exists supabase_migrations;

create schema if not exists vault;


-- Extensions

create extension if not exists btree_gist with schema public;

create extension if not exists pg_cron with schema pg_catalog;

create extension if not exists pg_graphql with schema graphql;

create extension if not exists pg_net with schema public;

create extension if not exists pg_stat_statements with schema extensions;

create extension if not exists pgcrypto with schema extensions;

create extension if not exists plpgsql with schema pg_catalog;

create extension if not exists supabase_vault with schema vault;

create extension if not exists "uuid-ossp" with schema extensions;

create extension if not exists vector with schema public;


-- Enum Types

create type auth.aal_level as enum ('aal1', 'aal2', 'aal3');

create type auth.code_challenge_method as enum ('s256', 'plain');

create type auth.factor_status as enum ('unverified', 'verified');

create type auth.factor_type as enum ('totp', 'webauthn', 'phone');

create type auth.oauth_authorization_status as enum ('pending', 'approved', 'denied', 'expired');

create type auth.oauth_client_type as enum ('public', 'confidential');

create type auth.oauth_registration_type as enum ('dynamic', 'manual');

create type auth.oauth_response_type as enum ('code');

create type auth.one_time_token_type as enum ('confirmation_token', 'reauthentication_token', 'recovery_token', 'email_change_token_new', 'email_change_token_current', 'phone_change_token');

create type public.verification_status_enum as enum ('NOT_STARTED', 'PENDING', 'PENDING_REVIEW', 'APPROVED', 'DECLINED', 'ABANDONED');

create type realtime.action as enum ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'ERROR');

create type realtime.equality_op as enum ('eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in');

create type storage.buckettype as enum ('STANDARD', 'ANALYTICS', 'VECTOR');


-- Sequences

create sequence auth.refresh_tokens_id_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;

create sequence realtime.subscription_id_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1 no cycle;


-- Sequence Ownership

alter sequence auth.refresh_tokens_id_seq owned by auth.refresh_tokens.id;

alter sequence net.http_request_queue_id_seq owned by net.http_request_queue.id;


-- Tables

create table if not exists auth.audit_log_entries (
    instance_id uuid,
    id uuid not null,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) default ''::character varying not null\n);

create table if not exists auth.custom_oauth_providers (
    id uuid default gen_random_uuid() not null,
    provider_type text not null,
    identifier text not null,
    name text not null,
    client_id text not null,
    client_secret text not null,
    acceptable_client_ids text[] default '{}'::text[] not null,
    scopes text[] default '{}'::text[] not null,
    pkce_enabled boolean default true not null,
    attribute_mapping jsonb default '{}'::jsonb not null,
    authorization_params jsonb default '{}'::jsonb not null,
    enabled boolean default true not null,
    email_optional boolean default false not null,
    issuer text,
    discovery_url text,
    skip_nonce_check boolean default false not null,
    cached_discovery jsonb,
    discovery_cached_at timestamp with time zone,
    authorization_url text,
    token_url text,
    userinfo_url text,
    jwks_uri text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null\n);

create table if not exists auth.flow_state (
    id uuid not null,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text not null,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text not null,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean default false not null\n);

create table if not exists auth.identities (
    provider_id text not null,
    user_id uuid not null,
    identity_data jsonb not null,
    provider text not null,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text generated always as (lower((identity_data ->> 'email'::text))) stored,
    id uuid default gen_random_uuid() not null\n);

create table if not exists auth.instances (
    id uuid not null,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone\n);

create table if not exists auth.mfa_amr_claims (
    session_id uuid not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    authentication_method text not null,
    id uuid not null\n);

create table if not exists auth.mfa_challenges (
    id uuid not null,
    factor_id uuid not null,
    created_at timestamp with time zone not null,
    verified_at timestamp with time zone,
    ip_address inet not null,
    otp_code text,
    web_authn_session_data jsonb\n);

create table if not exists auth.mfa_factors (
    id uuid not null,
    user_id uuid not null,
    friendly_name text,
    factor_type auth.factor_type not null,
    status auth.factor_status not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb\n);

create table if not exists auth.oauth_authorizations (
    id uuid not null,
    authorization_id text not null,
    client_id uuid not null,
    user_id uuid,
    redirect_uri text not null,
    scope text not null,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type default 'code'::auth.oauth_response_type not null,
    status auth.oauth_authorization_status default 'pending'::auth.oauth_authorization_status not null,
    authorization_code text,
    created_at timestamp with time zone default now() not null,
    expires_at timestamp with time zone default (now() + '00:03:00'::interval) not null,
    approved_at timestamp with time zone,
    nonce text\n);

create table if not exists auth.oauth_client_states (
    id uuid not null,
    provider_type text not null,
    code_verifier text,
    created_at timestamp with time zone not null\n);

create table if not exists auth.oauth_clients (
    id uuid not null,
    client_secret_hash text,
    registration_type auth.oauth_registration_type not null,
    redirect_uris text not null,
    grant_types text not null,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type default 'confidential'::auth.oauth_client_type not null,
    token_endpoint_auth_method text not null\n);

create table if not exists auth.oauth_consents (
    id uuid not null,
    user_id uuid not null,
    client_id uuid not null,
    scopes text not null,
    granted_at timestamp with time zone default now() not null,
    revoked_at timestamp with time zone\n);

create table if not exists auth.one_time_tokens (
    id uuid not null,
    user_id uuid not null,
    token_type auth.one_time_token_type not null,
    token_hash text not null,
    relates_to text not null,
    created_at timestamp without time zone default now() not null,
    updated_at timestamp without time zone default now() not null\n);

create table if not exists auth.refresh_tokens (
    instance_id uuid,
    id bigint default nextval('auth.refresh_tokens_id_seq'::regclass) not null,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid\n);

create table if not exists auth.saml_providers (
    id uuid not null,
    sso_provider_id uuid not null,
    entity_id text not null,
    metadata_xml text not null,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text\n);

create table if not exists auth.saml_relay_states (
    id uuid not null,
    sso_provider_id uuid not null,
    request_id text not null,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid\n);

create table if not exists auth.schema_migrations (
    version character varying(255) not null\n);

create table if not exists auth.sessions (
    id uuid not null,
    user_id uuid not null,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    factor_id uuid,
    aal auth.aal_level,
    not_after timestamp with time zone,
    refreshed_at timestamp without time zone,
    user_agent text,
    ip inet,
    tag text,
    oauth_client_id uuid,
    refresh_token_hmac_key text,
    refresh_token_counter bigint,
    scopes text\n);

create table if not exists auth.sso_domains (
    id uuid not null,
    sso_provider_id uuid not null,
    domain text not null,
    created_at timestamp with time zone,
    updated_at timestamp with time zone\n);

create table if not exists auth.sso_providers (
    id uuid not null,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean\n);

create table if not exists auth.users (
    instance_id uuid,
    id uuid not null,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    email_confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token_new character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    phone text default NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text default ''::character varying,
    phone_change_token character varying(255) default ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone generated always as (LEAST(email_confirmed_at, phone_confirmed_at)) stored,
    email_change_token_current character varying(255) default ''::character varying,
    email_change_confirm_status smallint default 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) default ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean default false not null,
    deleted_at timestamp with time zone,
    is_anonymous boolean default false not null\n);

create table if not exists auth.webauthn_challenges (
    id uuid default gen_random_uuid() not null,
    user_id uuid,
    challenge_type text not null,
    session_data jsonb not null,
    created_at timestamp with time zone default now() not null,
    expires_at timestamp with time zone not null\n);

create table if not exists auth.webauthn_credentials (
    id uuid default gen_random_uuid() not null,
    user_id uuid not null,
    credential_id bytea not null,
    public_key bytea not null,
    attestation_type text default ''::text not null,
    aaguid uuid,
    sign_count bigint default 0 not null,
    transports jsonb default '[]'::jsonb not null,
    backup_eligible boolean default false not null,
    backed_up boolean default false not null,
    friendly_name text default ''::text not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    last_used_at timestamp with time zone\n);

create table if not exists public.address_verification_sessions (
    id uuid default uuid_generate_v4() not null,
    session_id text not null,
    user_id uuid not null,
    entity_type text not null,
    entity_id uuid,
    expected_address text,
    expected_name text,
    extracted_address text,
    extracted_name text,
    issuer text,
    issue_date text,
    name_matches boolean,
    address_matches boolean,
    status text default 'PENDING'::text,
    notes text,
    verified_at timestamp with time zone,
    raw_response jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    smile_user_id text,
    archive_id text,
    provider text default 'smile'::text,
    verification_result jsonb,
    error_code text,
    error_message text,
    updated_at timestamp with time zone default timezone('utc'::text, now())\n);

create table if not exists public.booking_attendance_events (
    id uuid default uuid_generate_v4() not null,
    booking_id uuid not null,
    reporter_user_id uuid,
    event_type text not null,
    notes text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.booking_holds (
    id uuid default uuid_generate_v4() not null,
    user_id uuid not null,
    studio_id uuid not null,
    booking_date date not null,
    start_time time without time zone not null,
    end_time time without time zone not null,
    expires_at timestamp with time zone not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.booking_requests (
    id uuid default gen_random_uuid() not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    sender_id uuid not null,
    receiver_id uuid,
    group_id uuid,
    message text,
    status text default 'pending'::text,
    event_details jsonb,
    attachment_url text,
    studio_id uuid\n);

create table if not exists public.conversation_participants (
    id uuid default uuid_generate_v4() not null,
    conversation_id uuid not null,
    user_id uuid not null,
    role text default 'member'::text,
    joined_at timestamp with time zone default timezone('utc'::text, now()),
    last_read_at timestamp with time zone,
    is_muted boolean default false\n);

create table if not exists public.conversations (
    id uuid default uuid_generate_v4() not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    studio_booking_id uuid,
    gig_application_id uuid,
    gig_id uuid,
    group_id uuid,
    studio_id uuid,
    is_group boolean default false\n);

create table if not exists public.email_notifications (
    id uuid default gen_random_uuid() not null,
    recipient_email text not null,
    recipient_name text,
    subject text not null,
    html_content text,
    text_content text,
    template_type text,
    status text default 'pending'::text,
    sent_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone default now()\n);

create table if not exists public.favorites (
    id uuid default uuid_generate_v4() not null,
    user_id uuid not null,
    group_id uuid,
    studio_id uuid,
    gig_id uuid,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.gig_applications (
    id uuid default uuid_generate_v4() not null,
    applicant_id uuid not null,
    group_id uuid,
    gig_id uuid not null,
    pitch_message text,
    video_url text,
    status text default 'pending'::text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    reviewed_by_applicant boolean default false,
    reviewed_by_organizer boolean default false,
    cancellation_reason text,
    note text,
    cv_url text,
    is_solo_application boolean default false,
    rejected_at timestamp with time zone,
    slot_type text,
    submitted_by_user_id uuid,
    leader_approval_status text,
    leader_reviewed_at timestamp with time zone,
    reconfirmation_required_at timestamp with time zone,
    reconfirmation_due_at timestamp with time zone,
    system_status_reason text,
    show_on_profile boolean default true not null\n);

create table if not exists public.gig_availability_slots (
    id uuid default uuid_generate_v4() not null,
    gig_id uuid not null,
    day_of_week smallint,
    slot_date date,
    start_time time without time zone not null,
    end_time time without time zone not null,
    is_available boolean default true not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.gig_deletion_audit (
    id uuid default uuid_generate_v4() not null,
    gig_id uuid not null,
    organizer_id uuid,
    deleted_by uuid,
    deleted_at timestamp with time zone default timezone('utc'::text, now()) not null,
    gig_snapshot jsonb not null,
    related_counts jsonb not null,
    applicant_counts jsonb not null,
    storage_cleanup jsonb,
    reason text\n);

create table if not exists public.gig_media (
    id uuid default uuid_generate_v4() not null,
    gig_id uuid not null,
    media_type text not null,
    media_url text not null,
    sort_order integer default 0 not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.gig_requirements (
    id uuid default uuid_generate_v4() not null,
    gig_id uuid not null,
    requirement_key text not null,
    requirement_value jsonb not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.gig_slot_fill_applicants (
    gig_id uuid not null,
    slot_type text not null,
    applicant_id uuid not null,
    created_at timestamp with time zone default now() not null\n);

create table if not exists public.gig_slot_fill_summary (
    gig_id uuid not null,
    slot_type text not null,
    accepted_count integer default 0 not null,
    updated_at timestamp with time zone default now() not null\n);

create table if not exists public.gigs (
    id uuid default uuid_generate_v4() not null,
    organizer_id uuid not null,
    name text not null,
    location text,
    budget numeric,
    description text,
    event_date timestamp with time zone,
    status text default 'open'::text,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    embedding vector(384),
    rate numeric,
    contract_url text,
    address_verification_status text default 'NOT_STARTED'::text,
    address_verification_session_id text,
    address_verified_at timestamp with time zone,
    verified_address text,
    address_verification_completed_at timestamp with time zone,
    business_permit_url text,
    reapplication_cooldown_days integer default 30,
    total_slots_filled integer default 0\n);

create table if not exists public.group_availability_slots (
    id uuid default gen_random_uuid() not null,
    group_id uuid not null,
    day_of_week smallint,
    slot_date date,
    start_time time without time zone not null,
    end_time time without time zone not null,
    is_available boolean default true not null,
    created_at timestamp with time zone default now() not null\n);

create table if not exists public.group_deletion_audit (
    id uuid default uuid_generate_v4() not null,
    group_id uuid not null,
    owner_id uuid,
    deleted_by uuid,
    deleted_at timestamp with time zone default timezone('utc'::text, now()) not null,
    group_snapshot jsonb not null,
    related_counts jsonb not null,
    application_counts jsonb not null,
    reason text\n);

create table if not exists public.group_media (
    id uuid default gen_random_uuid() not null,
    group_id uuid not null,
    media_type text default 'image'::text not null,
    media_url text not null,
    sort_order integer default 0 not null,
    created_at timestamp with time zone default now() not null\n);

create table if not exists public.group_members (
    id uuid default uuid_generate_v4() not null,
    group_id uuid not null,
    user_id uuid not null,
    role text default 'member'::text,
    joined_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.group_roster_members (
    id uuid default gen_random_uuid() not null,
    group_id uuid not null,
    user_id uuid,
    member_name text not null,
    member_role text,
    instrument text,
    avatar_url text,
    sort_order integer default 0 not null,
    metadata jsonb default '{}'::jsonb not null,
    created_at timestamp with time zone default now() not null,
    raw_member jsonb default '{}'::jsonb\n);

create table if not exists public.groups (
    id uuid default uuid_generate_v4() not null,
    owner_id uuid not null,
    name text not null,
    genre text,
    description text,
    location text,
    latitude double precision,
    longitude double precision,
    rate numeric,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    embedding vector(384),
    group_type text default 'band'::text,
    open_group_applications boolean default true not null\n);

create table if not exists public.leadership_transfer_requests (
    id uuid default uuid_generate_v4() not null,
    group_id uuid not null,
    from_user_id uuid not null,
    to_user_id uuid not null,
    status text default 'pending'::text,
    message text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    responded_at timestamp with time zone\n);

create table if not exists public.message_reactions (
    id uuid default uuid_generate_v4() not null,
    message_id uuid not null,
    user_id uuid not null,
    emoji text not null,
    created_at timestamp with time zone default timezone('utc'::text, now())\n);

create table if not exists public.messages (
    id uuid default uuid_generate_v4() not null,
    conversation_id uuid not null,
    sender_id uuid not null,
    content text not null,
    message_type text default 'text'::text,
    attachment_url text,
    read_at timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.normalization_exceptions (
    table_name text not null,
    column_name text not null,
    rationale text not null,
    approved_at timestamp with time zone default now() not null,
    approved_by_user_id uuid\n);

create table if not exists public.notification_preferences (
    user_id uuid not null,
    booking_confirmed boolean default true not null,
    awaiting_confirmation boolean default true not null,
    upload_required boolean default false not null,
    event_reminder boolean default true not null,
    leave_review boolean default false not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null\n);

create table if not exists public.notifications (
    id uuid default uuid_generate_v4() not null,
    user_id uuid not null,
    type text,
    title text not null,
    message text not null,
    read boolean default false,
    image text,
    meta jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.payout_methods (
    id uuid default uuid_generate_v4() not null,
    user_id uuid not null,
    type text not null,
    account_name text not null,
    account_number text not null,
    bank_name text,
    is_default boolean default false,
    is_verified boolean default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.profile_genres (
    id uuid default uuid_generate_v4() not null,
    profile_id uuid not null,
    genre text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.profile_portfolio_urls (
    id uuid default uuid_generate_v4() not null,
    profile_id uuid not null,
    portfolio_url text not null,
    sort_order integer default 0 not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.profile_skills (
    id uuid default uuid_generate_v4() not null,
    profile_id uuid not null,
    skill text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.profiles (
    id uuid not null,
    email text not null,
    full_name text,
    avatar_url text,
    role text not null,
    bio text,
    location text,
    is_verified boolean default false,
    verification_status text,
    didit_session_id text,
    id_document_expiry date,
    id_verified_at timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    interest_vector vector(384),
    contact_number text,
    address text,
    subscription_status text default 'none'::text,
    subscription_expires_at timestamp with time zone,
    resume_url text,
    smile_user_id text,
    subscription_plan_id uuid\n);

create table if not exists public.reports (
    id uuid default uuid_generate_v4() not null,
    reporter_id uuid,
    target_type text not null,
    target_id uuid not null,
    reason text not null,
    details text,
    status text default 'pending'::text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.review_comments (
    id uuid default uuid_generate_v4() not null,
    user_id uuid not null,
    review_id uuid not null,
    content text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.review_likes (
    id uuid default uuid_generate_v4() not null,
    user_id uuid not null,
    review_id uuid not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.reviews (
    id uuid default uuid_generate_v4() not null,
    author_id uuid not null,
    group_id uuid,
    studio_id uuid,
    gig_id uuid,
    user_id uuid,
    rating integer not null,
    content text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    studio_booking_id uuid,
    gig_application_id uuid\n);

create table if not exists public.studio_amenities (
    id uuid default uuid_generate_v4() not null,
    studio_id uuid not null,
    amenity text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.studio_availability_slots (
    id uuid default uuid_generate_v4() not null,
    studio_id uuid not null,
    day_of_week smallint,
    slot_date date,
    start_time time without time zone not null,
    end_time time without time zone not null,
    is_open boolean default true not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.studio_booking_slots (
    id uuid default gen_random_uuid() not null,
    booking_id uuid not null,
    start_time time without time zone not null,
    end_time time without time zone not null,
    sort_order integer default 0 not null,
    created_at timestamp with time zone default now() not null\n);

create table if not exists public.studio_bookings (
    id uuid default uuid_generate_v4() not null,
    user_id uuid not null,
    studio_id uuid not null,
    booking_date date not null,
    start_time time without time zone not null,
    end_time time without time zone not null,
    base_rate numeric not null,
    hours numeric not null,
    subtotal numeric not null,
    modifiers_applied jsonb default '{}'::jsonb,
    final_price numeric not null,
    notes text,
    status text default 'pending'::text,
    buffer_minutes integer default 30,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    proof_url text,
    reviewed_by_customer boolean default false,
    reviewed_by_owner boolean default false,
    cancellation_reason text,
    check_in_time timestamp with time zone,
    payment_status text default 'unpaid'::text,
    payment_intent_id text,
    checkout_session_id text,
    payment_method text,
    paid_at timestamp with time zone,
    payment_amount numeric,
    refund_amount numeric(10,2),
    refund_id text,
    refunded_at timestamp with time zone,
    payment_type text default 'full'::text,
    remaining_balance numeric default 0,
    session_type text,
    relocation_requested_at timestamp with time zone,
    relocation_expires_at timestamp with time zone,
    relocation_proposed_date date,
    relocation_proposed_start_time time without time zone,
    relocation_proposed_end_time time without time zone\n);

create table if not exists public.studio_date_overrides (
    id uuid default uuid_generate_v4() not null,
    studio_id uuid not null,
    override_date date not null,
    is_open boolean default false not null,
    open_time time without time zone,
    close_time time without time zone,
    reason text\n);

create table if not exists public.studio_deletion_audit (
    id uuid default uuid_generate_v4() not null,
    studio_id uuid not null,
    owner_id uuid,
    deleted_by uuid,
    deleted_at timestamp with time zone default timezone('utc'::text, now()) not null,
    studio_snapshot jsonb not null,
    related_counts jsonb not null,
    storage_cleanup jsonb,
    reason text\n);

create table if not exists public.studio_instruments (
    id uuid default uuid_generate_v4() not null,
    studio_id uuid not null,
    instrument_name text not null,
    image_url text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.studio_media (
    id uuid default uuid_generate_v4() not null,
    studio_id uuid not null,
    media_type text not null,
    media_url text not null,
    sort_order integer default 0 not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.studio_open_dates (
    id uuid default uuid_generate_v4() not null,
    studio_id uuid not null,
    open_date date not null,
    is_open boolean default true not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.studio_operating_hours (
    id uuid default uuid_generate_v4() not null,
    studio_id uuid not null,
    day_of_week integer not null,
    is_open boolean default true not null,
    open_time time without time zone,
    close_time time without time zone,
    slot_order integer default 0\n);

create table if not exists public.studio_owner_penalties (
    id uuid default uuid_generate_v4() not null,
    owner_id uuid not null,
    studio_id uuid not null,
    booking_id uuid not null,
    penalty_type text not null,
    penalty_points integer default 1 not null,
    reason text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.studio_promotions (
    id uuid default gen_random_uuid() not null,
    studio_id uuid not null,
    name text not null,
    description text,
    discount_type text not null,
    discount_value numeric(10,2) not null,
    is_permanent boolean default false not null,
    start_date date,
    end_date date,
    applies_to text default 'both'::text not null,
    is_active boolean default true not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null\n);

create table if not exists public.studio_settings (
    id uuid default uuid_generate_v4() not null,
    studio_id uuid not null,
    time_zone text default 'Asia/Manila'::text not null,
    slot_increment_minutes integer default 30,
    min_booking_duration_hours numeric default 2.0,
    max_booking_duration_hours numeric default 12.0,
    buffer_minutes integer default 30,
    lead_time_hours integer default 24,
    booking_horizon_days integer default 90,
    weekend_multiplier numeric default 1.0,
    late_night_multiplier numeric default 1.0,
    bulk_discount_threshold_hours integer default 10,
    bulk_discount_percentage numeric default 0,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    peak_season_multiplier numeric default 1.0,
    peak_season_dates jsonb default '[]'::jsonb,
    off_peak_multiplier numeric default 1.0,
    off_peak_dates jsonb default '[]'::jsonb,
    holiday_multiplier numeric default 1.0\n);

create table if not exists public.studio_types (
    id uuid default uuid_generate_v4() not null,
    studio_id uuid not null,
    studio_type text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.studios (
    id uuid default uuid_generate_v4() not null,
    owner_id uuid not null,
    name text not null,
    address text,
    hourly_rate numeric,
    description text,
    latitude double precision,
    longitude double precision,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    embedding vector(384),
    rate numeric,
    contract_url text,
    rehearsal_rate numeric,
    recording_rate numeric,
    pax integer,
    address_verification_status text default 'NOT_STARTED'::text,
    address_verification_session_id text,
    address_verified_at timestamp with time zone,
    verified_address text,
    address_verification_completed_at timestamp with time zone,
    business_permit_url text\n);

create table if not exists public.subscription_payments (
    id uuid default uuid_generate_v4() not null,
    subscription_id uuid not null,
    user_id uuid not null,
    amount numeric not null,
    status text default 'pending'::text not null,
    payment_method text,
    payment_intent_id text,
    checkout_session_id text,
    billing_period_start timestamp with time zone not null,
    billing_period_end timestamp with time zone not null,
    paid_at timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.subscription_plans (
    id uuid default uuid_generate_v4() not null,
    name text not null,
    description text,
    price numeric not null,
    features jsonb default '[]'::jsonb,
    duration_days integer default 30,
    is_active boolean default true,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.subscriptions (
    id uuid default uuid_generate_v4() not null,
    user_id uuid not null,
    plan_id uuid not null,
    status text default 'active'::text not null,
    current_period_start timestamp with time zone not null,
    current_period_end timestamp with time zone not null,
    cancelled_at timestamp with time zone,
    cancel_at_period_end boolean default false,
    payment_method text,
    last_payment_date timestamp with time zone,
    last_payment_amount numeric,
    checkout_session_id text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.verification_sessions (
    session_ref text not null,
    verification_data jsonb,
    status text,
    created_at timestamp with time zone default now()\n);

create table if not exists public.wallet_transactions (
    id uuid default uuid_generate_v4() not null,
    wallet_id uuid not null,
    amount numeric not null,
    type text not null,
    description text,
    reference_id uuid,
    is_credit boolean default true,
    status text default 'completed'::text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.wallets (
    id uuid default uuid_generate_v4() not null,
    user_id uuid not null,
    balance numeric default 0.00,
    currency text default 'PHP'::text,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists public.withdrawal_requests (
    id uuid default uuid_generate_v4() not null,
    user_id uuid not null,
    wallet_id uuid not null,
    payout_method_id uuid,
    amount numeric not null,
    fee numeric default 0,
    net_amount numeric not null,
    status text default 'pending'::text not null,
    payout_type text,
    payout_account_name text,
    payout_account_number text,
    payout_bank_name text,
    reference_number text,
    notes text,
    processed_at timestamp with time zone,
    processed_by uuid,
    failure_reason text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null\n);

create table if not exists realtime.messages (
    topic text not null,
    extension text not null,
    payload jsonb,
    event text,
    private boolean default false,
    updated_at timestamp without time zone default now() not null,
    inserted_at timestamp without time zone default now() not null,
    id uuid default gen_random_uuid() not null\n)
partition by RANGE (inserted_at);

create table if not exists realtime.messages_2026_03_22 (
    topic text not null,
    extension text not null,
    payload jsonb,
    event text,
    private boolean default false,
    updated_at timestamp without time zone default now() not null,
    inserted_at timestamp without time zone default now() not null,
    id uuid default gen_random_uuid() not null\n);

create table if not exists realtime.messages_2026_03_23 (
    topic text not null,
    extension text not null,
    payload jsonb,
    event text,
    private boolean default false,
    updated_at timestamp without time zone default now() not null,
    inserted_at timestamp without time zone default now() not null,
    id uuid default gen_random_uuid() not null\n);

create table if not exists realtime.messages_2026_03_24 (
    topic text not null,
    extension text not null,
    payload jsonb,
    event text,
    private boolean default false,
    updated_at timestamp without time zone default now() not null,
    inserted_at timestamp without time zone default now() not null,
    id uuid default gen_random_uuid() not null\n);

create table if not exists realtime.messages_2026_03_25 (
    topic text not null,
    extension text not null,
    payload jsonb,
    event text,
    private boolean default false,
    updated_at timestamp without time zone default now() not null,
    inserted_at timestamp without time zone default now() not null,
    id uuid default gen_random_uuid() not null\n);

create table if not exists realtime.messages_2026_03_26 (
    topic text not null,
    extension text not null,
    payload jsonb,
    event text,
    private boolean default false,
    updated_at timestamp without time zone default now() not null,
    inserted_at timestamp without time zone default now() not null,
    id uuid default gen_random_uuid() not null\n);

create table if not exists realtime.messages_2026_03_27 (
    topic text not null,
    extension text not null,
    payload jsonb,
    event text,
    private boolean default false,
    updated_at timestamp without time zone default now() not null,
    inserted_at timestamp without time zone default now() not null,
    id uuid default gen_random_uuid() not null\n);

create table if not exists realtime.messages_2026_03_28 (
    topic text not null,
    extension text not null,
    payload jsonb,
    event text,
    private boolean default false,
    updated_at timestamp without time zone default now() not null,
    inserted_at timestamp without time zone default now() not null,
    id uuid default gen_random_uuid() not null\n);

create table if not exists realtime.schema_migrations (
    version bigint not null,
    inserted_at timestamp(0) without time zone\n);

create table if not exists realtime.subscription (
    id bigint generated always as identity not null,
    subscription_id uuid not null,
    entity regclass not null,
    filters realtime.user_defined_filter[] default '{}'::realtime.user_defined_filter[] not null,
    claims jsonb not null,
    claims_role regrole generated always as (realtime.to_regrole((claims ->> 'role'::text))) stored not null,
    created_at timestamp without time zone default timezone('utc'::text, now()) not null,
    action_filter text default '*'::text\n);

create table if not exists storage.buckets (
    id text not null,
    name text not null,
    owner uuid,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    public boolean default false,
    avif_autodetection boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype default 'STANDARD'::storage.buckettype not null\n);

create table if not exists storage.buckets_analytics (
    name text not null,
    type storage.buckettype default 'ANALYTICS'::storage.buckettype not null,
    format text default 'ICEBERG'::text not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null,
    id uuid default gen_random_uuid() not null,
    deleted_at timestamp with time zone\n);

create table if not exists storage.buckets_vectors (
    id text not null,
    type storage.buckettype default 'VECTOR'::storage.buckettype not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null\n);

create table if not exists storage.migrations (
    id integer not null,
    name character varying(100) not null,
    hash character varying(40) not null,
    executed_at timestamp without time zone default CURRENT_TIMESTAMP\n);

create table if not exists storage.objects (
    id uuid default gen_random_uuid() not null,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    last_accessed_at timestamp with time zone default now(),
    metadata jsonb,
    path_tokens text[] generated always as (string_to_array(name, '/'::text)) stored,
    version text,
    owner_id text,
    user_metadata jsonb\n);

create table if not exists storage.s3_multipart_uploads (
    id text not null,
    in_progress_size bigint default 0 not null,
    upload_signature text not null,
    bucket_id text not null,
    key text collate pg_catalog."C" not null,
    version text not null,
    owner_id text,
    created_at timestamp with time zone default now() not null,
    user_metadata jsonb\n);

create table if not exists storage.s3_multipart_uploads_parts (
    id uuid default gen_random_uuid() not null,
    upload_id text not null,
    size bigint default 0 not null,
    part_number integer not null,
    bucket_id text not null,
    key text collate pg_catalog."C" not null,
    etag text not null,
    owner_id text,
    version text not null,
    created_at timestamp with time zone default now() not null\n);

create table if not exists storage.vector_indexes (
    id text default gen_random_uuid() not null,
    name text collate pg_catalog."C" not null,
    bucket_id text not null,
    data_type text not null,
    dimension integer not null,
    distance_metric text not null,
    metadata_configuration jsonb,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null\n);

create table if not exists supabase_migrations.schema_migrations (
    version text not null,
    statements text[],
    name text,
    created_by text,
    idempotency_key text,
    rollback text[]\n);


-- Table Constraints

alter table only auth.audit_log_entries add constraint audit_log_entries_pkey PRIMARY KEY (id);

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_authorization_url_https CHECK (authorization_url IS NULL OR authorization_url ~~ 'https://%'::text);

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_authorization_url_length CHECK (authorization_url IS NULL OR char_length(authorization_url) <= 2048);

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_client_id_length CHECK (char_length(client_id) >= 1 AND char_length(client_id) <= 512);

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_discovery_url_length CHECK (discovery_url IS NULL OR char_length(discovery_url) <= 2048);

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_identifier_format CHECK (identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text);

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_identifier_key UNIQUE (identifier);

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_issuer_length CHECK (issuer IS NULL OR char_length(issuer) >= 1 AND char_length(issuer) <= 2048);

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_jwks_uri_https CHECK (jwks_uri IS NULL OR jwks_uri ~~ 'https://%'::text);

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_jwks_uri_length CHECK (jwks_uri IS NULL OR char_length(jwks_uri) <= 2048);

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 100);

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_oauth2_requires_endpoints CHECK (provider_type <> 'oauth2'::text OR authorization_url IS NOT NULL AND token_url IS NOT NULL AND userinfo_url IS NOT NULL);

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_oidc_discovery_url_https CHECK (provider_type <> 'oidc'::text OR discovery_url IS NULL OR discovery_url ~~ 'https://%'::text);

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_oidc_issuer_https CHECK (provider_type <> 'oidc'::text OR issuer IS NULL OR issuer ~~ 'https://%'::text);

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_oidc_requires_issuer CHECK (provider_type <> 'oidc'::text OR issuer IS NOT NULL);

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_pkey PRIMARY KEY (id);

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_provider_type_check CHECK (provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]));

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_token_url_https CHECK (token_url IS NULL OR token_url ~~ 'https://%'::text);

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_token_url_length CHECK (token_url IS NULL OR char_length(token_url) <= 2048);

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_userinfo_url_https CHECK (userinfo_url IS NULL OR userinfo_url ~~ 'https://%'::text);

alter table only auth.custom_oauth_providers add constraint custom_oauth_providers_userinfo_url_length CHECK (userinfo_url IS NULL OR char_length(userinfo_url) <= 2048);

alter table only auth.flow_state add constraint flow_state_pkey PRIMARY KEY (id);

alter table only auth.identities add constraint identities_pkey PRIMARY KEY (id);

alter table only auth.identities add constraint identities_provider_id_provider_unique UNIQUE (provider_id, provider);

alter table only auth.identities add constraint identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table only auth.instances add constraint instances_pkey PRIMARY KEY (id);

alter table only auth.mfa_amr_claims add constraint amr_id_pk PRIMARY KEY (id);

alter table only auth.mfa_amr_claims add constraint mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);

alter table only auth.mfa_amr_claims add constraint mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;

alter table only auth.mfa_challenges add constraint mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;

alter table only auth.mfa_challenges add constraint mfa_challenges_pkey PRIMARY KEY (id);

alter table only auth.mfa_factors add constraint mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);

alter table only auth.mfa_factors add constraint mfa_factors_pkey PRIMARY KEY (id);

alter table only auth.mfa_factors add constraint mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table only auth.oauth_authorizations add constraint oauth_authorizations_authorization_code_key UNIQUE (authorization_code);

alter table only auth.oauth_authorizations add constraint oauth_authorizations_authorization_code_length CHECK (char_length(authorization_code) <= 255);

alter table only auth.oauth_authorizations add constraint oauth_authorizations_authorization_id_key UNIQUE (authorization_id);

alter table only auth.oauth_authorizations add constraint oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;

alter table only auth.oauth_authorizations add constraint oauth_authorizations_code_challenge_length CHECK (char_length(code_challenge) <= 128);

alter table only auth.oauth_authorizations add constraint oauth_authorizations_expires_at_future CHECK (expires_at > created_at);

alter table only auth.oauth_authorizations add constraint oauth_authorizations_nonce_length CHECK (char_length(nonce) <= 255);

alter table only auth.oauth_authorizations add constraint oauth_authorizations_pkey PRIMARY KEY (id);

alter table only auth.oauth_authorizations add constraint oauth_authorizations_redirect_uri_length CHECK (char_length(redirect_uri) <= 2048);

alter table only auth.oauth_authorizations add constraint oauth_authorizations_resource_length CHECK (char_length(resource) <= 2048);

alter table only auth.oauth_authorizations add constraint oauth_authorizations_scope_length CHECK (char_length(scope) <= 4096);

alter table only auth.oauth_authorizations add constraint oauth_authorizations_state_length CHECK (char_length(state) <= 4096);

alter table only auth.oauth_authorizations add constraint oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table only auth.oauth_client_states add constraint oauth_client_states_pkey PRIMARY KEY (id);

alter table only auth.oauth_clients add constraint oauth_clients_client_name_length CHECK (char_length(client_name) <= 1024);

alter table only auth.oauth_clients add constraint oauth_clients_client_uri_length CHECK (char_length(client_uri) <= 2048);

alter table only auth.oauth_clients add constraint oauth_clients_logo_uri_length CHECK (char_length(logo_uri) <= 2048);

alter table only auth.oauth_clients add constraint oauth_clients_pkey PRIMARY KEY (id);

alter table only auth.oauth_clients add constraint oauth_clients_token_endpoint_auth_method_check CHECK (token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text]));

alter table only auth.oauth_consents add constraint oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;

alter table only auth.oauth_consents add constraint oauth_consents_pkey PRIMARY KEY (id);

alter table only auth.oauth_consents add constraint oauth_consents_revoked_after_granted CHECK (revoked_at IS NULL OR revoked_at >= granted_at);

alter table only auth.oauth_consents add constraint oauth_consents_scopes_length CHECK (char_length(scopes) <= 2048);

alter table only auth.oauth_consents add constraint oauth_consents_scopes_not_empty CHECK (char_length(TRIM(BOTH FROM scopes)) > 0);

alter table only auth.oauth_consents add constraint oauth_consents_user_client_unique UNIQUE (user_id, client_id);

alter table only auth.oauth_consents add constraint oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table only auth.one_time_tokens add constraint one_time_tokens_pkey PRIMARY KEY (id);

alter table only auth.one_time_tokens add constraint one_time_tokens_token_hash_check CHECK (char_length(token_hash) > 0);

alter table only auth.one_time_tokens add constraint one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table only auth.refresh_tokens add constraint refresh_tokens_pkey PRIMARY KEY (id);

alter table only auth.refresh_tokens add constraint refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;

alter table only auth.refresh_tokens add constraint refresh_tokens_token_unique UNIQUE (token);

alter table only auth.saml_providers add constraint "entity_id not empty" CHECK (char_length(entity_id) > 0);

alter table only auth.saml_providers add constraint "metadata_url not empty" CHECK (metadata_url = NULL::text OR char_length(metadata_url) > 0);

alter table only auth.saml_providers add constraint "metadata_xml not empty" CHECK (char_length(metadata_xml) > 0);

alter table only auth.saml_providers add constraint saml_providers_entity_id_key UNIQUE (entity_id);

alter table only auth.saml_providers add constraint saml_providers_pkey PRIMARY KEY (id);

alter table only auth.saml_providers add constraint saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;

alter table only auth.saml_relay_states add constraint "request_id not empty" CHECK (char_length(request_id) > 0);

alter table only auth.saml_relay_states add constraint saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;

alter table only auth.saml_relay_states add constraint saml_relay_states_pkey PRIMARY KEY (id);

alter table only auth.saml_relay_states add constraint saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;

alter table only auth.schema_migrations add constraint schema_migrations_pkey PRIMARY KEY (version);

alter table only auth.sessions add constraint sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;

alter table only auth.sessions add constraint sessions_pkey PRIMARY KEY (id);

alter table only auth.sessions add constraint sessions_scopes_length CHECK (char_length(scopes) <= 4096);

alter table only auth.sessions add constraint sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table only auth.sso_domains add constraint "domain not empty" CHECK (char_length(domain) > 0);

alter table only auth.sso_domains add constraint sso_domains_pkey PRIMARY KEY (id);

alter table only auth.sso_domains add constraint sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;

alter table only auth.sso_providers add constraint "resource_id not empty" CHECK (resource_id = NULL::text OR char_length(resource_id) > 0);

alter table only auth.sso_providers add constraint sso_providers_pkey PRIMARY KEY (id);

alter table only auth.users add constraint users_email_change_confirm_status_check CHECK (email_change_confirm_status >= 0 AND email_change_confirm_status <= 2);

alter table only auth.users add constraint users_phone_key UNIQUE (phone);

alter table only auth.users add constraint users_pkey PRIMARY KEY (id);

alter table only auth.webauthn_challenges add constraint webauthn_challenges_challenge_type_check CHECK (challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text]));

alter table only auth.webauthn_challenges add constraint webauthn_challenges_pkey PRIMARY KEY (id);

alter table only auth.webauthn_challenges add constraint webauthn_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table only auth.webauthn_credentials add constraint webauthn_credentials_pkey PRIMARY KEY (id);

alter table only auth.webauthn_credentials add constraint webauthn_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table only public.address_verification_sessions add constraint address_verification_sessions_entity_type_check CHECK (entity_type = ANY (ARRAY['studio'::text, 'gig'::text]));

alter table only public.address_verification_sessions add constraint address_verification_sessions_pkey PRIMARY KEY (id);

alter table only public.address_verification_sessions add constraint address_verification_sessions_session_id_key UNIQUE (session_id);

alter table only public.address_verification_sessions add constraint address_verification_sessions_status_check CHECK (status = ANY (ARRAY['PENDING'::text, 'SUBMITTED'::text, 'PROCESSING'::text, 'ANALYZED'::text, 'VERIFIED'::text, 'APPROVED'::text, 'DECLINED'::text, 'FAILED'::text, 'REVOKED'::text, 'ABANDONED'::text, 'MANUAL_REVIEW'::text, 'PENDING_REVIEW'::text]));

alter table only public.address_verification_sessions add constraint address_verification_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.booking_attendance_events add constraint booking_attendance_events_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio_bookings(id) ON DELETE CASCADE;

alter table only public.booking_attendance_events add constraint booking_attendance_events_event_type_check CHECK (event_type = ANY (ARRAY['booking_started'::text, 'checked_in'::text, 'late'::text, 'not_attending'::text, 'no_show'::text]));

alter table only public.booking_attendance_events add constraint booking_attendance_events_pkey PRIMARY KEY (id);

alter table only public.booking_attendance_events add constraint booking_attendance_events_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

alter table only public.booking_holds add constraint booking_holds_check CHECK (end_time > start_time);

alter table only public.booking_holds add constraint booking_holds_pkey PRIMARY KEY (id);

alter table only public.booking_holds add constraint booking_holds_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

alter table only public.booking_holds add constraint booking_holds_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.booking_requests add constraint booking_requests_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id);

alter table only public.booking_requests add constraint booking_requests_pkey PRIMARY KEY (id);

alter table only public.booking_requests add constraint booking_requests_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id);

alter table only public.booking_requests add constraint booking_requests_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id);

alter table only public.booking_requests add constraint booking_requests_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id);

alter table only public.conversation_participants add constraint conversation_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

alter table only public.conversation_participants add constraint conversation_participants_conversation_id_user_id_key UNIQUE (conversation_id, user_id);

alter table only public.conversation_participants add constraint conversation_participants_pkey PRIMARY KEY (id);

alter table only public.conversation_participants add constraint conversation_participants_role_check CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]));

alter table only public.conversation_participants add constraint conversation_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.conversations add constraint conversations_gig_application_id_fkey FOREIGN KEY (gig_application_id) REFERENCES gig_applications(id) ON DELETE SET NULL;

alter table only public.conversations add constraint conversations_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE SET NULL;

alter table only public.conversations add constraint conversations_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;

alter table only public.conversations add constraint conversations_pkey PRIMARY KEY (id);

alter table only public.conversations add constraint conversations_studio_booking_id_fkey FOREIGN KEY (studio_booking_id) REFERENCES studio_bookings(id) ON DELETE SET NULL;

alter table only public.conversations add constraint conversations_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE SET NULL;

alter table only public.email_notifications add constraint email_notifications_pkey PRIMARY KEY (id);

alter table only public.favorites add constraint fav_one_target CHECK (((group_id IS NOT NULL)::integer + (studio_id IS NOT NULL)::integer + (gig_id IS NOT NULL)::integer) = 1);

alter table only public.favorites add constraint favorites_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE;

alter table only public.favorites add constraint favorites_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

alter table only public.favorites add constraint favorites_pkey PRIMARY KEY (id);

alter table only public.favorites add constraint favorites_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

alter table only public.favorites add constraint favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.gig_applications add constraint gig_applications_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.gig_applications add constraint gig_applications_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE;

alter table only public.gig_applications add constraint gig_applications_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

alter table only public.gig_applications add constraint gig_applications_leader_approval_status_check CHECK (leader_approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));

alter table only public.gig_applications add constraint gig_applications_pkey PRIMARY KEY (id);

alter table only public.gig_applications add constraint gig_applications_slot_type_check CHECK (slot_type = ANY (ARRAY['solo'::text, 'duo'::text, 'band'::text]));

alter table only public.gig_applications add constraint gig_applications_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'accepted'::text, 'rejected'::text, 'declined'::text, 'cancelled'::text, 'fired'::text, 'completed'::text]));

alter table only public.gig_applications add constraint gig_applications_submitted_by_user_id_fkey FOREIGN KEY (submitted_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

alter table only public.gig_applications add constraint unique_applicant_per_gig UNIQUE (applicant_id, gig_id);

alter table only public.gig_availability_slots add constraint gig_availability_slots_check CHECK (end_time > start_time);

alter table only public.gig_availability_slots add constraint gig_availability_slots_check1 CHECK (day_of_week IS NOT NULL AND day_of_week >= 0 AND day_of_week <= 6 OR slot_date IS NOT NULL);

alter table only public.gig_availability_slots add constraint gig_availability_slots_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE;

alter table only public.gig_availability_slots add constraint gig_availability_slots_pkey PRIMARY KEY (id);

alter table only public.gig_deletion_audit add constraint gig_deletion_audit_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES profiles(id) ON DELETE SET NULL;

alter table only public.gig_deletion_audit add constraint gig_deletion_audit_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES profiles(id) ON DELETE SET NULL;

alter table only public.gig_deletion_audit add constraint gig_deletion_audit_pkey PRIMARY KEY (id);

alter table only public.gig_media add constraint gig_media_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE;

alter table only public.gig_media add constraint gig_media_gig_id_media_type_media_url_key UNIQUE (gig_id, media_type, media_url);

alter table only public.gig_media add constraint gig_media_media_type_check CHECK (media_type = ANY (ARRAY['image'::text, 'document'::text]));

alter table only public.gig_media add constraint gig_media_pkey PRIMARY KEY (id);

alter table only public.gig_requirements add constraint gig_requirements_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE;

alter table only public.gig_requirements add constraint gig_requirements_gig_id_requirement_key_key UNIQUE (gig_id, requirement_key);

alter table only public.gig_requirements add constraint gig_requirements_pkey PRIMARY KEY (id);

alter table only public.gig_slot_fill_applicants add constraint gig_slot_fill_applicants_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE;

alter table only public.gig_slot_fill_applicants add constraint gig_slot_fill_applicants_pkey PRIMARY KEY (gig_id, slot_type, applicant_id);

alter table only public.gig_slot_fill_applicants add constraint gig_slot_fill_applicants_slot_type_check CHECK (slot_type = ANY (ARRAY['solo'::text, 'duo'::text, 'band'::text]));

alter table only public.gig_slot_fill_summary add constraint gig_slot_fill_summary_accepted_count_check CHECK (accepted_count >= 0);

alter table only public.gig_slot_fill_summary add constraint gig_slot_fill_summary_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE;

alter table only public.gig_slot_fill_summary add constraint gig_slot_fill_summary_pkey PRIMARY KEY (gig_id, slot_type);

alter table only public.gig_slot_fill_summary add constraint gig_slot_fill_summary_slot_type_check CHECK (slot_type = ANY (ARRAY['solo'::text, 'duo'::text, 'band'::text]));

alter table only public.gigs add constraint gigs_address_verification_status_check CHECK (address_verification_status = ANY (ARRAY['NOT_STARTED'::text, 'PENDING'::text, 'PROCESSING'::text, 'VERIFIED'::text, 'APPROVED'::text, 'DECLINED'::text, 'FAILED'::text, 'ABANDONED'::text, 'MANUAL_REVIEW'::text, 'PENDING_REVIEW'::text]));

alter table only public.gigs add constraint gigs_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.gigs add constraint gigs_pkey PRIMARY KEY (id);

alter table only public.gigs add constraint gigs_reapplication_cooldown_days_check CHECK (reapplication_cooldown_days >= 0 AND reapplication_cooldown_days <= 365);

alter table only public.gigs add constraint gigs_status_check CHECK (status = ANY (ARRAY['open'::text, 'closed'::text, 'cancelled'::text]));

alter table only public.group_availability_slots add constraint group_availability_slots_check CHECK (end_time > start_time);

alter table only public.group_availability_slots add constraint group_availability_slots_check1 CHECK (day_of_week IS NOT NULL AND day_of_week >= 0 AND day_of_week <= 6 OR slot_date IS NOT NULL);

alter table only public.group_availability_slots add constraint group_availability_slots_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

alter table only public.group_availability_slots add constraint group_availability_slots_pkey PRIMARY KEY (id);

alter table only public.group_deletion_audit add constraint group_deletion_audit_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES profiles(id) ON DELETE SET NULL;

alter table only public.group_deletion_audit add constraint group_deletion_audit_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE SET NULL;

alter table only public.group_deletion_audit add constraint group_deletion_audit_pkey PRIMARY KEY (id);

alter table only public.group_media add constraint group_media_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

alter table only public.group_media add constraint group_media_group_id_media_type_media_url_key UNIQUE (group_id, media_type, media_url);

alter table only public.group_media add constraint group_media_media_type_check CHECK (media_type = 'image'::text);

alter table only public.group_media add constraint group_media_pkey PRIMARY KEY (id);

alter table only public.group_members add constraint group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

alter table only public.group_members add constraint group_members_group_id_user_id_key UNIQUE (group_id, user_id);

alter table only public.group_members add constraint group_members_pkey PRIMARY KEY (id);

alter table only public.group_members add constraint group_members_role_check CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]));

alter table only public.group_members add constraint group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.group_roster_members add constraint group_roster_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

alter table only public.group_roster_members add constraint group_roster_members_pkey PRIMARY KEY (id);

alter table only public.group_roster_members add constraint group_roster_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

alter table only public.groups add constraint groups_group_type_check CHECK (group_type = ANY (ARRAY['duo'::text, 'band'::text]));

alter table only public.groups add constraint groups_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.groups add constraint groups_pkey PRIMARY KEY (id);

alter table only public.leadership_transfer_requests add constraint leadership_transfer_requests_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.leadership_transfer_requests add constraint leadership_transfer_requests_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

alter table only public.leadership_transfer_requests add constraint leadership_transfer_requests_pkey PRIMARY KEY (id);

alter table only public.leadership_transfer_requests add constraint leadership_transfer_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'cancelled'::text]));

alter table only public.leadership_transfer_requests add constraint leadership_transfer_requests_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.message_reactions add constraint message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE;

alter table only public.message_reactions add constraint message_reactions_message_id_user_id_key UNIQUE (message_id, user_id);

alter table only public.message_reactions add constraint message_reactions_pkey PRIMARY KEY (id);

alter table only public.message_reactions add constraint message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.messages add constraint messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

alter table only public.messages add constraint messages_message_type_check CHECK (message_type = ANY (ARRAY['text'::text, 'image'::text, 'file'::text, 'system'::text]));

alter table only public.messages add constraint messages_pkey PRIMARY KEY (id);

alter table only public.messages add constraint messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.normalization_exceptions add constraint normalization_exceptions_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

alter table only public.normalization_exceptions add constraint normalization_exceptions_pkey PRIMARY KEY (table_name, column_name);

alter table only public.notification_preferences add constraint notification_preferences_pkey PRIMARY KEY (user_id);

alter table only public.notification_preferences add constraint notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.notifications add constraint notifications_pkey PRIMARY KEY (id);

alter table only public.notifications add constraint notifications_type_check CHECK (type = ANY (ARRAY['success'::text, 'info'::text, 'warning'::text, 'error'::text]));

alter table only public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.payout_methods add constraint payout_methods_pkey PRIMARY KEY (id);

alter table only public.payout_methods add constraint payout_methods_type_check CHECK (type = ANY (ARRAY['bank'::text, 'gcash'::text, 'maya'::text, 'paypal'::text]));

alter table only public.payout_methods add constraint payout_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.profile_genres add constraint profile_genres_pkey PRIMARY KEY (id);

alter table only public.profile_genres add constraint profile_genres_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.profile_genres add constraint profile_genres_profile_id_genre_key UNIQUE (profile_id, genre);

alter table only public.profile_portfolio_urls add constraint profile_portfolio_urls_pkey PRIMARY KEY (id);

alter table only public.profile_portfolio_urls add constraint profile_portfolio_urls_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.profile_portfolio_urls add constraint profile_portfolio_urls_profile_id_portfolio_url_key UNIQUE (profile_id, portfolio_url);

alter table only public.profile_skills add constraint profile_skills_pkey PRIMARY KEY (id);

alter table only public.profile_skills add constraint profile_skills_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.profile_skills add constraint profile_skills_profile_id_skill_key UNIQUE (profile_id, skill);

alter table only public.profiles add constraint profiles_email_key UNIQUE (email);

alter table only public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table only public.profiles add constraint profiles_pkey PRIMARY KEY (id);

alter table only public.profiles add constraint profiles_role_check CHECK (role = ANY (ARRAY['musician'::text, 'studio-owner'::text, 'venue-owner'::text]));

alter table only public.profiles add constraint profiles_subscription_plan_id_fkey FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL;

alter table only public.profiles add constraint profiles_subscription_status_check CHECK (subscription_status = ANY (ARRAY['none'::text, 'active'::text, 'expired'::text, 'cancelled'::text]));

alter table only public.profiles add constraint profiles_verification_status_check CHECK (verification_status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'DECLINED'::text, 'ABANDONED'::text, 'PENDING_REVIEW'::text]));

alter table only public.reports add constraint reports_pkey PRIMARY KEY (id);

alter table only public.reports add constraint reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE SET NULL;

alter table only public.reports add constraint reports_status_check CHECK (status = ANY (ARRAY['pending'::text, 'resolved'::text, 'dismissed'::text]));

alter table only public.review_comments add constraint review_comments_pkey PRIMARY KEY (id);

alter table only public.review_comments add constraint review_comments_review_id_fkey FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE;

alter table only public.review_comments add constraint review_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.review_likes add constraint review_likes_pkey PRIMARY KEY (id);

alter table only public.review_likes add constraint review_likes_review_id_fkey FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE;

alter table only public.review_likes add constraint review_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.review_likes add constraint review_likes_user_id_review_id_key UNIQUE (user_id, review_id);

alter table only public.reviews add constraint one_target_only CHECK (((group_id IS NOT NULL)::integer + (studio_id IS NOT NULL)::integer + (gig_id IS NOT NULL)::integer + (user_id IS NOT NULL)::integer) = 1);

alter table only public.reviews add constraint reviews_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.reviews add constraint reviews_gig_application_id_fkey FOREIGN KEY (gig_application_id) REFERENCES gig_applications(id) ON DELETE SET NULL;

alter table only public.reviews add constraint reviews_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE;

alter table only public.reviews add constraint reviews_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

alter table only public.reviews add constraint reviews_pkey PRIMARY KEY (id);

alter table only public.reviews add constraint reviews_rating_check CHECK (rating >= 1 AND rating <= 5);

alter table only public.reviews add constraint reviews_studio_booking_id_fkey FOREIGN KEY (studio_booking_id) REFERENCES studio_bookings(id) ON DELETE SET NULL;

alter table only public.reviews add constraint reviews_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

alter table only public.reviews add constraint reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.studio_amenities add constraint studio_amenities_pkey PRIMARY KEY (id);

alter table only public.studio_amenities add constraint studio_amenities_studio_id_amenity_key UNIQUE (studio_id, amenity);

alter table only public.studio_amenities add constraint studio_amenities_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

alter table only public.studio_availability_slots add constraint studio_availability_slots_check CHECK (end_time > start_time);

alter table only public.studio_availability_slots add constraint studio_availability_slots_check1 CHECK (day_of_week IS NOT NULL AND day_of_week >= 0 AND day_of_week <= 6 OR slot_date IS NOT NULL);

alter table only public.studio_availability_slots add constraint studio_availability_slots_pkey PRIMARY KEY (id);

alter table only public.studio_availability_slots add constraint studio_availability_slots_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

alter table only public.studio_booking_slots add constraint studio_booking_slots_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio_bookings(id) ON DELETE CASCADE;

alter table only public.studio_booking_slots add constraint studio_booking_slots_booking_id_start_time_end_time_key UNIQUE (booking_id, start_time, end_time);

alter table only public.studio_booking_slots add constraint studio_booking_slots_pkey PRIMARY KEY (id);

alter table only public.studio_booking_slots add constraint studio_booking_slots_time_check CHECK (end_time > start_time);

alter table only public.studio_bookings add constraint no_overlapping_bookings EXCLUDE USING gist (studio_id WITH =, booking_date WITH =, tsrange(booking_date + start_time, booking_date + end_time, '[)'::text) WITH &&) WHERE (status <> 'cancelled'::text AND status <> 'rejected'::text);

alter table only public.studio_bookings add constraint studio_bookings_check CHECK (end_time > start_time);

alter table only public.studio_bookings add constraint studio_bookings_final_price_check CHECK (final_price >= 0::numeric);

alter table only public.studio_bookings add constraint studio_bookings_hours_check CHECK (hours > 0::numeric);

alter table only public.studio_bookings add constraint studio_bookings_payment_status_check CHECK (payment_status = ANY (ARRAY['unpaid'::text, 'pending'::text, 'paid'::text, 'partial'::text, 'failed'::text, 'refunded'::text, 'refund_pending'::text]));

alter table only public.studio_bookings add constraint studio_bookings_payment_type_check CHECK (payment_type = ANY (ARRAY['full'::text, 'downpayment'::text, 'balance'::text]));

alter table only public.studio_bookings add constraint studio_bookings_pkey PRIMARY KEY (id);

alter table only public.studio_bookings add constraint studio_bookings_remaining_balance_check CHECK (remaining_balance >= 0::numeric);

alter table only public.studio_bookings add constraint studio_bookings_session_type_check CHECK (session_type = ANY (ARRAY['rehearsal'::text, 'recording'::text]));

alter table only public.studio_bookings add constraint studio_bookings_status_check CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text, 'checked_in'::text, 'pending_relocation'::text]));

alter table only public.studio_bookings add constraint studio_bookings_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

alter table only public.studio_bookings add constraint studio_bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.studio_date_overrides add constraint studio_date_overrides_check CHECK (is_open = false OR open_time IS NOT NULL AND close_time IS NOT NULL);

alter table only public.studio_date_overrides add constraint studio_date_overrides_check1 CHECK (NOT is_open OR close_time > open_time);

alter table only public.studio_date_overrides add constraint studio_date_overrides_pkey PRIMARY KEY (id);

alter table only public.studio_date_overrides add constraint studio_date_overrides_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

alter table only public.studio_date_overrides add constraint studio_date_overrides_studio_id_override_date_key UNIQUE (studio_id, override_date);

alter table only public.studio_deletion_audit add constraint studio_deletion_audit_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES profiles(id) ON DELETE SET NULL;

alter table only public.studio_deletion_audit add constraint studio_deletion_audit_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE SET NULL;

alter table only public.studio_deletion_audit add constraint studio_deletion_audit_pkey PRIMARY KEY (id);

alter table only public.studio_instruments add constraint studio_instruments_pkey PRIMARY KEY (id);

alter table only public.studio_instruments add constraint studio_instruments_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

alter table only public.studio_instruments add constraint studio_instruments_studio_id_instrument_name_image_url_key UNIQUE (studio_id, instrument_name, image_url);

alter table only public.studio_media add constraint studio_media_media_type_check CHECK (media_type = 'image'::text);

alter table only public.studio_media add constraint studio_media_pkey PRIMARY KEY (id);

alter table only public.studio_media add constraint studio_media_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

alter table only public.studio_media add constraint studio_media_studio_id_media_type_media_url_key UNIQUE (studio_id, media_type, media_url);

alter table only public.studio_open_dates add constraint studio_open_dates_pkey PRIMARY KEY (id);

alter table only public.studio_open_dates add constraint studio_open_dates_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

alter table only public.studio_open_dates add constraint studio_open_dates_studio_id_open_date_key UNIQUE (studio_id, open_date);

alter table only public.studio_operating_hours add constraint studio_operating_hours_check CHECK (is_open = false OR open_time IS NOT NULL AND close_time IS NOT NULL);

alter table only public.studio_operating_hours add constraint studio_operating_hours_check1 CHECK (NOT is_open OR close_time > open_time);

alter table only public.studio_operating_hours add constraint studio_operating_hours_day_of_week_check CHECK (day_of_week >= 0 AND day_of_week <= 6);

alter table only public.studio_operating_hours add constraint studio_operating_hours_pkey PRIMARY KEY (id);

alter table only public.studio_operating_hours add constraint studio_operating_hours_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

alter table only public.studio_owner_penalties add constraint studio_owner_penalties_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio_bookings(id) ON DELETE CASCADE;

alter table only public.studio_owner_penalties add constraint studio_owner_penalties_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.studio_owner_penalties add constraint studio_owner_penalties_penalty_points_check CHECK (penalty_points > 0);

alter table only public.studio_owner_penalties add constraint studio_owner_penalties_penalty_type_check CHECK (penalty_type = 'forced_relocation_expired'::text);

alter table only public.studio_owner_penalties add constraint studio_owner_penalties_pkey PRIMARY KEY (id);

alter table only public.studio_owner_penalties add constraint studio_owner_penalties_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

alter table only public.studio_promotions add constraint chk_date_range CHECK (is_permanent = true OR start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date);

alter table only public.studio_promotions add constraint chk_percentage_range CHECK (discount_type <> 'percentage'::text OR discount_value > 0::numeric AND discount_value <= 100::numeric);

alter table only public.studio_promotions add constraint studio_promotions_applies_to_check CHECK (applies_to = ANY (ARRAY['rehearsal'::text, 'recording'::text, 'both'::text]));

alter table only public.studio_promotions add constraint studio_promotions_discount_type_check CHECK (discount_type = ANY (ARRAY['percentage'::text, 'fixed_amount'::text]));

alter table only public.studio_promotions add constraint studio_promotions_discount_value_check CHECK (discount_value > 0::numeric);

alter table only public.studio_promotions add constraint studio_promotions_pkey PRIMARY KEY (id);

alter table only public.studio_promotions add constraint studio_promotions_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

alter table only public.studio_settings add constraint studio_settings_booking_horizon_days_check CHECK (booking_horizon_days > 0);

alter table only public.studio_settings add constraint studio_settings_buffer_minutes_check CHECK (buffer_minutes >= 0);

alter table only public.studio_settings add constraint studio_settings_bulk_discount_percentage_check CHECK (bulk_discount_percentage >= 0::numeric AND bulk_discount_percentage <= 100::numeric);

alter table only public.studio_settings add constraint studio_settings_holiday_multiplier_check CHECK (holiday_multiplier >= 1.0);

alter table only public.studio_settings add constraint studio_settings_late_night_multiplier_check CHECK (late_night_multiplier >= 1.0);

alter table only public.studio_settings add constraint studio_settings_lead_time_hours_check CHECK (lead_time_hours >= 0);

alter table only public.studio_settings add constraint studio_settings_max_booking_duration_hours_check CHECK (max_booking_duration_hours <= 24::numeric);

alter table only public.studio_settings add constraint studio_settings_min_booking_duration_hours_check CHECK (min_booking_duration_hours > 0::numeric);

alter table only public.studio_settings add constraint studio_settings_off_peak_multiplier_check CHECK (off_peak_multiplier >= 0.5 AND off_peak_multiplier <= 1.0);

alter table only public.studio_settings add constraint studio_settings_peak_season_multiplier_check CHECK (peak_season_multiplier >= 1.0);

alter table only public.studio_settings add constraint studio_settings_pkey PRIMARY KEY (id);

alter table only public.studio_settings add constraint studio_settings_slot_increment_minutes_check CHECK (slot_increment_minutes = ANY (ARRAY[15, 30, 60]));

alter table only public.studio_settings add constraint studio_settings_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

alter table only public.studio_settings add constraint studio_settings_studio_id_key UNIQUE (studio_id);

alter table only public.studio_settings add constraint studio_settings_weekend_multiplier_check CHECK (weekend_multiplier >= 1.0);

alter table only public.studio_types add constraint studio_types_pkey PRIMARY KEY (id);

alter table only public.studio_types add constraint studio_types_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

alter table only public.studio_types add constraint studio_types_studio_id_studio_type_key UNIQUE (studio_id, studio_type);

alter table only public.studios add constraint studios_address_verification_status_check CHECK (address_verification_status = ANY (ARRAY['NOT_STARTED'::text, 'PENDING'::text, 'PROCESSING'::text, 'VERIFIED'::text, 'APPROVED'::text, 'DECLINED'::text, 'FAILED'::text, 'ABANDONED'::text, 'MANUAL_REVIEW'::text, 'PENDING_REVIEW'::text]));

alter table only public.studios add constraint studios_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.studios add constraint studios_pkey PRIMARY KEY (id);

alter table only public.subscription_payments add constraint subscription_payments_pkey PRIMARY KEY (id);

alter table only public.subscription_payments add constraint subscription_payments_status_check CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text]));

alter table only public.subscription_payments add constraint subscription_payments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE;

alter table only public.subscription_payments add constraint subscription_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.subscription_plans add constraint subscription_plans_pkey PRIMARY KEY (id);

alter table only public.subscriptions add constraint subscriptions_pkey PRIMARY KEY (id);

alter table only public.subscriptions add constraint subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT;

alter table only public.subscriptions add constraint subscriptions_status_check CHECK (status = ANY (ARRAY['active'::text, 'cancelled'::text, 'expired'::text, 'pending'::text, 'past_due'::text]));

alter table only public.subscriptions add constraint subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.subscriptions add constraint unique_active_subscription UNIQUE (user_id);

alter table only public.verification_sessions add constraint verification_sessions_pkey PRIMARY KEY (session_ref);

alter table only public.wallet_transactions add constraint wallet_transactions_pkey PRIMARY KEY (id);

alter table only public.wallet_transactions add constraint wallet_transactions_status_check CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text]));

alter table only public.wallet_transactions add constraint wallet_transactions_type_check CHECK (type = ANY (ARRAY['deposit'::text, 'withdrawal'::text, 'payment'::text, 'refund'::text, 'earning'::text]));

alter table only public.wallet_transactions add constraint wallet_transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE;

alter table only public.wallets add constraint wallets_pkey PRIMARY KEY (id);

alter table only public.wallets add constraint wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.wallets add constraint wallets_user_id_key UNIQUE (user_id);

alter table only public.withdrawal_requests add constraint withdrawal_requests_amount_check CHECK (amount > 0::numeric);

alter table only public.withdrawal_requests add constraint withdrawal_requests_payout_method_id_fkey FOREIGN KEY (payout_method_id) REFERENCES payout_methods(id) ON DELETE SET NULL;

alter table only public.withdrawal_requests add constraint withdrawal_requests_pkey PRIMARY KEY (id);

alter table only public.withdrawal_requests add constraint withdrawal_requests_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES profiles(id);

alter table only public.withdrawal_requests add constraint withdrawal_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]));

alter table only public.withdrawal_requests add constraint withdrawal_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table only public.withdrawal_requests add constraint withdrawal_requests_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE;

alter table only realtime.messages add constraint messages_pkey PRIMARY KEY (id, inserted_at);

alter table only realtime.messages_2026_03_22 add constraint messages_2026_03_22_pkey PRIMARY KEY (id, inserted_at);

alter table only realtime.messages_2026_03_23 add constraint messages_2026_03_23_pkey PRIMARY KEY (id, inserted_at);

alter table only realtime.messages_2026_03_24 add constraint messages_2026_03_24_pkey PRIMARY KEY (id, inserted_at);

alter table only realtime.messages_2026_03_25 add constraint messages_2026_03_25_pkey PRIMARY KEY (id, inserted_at);

alter table only realtime.messages_2026_03_26 add constraint messages_2026_03_26_pkey PRIMARY KEY (id, inserted_at);

alter table only realtime.messages_2026_03_27 add constraint messages_2026_03_27_pkey PRIMARY KEY (id, inserted_at);

alter table only realtime.messages_2026_03_28 add constraint messages_2026_03_28_pkey PRIMARY KEY (id, inserted_at);

alter table only realtime.schema_migrations add constraint schema_migrations_pkey PRIMARY KEY (version);

alter table only realtime.subscription add constraint pk_subscription PRIMARY KEY (id);

alter table only realtime.subscription add constraint subscription_action_filter_check CHECK (action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text]));

alter table only storage.buckets add constraint buckets_pkey PRIMARY KEY (id);

alter table only storage.buckets_analytics add constraint buckets_analytics_pkey PRIMARY KEY (id);

alter table only storage.buckets_vectors add constraint buckets_vectors_pkey PRIMARY KEY (id);

alter table only storage.migrations add constraint migrations_name_key UNIQUE (name);

alter table only storage.migrations add constraint migrations_pkey PRIMARY KEY (id);

alter table only storage.objects add constraint "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);

alter table only storage.objects add constraint objects_pkey PRIMARY KEY (id);

alter table only storage.s3_multipart_uploads add constraint s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);

alter table only storage.s3_multipart_uploads add constraint s3_multipart_uploads_pkey PRIMARY KEY (id);

alter table only storage.s3_multipart_uploads_parts add constraint s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);

alter table only storage.s3_multipart_uploads_parts add constraint s3_multipart_uploads_parts_pkey PRIMARY KEY (id);

alter table only storage.s3_multipart_uploads_parts add constraint s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;

alter table only storage.vector_indexes add constraint vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);

alter table only storage.vector_indexes add constraint vector_indexes_pkey PRIMARY KEY (id);

alter table only supabase_migrations.schema_migrations add constraint schema_migrations_idempotency_key_key UNIQUE (idempotency_key);

alter table only supabase_migrations.schema_migrations add constraint schema_migrations_pkey PRIMARY KEY (version);


-- Indexes

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);

CREATE INDEX custom_oauth_providers_created_at_idx ON auth.custom_oauth_providers USING btree (created_at);

CREATE INDEX custom_oauth_providers_enabled_idx ON auth.custom_oauth_providers USING btree (enabled);

CREATE INDEX custom_oauth_providers_identifier_idx ON auth.custom_oauth_providers USING btree (identifier);

CREATE INDEX custom_oauth_providers_provider_type_idx ON auth.custom_oauth_providers USING btree (provider_type);

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);

CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent);

CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked);

CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC);

CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id);

CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC);

CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email);

CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id);

CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC);

CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id);

CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id);

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);

CREATE INDEX webauthn_challenges_expires_at_idx ON auth.webauthn_challenges USING btree (expires_at);

CREATE INDEX webauthn_challenges_user_id_idx ON auth.webauthn_challenges USING btree (user_id);

CREATE UNIQUE INDEX webauthn_credentials_credential_id_key ON auth.webauthn_credentials USING btree (credential_id);

CREATE INDEX webauthn_credentials_user_id_idx ON auth.webauthn_credentials USING btree (user_id);

CREATE INDEX _http_response_created_idx ON net._http_response USING btree (created);

CREATE UNIQUE INDEX booking_attendance_events_unique_report ON public.booking_attendance_events USING btree (booking_id, event_type, COALESCE(reporter_user_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX idx_address_verification_sessions_archive ON public.address_verification_sessions USING btree (archive_id);

CREATE INDEX idx_address_verification_sessions_entity ON public.address_verification_sessions USING btree (entity_type, entity_id);

CREATE INDEX idx_address_verification_sessions_session_id ON public.address_verification_sessions USING btree (session_id);

CREATE INDEX idx_address_verification_sessions_smile_user ON public.address_verification_sessions USING btree (smile_user_id);

CREATE INDEX idx_address_verification_sessions_user ON public.address_verification_sessions USING btree (user_id);

CREATE INDEX idx_booking_holds_expiry ON public.booking_holds USING btree (expires_at);

CREATE INDEX idx_booking_holds_studio_date ON public.booking_holds USING btree (studio_id, booking_date);

CREATE INDEX idx_conversation_participants_conversation_id ON public.conversation_participants USING btree (conversation_id);

CREATE INDEX idx_conversation_participants_user_id ON public.conversation_participants USING btree (user_id);

CREATE INDEX idx_conversations_group_id_is_group ON public.conversations USING btree (group_id) WHERE (group_id IS NOT NULL);

CREATE INDEX idx_conversations_is_group ON public.conversations USING btree (is_group) WHERE (is_group = true);

CREATE INDEX idx_email_notifications_status ON public.email_notifications USING btree (status) WHERE (status = 'pending'::text);

CREATE INDEX idx_favorites_user_id ON public.favorites USING btree (user_id);

CREATE INDEX idx_gig_applications_applicant_id ON public.gig_applications USING btree (applicant_id);

CREATE INDEX idx_gig_applications_gig_applicant ON public.gig_applications USING btree (gig_id, applicant_id);

CREATE INDEX idx_gig_applications_gig_id ON public.gig_applications USING btree (gig_id);

CREATE INDEX idx_gig_applications_group_leader_approval ON public.gig_applications USING btree (group_id, leader_approval_status, created_at DESC);

CREATE INDEX idx_gig_applications_reconfirm_due ON public.gig_applications USING btree (gig_id, reconfirmation_due_at) WHERE ((status = 'pending'::text) AND (reconfirmation_due_at IS NOT NULL));

CREATE INDEX idx_gig_applications_rejected_at ON public.gig_applications USING btree (gig_id, applicant_id, rejected_at) WHERE (status = 'rejected'::text);

CREATE INDEX idx_gig_applications_status ON public.gig_applications USING btree (status);

CREATE UNIQUE INDEX idx_gig_applications_unique_group ON public.gig_applications USING btree (gig_id, group_id) WHERE ((group_id IS NOT NULL) AND (status <> 'rejected'::text));

CREATE INDEX idx_gig_availability_slots_gig_id ON public.gig_availability_slots USING btree (gig_id);

CREATE INDEX idx_gig_media_gig_id ON public.gig_media USING btree (gig_id);

CREATE INDEX idx_gig_requirements_gig_id ON public.gig_requirements USING btree (gig_id);

CREATE INDEX idx_gig_slot_fill_applicants_gig_id ON public.gig_slot_fill_applicants USING btree (gig_id);

CREATE INDEX idx_gigs_slots_status ON public.gigs USING btree (status) WHERE (status = 'open'::text);

CREATE INDEX idx_group_availability_slots_group_id ON public.group_availability_slots USING btree (group_id);

CREATE INDEX idx_group_media_group_id ON public.group_media USING btree (group_id);

CREATE INDEX idx_group_members_group ON public.group_members USING btree (group_id);

CREATE INDEX idx_group_members_user ON public.group_members USING btree (user_id);

CREATE INDEX idx_group_roster_members_group_id ON public.group_roster_members USING btree (group_id);

CREATE INDEX idx_group_roster_members_user_id ON public.group_roster_members USING btree (user_id);

CREATE INDEX idx_leadership_transfer_from ON public.leadership_transfer_requests USING btree (from_user_id);

CREATE INDEX idx_leadership_transfer_group ON public.leadership_transfer_requests USING btree (group_id);

CREATE UNIQUE INDEX idx_leadership_transfer_pending ON public.leadership_transfer_requests USING btree (group_id) WHERE (status = 'pending'::text);

CREATE INDEX idx_leadership_transfer_status ON public.leadership_transfer_requests USING btree (status);

CREATE INDEX idx_leadership_transfer_to ON public.leadership_transfer_requests USING btree (to_user_id);

CREATE INDEX idx_leadership_transfer_to_user ON public.leadership_transfer_requests USING btree (to_user_id);

CREATE INDEX idx_message_reactions_message_id ON public.message_reactions USING btree (message_id);

CREATE INDEX idx_message_reactions_user_id ON public.message_reactions USING btree (user_id);

CREATE INDEX idx_messages_conversation_id ON public.messages USING btree (conversation_id);

CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at DESC);

CREATE INDEX idx_messages_sender_id ON public.messages USING btree (sender_id);

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);

CREATE INDEX idx_owner_penalties_owner_created ON public.studio_owner_penalties USING btree (owner_id, created_at DESC);

CREATE UNIQUE INDEX idx_owner_penalties_unique_booking_type ON public.studio_owner_penalties USING btree (booking_id, penalty_type);

CREATE INDEX idx_payout_methods_user ON public.payout_methods USING btree (user_id);

CREATE INDEX idx_profile_genres_profile_id ON public.profile_genres USING btree (profile_id);

CREATE INDEX idx_profile_portfolio_urls_profile_id ON public.profile_portfolio_urls USING btree (profile_id);

CREATE INDEX idx_profile_skills_profile_id ON public.profile_skills USING btree (profile_id);

CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);

CREATE INDEX idx_profiles_smile_user_id ON public.profiles USING btree (smile_user_id);

CREATE INDEX idx_profiles_verification_status ON public.profiles USING btree (verification_status);

CREATE INDEX idx_review_likes_review_id ON public.review_likes USING btree (review_id);

CREATE INDEX idx_reviews_gig_application_id ON public.reviews USING btree (gig_application_id);

CREATE INDEX idx_reviews_gig_id ON public.reviews USING btree (gig_id);

CREATE INDEX idx_reviews_group_id ON public.reviews USING btree (group_id);

CREATE INDEX idx_reviews_studio_booking_id ON public.reviews USING btree (studio_booking_id);

CREATE INDEX idx_reviews_studio_id ON public.reviews USING btree (studio_id);

CREATE INDEX idx_reviews_user_id ON public.reviews USING btree (user_id);

CREATE INDEX idx_studio_amenities_studio_id ON public.studio_amenities USING btree (studio_id);

CREATE INDEX idx_studio_availability_slots_studio_id ON public.studio_availability_slots USING btree (studio_id);

CREATE INDEX idx_studio_booking_slots_booking_id ON public.studio_booking_slots USING btree (booking_id);

CREATE INDEX idx_studio_bookings_checkout_session ON public.studio_bookings USING btree (checkout_session_id);

CREATE INDEX idx_studio_bookings_date_status ON public.studio_bookings USING btree (studio_id, booking_date, status);

CREATE INDEX idx_studio_bookings_payment_status ON public.studio_bookings USING btree (payment_status);

CREATE INDEX idx_studio_bookings_studio_id ON public.studio_bookings USING btree (studio_id);

CREATE INDEX idx_studio_bookings_user_id ON public.studio_bookings USING btree (user_id);

CREATE INDEX idx_studio_bookings_user_studio_status ON public.studio_bookings USING btree (user_id, studio_id, status);

CREATE INDEX idx_studio_instruments_studio_id ON public.studio_instruments USING btree (studio_id);

CREATE INDEX idx_studio_media_studio_id ON public.studio_media USING btree (studio_id);

CREATE INDEX idx_studio_open_dates_studio_id ON public.studio_open_dates USING btree (studio_id);

CREATE INDEX idx_studio_operating_hours_lookup ON public.studio_operating_hours USING btree (studio_id, day_of_week, slot_order);

CREATE INDEX idx_studio_promotions_studio_active ON public.studio_promotions USING btree (studio_id, is_active) WHERE (is_active = true);

CREATE INDEX idx_studio_types_studio_id ON public.studio_types USING btree (studio_id);

CREATE INDEX idx_subscription_payments_subscription_id ON public.subscription_payments USING btree (subscription_id);

CREATE INDEX idx_subscription_payments_user_id ON public.subscription_payments USING btree (user_id);

CREATE INDEX idx_subscriptions_period_end ON public.subscriptions USING btree (current_period_end);

CREATE INDEX idx_subscriptions_status ON public.subscriptions USING btree (status);

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions USING btree (user_id);

CREATE UNIQUE INDEX idx_unique_pending_studio_booking_per_day ON public.studio_bookings USING btree (user_id, studio_id, booking_date) WHERE (status = 'pending'::text);

CREATE INDEX idx_withdrawal_requests_status ON public.withdrawal_requests USING btree (status);

CREATE INDEX idx_withdrawal_requests_user ON public.withdrawal_requests USING btree (user_id);

CREATE INDEX idx_withdrawal_requests_wallet ON public.withdrawal_requests USING btree (wallet_id);

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);

CREATE INDEX messages_2026_03_22_inserted_at_topic_idx ON realtime.messages_2026_03_22 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));

CREATE INDEX messages_2026_03_23_inserted_at_topic_idx ON realtime.messages_2026_03_23 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));

CREATE INDEX messages_2026_03_24_inserted_at_topic_idx ON realtime.messages_2026_03_24 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));

CREATE INDEX messages_2026_03_25_inserted_at_topic_idx ON realtime.messages_2026_03_25 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));

CREATE INDEX messages_2026_03_26_inserted_at_topic_idx ON realtime.messages_2026_03_26 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));

CREATE INDEX messages_2026_03_27_inserted_at_topic_idx ON realtime.messages_2026_03_27 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));

CREATE INDEX messages_2026_03_28_inserted_at_topic_idx ON realtime.messages_2026_03_28 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_action_filter_key ON realtime.subscription USING btree (subscription_id, entity, filters, action_filter);

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");

CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);

CREATE UNIQUE INDEX secrets_name_idx ON vault.secrets USING btree (name) WHERE (name IS NOT NULL);


-- Views

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
    count(r.id) AS review_count
   FROM gigs g
     LEFT JOIN reviews r ON r.gig_id = g.id
     LEFT JOIN gigs_legacy_projection glp ON glp.id = g.id
     LEFT JOIN gigs_availability_projection gap ON gap.gig_id = g.id
  GROUP BY g.id, g.organizer_id, g.name, g.location, g.budget, g.description, g.event_date, glp.requirements, glp.images, glp.documents, g.status, g.latitude, g.longitude, g.created_at, g.embedding, g.rate, g.contract_url, g.business_permit_url, gap.availability, g.address_verification_status, g.address_verification_session_id, g.address_verified_at, g.verified_address, g.address_verification_completed_at;;

create or replace view public.gigs_with_verification as
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
    COALESCE(gap.availability, '[]'::jsonb) AS availability,
    g.address_verification_status,
    g.address_verification_session_id,
    g.address_verified_at,
    g.verified_address,
    g.address_verification_completed_at,
        CASE
            WHEN g.address_verification_status = ANY (ARRAY['APPROVED'::text, 'VERIFIED'::text]) THEN true
            ELSE false
        END AS is_address_verified,
    avs.extracted_address AS session_extracted_address,
    avs.extracted_name AS session_extracted_name,
    avs.issuer AS verification_issuer,
    avs.notes AS verification_notes,
    avs.provider AS verification_provider,
    avs.archive_id AS smile_archive_id
   FROM gigs g
     LEFT JOIN gigs_legacy_projection glp ON glp.id = g.id
     LEFT JOIN gigs_availability_projection gap ON gap.gig_id = g.id
     LEFT JOIN address_verification_sessions avs ON avs.entity_type = 'gig'::text AND avs.entity_id = g.id AND (avs.status = ANY (ARRAY['APPROVED'::text, 'VERIFIED'::text]));;

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
    count(r.id) AS review_count
   FROM groups g
     LEFT JOIN reviews r ON r.group_id = g.id
     LEFT JOIN groups_legacy_projection glp ON glp.id = g.id
     LEFT JOIN groups_availability_projection gap ON gap.group_id = g.id
  GROUP BY g.id, g.owner_id, g.name, g.genre, g.description, glp.members, g.location, glp.images, g.latitude, g.longitude, g.rate, g.created_at, g.group_type, gap.availability;;

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
    count(r.id) AS review_count
   FROM profiles p
     LEFT JOIN reviews r ON r.user_id = p.id
     LEFT JOIN profiles_legacy_projection plp ON plp.id = p.id
  GROUP BY p.id, p.email, p.full_name, p.avatar_url, p.role, p.bio, p.location, plp.skills, plp.genres, plp.portfolio_urls, p.is_verified, p.verification_status, p.didit_session_id, p.id_document_expiry, p.id_verified_at, p.created_at;;

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
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('day_of_week', sas.day_of_week, 'date', sas.slot_date, 'start', to_char(sas.start_time::interval, 'HH24:MI'::text), 'end', to_char(sas.end_time::interval, 'HH24:MI'::text), 'is_open', sas.is_open)) ORDER BY sas.day_of_week, sas.slot_date, sas.start_time) AS jsonb_agg
           FROM studio_availability_slots sas
          WHERE sas.studio_id = s.id), '[]'::jsonb) AS availability,
    COALESCE(( SELECT jsonb_agg(sod.open_date ORDER BY sod.open_date) AS jsonb_agg
           FROM studio_open_dates sod
          WHERE sod.studio_id = s.id AND sod.is_open = true), '[]'::jsonb) AS open_dates
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
          WHERE sdo.studio_id = s.id)) AS has_special_dates
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
    s.rehearsal_rate,
    s.recording_rate,
    COALESCE(sap.open_dates, '[]'::jsonb) AS open_dates,
    slp.types,
    s.pax,
    s.address_verification_status,
    s.address_verification_session_id,
    s.address_verified_at,
    s.verified_address,
    s.address_verification_completed_at,
        CASE
            WHEN s.address_verification_status = ANY (ARRAY['APPROVED'::text, 'VERIFIED'::text]) THEN true
            ELSE false
        END AS is_address_verified,
    avs.extracted_address AS session_extracted_address,
    avs.extracted_name AS session_extracted_name,
    avs.issuer AS verification_issuer,
    avs.notes AS verification_notes,
    avs.provider AS verification_provider,
    avs.archive_id AS smile_archive_id
   FROM studios s
     LEFT JOIN studios_legacy_projection slp ON slp.id = s.id
     LEFT JOIN studios_availability_projection sap ON sap.studio_id = s.id
     LEFT JOIN address_verification_sessions avs ON avs.entity_type = 'studio'::text AND avs.entity_id = s.id AND (avs.status = ANY (ARRAY['APPROVED'::text, 'VERIFIED'::text]));;


-- Row Level Security

alter table auth.audit_log_entries enable row level security;

alter table auth.flow_state enable row level security;

alter table auth.identities enable row level security;

alter table auth.instances enable row level security;

alter table auth.mfa_amr_claims enable row level security;

alter table auth.mfa_challenges enable row level security;

alter table auth.mfa_factors enable row level security;

alter table auth.one_time_tokens enable row level security;

alter table auth.refresh_tokens enable row level security;

alter table auth.saml_providers enable row level security;

alter table auth.saml_relay_states enable row level security;

alter table auth.schema_migrations enable row level security;

alter table auth.sessions enable row level security;

alter table auth.sso_domains enable row level security;

alter table auth.sso_providers enable row level security;

alter table auth.users enable row level security;

alter table public.address_verification_sessions enable row level security;

alter table public.booking_attendance_events enable row level security;

alter table public.booking_requests enable row level security;

alter table public.conversation_participants enable row level security;

alter table public.conversations enable row level security;

alter table public.favorites enable row level security;

alter table public.gig_applications enable row level security;

alter table public.gig_deletion_audit enable row level security;

alter table public.gigs enable row level security;

alter table public.group_deletion_audit enable row level security;

alter table public.group_members enable row level security;

alter table public.groups enable row level security;

alter table public.leadership_transfer_requests enable row level security;

alter table public.message_reactions enable row level security;

alter table public.messages enable row level security;

alter table public.notification_preferences enable row level security;

alter table public.notifications enable row level security;

alter table public.payout_methods enable row level security;

alter table public.profiles enable row level security;

alter table public.reports enable row level security;

alter table public.review_comments enable row level security;

alter table public.review_likes enable row level security;

alter table public.reviews enable row level security;

alter table public.studio_bookings enable row level security;

alter table public.studio_deletion_audit enable row level security;

alter table public.studios enable row level security;

alter table public.subscription_payments enable row level security;

alter table public.subscription_plans enable row level security;

alter table public.subscriptions enable row level security;

alter table public.verification_sessions enable row level security;

alter table public.withdrawal_requests enable row level security;

alter table realtime.messages enable row level security;

alter table storage.buckets enable row level security;

alter table storage.buckets_analytics enable row level security;

alter table storage.buckets_vectors enable row level security;

alter table storage.migrations enable row level security;

alter table storage.objects enable row level security;

alter table storage.s3_multipart_uploads enable row level security;

alter table storage.s3_multipart_uploads_parts enable row level security;

alter table storage.vector_indexes enable row level security;


-- Policies

create policy cron_job_policy on cron.job as permissive for all to public
    using ((username = CURRENT_USER));

create policy cron_job_run_details_policy on cron.job_run_details as permissive for all to public
    using ((username = CURRENT_USER));

create policy "Service role can manage address verification sessions" on public.address_verification_sessions as permissive for all to public
    using (true);

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

create policy "Users can delete own favorites" on public.favorites as permissive for delete to authenticated
    using ((auth.uid() = user_id));

create policy "Users can insert own favorites" on public.favorites as permissive for insert to authenticated
    with check ((auth.uid() = user_id));

create policy "Users can view own favorites" on public.favorites as permissive for select to authenticated
    using ((auth.uid() = user_id));

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

create policy "Users can create applications" on public.gig_applications as permissive for insert to authenticated
    with check ((auth.uid() = applicant_id));

create policy "Gigs are viewable by everyone" on public.gigs as permissive for select to public
    using (true);

create policy "Organizers can delete their gigs" on public.gigs as permissive for delete to public
    using ((auth.uid() = organizer_id));

create policy "Organizers can update their gigs" on public.gigs as permissive for update to public
    using ((auth.uid() = organizer_id));

create policy "Users can create gigs" on public.gigs as permissive for insert to public
    with check ((auth.uid() = organizer_id));

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

create policy "Users can delete their own payout methods" on public.payout_methods as permissive for delete to public
    using ((auth.uid() = user_id));

create policy "Users can insert their own payout methods" on public.payout_methods as permissive for insert to public
    with check ((auth.uid() = user_id));

create policy "Users can update their own payout methods" on public.payout_methods as permissive for update to public
    using ((auth.uid() = user_id));

create policy "Users can view their own payout methods" on public.payout_methods as permissive for select to public
    using ((auth.uid() = user_id));

create policy "Public profiles are viewable by everyone" on public.profiles as permissive for select to public
    using (true);

create policy "Users can insert their own profile" on public.profiles as permissive for insert to public
    with check ((auth.uid() = id));

create policy "Users can update own profile" on public.profiles as permissive for update to public
    using ((auth.uid() = id));

create policy "Users can insert reports" on public.reports as permissive for insert to authenticated
    with check ((auth.uid() = reporter_id));

create policy "Users can view own reports" on public.reports as permissive for select to authenticated
    using ((auth.uid() = reporter_id));

create policy "Review comments are public" on public.review_comments as permissive for select to public
    using (true);

create policy "Users can post review comments" on public.review_comments as permissive for insert to authenticated
    with check ((auth.uid() = user_id));

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

create policy "Owners can delete their studios" on public.studios as permissive for delete to public
    using ((auth.uid() = owner_id));

create policy "Owners can update their studios" on public.studios as permissive for update to public
    using ((auth.uid() = owner_id));

create policy "Studios are viewable by everyone" on public.studios as permissive for select to public
    using (true);

create policy "Users can create studios" on public.studios as permissive for insert to public
    with check ((auth.uid() = owner_id));

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

create policy "Users can cancel their pending withdrawal requests" on public.withdrawal_requests as permissive for update to public
    using (((auth.uid() = user_id) AND (status = 'pending'::text)));

create policy "Users can create withdrawal requests" on public.withdrawal_requests as permissive for insert to public
    with check ((auth.uid() = user_id));

create policy "Users can view their own withdrawal requests" on public.withdrawal_requests as permissive for select to public
    using ((auth.uid() = user_id));

create policy "Anyone can view chat attachments" on storage.objects as permissive for select to public
    using ((bucket_id = 'chat-attachments'::text));

create policy "Authenticated users can upload chat attachments" on storage.objects as permissive for insert to public
    with check (((bucket_id = 'chat-attachments'::text) AND (auth.role() = 'authenticated'::text)));

create policy "Avatars are publicly viewable" on storage.objects as permissive for select to public
    using ((bucket_id = 'avatars'::text));

create policy "Documents are publicly viewable" on storage.objects as permissive for select to public
    using ((bucket_id = 'documents'::text));

create policy "Listings are publicly viewable" on storage.objects as permissive for select to public
    using ((bucket_id = 'listings'::text));

create policy "Performance videos are publicly viewable" on storage.objects as permissive for select to public
    using (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[2] = 'performance-videos'::text)));

create policy "Portfolio is publicly viewable" on storage.objects as permissive for select to public
    using ((bucket_id = 'portfolio'::text));

create policy "Users can delete their own chat attachments" on storage.objects as permissive for delete to public
    using (((bucket_id = 'chat-attachments'::text) AND ((auth.uid())::text = (storage.foldername(name))[2])));

create policy "Users can upload avatars" on storage.objects as permissive for insert to authenticated
    with check (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

create policy "Users can upload documents" on storage.objects as permissive for insert to authenticated
    with check ((bucket_id = 'documents'::text));

create policy "Users can upload listings" on storage.objects as permissive for insert to authenticated
    with check ((bucket_id = 'listings'::text));

create policy "Users can upload performance videos" on storage.objects as permissive for insert to authenticated
    with check (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[2] = 'performance-videos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

create policy "Users can upload portfolio" on storage.objects as permissive for insert to authenticated
    with check (((bucket_id = 'portfolio'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

create policy "Users can view documents in their folder" on storage.objects as permissive for select to authenticated
    using (((bucket_id = 'documents'::text) AND (((auth.uid())::text = (storage.foldername(name))[2]) OR ((storage.foldername(name))[1] = 'contracts'::text))));

create policy "Users can view their performance videos" on storage.objects as permissive for select to authenticated
    using (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[2] = 'performance-videos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));


-- Functions and Procedures

CREATE OR REPLACE FUNCTION auth.email()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$function$


CREATE OR REPLACE FUNCTION auth.jwt()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$function$


CREATE OR REPLACE FUNCTION auth.role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$


CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$


CREATE OR REPLACE FUNCTION extensions.grant_pg_cron_access()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION extensions.grant_pg_graphql_access()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    func_is_graphql_resolve bool;
BEGIN
    func_is_graphql_resolve = (
        SELECT n.proname = 'resolve'
        FROM pg_event_trigger_ddl_commands() AS ev
        LEFT JOIN pg_catalog.pg_proc AS n
        ON ev.objid = n.oid
    );

    IF func_is_graphql_resolve
    THEN
        -- Update public wrapper to pass all arguments through to the pg_graphql resolve func
        DROP FUNCTION IF EXISTS graphql_public.graphql;
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language sql
        as $$
            select graphql.resolve(
                query := query,
                variables := coalesce(variables, '{}'),
                "operationName" := "operationName",
                extensions := extensions
            );
        $$;

        -- This hook executes when `graphql.resolve` is created. That is not necessarily the last
        -- function in the extension so we need to grant permissions on existing entities AND
        -- update default permissions to any others that are created after `graphql.resolve`
        grant usage on schema graphql to postgres, anon, authenticated, service_role;
        grant select on all tables in schema graphql to postgres, anon, authenticated, service_role;
        grant execute on all functions in schema graphql to postgres, anon, authenticated, service_role;
        grant all on all sequences in schema graphql to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on tables to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on functions to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on sequences to postgres, anon, authenticated, service_role;

        -- Allow postgres role to allow granting usage on graphql and graphql_public schemas to custom roles
        grant usage on schema graphql_public to postgres with grant option;
        grant usage on schema graphql to postgres with grant option;
    END IF;

END;
$function$


CREATE OR REPLACE FUNCTION extensions.grant_pg_net_access()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$function$


CREATE OR REPLACE FUNCTION extensions.pgrst_ddl_watch()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $function$


CREATE OR REPLACE FUNCTION extensions.pgrst_drop_watch()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $function$


CREATE OR REPLACE FUNCTION extensions.set_graphql_placeholder()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$function$


CREATE OR REPLACE FUNCTION pgbouncer.get_auth(p_usename text)
 RETURNS TABLE(username text, password text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  BEGIN
      RAISE DEBUG 'PgBouncer auth request: %', p_usename;

      RETURN QUERY
      SELECT
          rolname::text,
          CASE WHEN rolvaliduntil < now()
              THEN null
              ELSE rolpassword::text
          END
      FROM pg_authid
      WHERE rolname=$1 and rolcanlogin;
  END;
  $function$


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
  -- Find the best active promotion for this booking
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
  ORDER BY
    -- Pick the one that gives the highest discount
    CASE
      WHEN discount_type = 'percentage' THEN p_base_price * (discount_value / 100)
      WHEN discount_type = 'fixed_amount' THEN discount_value * p_hours
      ELSE 0
    END DESC
  LIMIT 1;

  IF v_promo IS NULL THEN
    RETURN NULL;
  END IF;

  -- Calculate discount amount
  IF v_promo.discount_type = 'percentage' THEN
    v_discount_amount := p_base_price * (v_promo.discount_value / 100);
  ELSIF v_promo.discount_type = 'fixed_amount' THEN
    v_discount_amount := v_promo.discount_value * p_hours;
  END IF;

  -- Ensure discount doesn't exceed the base price
  IF v_discount_amount > p_base_price THEN
    v_discount_amount := p_base_price;
  END IF;

  v_result := jsonb_build_object(
    'id', v_promo.id,
    'name', v_promo.name,
    'discount_type', v_promo.discount_type,
    'discount_value', v_promo.discount_value,
    'discount_amount', ROUND(v_discount_amount, 2),
    'final_price_after_promo', ROUND(p_base_price - v_discount_amount, 2)
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
  v_override record;
BEGIN
  v_day_of_week := EXTRACT(DOW FROM p_booking_date)::integer;

  SELECT override_date, is_open, open_time, close_time
  INTO v_override
  FROM public.studio_date_overrides
  WHERE studio_id = p_studio_id
    AND override_date = p_booking_date
  LIMIT 1;

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

    IF v_override.override_date IS NOT NULL THEN
      IF COALESCE(v_override.is_open, false) = false THEN
        RETURN FALSE;
      END IF;

      IF v_override.open_time IS NOT NULL AND slot_start < v_override.open_time THEN
        RETURN FALSE;
      END IF;

      IF v_override.close_time IS NOT NULL AND slot_end > v_override.close_time THEN
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
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_day_of_week INTEGER;
  v_is_open BOOLEAN;
  v_open_time TIME;
  v_close_time TIME;
  v_buffer_minutes INTEGER;
  v_conflict_count INTEGER;
BEGIN
  v_day_of_week := EXTRACT(DOW FROM p_booking_date);
  
  SELECT COALESCE(buffer_minutes, 30) INTO v_buffer_minutes
  FROM studio_settings WHERE studio_id = p_studio_id;
  
  SELECT is_open, open_time, close_time INTO v_is_open, v_open_time, v_close_time
  FROM studio_date_overrides
  WHERE studio_id = p_studio_id AND override_date = p_booking_date;
  
  IF NOT FOUND THEN
    SELECT soh.is_open, soh.open_time, soh.close_time INTO v_is_open, v_open_time, v_close_time
    FROM studio_operating_hours soh
    WHERE soh.studio_id = p_studio_id AND soh.day_of_week = v_day_of_week;
  END IF;
  
  IF NOT FOUND THEN
    v_is_open := TRUE;
    v_open_time := '00:00'::TIME;
    v_close_time := '23:59'::TIME;
  END IF;
  
  IF NOT v_is_open THEN RETURN FALSE; END IF;
  IF p_start_time < v_open_time OR p_end_time > v_close_time THEN RETURN FALSE; END IF;
  
  SELECT COUNT(*) INTO v_conflict_count
  FROM studio_bookings
  WHERE studio_id = p_studio_id AND booking_date = p_booking_date
    AND status NOT IN ('cancelled')
    AND ((p_start_time, p_end_time) OVERLAPS (start_time, end_time));
  
  IF v_conflict_count > 0 THEN RETURN FALSE; END IF;
  
  SELECT COUNT(*) INTO v_conflict_count
  FROM booking_holds
  WHERE studio_id = p_studio_id AND booking_date = p_booking_date
    AND expires_at > NOW() AND (p_user_id IS NULL OR user_id != p_user_id)
    AND ((p_start_time, p_end_time) OVERLAPS (start_time, end_time));
  
  IF v_conflict_count > 0 THEN RETURN FALSE; END IF;
  
  RETURN TRUE;
END;
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


CREATE OR REPLACE FUNCTION public.set_notification_preferences_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
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


CREATE OR REPLACE FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024))
 RETURNS SETOF realtime.wal_rls
 LANGUAGE plpgsql
AS $function$
declare
-- Regclass of the table e.g. public.notes
entity_ regclass = (quote_ident(wal ->> 'schema') || '.' || quote_ident(wal ->> 'table'))::regclass;

-- I, U, D, T: insert, update ...
action realtime.action = (
    case wal ->> 'action'
        when 'I' then 'INSERT'
        when 'U' then 'UPDATE'
        when 'D' then 'DELETE'
        else 'ERROR'
    end
);

-- Is row level security enabled for the table
is_rls_enabled bool = relrowsecurity from pg_class where oid = entity_;

subscriptions realtime.subscription[] = array_agg(subs)
    from
        realtime.subscription subs
    where
        subs.entity = entity_
        -- Filter by action early - only get subscriptions interested in this action
        -- action_filter column can be: '*' (all), 'INSERT', 'UPDATE', or 'DELETE'
        and (subs.action_filter = '*' or subs.action_filter = action::text);

-- Subscription vars
roles regrole[] = array_agg(distinct us.claims_role::text)
    from
        unnest(subscriptions) us;

working_role regrole;
claimed_role regrole;
claims jsonb;

subscription_id uuid;
subscription_has_access bool;
visible_to_subscription_ids uuid[] = '{}';

-- structured info for wal's columns
columns realtime.wal_column[];
-- previous identity values for update/delete
old_columns realtime.wal_column[];

error_record_exceeds_max_size boolean = octet_length(wal::text) > max_record_bytes;

-- Primary jsonb output for record
output jsonb;

begin
perform set_config('role', null, true);

columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'columns') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

old_columns =
    array_agg(
        (
            x->>'name',
            x->>'type',
            x->>'typeoid',
            realtime.cast(
                (x->'value') #>> '{}',
                coalesce(
                    (x->>'typeoid')::regtype, -- null when wal2json version <= 2.4
                    (x->>'type')::regtype
                )
            ),
            (pks ->> 'name') is not null,
            true
        )::realtime.wal_column
    )
    from
        jsonb_array_elements(wal -> 'identity') x
        left join jsonb_array_elements(wal -> 'pk') pks
            on (x ->> 'name') = (pks ->> 'name');

for working_role in select * from unnest(roles) loop

    -- Update `is_selectable` for columns and old_columns
    columns =
        array_agg(
            (
                c.name,
                c.type_name,
                c.type_oid,
                c.value,
                c.is_pkey,
                pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
            )::realtime.wal_column
        )
        from
            unnest(columns) c;

    old_columns =
            array_agg(
                (
                    c.name,
                    c.type_name,
                    c.type_oid,
                    c.value,
                    c.is_pkey,
                    pg_catalog.has_column_privilege(working_role, entity_, c.name, 'SELECT')
                )::realtime.wal_column
            )
            from
                unnest(old_columns) c;

    if action <> 'DELETE' and count(1) = 0 from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            -- subscriptions is already filtered by entity
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 400: Bad Request, no primary key']
        )::realtime.wal_rls;

    -- The claims role does not have SELECT permission to the primary key of entity
    elsif action <> 'DELETE' and sum(c.is_selectable::int) <> count(1) from unnest(columns) c where c.is_pkey then
        return next (
            jsonb_build_object(
                'schema', wal ->> 'schema',
                'table', wal ->> 'table',
                'type', action
            ),
            is_rls_enabled,
            (select array_agg(s.subscription_id) from unnest(subscriptions) as s where claims_role = working_role),
            array['Error 401: Unauthorized']
        )::realtime.wal_rls;

    else
        output = jsonb_build_object(
            'schema', wal ->> 'schema',
            'table', wal ->> 'table',
            'type', action,
            'commit_timestamp', to_char(
                ((wal ->> 'timestamp')::timestamptz at time zone 'utc'),
                'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ),
            'columns', (
                select
                    jsonb_agg(
                        jsonb_build_object(
                            'name', pa.attname,
                            'type', pt.typname
                        )
                        order by pa.attnum asc
                    )
                from
                    pg_attribute pa
                    join pg_type pt
                        on pa.atttypid = pt.oid
                where
                    attrelid = entity_
                    and attnum > 0
                    and pg_catalog.has_column_privilege(working_role, entity_, pa.attname, 'SELECT')
            )
        )
        -- Add "record" key for insert and update
        || case
            when action in ('INSERT', 'UPDATE') then
                jsonb_build_object(
                    'record',
                    (
                        select
                            jsonb_object_agg(
                                -- if unchanged toast, get column name and value from old record
                                coalesce((c).name, (oc).name),
                                case
                                    when (c).name is null then (oc).value
                                    else (c).value
                                end
                            )
                        from
                            unnest(columns) c
                            full outer join unnest(old_columns) oc
                                on (c).name = (oc).name
                        where
                            coalesce((c).is_selectable, (oc).is_selectable)
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                    )
                )
            else '{}'::jsonb
        end
        -- Add "old_record" key for update and delete
        || case
            when action = 'UPDATE' then
                jsonb_build_object(
                        'old_record',
                        (
                            select jsonb_object_agg((c).name, (c).value)
                            from unnest(old_columns) c
                            where
                                (c).is_selectable
                                and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                        )
                    )
            when action = 'DELETE' then
                jsonb_build_object(
                    'old_record',
                    (
                        select jsonb_object_agg((c).name, (c).value)
                        from unnest(old_columns) c
                        where
                            (c).is_selectable
                            and ( not error_record_exceeds_max_size or (octet_length((c).value::text) <= 64))
                            and ( not is_rls_enabled or (c).is_pkey ) -- if RLS enabled, we can't secure deletes so filter to pkey
                    )
                )
            else '{}'::jsonb
        end;

        -- Create the prepared statement
        if is_rls_enabled and action <> 'DELETE' then
            if (select 1 from pg_prepared_statements where name = 'walrus_rls_stmt' limit 1) > 0 then
                deallocate walrus_rls_stmt;
            end if;
            execute realtime.build_prepared_statement_sql('walrus_rls_stmt', entity_, columns);
        end if;

        visible_to_subscription_ids = '{}';

        for subscription_id, claims in (
                select
                    subs.subscription_id,
                    subs.claims
                from
                    unnest(subscriptions) subs
                where
                    subs.entity = entity_
                    and subs.claims_role = working_role
                    and (
                        realtime.is_visible_through_filters(columns, subs.filters)
                        or (
                          action = 'DELETE'
                          and realtime.is_visible_through_filters(old_columns, subs.filters)
                        )
                    )
        ) loop

            if not is_rls_enabled or action = 'DELETE' then
                visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
            else
                -- Check if RLS allows the role to see the record
                perform
                    -- Trim leading and trailing quotes from working_role because set_config
                    -- doesn't recognize the role as valid if they are included
                    set_config('role', trim(both '"' from working_role::text), true),
                    set_config('request.jwt.claims', claims::text, true);

                execute 'execute walrus_rls_stmt' into subscription_has_access;

                if subscription_has_access then
                    visible_to_subscription_ids = visible_to_subscription_ids || subscription_id;
                end if;
            end if;
        end loop;

        perform set_config('role', null, true);

        return next (
            output,
            is_rls_enabled,
            visible_to_subscription_ids,
            case
                when error_record_exceeds_max_size then array['Error 413: Payload Too Large']
                else '{}'
            end
        )::realtime.wal_rls;

    end if;
end loop;

perform set_config('role', null, true);
end;
$function$


CREATE OR REPLACE FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    -- Declare a variable to hold the JSONB representation of the row
    row_data jsonb := '{}'::jsonb;
BEGIN
    IF level = 'STATEMENT' THEN
        RAISE EXCEPTION 'function can only be triggered for each row, not for each statement';
    END IF;
    -- Check the operation type and handle accordingly
    IF operation = 'INSERT' OR operation = 'UPDATE' OR operation = 'DELETE' THEN
        row_data := jsonb_build_object('old_record', OLD, 'record', NEW, 'operation', operation, 'table', table_name, 'schema', table_schema);
        PERFORM realtime.send (row_data, event_name, topic_name);
    ELSE
        RAISE EXCEPTION 'Unexpected operation type: %', operation;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Failed to process the row: %', SQLERRM;
END;

$function$


CREATE OR REPLACE FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[])
 RETURNS text
 LANGUAGE sql
AS $function$
      /*
      Builds a sql string that, if executed, creates a prepared statement to
      tests retrive a row from *entity* by its primary key columns.
      Example
          select realtime.build_prepared_statement_sql('public.notes', '{"id"}'::text[], '{"bigint"}'::text[])
      */
          select
      'prepare ' || prepared_statement_name || ' as
          select
              exists(
                  select
                      1
                  from
                      ' || entity || '
                  where
                      ' || string_agg(quote_ident(pkc.name) || '=' || quote_nullable(pkc.value #>> '{}') , ' and ') || '
              )'
          from
              unnest(columns) pkc
          where
              pkc.is_pkey
          group by
              entity
      $function$


CREATE OR REPLACE FUNCTION realtime."cast"(val text, type_ regtype)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  res jsonb;
begin
  if type_::text = 'bytea' then
    return to_jsonb(val);
  end if;
  execute format('select to_jsonb(%L::'|| type_::text || ')', val) into res;
  return res;
end
$function$


CREATE OR REPLACE FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
      /*
      Casts *val_1* and *val_2* as type *type_* and check the *op* condition for truthiness
      */
      declare
          op_symbol text = (
              case
                  when op = 'eq' then '='
                  when op = 'neq' then '!='
                  when op = 'lt' then '<'
                  when op = 'lte' then '<='
                  when op = 'gt' then '>'
                  when op = 'gte' then '>='
                  when op = 'in' then '= any'
                  else 'UNKNOWN OP'
              end
          );
          res boolean;
      begin
          execute format(
              'select %L::'|| type_::text || ' ' || op_symbol
              || ' ( %L::'
              || (
                  case
                      when op = 'in' then type_::text || '[]'
                      else type_::text end
              )
              || ')', val_1, val_2) into res;
          return res;
      end;
      $function$


CREATE OR REPLACE FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
    /*
    Should the record be visible (true) or filtered out (false) after *filters* are applied
    */
        select
            -- Default to allowed when no filters present
            $2 is null -- no filters. this should not happen because subscriptions has a default
            or array_length($2, 1) is null -- array length of an empty array is null
            or bool_and(
                coalesce(
                    realtime.check_equality_op(
                        op:=f.op,
                        type_:=coalesce(
                            col.type_oid::regtype, -- null when wal2json version <= 2.4
                            col.type_name::regtype
                        ),
                        -- cast jsonb to text
                        val_1:=col.value #>> '{}',
                        val_2:=f.value
                    ),
                    false -- if null, filter does not match
                )
            )
        from
            unnest(filters) f
            join unnest(columns) col
                on f.column_name = col.name;
    $function$


CREATE OR REPLACE FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer)
 RETURNS SETOF realtime.wal_rls
 LANGUAGE sql
 SET log_min_messages TO 'fatal'
AS $function$
      with pub as (
        select
          concat_ws(
            ',',
            case when bool_or(pubinsert) then 'insert' else null end,
            case when bool_or(pubupdate) then 'update' else null end,
            case when bool_or(pubdelete) then 'delete' else null end
          ) as w2j_actions,
          coalesce(
            string_agg(
              realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
              ','
            ) filter (where ppt.tablename is not null and ppt.tablename not like '% %'),
            ''
          ) w2j_add_tables
        from
          pg_publication pp
          left join pg_publication_tables ppt
            on pp.pubname = ppt.pubname
        where
          pp.pubname = publication
        group by
          pp.pubname
        limit 1
      ),
      w2j as (
        select
          x.*, pub.w2j_add_tables
        from
          pub,
          pg_logical_slot_get_changes(
            slot_name, null, max_changes,
            'include-pk', 'true',
            'include-transaction', 'false',
            'include-timestamp', 'true',
            'include-type-oids', 'true',
            'format-version', '2',
            'actions', pub.w2j_actions,
            'add-tables', pub.w2j_add_tables
          ) x
      )
      select
        xyz.wal,
        xyz.is_rls_enabled,
        xyz.subscription_ids,
        xyz.errors
      from
        w2j,
        realtime.apply_rls(
          wal := w2j.data::jsonb,
          max_record_bytes := max_record_bytes
        ) xyz(wal, is_rls_enabled, subscription_ids, errors)
      where
        w2j.w2j_add_tables <> ''
        and xyz.subscription_ids[1] is not null
    $function$


CREATE OR REPLACE FUNCTION realtime.quote_wal2json(entity regclass)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
      select
        (
          select string_agg('' || ch,'')
          from unnest(string_to_array(nsp.nspname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
        )
        || '.'
        || (
          select string_agg('' || ch,'')
          from unnest(string_to_array(pc.relname::text, null)) with ordinality x(ch, idx)
          where
            not (x.idx = 1 and x.ch = '"')
            and not (
              x.idx = array_length(string_to_array(nsp.nspname::text, null), 1)
              and x.ch = '"'
            )
          )
      from
        pg_class pc
        join pg_namespace nsp
          on pc.relnamespace = nsp.oid
      where
        pc.oid = entity
    $function$


CREATE OR REPLACE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  generated_id uuid;
  final_payload jsonb;
BEGIN
  BEGIN
    -- Generate a new UUID for the id
    generated_id := gen_random_uuid();

    -- Check if payload has an 'id' key, if not, add the generated UUID
    IF payload ? 'id' THEN
      final_payload := payload;
    ELSE
      final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    END IF;

    -- Set the topic configuration
    EXECUTE format('SET LOCAL realtime.topic TO %L', topic);

    -- Attempt to insert the message
    INSERT INTO realtime.messages (id, payload, event, topic, private, extension)
    VALUES (generated_id, final_payload, event, topic, private, 'broadcast');
  EXCEPTION
    WHEN OTHERS THEN
      -- Capture and notify the error
      RAISE WARNING 'ErrorSendingBroadcastMessage: %', SQLERRM;
  END;
END;
$function$


CREATE OR REPLACE FUNCTION realtime.subscription_check_filters()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    /*
    Validates that the user defined filters for a subscription:
    - refer to valid columns that the claimed role may access
    - values are coercable to the correct column type
    */
    declare
        col_names text[] = coalesce(
                array_agg(c.column_name order by c.ordinal_position),
                '{}'::text[]
            )
            from
                information_schema.columns c
            where
                format('%I.%I', c.table_schema, c.table_name)::regclass = new.entity
                and pg_catalog.has_column_privilege(
                    (new.claims ->> 'role'),
                    format('%I.%I', c.table_schema, c.table_name)::regclass,
                    c.column_name,
                    'SELECT'
                );
        filter realtime.user_defined_filter;
        col_type regtype;

        in_val jsonb;
    begin
        for filter in select * from unnest(new.filters) loop
            -- Filtered column is valid
            if not filter.column_name = any(col_names) then
                raise exception 'invalid column for filter %', filter.column_name;
            end if;

            -- Type is sanitized and safe for string interpolation
            col_type = (
                select atttypid::regtype
                from pg_catalog.pg_attribute
                where attrelid = new.entity
                      and attname = filter.column_name
            );
            if col_type is null then
                raise exception 'failed to lookup type for column %', filter.column_name;
            end if;

            -- Set maximum number of entries for in filter
            if filter.op = 'in'::realtime.equality_op then
                in_val = realtime.cast(filter.value, (col_type::text || '[]')::regtype);
                if coalesce(jsonb_array_length(in_val), 0) > 100 then
                    raise exception 'too many values for `in` filter. Maximum 100';
                end if;
            else
                -- raises an exception if value is not coercable to type
                perform realtime.cast(filter.value, col_type);
            end if;

        end loop;

        -- Apply consistent order to filters so the unique constraint on
        -- (subscription_id, entity, filters) can't be tricked by a different filter order
        new.filters = coalesce(
            array_agg(f order by f.column_name, f.op, f.value),
            '{}'
        ) from unnest(new.filters) f;

        return new;
    end;
    $function$


CREATE OR REPLACE FUNCTION realtime.to_regrole(role_name text)
 RETURNS regrole
 LANGUAGE sql
 IMMUTABLE
AS $function$ select role_name::regrole $function$


CREATE OR REPLACE FUNCTION realtime.topic()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
select nullif(current_setting('realtime.topic', true), '')::text;
$function$


CREATE OR REPLACE FUNCTION storage.can_insert_object(bucketid text, name text, owner uuid, metadata jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO "storage"."objects" ("bucket_id", "name", "owner", "metadata") VALUES (bucketid, name, owner, metadata);
  -- hack to rollback the successful insert
  RAISE sqlstate 'PT200' using
  message = 'ROLLBACK',
  detail = 'rollback successful insert';
END
$function$


CREATE OR REPLACE FUNCTION storage.delete_leaf_prefixes(bucket_ids text[], names text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_rows_deleted integer;
BEGIN
    LOOP
        WITH candidates AS (
            SELECT DISTINCT
                t.bucket_id,
                unnest(storage.get_prefixes(t.name)) AS name
            FROM unnest(bucket_ids, names) AS t(bucket_id, name)
        ),
        uniq AS (
             SELECT
                 bucket_id,
                 name,
                 storage.get_level(name) AS level
             FROM candidates
             WHERE name <> ''
             GROUP BY bucket_id, name
        ),
        leaf AS (
             SELECT
                 p.bucket_id,
                 p.name,
                 p.level
             FROM storage.prefixes AS p
                  JOIN uniq AS u
                       ON u.bucket_id = p.bucket_id
                           AND u.name = p.name
                           AND u.level = p.level
             WHERE NOT EXISTS (
                 SELECT 1
                 FROM storage.objects AS o
                 WHERE o.bucket_id = p.bucket_id
                   AND o.level = p.level + 1
                   AND o.name COLLATE "C" LIKE p.name || '/%'
             )
             AND NOT EXISTS (
                 SELECT 1
                 FROM storage.prefixes AS c
                 WHERE c.bucket_id = p.bucket_id
                   AND c.level = p.level + 1
                   AND c.name COLLATE "C" LIKE p.name || '/%'
             )
        )
        DELETE
        FROM storage.prefixes AS p
            USING leaf AS l
        WHERE p.bucket_id = l.bucket_id
          AND p.name = l.name
          AND p.level = l.level;

        GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
        EXIT WHEN v_rows_deleted = 0;
    END LOOP;
END;
$function$


CREATE OR REPLACE FUNCTION storage.enforce_bucket_name_length()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
    if length(new.name) > 100 then
        raise exception 'bucket name "%" is too long (% characters). Max is 100.', new.name, length(new.name);
    end if;
    return new;
end;
$function$


CREATE OR REPLACE FUNCTION storage.extension(name text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    _parts text[];
    _filename text;
BEGIN
    SELECT string_to_array(name, '/') INTO _parts;
    SELECT _parts[array_length(_parts,1)] INTO _filename;
    RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$function$


CREATE OR REPLACE FUNCTION storage.filename(name text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
_parts text[];
BEGIN
	select string_to_array(name, '/') into _parts;
	return _parts[array_length(_parts,1)];
END
$function$


CREATE OR REPLACE FUNCTION storage.foldername(name text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    _parts text[];
BEGIN
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Return everything except the last segment
    RETURN _parts[1 : array_length(_parts,1) - 1];
END
$function$


CREATE OR REPLACE FUNCTION storage.get_common_prefix(p_key text, p_prefix text, p_delimiter text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
SELECT CASE
    WHEN position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)) > 0
    THEN left(p_key, length(p_prefix) + position(p_delimiter IN substring(p_key FROM length(p_prefix) + 1)))
    ELSE NULL
END;
$function$


CREATE OR REPLACE FUNCTION storage.get_level(name text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
SELECT array_length(string_to_array("name", '/'), 1);
$function$


CREATE OR REPLACE FUNCTION storage.get_prefix(name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
SELECT
    CASE WHEN strpos("name", '/') > 0 THEN
             regexp_replace("name", '[\/]{1}[^\/]+\/?$', '')
         ELSE
             ''
        END;
$function$


CREATE OR REPLACE FUNCTION storage.get_prefixes(name text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE STRICT
AS $function$
DECLARE
    parts text[];
    prefixes text[];
    prefix text;
BEGIN
    -- Split the name into parts by '/'
    parts := string_to_array("name", '/');
    prefixes := '{}';

    -- Construct the prefixes, stopping one level below the last part
    FOR i IN 1..array_length(parts, 1) - 1 LOOP
            prefix := array_to_string(parts[1:i], '/');
            prefixes := array_append(prefixes, prefix);
    END LOOP;

    RETURN prefixes;
END;
$function$


CREATE OR REPLACE FUNCTION storage.get_size_by_bucket()
 RETURNS TABLE(size bigint, bucket_id text)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
    return query
        select sum((metadata->>'size')::bigint) as size, obj.bucket_id
        from "storage".objects as obj
        group by obj.bucket_id;
END
$function$


CREATE OR REPLACE FUNCTION storage.list_multipart_uploads_with_delimiter(bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text)
 RETURNS TABLE(key text, id text, created_at timestamp with time zone)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY EXECUTE
        'SELECT DISTINCT ON(key COLLATE "C") * from (
            SELECT
                CASE
                    WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                        substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1)))
                    ELSE
                        key
                END AS key, id, created_at
            FROM
                storage.s3_multipart_uploads
            WHERE
                bucket_id = $5 AND
                key ILIKE $1 || ''%'' AND
                CASE
                    WHEN $4 != '''' AND $6 = '''' THEN
                        CASE
                            WHEN position($2 IN substring(key from length($1) + 1)) > 0 THEN
                                substring(key from 1 for length($1) + position($2 IN substring(key from length($1) + 1))) COLLATE "C" > $4
                            ELSE
                                key COLLATE "C" > $4
                            END
                    ELSE
                        true
                END AND
                CASE
                    WHEN $6 != '''' THEN
                        id COLLATE "C" > $6
                    ELSE
                        true
                    END
            ORDER BY
                key COLLATE "C" ASC, created_at ASC) as e order by key COLLATE "C" LIMIT $3'
        USING prefix_param, delimiter_param, max_keys, next_key_token, bucket_id, next_upload_token;
END;
$function$


CREATE OR REPLACE FUNCTION storage.list_objects_with_delimiter(_bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text)
 RETURNS TABLE(name text, id uuid, metadata jsonb, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;

    -- Configuration
    v_is_asc BOOLEAN;
    v_prefix TEXT;
    v_start TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_is_asc := lower(coalesce(sort_order, 'asc')) = 'asc';
    v_prefix := coalesce(prefix_param, '');
    v_start := CASE WHEN coalesce(next_token, '') <> '' THEN next_token ELSE coalesce(start_after, '') END;
    v_file_batch_size := LEAST(GREATEST(max_keys * 2, 100), 1000);

    -- Calculate upper bound for prefix filtering (bytewise, using COLLATE "C")
    IF v_prefix = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix, 1) = delimiter_param THEN
        v_upper_bound := left(v_prefix, -1) || chr(ascii(delimiter_param) + 1);
    ELSE
        v_upper_bound := left(v_prefix, -1) || chr(ascii(right(v_prefix, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'AND o.name COLLATE "C" < $3 ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" >= $2 ' ||
                'ORDER BY o.name COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'AND o.name COLLATE "C" >= $3 ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND o.name COLLATE "C" < $2 ' ||
                'ORDER BY o.name COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- ========================================================================
    -- SEEK INITIALIZATION: Determine starting position
    -- ========================================================================
    IF v_start = '' THEN
        IF v_is_asc THEN
            v_next_seek := v_prefix;
        ELSE
            -- DESC without cursor: find the last item in range
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_next_seek FROM storage.objects o
                WHERE o.bucket_id = _bucket_id
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;

            IF v_next_seek IS NOT NULL THEN
                v_next_seek := v_next_seek || delimiter_param;
            ELSE
                RETURN;
            END IF;
        END IF;
    ELSE
        -- Cursor provided: determine if it refers to a folder or leaf
        IF EXISTS (
            SELECT 1 FROM storage.objects o
            WHERE o.bucket_id = _bucket_id
              AND o.name COLLATE "C" LIKE v_start || delimiter_param || '%'
            LIMIT 1
        ) THEN
            -- Cursor refers to a folder
            IF v_is_asc THEN
                v_next_seek := v_start || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_start || delimiter_param;
            END IF;
        ELSE
            -- Cursor refers to a leaf object
            IF v_is_asc THEN
                v_next_seek := v_start || delimiter_param;
            ELSE
                v_next_seek := v_start;
            END IF;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= max_keys;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek AND o.name COLLATE "C" < v_upper_bound
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" >= v_next_seek
                ORDER BY o.name COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek AND o.name COLLATE "C" >= v_prefix
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = _bucket_id AND o.name COLLATE "C" < v_next_seek
                ORDER BY o.name COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(v_peek_name, v_prefix, delimiter_param);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Emit and skip to next folder (no heap access needed)
            name := rtrim(v_common_prefix, delimiter_param);
            id := NULL;
            updated_at := NULL;
            created_at := NULL;
            last_accessed_at := NULL;
            metadata := NULL;
            RETURN NEXT;
            v_count := v_count + 1;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := left(v_common_prefix, -1) || chr(ascii(delimiter_param) + 1);
            ELSE
                v_next_seek := v_common_prefix;
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query USING _bucket_id, v_next_seek,
                CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix) ELSE v_prefix END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(v_current.name, v_prefix, delimiter_param);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := v_current.name;
                    EXIT;
                END IF;

                -- Emit file
                name := v_current.name;
                id := v_current.id;
                updated_at := v_current.updated_at;
                created_at := v_current.created_at;
                last_accessed_at := v_current.last_accessed_at;
                metadata := v_current.metadata;
                RETURN NEXT;
                v_count := v_count + 1;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := v_current.name || delimiter_param;
                ELSE
                    v_next_seek := v_current.name;
                END IF;

                EXIT WHEN v_count >= max_keys;
            END LOOP;
        END IF;
    END LOOP;
END;
$function$


CREATE OR REPLACE FUNCTION storage.operation()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
    RETURN current_setting('storage.operation', true);
END;
$function$


CREATE OR REPLACE FUNCTION storage.protect_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$function$


CREATE OR REPLACE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text)
 RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_peek_name TEXT;
    v_current RECORD;
    v_common_prefix TEXT;
    v_delimiter CONSTANT TEXT := '/';

    -- Configuration
    v_limit INT;
    v_prefix TEXT;
    v_prefix_lower TEXT;
    v_is_asc BOOLEAN;
    v_order_by TEXT;
    v_sort_order TEXT;
    v_upper_bound TEXT;
    v_file_batch_size INT;

    -- Dynamic SQL for batch query only
    v_batch_query TEXT;

    -- Seek state
    v_next_seek TEXT;
    v_count INT := 0;
    v_skipped INT := 0;
BEGIN
    -- ========================================================================
    -- INITIALIZATION
    -- ========================================================================
    v_limit := LEAST(coalesce(limits, 100), 1500);
    v_prefix := coalesce(prefix, '') || coalesce(search, '');
    v_prefix_lower := lower(v_prefix);
    v_is_asc := lower(coalesce(sortorder, 'asc')) = 'asc';
    v_file_batch_size := LEAST(GREATEST(v_limit * 2, 100), 1000);

    -- Validate sort column
    CASE lower(coalesce(sortcolumn, 'name'))
        WHEN 'name' THEN v_order_by := 'name';
        WHEN 'updated_at' THEN v_order_by := 'updated_at';
        WHEN 'created_at' THEN v_order_by := 'created_at';
        WHEN 'last_accessed_at' THEN v_order_by := 'last_accessed_at';
        ELSE v_order_by := 'name';
    END CASE;

    v_sort_order := CASE WHEN v_is_asc THEN 'asc' ELSE 'desc' END;

    -- ========================================================================
    -- NON-NAME SORTING: Use path_tokens approach (unchanged)
    -- ========================================================================
    IF v_order_by != 'name' THEN
        RETURN QUERY EXECUTE format(
            $sql$
            WITH folders AS (
                SELECT path_tokens[$1] AS folder
                FROM storage.objects
                WHERE objects.name ILIKE $2 || '%%'
                  AND bucket_id = $3
                  AND array_length(objects.path_tokens, 1) <> $1
                GROUP BY folder
                ORDER BY folder %s
            )
            (SELECT folder AS "name",
                   NULL::uuid AS id,
                   NULL::timestamptz AS updated_at,
                   NULL::timestamptz AS created_at,
                   NULL::timestamptz AS last_accessed_at,
                   NULL::jsonb AS metadata FROM folders)
            UNION ALL
            (SELECT path_tokens[$1] AS "name",
                   id, updated_at, created_at, last_accessed_at, metadata
             FROM storage.objects
             WHERE objects.name ILIKE $2 || '%%'
               AND bucket_id = $3
               AND array_length(objects.path_tokens, 1) = $1
             ORDER BY %I %s)
            LIMIT $4 OFFSET $5
            $sql$, v_sort_order, v_order_by, v_sort_order
        ) USING levels, v_prefix, bucketname, v_limit, offsets;
        RETURN;
    END IF;

    -- ========================================================================
    -- NAME SORTING: Hybrid skip-scan with batch optimization
    -- ========================================================================

    -- Calculate upper bound for prefix filtering
    IF v_prefix_lower = '' THEN
        v_upper_bound := NULL;
    ELSIF right(v_prefix_lower, 1) = v_delimiter THEN
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(v_delimiter) + 1);
    ELSE
        v_upper_bound := left(v_prefix_lower, -1) || chr(ascii(right(v_prefix_lower, 1)) + 1);
    END IF;

    -- Build batch query (dynamic SQL - called infrequently, amortized over many rows)
    IF v_is_asc THEN
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'AND lower(o.name) COLLATE "C" < $3 ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" >= $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" ASC LIMIT $4';
        END IF;
    ELSE
        IF v_upper_bound IS NOT NULL THEN
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'AND lower(o.name) COLLATE "C" >= $3 ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        ELSE
            v_batch_query := 'SELECT o.name, o.id, o.updated_at, o.created_at, o.last_accessed_at, o.metadata ' ||
                'FROM storage.objects o WHERE o.bucket_id = $1 AND lower(o.name) COLLATE "C" < $2 ' ||
                'ORDER BY lower(o.name) COLLATE "C" DESC LIMIT $4';
        END IF;
    END IF;

    -- Initialize seek position
    IF v_is_asc THEN
        v_next_seek := v_prefix_lower;
    ELSE
        -- DESC: find the last item in range first (static SQL)
        IF v_upper_bound IS NOT NULL THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower AND lower(o.name) COLLATE "C" < v_upper_bound
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSIF v_prefix_lower <> '' THEN
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_prefix_lower
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        ELSE
            SELECT o.name INTO v_peek_name FROM storage.objects o
            WHERE o.bucket_id = bucketname
            ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
        END IF;

        IF v_peek_name IS NOT NULL THEN
            v_next_seek := lower(v_peek_name) || v_delimiter;
        ELSE
            RETURN;
        END IF;
    END IF;

    -- ========================================================================
    -- MAIN LOOP: Hybrid peek-then-batch algorithm
    -- Uses STATIC SQL for peek (hot path) and DYNAMIC SQL for batch
    -- ========================================================================
    LOOP
        EXIT WHEN v_count >= v_limit;

        -- STEP 1: PEEK using STATIC SQL (plan cached, very fast)
        IF v_is_asc THEN
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek AND lower(o.name) COLLATE "C" < v_upper_bound
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" >= v_next_seek
                ORDER BY lower(o.name) COLLATE "C" ASC LIMIT 1;
            END IF;
        ELSE
            IF v_upper_bound IS NOT NULL THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSIF v_prefix_lower <> '' THEN
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek AND lower(o.name) COLLATE "C" >= v_prefix_lower
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            ELSE
                SELECT o.name INTO v_peek_name FROM storage.objects o
                WHERE o.bucket_id = bucketname AND lower(o.name) COLLATE "C" < v_next_seek
                ORDER BY lower(o.name) COLLATE "C" DESC LIMIT 1;
            END IF;
        END IF;

        EXIT WHEN v_peek_name IS NULL;

        -- STEP 2: Check if this is a FOLDER or FILE
        v_common_prefix := storage.get_common_prefix(lower(v_peek_name), v_prefix_lower, v_delimiter);

        IF v_common_prefix IS NOT NULL THEN
            -- FOLDER: Handle offset, emit if needed, skip to next folder
            IF v_skipped < offsets THEN
                v_skipped := v_skipped + 1;
            ELSE
                name := split_part(rtrim(storage.get_common_prefix(v_peek_name, v_prefix, v_delimiter), v_delimiter), v_delimiter, levels);
                id := NULL;
                updated_at := NULL;
                created_at := NULL;
                last_accessed_at := NULL;
                metadata := NULL;
                RETURN NEXT;
                v_count := v_count + 1;
            END IF;

            -- Advance seek past the folder range
            IF v_is_asc THEN
                v_next_seek := lower(left(v_common_prefix, -1)) || chr(ascii(v_delimiter) + 1);
            ELSE
                v_next_seek := lower(v_common_prefix);
            END IF;
        ELSE
            -- FILE: Batch fetch using DYNAMIC SQL (overhead amortized over many rows)
            -- For ASC: upper_bound is the exclusive upper limit (< condition)
            -- For DESC: prefix_lower is the inclusive lower limit (>= condition)
            FOR v_current IN EXECUTE v_batch_query
                USING bucketname, v_next_seek,
                    CASE WHEN v_is_asc THEN COALESCE(v_upper_bound, v_prefix_lower) ELSE v_prefix_lower END, v_file_batch_size
            LOOP
                v_common_prefix := storage.get_common_prefix(lower(v_current.name), v_prefix_lower, v_delimiter);

                IF v_common_prefix IS NOT NULL THEN
                    -- Hit a folder: exit batch, let peek handle it
                    v_next_seek := lower(v_current.name);
                    EXIT;
                END IF;

                -- Handle offset skipping
                IF v_skipped < offsets THEN
                    v_skipped := v_skipped + 1;
                ELSE
                    -- Emit file
                    name := split_part(v_current.name, v_delimiter, levels);
                    id := v_current.id;
                    updated_at := v_current.updated_at;
                    created_at := v_current.created_at;
                    last_accessed_at := v_current.last_accessed_at;
                    metadata := v_current.metadata;
                    RETURN NEXT;
                    v_count := v_count + 1;
                END IF;

                -- Advance seek past this file
                IF v_is_asc THEN
                    v_next_seek := lower(v_current.name) || v_delimiter;
                ELSE
                    v_next_seek := lower(v_current.name);
                END IF;

                EXIT WHEN v_count >= v_limit;
            END LOOP;
        END IF;
    END LOOP;
END;
$function$


CREATE OR REPLACE FUNCTION storage.search_by_timestamp(p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text)
 RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_cursor_op text;
    v_query text;
    v_prefix text;
BEGIN
    v_prefix := coalesce(p_prefix, '');

    IF p_sort_order = 'asc' THEN
        v_cursor_op := '>';
    ELSE
        v_cursor_op := '<';
    END IF;

    v_query := format($sql$
        WITH raw_objects AS (
            SELECT
                o.name AS obj_name,
                o.id AS obj_id,
                o.updated_at AS obj_updated_at,
                o.created_at AS obj_created_at,
                o.last_accessed_at AS obj_last_accessed_at,
                o.metadata AS obj_metadata,
                storage.get_common_prefix(o.name, $1, '/') AS common_prefix
            FROM storage.objects o
            WHERE o.bucket_id = $2
              AND o.name COLLATE "C" LIKE $1 || '%%'
        ),
        -- Aggregate common prefixes (folders)
        -- Both created_at and updated_at use MIN(obj_created_at) to match the old prefixes table behavior
        aggregated_prefixes AS (
            SELECT
                rtrim(common_prefix, '/') AS name,
                NULL::uuid AS id,
                MIN(obj_created_at) AS updated_at,
                MIN(obj_created_at) AS created_at,
                NULL::timestamptz AS last_accessed_at,
                NULL::jsonb AS metadata,
                TRUE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NOT NULL
            GROUP BY common_prefix
        ),
        leaf_objects AS (
            SELECT
                obj_name AS name,
                obj_id AS id,
                obj_updated_at AS updated_at,
                obj_created_at AS created_at,
                obj_last_accessed_at AS last_accessed_at,
                obj_metadata AS metadata,
                FALSE AS is_prefix
            FROM raw_objects
            WHERE common_prefix IS NULL
        ),
        combined AS (
            SELECT * FROM aggregated_prefixes
            UNION ALL
            SELECT * FROM leaf_objects
        ),
        filtered AS (
            SELECT *
            FROM combined
            WHERE (
                $5 = ''
                OR ROW(
                    date_trunc('milliseconds', %I),
                    name COLLATE "C"
                ) %s ROW(
                    COALESCE(NULLIF($6, '')::timestamptz, 'epoch'::timestamptz),
                    $5
                )
            )
        )
        SELECT
            split_part(name, '/', $3) AS key,
            name,
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
        FROM filtered
        ORDER BY
            COALESCE(date_trunc('milliseconds', %I), 'epoch'::timestamptz) %s,
            name COLLATE "C" %s
        LIMIT $4
    $sql$,
        p_sort_column,
        v_cursor_op,
        p_sort_column,
        p_sort_order,
        p_sort_order
    );

    RETURN QUERY EXECUTE v_query
    USING v_prefix, p_bucket_id, p_level, p_limit, p_start_after, p_sort_column_after;
END;
$function$


CREATE OR REPLACE FUNCTION storage.search_legacy_v1(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text)
 RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
    v_order_by text;
    v_sort_order text;
begin
    case
        when sortcolumn = 'name' then
            v_order_by = 'name';
        when sortcolumn = 'updated_at' then
            v_order_by = 'updated_at';
        when sortcolumn = 'created_at' then
            v_order_by = 'created_at';
        when sortcolumn = 'last_accessed_at' then
            v_order_by = 'last_accessed_at';
        else
            v_order_by = 'name';
        end case;

    case
        when sortorder = 'asc' then
            v_sort_order = 'asc';
        when sortorder = 'desc' then
            v_sort_order = 'desc';
        else
            v_sort_order = 'asc';
        end case;

    v_order_by = v_order_by || ' ' || v_sort_order;

    return query execute
        'with folders as (
           select path_tokens[$1] as folder
           from storage.objects
             where objects.name ilike $2 || $3 || ''%''
               and bucket_id = $4
               and array_length(objects.path_tokens, 1) <> $1
           group by folder
           order by folder ' || v_sort_order || '
     )
     (select folder as "name",
            null as id,
            null as updated_at,
            null as created_at,
            null as last_accessed_at,
            null as metadata from folders)
     union all
     (select path_tokens[$1] as "name",
            id,
            updated_at,
            created_at,
            last_accessed_at,
            metadata
     from storage.objects
     where objects.name ilike $2 || $3 || ''%''
       and bucket_id = $4
       and array_length(objects.path_tokens, 1) = $1
     order by ' || v_order_by || ')
     limit $5
     offset $6' using levels, prefix, search, bucketname, limits, offsets;
end;
$function$


CREATE OR REPLACE FUNCTION storage.search_v2(prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text)
 RETURNS TABLE(key text, name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_sort_col text;
    v_sort_ord text;
    v_limit int;
BEGIN
    -- Cap limit to maximum of 1500 records
    v_limit := LEAST(coalesce(limits, 100), 1500);

    -- Validate and normalize sort_order
    v_sort_ord := lower(coalesce(sort_order, 'asc'));
    IF v_sort_ord NOT IN ('asc', 'desc') THEN
        v_sort_ord := 'asc';
    END IF;

    -- Validate and normalize sort_column
    v_sort_col := lower(coalesce(sort_column, 'name'));
    IF v_sort_col NOT IN ('name', 'updated_at', 'created_at') THEN
        v_sort_col := 'name';
    END IF;

    -- Route to appropriate implementation
    IF v_sort_col = 'name' THEN
        -- Use list_objects_with_delimiter for name sorting (most efficient: O(k * log n))
        RETURN QUERY
        SELECT
            split_part(l.name, '/', levels) AS key,
            l.name AS name,
            l.id,
            l.updated_at,
            l.created_at,
            l.last_accessed_at,
            l.metadata
        FROM storage.list_objects_with_delimiter(
            bucket_name,
            coalesce(prefix, ''),
            '/',
            v_limit,
            start_after,
            '',
            v_sort_ord
        ) l;
    ELSE
        -- Use aggregation approach for timestamp sorting
        -- Not efficient for large datasets but supports correct pagination
        RETURN QUERY SELECT * FROM storage.search_by_timestamp(
            prefix, bucket_name, v_limit, levels, start_after,
            v_sort_ord, v_sort_col, sort_column_after
        );
    END IF;
END;
$function$


CREATE OR REPLACE FUNCTION storage.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW; 
END;
$function$



-- Triggers

CREATE TRIGGER cron_job_cache_invalidate AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON cron.job FOR EACH STATEMENT EXECUTE FUNCTION cron.job_cache_invalidate();

CREATE TRIGGER trg_notify_booking_attendance_event AFTER INSERT ON booking_attendance_events FOR EACH ROW EXECUTE FUNCTION notify_booking_attendance_event();

CREATE TRIGGER trigger_insert_slot_counts AFTER INSERT ON gig_applications FOR EACH ROW WHEN (new.status = 'accepted'::text) EXECUTE FUNCTION update_gig_slot_counts();

CREATE TRIGGER trigger_update_rejected_at BEFORE UPDATE ON gig_applications FOR EACH ROW EXECUTE FUNCTION update_application_rejected_at();

CREATE TRIGGER trigger_update_slot_counts AFTER UPDATE ON gig_applications FOR EACH ROW EXECUTE FUNCTION update_gig_slot_counts();

CREATE TRIGGER sync_group_conversation_on_member_change AFTER INSERT OR DELETE OR UPDATE ON group_members FOR EACH ROW EXECUTE FUNCTION sync_group_conversation_members();

CREATE TRIGGER auto_add_group_owner_trigger AFTER INSERT ON groups FOR EACH ROW EXECUTE FUNCTION auto_add_group_owner_to_members();

CREATE TRIGGER trigger_update_conversation_timestamp AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION update_conversation_timestamp();

CREATE TRIGGER trg_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION set_notification_preferences_updated_at();

CREATE TRIGGER trg_studio_promotions_updated_at BEFORE UPDATE ON studio_promotions FOR EACH ROW EXECUTE FUNCTION set_updated_at_studio_promotions();

CREATE TRIGGER on_withdrawal_status_change AFTER UPDATE OF status ON withdrawal_requests FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION process_withdrawal_balance();

CREATE TRIGGER trg_prevent_withdrawal_snapshot_mutation BEFORE UPDATE ON withdrawal_requests FOR EACH ROW EXECUTE FUNCTION prevent_withdrawal_snapshot_mutation();

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();