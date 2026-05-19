-- Live Supabase schema SQL export
-- Project ref: aefldxegsvzecshlayza
-- Generated: 2026-05-19T13:28:53+08:00
-- Source: Supabase Management API read-only SQL endpoint + pg_catalog introspection
-- Note: Docker/pg_dump was unavailable locally, so this is a catalog-generated schema-only DDL snapshot.
-- Note: Schema-level GRANT lines are omitted because pg_namespace ACLs are not exposed by this read-only endpoint.


-- schema
CREATE SCHEMA IF NOT EXISTS auth;

CREATE SCHEMA IF NOT EXISTS cron;

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE SCHEMA IF NOT EXISTS graphql;

CREATE SCHEMA IF NOT EXISTS graphql_public;

CREATE SCHEMA IF NOT EXISTS net;

CREATE SCHEMA IF NOT EXISTS pgbouncer;

CREATE SCHEMA IF NOT EXISTS private_archive;

CREATE SCHEMA IF NOT EXISTS public;

CREATE SCHEMA IF NOT EXISTS realtime;

CREATE SCHEMA IF NOT EXISTS storage;

CREATE SCHEMA IF NOT EXISTS supabase_migrations;

CREATE SCHEMA IF NOT EXISTS vault;


-- extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


-- enum
CREATE TYPE auth.aal_level AS ENUM ('aal1', 'aal2', 'aal3');

CREATE TYPE auth.code_challenge_method AS ENUM ('s256', 'plain');

CREATE TYPE auth.factor_status AS ENUM ('unverified', 'verified');

CREATE TYPE auth.factor_type AS ENUM ('totp', 'webauthn', 'phone');

CREATE TYPE auth.oauth_authorization_status AS ENUM ('pending', 'approved', 'denied', 'expired');

CREATE TYPE auth.oauth_client_type AS ENUM ('public', 'confidential');

CREATE TYPE auth.oauth_registration_type AS ENUM ('dynamic', 'manual');

CREATE TYPE auth.oauth_response_type AS ENUM ('code');

CREATE TYPE auth.one_time_token_type AS ENUM ('confirmation_token', 'reauthentication_token', 'recovery_token', 'email_change_token_new', 'email_change_token_current', 'phone_change_token');

CREATE TYPE public.verification_status_enum AS ENUM ('NOT_STARTED', 'PENDING', 'PENDING_REVIEW', 'APPROVED', 'DECLINED', 'ABANDONED');

CREATE TYPE realtime.action AS ENUM ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'ERROR');

CREATE TYPE realtime.equality_op AS ENUM ('eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'in');

CREATE TYPE storage.buckettype AS ENUM ('STANDARD', 'ANALYTICS', 'VECTOR');


-- composite_type
CREATE TYPE realtime.user_defined_filter AS (
    column_name text,
    op realtime.equality_op,
    value text
);

CREATE TYPE realtime.wal_column AS (
    name text,
    type_name text,
    type_oid oid,
    value jsonb,
    is_pkey boolean,
    is_selectable boolean
);

CREATE TYPE realtime.wal_rls AS (
    wal jsonb,
    is_rls_enabled boolean,
    subscription_ids uuid[],
    errors text[]
);


-- sequence
CREATE SEQUENCE auth.refresh_tokens_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;

CREATE SEQUENCE private_archive.venue_invite_member_cleanup_20260513_archive_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;

CREATE SEQUENCE realtime.subscription_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;


-- sequence_owner
ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;

ALTER SEQUENCE private_archive.venue_invite_member_cleanup_20260513_archive_id_seq OWNED BY private_archive.venue_invite_member_cleanup_20260513.archive_id;


-- table
CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone,
    ip_address character varying(64) DEFAULT ''::character varying NOT NULL
);

CREATE TABLE auth.custom_oauth_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_type text NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    client_id text NOT NULL,
    client_secret text NOT NULL,
    acceptable_client_ids text[] DEFAULT '{}'::text[] NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    pkce_enabled boolean DEFAULT true NOT NULL,
    attribute_mapping jsonb DEFAULT '{}'::jsonb NOT NULL,
    authorization_params jsonb DEFAULT '{}'::jsonb NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    email_optional boolean DEFAULT false NOT NULL,
    issuer text,
    discovery_url text,
    skip_nonce_check boolean DEFAULT false NOT NULL,
    cached_discovery jsonb,
    discovery_cached_at timestamp with time zone,
    authorization_url text,
    token_url text,
    userinfo_url text,
    jwks_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE auth.flow_state (
    id uuid NOT NULL,
    user_id uuid,
    auth_code text,
    code_challenge_method auth.code_challenge_method,
    code_challenge text,
    provider_type text NOT NULL,
    provider_access_token text,
    provider_refresh_token text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    authentication_method text NOT NULL,
    auth_code_issued_at timestamp with time zone,
    invite_token text,
    referrer text,
    oauth_client_state_id uuid,
    linking_target_id uuid,
    email_optional boolean DEFAULT false NOT NULL
);

CREATE TABLE auth.identities (
    provider_id text NOT NULL,
    user_id uuid NOT NULL,
    identity_data jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    email text GENERATED ALWAYS AS (lower((identity_data ->> 'email'::text))) STORED,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

CREATE TABLE auth.mfa_amr_claims (
    session_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    authentication_method text NOT NULL,
    id uuid NOT NULL
);

CREATE TABLE auth.mfa_challenges (
    id uuid NOT NULL,
    factor_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    ip_address inet NOT NULL,
    otp_code text,
    web_authn_session_data jsonb
);

CREATE TABLE auth.mfa_factors (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    friendly_name text,
    factor_type auth.factor_type NOT NULL,
    status auth.factor_status NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    secret text,
    phone text,
    last_challenged_at timestamp with time zone,
    web_authn_credential jsonb,
    web_authn_aaguid uuid,
    last_webauthn_challenge_data jsonb
);

CREATE TABLE auth.oauth_authorizations (
    id uuid NOT NULL,
    authorization_id text NOT NULL,
    client_id uuid NOT NULL,
    user_id uuid,
    redirect_uri text NOT NULL,
    scope text NOT NULL,
    state text,
    resource text,
    code_challenge text,
    code_challenge_method auth.code_challenge_method,
    response_type auth.oauth_response_type DEFAULT 'code'::auth.oauth_response_type NOT NULL,
    status auth.oauth_authorization_status DEFAULT 'pending'::auth.oauth_authorization_status NOT NULL,
    authorization_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:03:00'::interval) NOT NULL,
    approved_at timestamp with time zone,
    nonce text
);

CREATE TABLE auth.oauth_client_states (
    id uuid NOT NULL,
    provider_type text NOT NULL,
    code_verifier text,
    created_at timestamp with time zone NOT NULL
);

CREATE TABLE auth.oauth_clients (
    id uuid NOT NULL,
    client_secret_hash text,
    registration_type auth.oauth_registration_type NOT NULL,
    redirect_uris text NOT NULL,
    grant_types text NOT NULL,
    client_name text,
    client_uri text,
    logo_uri text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    client_type auth.oauth_client_type DEFAULT 'confidential'::auth.oauth_client_type NOT NULL,
    token_endpoint_auth_method text NOT NULL
);

CREATE TABLE auth.oauth_consents (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    client_id uuid NOT NULL,
    scopes text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);

CREATE TABLE auth.one_time_tokens (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    token_type auth.one_time_token_type NOT NULL,
    token_hash text NOT NULL,
    relates_to text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass) NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    parent character varying(255),
    session_id uuid
);

CREATE TABLE auth.saml_providers (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    entity_id text NOT NULL,
    metadata_xml text NOT NULL,
    metadata_url text,
    attribute_mapping jsonb,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    name_id_format text
);

CREATE TABLE auth.saml_relay_states (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    request_id text NOT NULL,
    for_email text,
    redirect_to text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    flow_state_id uuid
);

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);

CREATE TABLE auth.sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
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
    scopes text
);

CREATE TABLE auth.sso_domains (
    id uuid NOT NULL,
    sso_provider_id uuid NOT NULL,
    domain text NOT NULL,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

CREATE TABLE auth.sso_providers (
    id uuid NOT NULL,
    resource_id text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    disabled boolean
);

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
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
    phone text DEFAULT NULL::character varying,
    phone_confirmed_at timestamp with time zone,
    phone_change text DEFAULT ''::character varying,
    phone_change_token character varying(255) DEFAULT ''::character varying,
    phone_change_sent_at timestamp with time zone,
    confirmed_at timestamp with time zone GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current character varying(255) DEFAULT ''::character varying,
    email_change_confirm_status smallint DEFAULT 0,
    banned_until timestamp with time zone,
    reauthentication_token character varying(255) DEFAULT ''::character varying,
    reauthentication_sent_at timestamp with time zone,
    is_sso_user boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    is_anonymous boolean DEFAULT false NOT NULL
);

CREATE TABLE auth.webauthn_challenges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    challenge_type text NOT NULL,
    session_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);

CREATE TABLE auth.webauthn_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    credential_id bytea NOT NULL,
    public_key bytea NOT NULL,
    attestation_type text DEFAULT ''::text NOT NULL,
    aaguid uuid,
    sign_count bigint DEFAULT 0 NOT NULL,
    transports jsonb DEFAULT '[]'::jsonb NOT NULL,
    backup_eligible boolean DEFAULT false NOT NULL,
    backed_up boolean DEFAULT false NOT NULL,
    friendly_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone
);

CREATE TABLE private_archive.venue_invite_member_cleanup_20260513 (
    archive_id bigint DEFAULT nextval('private_archive.venue_invite_member_cleanup_20260513_archive_id_seq'::regclass) NOT NULL,
    cleanup_run_id uuid NOT NULL,
    archived_at timestamp with time zone DEFAULT now() NOT NULL,
    table_name text NOT NULL,
    row_pk text NOT NULL,
    row_data jsonb NOT NULL
);

CREATE TABLE private_archive.venue_partnership_deals_20260427 (
    archived_at timestamp with time zone,
    source_table text,
    id uuid,
    venue_owner_id uuid,
    production_team_id uuid,
    gig_id uuid,
    title text,
    status text,
    proposed_by_user_id uuid,
    accepted_term_version_id uuid,
    settled_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);

CREATE TABLE public.address_verification_sessions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
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
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.audit_event_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    audit_event_id uuid NOT NULL,
    column_name text NOT NULL,
    old_value text,
    new_value text
);

CREATE TABLE public.audit_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    occurred_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    actor_user_id uuid,
    target_user_id uuid,
    actor_role text,
    action text NOT NULL,
    entity_schema text DEFAULT 'public'::text NOT NULL,
    entity_table text NOT NULL,
    entity_id text NOT NULL,
    entity_label text,
    source text DEFAULT 'database'::text NOT NULL,
    request_id text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.booking_attendance_events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    booking_id uuid NOT NULL,
    reporter_user_id uuid,
    event_type text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.booking_cancellation_policies (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    name text DEFAULT 'Standard Policy'::text NOT NULL,
    full_refund_hours_before integer DEFAULT 48 NOT NULL,
    partial_refund_hours_before integer DEFAULT 24 NOT NULL,
    partial_refund_pct numeric DEFAULT 50 NOT NULL,
    no_show_penalty_pct numeric DEFAULT 100 NOT NULL,
    late_cancel_penalty_pct numeric DEFAULT 50 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.booking_holds (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    studio_id uuid NOT NULL,
    booking_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.booking_incidents (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
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
    penalty_event_id uuid
);

CREATE TABLE public.booking_penalty_events (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
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
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.booking_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid,
    group_id uuid,
    message text,
    status text DEFAULT 'pending'::text,
    event_details jsonb,
    attachment_url text,
    studio_id uuid
);

CREATE TABLE public.conversation_participants (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    conversation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text,
    joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    last_read_at timestamp with time zone,
    is_muted boolean DEFAULT false NOT NULL,
    muted_until timestamp with time zone
);

CREATE TABLE public.conversations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    studio_booking_id uuid,
    gig_application_id uuid,
    gig_id uuid,
    group_id uuid,
    studio_id uuid,
    is_group boolean DEFAULT false
);

CREATE TABLE public.didit_webhook_events (
    event_key text NOT NULL,
    session_id text,
    status text,
    payload_hash text NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.email_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_email text NOT NULL,
    recipient_name text,
    subject text NOT NULL,
    html_content text,
    template_type text,
    status text DEFAULT 'pending'::text,
    error_message text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.external_platform_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    platform text NOT NULL,
    url text NOT NULL,
    label text,
    linked_playlist_id uuid,
    linked_item_id uuid,
    click_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.favorites (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    group_id uuid,
    studio_id uuid,
    gig_id uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    profile_id uuid
);

CREATE TABLE public.feed_posts (
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.follows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    follower_id uuid NOT NULL,
    followed_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    followed_type text DEFAULT 'profile'::text NOT NULL
);

CREATE TABLE public.gig_applications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
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
    performer_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.gig_availability_slots (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    gig_id uuid NOT NULL,
    day_of_week smallint,
    slot_date date,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_available boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.gig_deletion_audit (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    gig_id uuid NOT NULL,
    organizer_id uuid,
    deleted_by uuid,
    deleted_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    gig_snapshot jsonb NOT NULL,
    related_counts jsonb NOT NULL,
    applicant_counts jsonb NOT NULL,
    storage_cleanup jsonb,
    reason text
);

CREATE TABLE public.gig_media (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    gig_id uuid NOT NULL,
    media_type text NOT NULL,
    media_url text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.gig_requirements (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    gig_id uuid NOT NULL,
    requirement_key text NOT NULL,
    requirement_value jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.gig_slot_fill_applicants (
    gig_id uuid NOT NULL,
    slot_type text NOT NULL,
    applicant_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.gig_slot_fill_summary (
    gig_id uuid NOT NULL,
    slot_type text NOT NULL,
    accepted_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.gigs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
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
    permit_resubmissions_used integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.group_availability_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    day_of_week smallint,
    slot_date date,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_available boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.group_deletion_audit (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    group_id uuid NOT NULL,
    owner_id uuid,
    deleted_by uuid,
    deleted_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    group_snapshot jsonb NOT NULL,
    related_counts jsonb NOT NULL,
    application_counts jsonb NOT NULL,
    reason text
);

CREATE TABLE public.group_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    media_type text DEFAULT 'image'::text NOT NULL,
    media_url text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.group_members (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text,
    joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.group_playlists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    playlist_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.group_roster_members (
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
    raw_member jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.groups (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
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
    open_group_applications boolean DEFAULT true NOT NULL
);

CREATE TABLE public.identity_document_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    role text NOT NULL,
    document_fingerprint text,
    document_type text,
    document_type_key text,
    document_country text DEFAULT 'PHL'::text NOT NULL,
    source text DEFAULT 'DIDIT'::text NOT NULL,
    status text DEFAULT 'APPROVED'::text NOT NULL,
    didit_session_id text,
    manual_review_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    original_user_id uuid,
    normalized_email text,
    claim_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    deleted_profile_at timestamp with time zone,
    verified_full_legal_name text,
    normalized_full_legal_name text,
    birth_date date
);

CREATE TABLE public.leadership_transfer_requests (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    group_id uuid NOT NULL,
    from_user_id uuid NOT NULL,
    to_user_id uuid NOT NULL,
    status text DEFAULT 'pending'::text,
    message text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    responded_at timestamp with time zone
);

CREATE TABLE public.manual_identity_reviews (
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
    submitted_role text,
    didit_session_id text,
    document_fingerprint text,
    duplicate_reason text,
    duplicate_match_count integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    verified_full_legal_name text,
    normalized_full_legal_name text,
    birth_date date,
    review_reason text,
    matched_on text
);

CREATE TABLE public.message_reactions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    message_id uuid NOT NULL,
    user_id uuid NOT NULL,
    emoji text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE public.messages (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text NOT NULL,
    message_type text DEFAULT 'text'::text,
    attachment_url text,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.normalization_exceptions (
    table_name text NOT NULL,
    column_name text NOT NULL,
    rationale text NOT NULL,
    approved_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_by_user_id uuid
);

CREATE TABLE public.notification_preferences (
    user_id uuid NOT NULL,
    booking_confirmed boolean DEFAULT true NOT NULL,
    awaiting_confirmation boolean DEFAULT true NOT NULL,
    upload_required boolean DEFAULT false NOT NULL,
    event_reminder boolean DEFAULT true NOT NULL,
    leave_review boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    push_enabled boolean DEFAULT true NOT NULL
);

CREATE TABLE public.notifications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    type text,
    title text NOT NULL,
    message text NOT NULL,
    read boolean DEFAULT false,
    image text,
    meta jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.order_fulfillments (
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    variant_id uuid,
    product_title text NOT NULL,
    variant_label text,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric NOT NULL,
    line_total numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.orders (
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.payout_methods (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    account_name text NOT NULL,
    account_number text NOT NULL,
    bank_name text,
    is_default boolean DEFAULT false,
    is_verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.permit_audit_log (
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
    admin_notes text
);

CREATE TABLE public.playlist_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    playlist_id uuid NOT NULL,
    title text NOT NULL,
    artist_name text,
    duration_seconds numeric,
    "position" integer DEFAULT 0 NOT NULL,
    teaser_asset_id uuid,
    external_link_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    audio_url text
);

CREATE TABLE public.playlist_play_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    playlist_id uuid,
    item_id uuid,
    station_id uuid,
    user_id uuid,
    event_type text NOT NULL,
    platform text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.playlist_teaser_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    playlist_id uuid NOT NULL,
    uploader_id uuid NOT NULL,
    asset_type text NOT NULL,
    storage_path text NOT NULL,
    mime_type text,
    duration_seconds numeric,
    file_size_bytes bigint,
    screen_result text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.playlists (
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.post_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    author_id uuid NOT NULL,
    parent_comment_id uuid,
    content text NOT NULL,
    is_hidden boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    moderation_status text DEFAULT 'approved'::text NOT NULL,
    moderation_reason text,
    moderation_categories jsonb DEFAULT '[]'::jsonb NOT NULL,
    moderation_score numeric,
    moderation_provider text,
    moderated_at timestamp with time zone,
    moderation_metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.post_media (
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
    thumbnail_path text,
    is_cover boolean DEFAULT false NOT NULL,
    safety_context text,
    safety_checked_at timestamp with time zone,
    safety_status text DEFAULT 'passed'::text NOT NULL,
    safety_metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.post_reactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reaction_type text DEFAULT 'like'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.product_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    media_type text DEFAULT 'image'::text NOT NULL,
    storage_path text NOT NULL,
    mime_type text,
    display_order integer DEFAULT 0,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    variant_label text NOT NULL,
    variant_type text DEFAULT 'size'::text NOT NULL,
    price_override numeric,
    sku text,
    stock_quantity integer DEFAULT 0,
    is_available boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.production_team_members (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.production_team_roster (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    entity_kind text NOT NULL,
    profile_id uuid,
    group_id uuid,
    added_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.production_teams (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    logo_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    open_production_applications boolean DEFAULT true NOT NULL
);

CREATE TABLE public.products (
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
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.profile_genres (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    profile_id uuid NOT NULL,
    genre text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.profile_portfolio_urls (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    profile_id uuid NOT NULL,
    portfolio_url text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.profile_skills (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    profile_id uuid NOT NULL,
    skill text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.profiles (
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
    show_gig_statuses boolean DEFAULT true NOT NULL
);

CREATE TABLE public.push_notification_devices (
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
    disabled_reason text
);

CREATE TABLE public.registration_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action text NOT NULL,
    email_hash text,
    ip_hash text,
    device_hash text,
    user_id uuid,
    didit_session_id text,
    blocked boolean DEFAULT false NOT NULL,
    success boolean DEFAULT false NOT NULL,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.reports (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
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
    escalation_reason text
);

CREATE TABLE public.review_likes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    review_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.reviews (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    author_id uuid NOT NULL,
    group_id uuid,
    studio_id uuid,
    gig_id uuid,
    user_id uuid,
    rating integer NOT NULL,
    content text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    studio_booking_id uuid,
    gig_application_id uuid
);

CREATE TABLE public.shipping_profiles (
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
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.social_activity_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    actor_id uuid NOT NULL,
    target_user_id uuid,
    post_id uuid,
    comment_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.station_playlist_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    station_id uuid NOT NULL,
    playlist_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    label text,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.stations (
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
    stream_url text,
    stream_status text DEFAULT 'offline'::text NOT NULL,
    now_playing_title text,
    now_playing_artist text,
    last_seen_live_at timestamp with time zone
);

CREATE TABLE public.studio_amenities (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    amenity text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.studio_availability_slots (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    day_of_week smallint,
    slot_date date,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_open boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.studio_booking_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.studio_bookings (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
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
    cancellation_policy_snapshot jsonb
);

CREATE TABLE public.studio_date_overrides (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    override_date date NOT NULL,
    is_open boolean DEFAULT false NOT NULL,
    open_time time without time zone,
    close_time time without time zone,
    reason text,
    slot_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.studio_deletion_audit (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    owner_id uuid,
    deleted_by uuid,
    deleted_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    studio_snapshot jsonb NOT NULL,
    related_counts jsonb NOT NULL,
    storage_cleanup jsonb,
    reason text
);

CREATE TABLE public.studio_instruments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    instrument_name text NOT NULL,
    image_url text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.studio_media (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    media_type text NOT NULL,
    media_url text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.studio_open_dates (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    open_date date NOT NULL,
    is_open boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.studio_operating_hours (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    is_open boolean DEFAULT true NOT NULL,
    open_time time without time zone,
    close_time time without time zone,
    slot_order integer DEFAULT 0,
    reason text,
    weekly_schedule_scope text,
    weekly_schedule_end_date date,
    weekly_schedule_dates jsonb
);

CREATE TABLE public.studio_owner_penalties (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    owner_id uuid NOT NULL,
    studio_id uuid NOT NULL,
    booking_id uuid NOT NULL,
    penalty_type text NOT NULL,
    penalty_points integer DEFAULT 1 NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.studio_promotions (
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
    minimum_spend numeric(12,2)
);

CREATE TABLE public.studio_settings (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
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
    weekly_schedule_scope text DEFAULT 'indefinite'::text NOT NULL,
    weekly_schedule_end_date date,
    weekly_schedule_dates jsonb DEFAULT '[]'::jsonb NOT NULL
);

CREATE TABLE public.studio_types (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    studio_id uuid NOT NULL,
    studio_type text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.studios (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
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
    studio_type text
);

CREATE TABLE public.subscription_payments (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
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
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.subscription_plans (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    description text,
    price numeric NOT NULL,
    features jsonb DEFAULT '[]'::jsonb,
    duration_days integer DEFAULT 30,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.subscriptions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
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
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.verification_sessions (
    session_ref text NOT NULL,
    verification_data jsonb,
    status text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.wallet_deposits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    checkout_session_id text NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.wallet_transactions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    wallet_id uuid NOT NULL,
    amount numeric NOT NULL,
    type text NOT NULL,
    description text,
    reference_id uuid,
    is_credit boolean DEFAULT true,
    status text DEFAULT 'completed'::text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    reference_type text
);

CREATE TABLE public.wallets (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    balance numeric DEFAULT 0.00,
    currency text DEFAULT 'PHP'::text,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.withdrawal_requests (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
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
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE realtime.messages (
    topic text NOT NULL,
    extension text NOT NULL,
    payload jsonb,
    event text,
    private boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    inserted_at timestamp without time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
) PARTITION BY RANGE (inserted_at);

CREATE TABLE realtime.schema_migrations (
    version bigint NOT NULL,
    inserted_at timestamp(0) without time zone
);

CREATE TABLE realtime.subscription (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
    subscription_id uuid NOT NULL,
    entity regclass NOT NULL,
    filters realtime.user_defined_filter[] DEFAULT '{}'::realtime.user_defined_filter[] NOT NULL,
    claims jsonb NOT NULL,
    claims_role regrole GENERATED ALWAYS AS (realtime.to_regrole((claims ->> 'role'::text))) STORED NOT NULL,
    created_at timestamp without time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    action_filter text DEFAULT '*'::text
);

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    public boolean DEFAULT false,
    avif_autodetection boolean DEFAULT false,
    file_size_limit bigint,
    allowed_mime_types text[],
    owner_id text,
    type storage.buckettype DEFAULT 'STANDARD'::storage.buckettype NOT NULL
);

CREATE TABLE storage.buckets_analytics (
    name text NOT NULL,
    type storage.buckettype DEFAULT 'ANALYTICS'::storage.buckettype NOT NULL,
    format text DEFAULT 'ICEBERG'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_at timestamp with time zone
);

CREATE TABLE storage.buckets_vectors (
    id text NOT NULL,
    type storage.buckettype DEFAULT 'VECTOR'::storage.buckettype NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb,
    path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/'::text)) STORED,
    version text,
    owner_id text,
    user_metadata jsonb
);

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text COLLATE pg_catalog."C" NOT NULL,
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb,
    metadata jsonb
);

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text COLLATE pg_catalog."C" NOT NULL,
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE storage.vector_indexes (
    id text DEFAULT gen_random_uuid() NOT NULL,
    name text COLLATE pg_catalog."C" NOT NULL,
    bucket_id text NOT NULL,
    data_type text NOT NULL,
    dimension integer NOT NULL,
    distance_metric text NOT NULL,
    metadata_configuration jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE supabase_migrations.schema_migrations (
    version text NOT NULL,
    statements text[],
    name text,
    created_by text,
    idempotency_key text,
    rollback text[]
);


-- partition
CREATE TABLE realtime.messages_2026_05_16 PARTITION OF realtime.messages FOR VALUES FROM ('2026-05-16 00:00:00') TO ('2026-05-17 00:00:00');

CREATE TABLE realtime.messages_2026_05_16_inserted_at_topic_idx PARTITION OF realtime.messages_inserted_at_topic_index ;

CREATE TABLE realtime.messages_2026_05_16_pkey PARTITION OF realtime.messages_pkey ;

CREATE TABLE realtime.messages_2026_05_17 PARTITION OF realtime.messages FOR VALUES FROM ('2026-05-17 00:00:00') TO ('2026-05-18 00:00:00');

CREATE TABLE realtime.messages_2026_05_17_inserted_at_topic_idx PARTITION OF realtime.messages_inserted_at_topic_index ;

CREATE TABLE realtime.messages_2026_05_17_pkey PARTITION OF realtime.messages_pkey ;

CREATE TABLE realtime.messages_2026_05_18 PARTITION OF realtime.messages FOR VALUES FROM ('2026-05-18 00:00:00') TO ('2026-05-19 00:00:00');

CREATE TABLE realtime.messages_2026_05_18_inserted_at_topic_idx PARTITION OF realtime.messages_inserted_at_topic_index ;

CREATE TABLE realtime.messages_2026_05_18_pkey PARTITION OF realtime.messages_pkey ;

CREATE TABLE realtime.messages_2026_05_19 PARTITION OF realtime.messages FOR VALUES FROM ('2026-05-19 00:00:00') TO ('2026-05-20 00:00:00');

CREATE TABLE realtime.messages_2026_05_19_inserted_at_topic_idx PARTITION OF realtime.messages_inserted_at_topic_index ;

CREATE TABLE realtime.messages_2026_05_19_pkey PARTITION OF realtime.messages_pkey ;

CREATE TABLE realtime.messages_2026_05_20 PARTITION OF realtime.messages FOR VALUES FROM ('2026-05-20 00:00:00') TO ('2026-05-21 00:00:00');

CREATE TABLE realtime.messages_2026_05_20_inserted_at_topic_idx PARTITION OF realtime.messages_inserted_at_topic_index ;

CREATE TABLE realtime.messages_2026_05_20_pkey PARTITION OF realtime.messages_pkey ;

CREATE TABLE realtime.messages_2026_05_21 PARTITION OF realtime.messages FOR VALUES FROM ('2026-05-21 00:00:00') TO ('2026-05-22 00:00:00');

CREATE TABLE realtime.messages_2026_05_21_inserted_at_topic_idx PARTITION OF realtime.messages_inserted_at_topic_index ;

CREATE TABLE realtime.messages_2026_05_21_pkey PARTITION OF realtime.messages_pkey ;

CREATE TABLE realtime.messages_2026_05_22 PARTITION OF realtime.messages FOR VALUES FROM ('2026-05-22 00:00:00') TO ('2026-05-23 00:00:00');

CREATE TABLE realtime.messages_2026_05_22_inserted_at_topic_idx PARTITION OF realtime.messages_inserted_at_topic_index ;

CREATE TABLE realtime.messages_2026_05_22_pkey PARTITION OF realtime.messages_pkey ;


-- function
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


CREATE OR REPLACE FUNCTION graphql_public.graphql("operationName" text DEFAULT NULL::text, query text DEFAULT NULL::text, variables jsonb DEFAULT NULL::jsonb, extensions jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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


CREATE OR REPLACE FUNCTION public.accept_gig_application_safely(p_application_id uuid, p_actor_user_id uuid, p_new_status text DEFAULT 'accepted'::text)
 RETURNS gig_applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app public.gig_applications%ROWTYPE;
  v_gig record;
  v_slot_type text;
  v_total_needed integer := 0;
  v_slot_needed integer := 0;
  v_total_filled integer := 0;
  v_slot_filled integer := 0;
BEGIN
  IF p_new_status NOT IN ('accepted', 'approved') THEN
    RAISE EXCEPTION 'Unsupported accepted status: %', p_new_status USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_app
  FROM public.gig_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT id, organizer_id, status
  INTO v_gig
  FROM public.gigs
  WHERE id = v_app.gig_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gig not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_gig.organizer_id IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_app.leader_approval_status = 'pending' THEN
    RAISE EXCEPTION 'Application is still awaiting group leader approval' USING ERRCODE = 'P0001';
  END IF;

  IF v_app.status = p_new_status THEN
    RETURN v_app;
  END IF;

  IF v_app.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending applications can be accepted' USING ERRCODE = 'P0001';
  END IF;

  v_slot_type := COALESCE(v_app.slot_type, CASE WHEN v_app.group_id IS NULL THEN 'solo' ELSE 'band' END);

  SELECT COALESCE((gr.requirement_value #>> '{}')::integer, 0)
  INTO v_total_needed
  FROM public.gig_requirements gr
  WHERE gr.gig_id = v_app.gig_id
    AND gr.requirement_key = 'total_slots_needed';

  SELECT COALESCE((gr.requirement_value -> v_slot_type ->> 'needed')::integer, 0)
  INTO v_slot_needed
  FROM public.gig_requirements gr
  WHERE gr.gig_id = v_app.gig_id
    AND gr.requirement_key = 'slots';

  SELECT count(*)
  INTO v_total_filled
  FROM public.gig_applications ga
  WHERE ga.gig_id = v_app.gig_id
    AND ga.id <> v_app.id
    AND ga.status = ANY (ARRAY['accepted'::text, 'approved'::text]);

  SELECT count(*)
  INTO v_slot_filled
  FROM public.gig_applications ga
  WHERE ga.gig_id = v_app.gig_id
    AND ga.id <> v_app.id
    AND COALESCE(ga.slot_type, CASE WHEN ga.group_id IS NULL THEN 'solo' ELSE 'band' END) = v_slot_type
    AND ga.status = ANY (ARRAY['accepted'::text, 'approved'::text]);

  IF v_total_needed > 0 AND v_total_filled >= v_total_needed THEN
    RAISE EXCEPTION 'All performer slots for this gig have been filled.' USING ERRCODE = 'P0001';
  END IF;

  IF v_slot_needed <= 0 THEN
    RAISE EXCEPTION 'This gig does not have an available % slot.', v_slot_type USING ERRCODE = 'P0001';
  END IF;

  IF v_slot_filled >= v_slot_needed THEN
    RAISE EXCEPTION 'All % slots have been filled. Try a different slot type.', v_slot_type USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.gig_applications
  SET status = p_new_status,
      updated_at = timezone('utc', now())
  WHERE id = v_app.id
  RETURNING * INTO v_app;

  RETURN v_app;
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


CREATE OR REPLACE FUNCTION public.admin_audit_feed(p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id text, entity_type text, action text, performer_name text, entity_name text, rejection_reason text, admin_notes text, amount numeric, refund_amount numeric, payment_status text, booking_status text, booking_id text, reference text, source text, changed_fields_count integer, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  WITH audit_change_summary AS (
    SELECT
      audit_event_id,
      count(*)::integer AS changed_fields_count,
      string_agg(column_name, ', ' ORDER BY column_name) FILTER (WHERE column_name IS NOT NULL) AS changed_fields
    FROM public.audit_event_changes
    GROUP BY audit_event_id
  ),
  unified AS (
    SELECT
      ae.id::text AS id,
      ae.entity_table::text AS entity_type,
      ae.action::text AS action,
      coalesce(actor.full_name, actor.email, ae.actor_user_id::text, ae.actor_role, 'System')::text AS performer_name,
      coalesce(ae.entity_label, ae.entity_table || ':' || ae.entity_id)::text AS entity_name,
      NULL::text AS rejection_reason,
      concat_ws(
        ' | ',
        'Source: ' || ae.source,
        CASE
          WHEN acs.changed_fields IS NOT NULL AND acs.changed_fields <> ''
            THEN 'Changed: ' || left(acs.changed_fields, 500)
          ELSE NULL
        END
      )::text AS admin_notes,
      NULL::numeric AS amount,
      NULL::numeric AS refund_amount,
      CASE WHEN ae.action LIKE 'payment_%' THEN replace(ae.action, 'payment_', '') ELSE NULL END::text AS payment_status,
      NULL::text AS booking_status,
      CASE WHEN ae.entity_table = 'studio_bookings' THEN ae.entity_id ELSE NULL END::text AS booking_id,
      ae.entity_id::text AS reference,
      ae.source::text AS source,
      coalesce(acs.changed_fields_count, 0)::integer AS changed_fields_count,
      ae.occurred_at AS created_at
    FROM public.audit_events ae
    LEFT JOIN public.profiles actor ON actor.id = ae.actor_user_id
    LEFT JOIN audit_change_summary acs ON acs.audit_event_id = ae.id

    UNION ALL

    SELECT
      'permit-' || pal.id::text AS id,
      pal.entity_type::text AS entity_type,
      pal.action::text AS action,
      coalesce(actor.full_name, actor.email, 'System')::text AS performer_name,
      coalesce(
        pal.metadata ->> 'entity_name',
        pal.entity_type || ':' || pal.entity_id::text
      )::text AS entity_name,
      coalesce(pal.rejection_reason, pal.reason)::text AS rejection_reason,
      coalesce(pal.admin_notes, pal.notes)::text AS admin_notes,
      NULL::numeric AS amount,
      NULL::numeric AS refund_amount,
      NULL::text AS payment_status,
      NULL::text AS booking_status,
      NULL::text AS booking_id,
      pal.entity_id::text AS reference,
      'permit-management'::text AS source,
      0::integer AS changed_fields_count,
      pal.created_at AS created_at
    FROM public.permit_audit_log pal
    LEFT JOIN public.profiles actor ON actor.id = pal.performed_by

    UNION ALL

    SELECT
      'studio-delete-' || sda.id::text AS id,
      'studio'::text AS entity_type,
      'delete'::text AS action,
      coalesce(actor.full_name, actor.email, 'System')::text AS performer_name,
      coalesce(sda.studio_snapshot ->> 'name', 'Studio ' || sda.studio_id::text)::text AS entity_name,
      sda.reason::text AS rejection_reason,
      'Existing studio deletion audit'::text AS admin_notes,
      NULL::numeric,
      NULL::numeric,
      NULL::text,
      NULL::text,
      NULL::text,
      sda.studio_id::text,
      'safe-delete-rpc'::text,
      0::integer,
      sda.deleted_at
    FROM public.studio_deletion_audit sda
    LEFT JOIN public.profiles actor ON actor.id = sda.deleted_by

    UNION ALL

    SELECT
      'gig-delete-' || gda.id::text AS id,
      'gig'::text AS entity_type,
      'delete'::text AS action,
      coalesce(actor.full_name, actor.email, 'System')::text AS performer_name,
      coalesce(gda.gig_snapshot ->> 'name', 'Gig ' || gda.gig_id::text)::text AS entity_name,
      gda.reason::text AS rejection_reason,
      'Existing gig deletion audit'::text AS admin_notes,
      NULL::numeric,
      NULL::numeric,
      NULL::text,
      NULL::text,
      NULL::text,
      gda.gig_id::text,
      'safe-delete-rpc'::text,
      0::integer,
      gda.deleted_at
    FROM public.gig_deletion_audit gda
    LEFT JOIN public.profiles actor ON actor.id = gda.deleted_by

    UNION ALL

    SELECT
      'group-delete-' || gda.id::text AS id,
      'group'::text AS entity_type,
      'delete'::text AS action,
      coalesce(actor.full_name, actor.email, 'System')::text AS performer_name,
      coalesce(gda.group_snapshot ->> 'name', 'Group ' || gda.group_id::text)::text AS entity_name,
      gda.reason::text AS rejection_reason,
      'Existing group deletion audit'::text AS admin_notes,
      NULL::numeric,
      NULL::numeric,
      NULL::text,
      NULL::text,
      NULL::text,
      gda.group_id::text,
      'safe-delete-rpc'::text,
      0::integer,
      gda.deleted_at
    FROM public.group_deletion_audit gda
    LEFT JOIN public.profiles actor ON actor.id = gda.deleted_by
  )
  SELECT *
  FROM unified
  WHERE public.is_admin(auth.uid())
  ORDER BY created_at DESC
  LIMIT greatest(1, least(500, coalesce(p_limit, 200)))
  OFFSET greatest(0, coalesce(p_offset, 0));
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
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  slot jsonb;
  other_slot jsonb;
  slot_start time;
  slot_end time;
  other_start time;
  other_end time;
  v_day_of_week integer;
  v_has_override boolean;
  v_seen_slots jsonb := '[]'::jsonb;
BEGIN
  IF p_time_slots IS NULL
    OR jsonb_typeof(p_time_slots) <> 'array'
    OR jsonb_array_length(p_time_slots) = 0
  THEN
    RETURN FALSE;
  END IF;

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

    FOR other_slot IN SELECT * FROM jsonb_array_elements(v_seen_slots)
    LOOP
      BEGIN
        other_start := (other_slot->>'start')::time;
        other_end := (other_slot->>'end')::time;
      EXCEPTION WHEN OTHERS THEN
        RETURN FALSE;
      END;

      IF slot_start < other_end AND slot_end > other_start THEN
        RETURN FALSE;
      END IF;
    END LOOP;

    v_seen_slots := v_seen_slots || jsonb_build_array(
      jsonb_build_object('start', slot_start::text, 'end', slot_end::text)
    );
  END LOOP;

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
    slot_start := (slot->>'start')::time;
    slot_end := (slot->>'end')::time;

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


CREATE OR REPLACE FUNCTION public.audit_capture_row_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  old_row jsonb;
  new_row jsonb;
  active_row jsonb;
  event_id uuid;
  actor_id uuid;
  target_id uuid;
  field_name text;
  old_value jsonb;
  new_value jsonb;
BEGIN
  IF current_setting('app.audit.disabled', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_SCHEMA <> 'public'
    OR TG_TABLE_NAME = ANY (ARRAY[
      'audit_events',
      'audit_event_changes',
      'permit_audit_log',
      'studio_deletion_audit',
      'gig_deletion_audit',
      'group_deletion_audit'
    ]) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  BEGIN
    old_row := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN public.audit_redact_row(to_jsonb(OLD)) ELSE NULL END;
    new_row := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN public.audit_redact_row(to_jsonb(NEW)) ELSE NULL END;

    IF TG_OP = 'UPDATE' AND old_row = new_row THEN
      RETURN NEW;
    END IF;

    active_row := coalesce(new_row, old_row, '{}'::jsonb);
    actor_id := public.audit_current_actor_id();
    IF TG_TABLE_NAME = 'profiles' THEN
      target_id := public.audit_uuid_from_row(active_row, ARRAY['id']);
    ELSE
      target_id := public.audit_uuid_from_row(active_row, ARRAY[
        'user_id',
        'profile_id',
        'owner_id',
        'organizer_id',
        'author_id',
        'creator_id',
        'seller_id',
        'buyer_id',
        'reporter_id',
        'sender_id',
        'receiver_id',
        'applicant_id',
        'submitted_by_user_id',
        'managed_profile_id',
        'uploader_id',
        'follower_id',
        'followed_id',
        'target_user_id',
        'penalized_user_id',
        'beneficiary_user_id',
        'processed_by',
        'reviewed_by',
        'resolved_by_user_id'
      ]);
    END IF;

    IF actor_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = actor_id) THEN
      actor_id := NULL;
    END IF;

    IF target_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = target_id) THEN
      target_id := NULL;
    END IF;

    INSERT INTO public.audit_events (
      actor_user_id,
      target_user_id,
      actor_role,
      action,
      entity_schema,
      entity_table,
      entity_id,
      entity_label,
      source,
      request_id,
      metadata
    )
    VALUES (
      actor_id,
      target_id,
      public.audit_current_actor_role(),
      public.audit_semantic_action(TG_TABLE_NAME, old_row, new_row, TG_OP),
      TG_TABLE_SCHEMA,
      TG_TABLE_NAME,
      public.audit_row_id(active_row),
      public.audit_entity_label(TG_TABLE_NAME, active_row),
      public.audit_current_source(),
      nullif(current_setting('request.request_id', true), ''),
      jsonb_build_object('operation', TG_OP)
    )
    RETURNING id INTO event_id;

    IF TG_OP = 'UPDATE' THEN
      FOR field_name IN
        SELECT key FROM jsonb_object_keys(coalesce(old_row, '{}'::jsonb)) AS old_keys(key)
        UNION
        SELECT key FROM jsonb_object_keys(coalesce(new_row, '{}'::jsonb)) AS new_keys(key)
      LOOP
        old_value := old_row -> field_name;
        new_value := new_row -> field_name;

        IF old_value IS DISTINCT FROM new_value THEN
          INSERT INTO public.audit_event_changes (audit_event_id, column_name, old_value, new_value)
          VALUES (
            event_id,
            field_name,
            public.audit_text_value(old_value),
            public.audit_text_value(new_value)
          );
        END IF;
      END LOOP;
    ELSIF TG_OP = 'INSERT' THEN
      FOR field_name, new_value IN SELECT * FROM jsonb_each(coalesce(new_row, '{}'::jsonb)) LOOP
        INSERT INTO public.audit_event_changes (audit_event_id, column_name, old_value, new_value)
        VALUES (event_id, field_name, NULL, public.audit_text_value(new_value));
      END LOOP;
    ELSIF TG_OP = 'DELETE' THEN
      FOR field_name, old_value IN SELECT * FROM jsonb_each(coalesce(old_row, '{}'::jsonb)) LOOP
        INSERT INTO public.audit_event_changes (audit_event_id, column_name, old_value, new_value)
        VALUES (event_id, field_name, public.audit_text_value(old_value), NULL);
      END LOOP;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'audit_capture_row_change failed for %.% %: %',
      TG_TABLE_SCHEMA,
      TG_TABLE_NAME,
      TG_OP,
      SQLERRM;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.audit_current_actor_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  configured_actor text;
  jwt_actor text;
BEGIN
  configured_actor := nullif(current_setting('app.audit.actor_user_id', true), '');
  IF configured_actor IS NOT NULL THEN
    BEGIN
      RETURN configured_actor::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
  END IF;

  BEGIN
    RETURN auth.uid();
  EXCEPTION WHEN others THEN
    NULL;
  END;

  jwt_actor := nullif(current_setting('request.jwt.claim.sub', true), '');
  IF jwt_actor IS NOT NULL THEN
    BEGIN
      RETURN jwt_actor::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
  END IF;

  RETURN NULL;
END;
$function$


CREATE OR REPLACE FUNCTION public.audit_current_actor_role()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  configured_role text;
  jwt_role text;
BEGIN
  configured_role := nullif(current_setting('app.audit.actor_role', true), '');
  IF configured_role IS NOT NULL THEN
    RETURN configured_role;
  END IF;

  jwt_role := nullif(current_setting('request.jwt.claim.role', true), '');
  IF jwt_role IS NOT NULL THEN
    RETURN jwt_role;
  END IF;

  RETURN current_user;
END;
$function$


CREATE OR REPLACE FUNCTION public.audit_current_source()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  configured_source text;
  jwt_role text;
BEGIN
  configured_source := nullif(current_setting('app.audit.source', true), '');
  IF configured_source IS NOT NULL THEN
    RETURN configured_source;
  END IF;

  jwt_role := nullif(current_setting('request.jwt.claim.role', true), '');
  IF jwt_role = 'service_role' THEN
    RETURN 'service_role';
  END IF;

  IF nullif(current_setting('request.method', true), '') IS NOT NULL THEN
    RETURN 'client';
  END IF;

  RETURN 'database';
END;
$function$


CREATE OR REPLACE FUNCTION public.audit_entity_label(p_table text, p_row jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  key text;
  value text;
BEGIN
  IF p_row IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH key IN ARRAY ARRAY[
    'name',
    'title',
    'full_name',
    'order_number',
    'subject',
    'recipient_email',
    'email',
    'message',
    'content',
    'booking_id',
    'id'
  ] LOOP
    value := nullif(btrim(p_row ->> key), '');
    IF value IS NOT NULL THEN
      RETURN left(value, 180);
    END IF;
  END LOOP;

  RETURN p_table || ':' || public.audit_row_id(p_row);
END;
$function$


CREATE OR REPLACE FUNCTION public.audit_redact_row(p_row jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb := '{}'::jsonb;
  key text;
  key_lc text;
  value jsonb;
  text_value text;
BEGIN
  IF p_row IS NULL THEN
    RETURN NULL;
  END IF;

  FOR key, value IN SELECT * FROM jsonb_each(p_row) LOOP
    key_lc := lower(key);

    IF key_lc = ANY (ARRAY[
      'password',
      'password_hash',
      'access_token',
      'refresh_token',
      'token',
      'secret',
      'authorization',
      'didit_session_id',
      'address_verification_session_id',
      'document_fingerprint',
      'front_image_path',
      'back_image_path',
      'selfie_image_path',
      'business_permit_url',
      'contract_url',
      'proof_url',
      'payment_intent_id',
      'checkout_session_id',
      'refund_id',
      'account_number',
      'account_name',
      'bank_name',
      'payout_account_number',
      'payout_account_name',
      'payout_bank_name',
      'claim_metadata',
      'metadata',
      'moderation_metadata',
      'safety_metadata'
    ])
    OR key_lc LIKE '%password%'
    OR key_lc LIKE '%token%'
    OR key_lc LIKE '%secret%'
    OR key_lc LIKE '%fingerprint%'
    OR key_lc LIKE '%document%'
    OR key_lc LIKE '%session_id%'
    OR key_lc LIKE '%account_number%'
    OR key_lc LIKE '%payment_intent%'
    OR key_lc LIKE '%checkout_session%'
    OR key_lc LIKE '%refund_id%'
    OR key_lc LIKE '%storage_path%'
    OR key_lc LIKE '%image_path%'
    OR key_lc LIKE '%media_url%'
    OR key_lc LIKE '%audio_url%'
    OR key_lc LIKE '%video_url%'
    OR key_lc LIKE '%avatar_url%'
    OR key_lc LIKE '%cover_image_url%'
    OR key_lc LIKE '%attachment_url%' THEN
      result := result || jsonb_build_object(key, '[redacted]');
    ELSIF jsonb_typeof(value) = 'string' THEN
      text_value := value #>> '{}';
      IF length(text_value) > 4000 THEN
        result := result || jsonb_build_object(key, left(text_value, 4000) || '...[truncated]');
      ELSE
        result := result || jsonb_build_object(key, value);
      END IF;
    ELSE
      result := result || jsonb_build_object(key, value);
    END IF;
  END LOOP;

  RETURN result;
END;
$function$


CREATE OR REPLACE FUNCTION public.audit_row_id(p_row jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  key text;
  value text;
BEGIN
  IF p_row IS NULL THEN
    RETURN md5('null');
  END IF;

  FOREACH key IN ARRAY ARRAY[
    'id',
    'event_key',
    'order_number',
    'booking_id',
    'request_id',
    'user_id',
    'profile_id',
    'group_id',
    'studio_id',
    'gig_id',
    'product_id',
    'playlist_id',
    'conversation_id',
    'message_id',
    'order_id'
  ] LOOP
    value := nullif(btrim(p_row ->> key), '');
    IF value IS NOT NULL THEN
      RETURN value;
    END IF;
  END LOOP;

  RETURN md5(p_row::text);
END;
$function$


CREATE OR REPLACE FUNCTION public.audit_semantic_action(p_table text, p_old jsonb, p_new jsonb, p_operation text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  next_value text;
BEGIN
  IF p_operation = 'INSERT' THEN
    RETURN 'create';
  ELSIF p_operation = 'DELETE' THEN
    RETURN 'delete';
  END IF;

  IF p_old ? 'payment_status'
    AND p_new ? 'payment_status'
    AND (p_old ->> 'payment_status') IS DISTINCT FROM (p_new ->> 'payment_status') THEN
    next_value := lower(coalesce(p_new ->> 'payment_status', 'unknown'));
    IF next_value = 'partial' THEN
      RETURN 'payment_partial';
    END IF;
    RETURN 'payment_' || replace(next_value, ' ', '_');
  END IF;

  IF p_old ? 'permit_status'
    AND p_new ? 'permit_status'
    AND (p_old ->> 'permit_status') IS DISTINCT FROM (p_new ->> 'permit_status') THEN
    RETURN replace(lower(coalesce(p_new ->> 'permit_status', 'update')), ' ', '_');
  END IF;

  IF p_old ? 'verification_status'
    AND p_new ? 'verification_status'
    AND (p_old ->> 'verification_status') IS DISTINCT FROM (p_new ->> 'verification_status') THEN
    RETURN 'verification_' || replace(lower(coalesce(p_new ->> 'verification_status', 'update')), ' ', '_');
  END IF;

  IF p_old ? 'status'
    AND p_new ? 'status'
    AND (p_old ->> 'status') IS DISTINCT FROM (p_new ->> 'status') THEN
    RETURN replace(lower(coalesce(p_new ->> 'status', 'update')), ' ', '_');
  END IF;

  IF p_old ? 'is_hidden'
    AND p_new ? 'is_hidden'
    AND (p_old ->> 'is_hidden') IS DISTINCT FROM (p_new ->> 'is_hidden') THEN
    IF coalesce((p_new ->> 'is_hidden')::boolean, false) THEN
      RETURN 'hide';
    END IF;
    RETURN 'restore';
  END IF;

  IF p_old ? 'read'
    AND p_new ? 'read'
    AND (p_old ->> 'read') IS DISTINCT FROM (p_new ->> 'read') THEN
    IF coalesce((p_new ->> 'read')::boolean, false) THEN
      RETURN 'read';
    END IF;
    RETURN 'unread';
  END IF;

  RETURN 'update';
END;
$function$


CREATE OR REPLACE FUNCTION public.audit_text_value(p_value jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  result text;
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(p_value) = 'string' THEN
    result := p_value #>> '{}';
  ELSE
    result := p_value::text;
  END IF;

  RETURN left(result, 4000);
END;
$function$


CREATE OR REPLACE FUNCTION public.audit_uuid_from_row(p_row jsonb, p_keys text[])
 RETURNS uuid
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  key text;
  value text;
BEGIN
  IF p_row IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH key IN ARRAY p_keys LOOP
    value := nullif(btrim(p_row ->> key), '');
    IF value IS NOT NULL THEN
      BEGIN
        RETURN value::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        NULL;
      END;
    END IF;
  END LOOP;

  RETURN NULL;
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


CREATE OR REPLACE FUNCTION public.build_production_roster_snapshot(p_roster_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snapshot jsonb;
BEGIN
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'roster_id', ptr.id,
    'team_id', ptr.team_id,
    'entity_kind', ptr.entity_kind,
    'profile_id', ptr.profile_id,
    'group_id', ptr.group_id,
    'display_name', COALESCE(p.full_name, g.name, 'Selected performer'),
    'avatar_url', p.avatar_url,
    'group_type', g.group_type,
    'group_genre', g.genre,
    'captured_at', timezone('utc', now())
  ))
  INTO v_snapshot
  FROM public.production_team_roster ptr
  LEFT JOIN public.profiles p ON p.id = ptr.profile_id
  LEFT JOIN public.groups g ON g.id = ptr.group_id
  WHERE ptr.id = p_roster_id;

  RETURN COALESCE(v_snapshot, '{}'::jsonb);
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


CREATE OR REPLACE FUNCTION public.claim_identity_document_approval(p_user_id uuid, p_role text, p_document_fingerprint text, p_normalized_email text DEFAULT NULL::text, p_document_type text DEFAULT NULL::text, p_document_type_key text DEFAULT NULL::text, p_document_country text DEFAULT 'PHL'::text, p_source text DEFAULT 'DIDIT'::text, p_didit_session_id text DEFAULT NULL::text, p_manual_review_id uuid DEFAULT NULL::uuid, p_claim_metadata jsonb DEFAULT '{}'::jsonb, p_duplicate_override boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.claim_identity_document_approval_v2(
    p_user_id,
    p_role,
    p_document_fingerprint,
    p_normalized_email,
    p_document_type,
    p_document_type_key,
    p_document_country,
    null,
    null,
    null,
    p_source,
    p_didit_session_id,
    p_manual_review_id,
    p_claim_metadata,
    p_duplicate_override
  );
$function$


CREATE OR REPLACE FUNCTION public.claim_identity_document_approval_v2(p_user_id uuid, p_role text, p_document_fingerprint text DEFAULT NULL::text, p_normalized_email text DEFAULT NULL::text, p_document_type text DEFAULT NULL::text, p_document_type_key text DEFAULT NULL::text, p_document_country text DEFAULT 'PHL'::text, p_full_legal_name text DEFAULT NULL::text, p_normalized_full_legal_name text DEFAULT NULL::text, p_birth_date date DEFAULT NULL::date, p_source text DEFAULT 'DIDIT'::text, p_didit_session_id text DEFAULT NULL::text, p_manual_review_id uuid DEFAULT NULL::uuid, p_claim_metadata jsonb DEFAULT '{}'::jsonb, p_duplicate_override boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_role text := lower(trim(coalesce(p_role, 'musician')));
  v_email text := lower(trim(coalesce(p_normalized_email, '')));
  v_document_fingerprint text := nullif(trim(coalesce(p_document_fingerprint, '')), '');
  v_country text := upper(trim(coalesce(p_document_country, 'PHL')));
  v_full_legal_name text := nullif(trim(coalesce(p_full_legal_name, '')), '');
  v_normalized_name text := public.normalize_identity_full_legal_name(coalesce(p_full_legal_name, p_normalized_full_legal_name));
  v_now timestamptz := now();
  v_matches jsonb := '[]'::jsonb;
  v_duplicate_count integer := 0;
  v_claim_id uuid;
  v_same_email_claim_id uuid;
  v_first_match_user_id uuid;
  v_review_reason text;
  v_matched_on text;
  v_match_source text := case
    when upper(coalesce(p_source, 'DIDIT')) = 'DIDIT' then 'DIDIT_ID_DOCUMENT'
    else upper(coalesce(p_source, 'IDENTITY_DOCUMENT'))
  end;
begin
  if p_user_id is null then
    return jsonb_build_object('decision', 'NO_CLAIM', 'claim_id', null, 'matches', v_matches);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    coalesce(v_document_fingerprint, 'MISSING_DOCUMENT_FINGERPRINT') || ':' ||
    v_role || ':' ||
    coalesce(v_normalized_name, '') || ':' ||
    coalesce(p_birth_date::text, ''),
    0
  ));

  if v_document_fingerprint is not null then
    select c.id
    into v_same_email_claim_id
    from public.identity_document_claims c
    left join public.profiles p on p.id = c.user_id
    where c.document_fingerprint = v_document_fingerprint
      and c.role = v_role
      and c.status = 'APPROVED'
      and c.user_id is distinct from p_user_id
      and v_email <> ''
      and coalesce(c.normalized_email, lower(p.email), '') = v_email
    limit 1;

    if v_same_email_claim_id is not null and not p_duplicate_override then
      return jsonb_build_object(
        'decision', 'EXISTING_ACCOUNT',
        'claim_id', v_same_email_claim_id,
        'review_reason', 'DUPLICATE_DOCUMENT_FINGERPRINT',
        'matched_on', 'DOCUMENT_FINGERPRINT',
        'matches', jsonb_build_array(jsonb_build_object('claim_id', v_same_email_claim_id))
      );
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'claim_id', c.id,
      'user_id', c.user_id,
      'original_user_id', c.original_user_id,
      'email', coalesce(c.normalized_email, lower(p.email)),
      'full_name', p.full_name,
      'role', c.role,
      'source', c.source,
      'verified_at', c.created_at,
      'matched_on', 'DOCUMENT_FINGERPRINT'
    )), '[]'::jsonb)
    into v_matches
    from public.identity_document_claims c
    left join public.profiles p on p.id = c.user_id
    where c.document_fingerprint = v_document_fingerprint
      and c.role = v_role
      and c.status = 'APPROVED'
      and c.user_id is distinct from p_user_id
      and (
        v_email = ''
        or coalesce(c.normalized_email, lower(p.email), '') = ''
        or coalesce(c.normalized_email, lower(p.email), '') <> v_email
      );

    v_duplicate_count := jsonb_array_length(v_matches);

    if v_duplicate_count > 0 and not p_duplicate_override then
      insert into public.identity_document_claims (
        user_id,
        original_user_id,
        normalized_email,
        role,
        document_fingerprint,
        document_type,
        document_type_key,
        document_country,
        verified_full_legal_name,
        normalized_full_legal_name,
        birth_date,
        source,
        status,
        didit_session_id,
        manual_review_id,
        claim_metadata,
        updated_at,
        last_seen_at
      )
      values (
        p_user_id,
        p_user_id,
        nullif(v_email, ''),
        v_role,
        v_document_fingerprint,
        p_document_type,
        p_document_type_key,
        coalesce(nullif(v_country, ''), 'PHL'),
        v_full_legal_name,
        v_normalized_name,
        p_birth_date,
        coalesce(nullif(p_source, ''), 'DIDIT_DUPLICATE'),
        'PENDING_REVIEW',
        p_didit_session_id,
        p_manual_review_id,
        coalesce(p_claim_metadata, '{}'::jsonb) || jsonb_build_object(
          'review_reason', 'DUPLICATE_DOCUMENT_FINGERPRINT',
          'matched_on', 'DOCUMENT_FINGERPRINT',
          'source', v_match_source,
          'duplicate_matches', v_matches
        ),
        v_now,
        v_now
      )
      on conflict (user_id, document_fingerprint, role) do update
        set normalized_email = excluded.normalized_email,
            verified_full_legal_name = coalesce(excluded.verified_full_legal_name, public.identity_document_claims.verified_full_legal_name),
            normalized_full_legal_name = coalesce(excluded.normalized_full_legal_name, public.identity_document_claims.normalized_full_legal_name),
            birth_date = coalesce(excluded.birth_date, public.identity_document_claims.birth_date),
            source = excluded.source,
            status = 'PENDING_REVIEW',
            didit_session_id = coalesce(excluded.didit_session_id, public.identity_document_claims.didit_session_id),
            manual_review_id = coalesce(excluded.manual_review_id, public.identity_document_claims.manual_review_id),
            claim_metadata = coalesce(public.identity_document_claims.claim_metadata, '{}'::jsonb) || excluded.claim_metadata,
            updated_at = v_now,
            last_seen_at = v_now
      returning id into v_claim_id;

      return jsonb_build_object(
        'decision', 'PENDING_REVIEW',
        'claim_id', v_claim_id,
        'matches', v_matches,
        'duplicate_count', v_duplicate_count,
        'review_reason', 'DUPLICATE_DOCUMENT_FINGERPRINT',
        'matched_on', 'DOCUMENT_FINGERPRINT'
      );
    end if;

    if v_duplicate_count > 0 and p_duplicate_override then
      update public.identity_document_claims c
      set
        status = 'REVOKED',
        claim_metadata = coalesce(c.claim_metadata, '{}'::jsonb) || jsonb_build_object(
          'revoked_by_duplicate_override', true,
          'replacement_user_id', p_user_id,
          'revoked_at', v_now,
          'override_metadata', coalesce(p_claim_metadata, '{}'::jsonb)
        ),
        updated_at = v_now
      where c.document_fingerprint = v_document_fingerprint
        and c.role = v_role
        and c.status = 'APPROVED'
        and c.user_id is distinct from p_user_id;
    end if;
  end if;

  if v_normalized_name is not null and p_birth_date is not null and not p_duplicate_override then
    select coalesce(jsonb_agg(jsonb_build_object(
      'claim_id', c.id,
      'user_id', c.user_id,
      'original_user_id', c.original_user_id,
      'email', coalesce(c.normalized_email, lower(p.email)),
      'full_name', coalesce(c.verified_full_legal_name, p.full_name),
      'role', c.role,
      'source', c.source,
      'verified_at', c.created_at,
      'matched_on', 'NAME_BIRTHDATE'
    )), '[]'::jsonb)
    into v_matches
    from public.identity_document_claims c
    left join public.profiles p on p.id = c.user_id
    where c.normalized_full_legal_name = v_normalized_name
      and c.birth_date = p_birth_date
      and c.role = v_role
      and c.status = 'APPROVED'
      and c.user_id is distinct from p_user_id;

    v_duplicate_count := jsonb_array_length(v_matches);

    if v_duplicate_count > 0 then
      select (v_matches -> 0 ->> 'user_id')::uuid into v_first_match_user_id;
      v_review_reason := 'SAME_NAME_BIRTHDATE_EXISTING_APPROVED_IDENTITY';
      v_matched_on := 'NAME_BIRTHDATE';

      insert into public.identity_document_claims (
        user_id,
        original_user_id,
        normalized_email,
        role,
        document_fingerprint,
        document_type,
        document_type_key,
        document_country,
        verified_full_legal_name,
        normalized_full_legal_name,
        birth_date,
        source,
        status,
        didit_session_id,
        manual_review_id,
        claim_metadata,
        updated_at,
        last_seen_at
      )
      values (
        p_user_id,
        p_user_id,
        nullif(v_email, ''),
        v_role,
        v_document_fingerprint,
        p_document_type,
        p_document_type_key,
        coalesce(nullif(v_country, ''), 'PHL'),
        v_full_legal_name,
        v_normalized_name,
        p_birth_date,
        coalesce(nullif(p_source, ''), 'DIDIT'),
        'PENDING_REVIEW',
        p_didit_session_id,
        p_manual_review_id,
        coalesce(p_claim_metadata, '{}'::jsonb) || jsonb_build_object(
          'review_reason', v_review_reason,
          'matched_on', v_matched_on,
          'source', v_match_source,
          'matched_existing_user_id', v_first_match_user_id,
          'duplicate_matches', v_matches,
          'missing_document_fingerprint', v_document_fingerprint is null
        ),
        v_now,
        v_now
      )
      on conflict (user_id, document_fingerprint, role) do update
        set normalized_email = excluded.normalized_email,
            verified_full_legal_name = coalesce(excluded.verified_full_legal_name, public.identity_document_claims.verified_full_legal_name),
            normalized_full_legal_name = coalesce(excluded.normalized_full_legal_name, public.identity_document_claims.normalized_full_legal_name),
            birth_date = coalesce(excluded.birth_date, public.identity_document_claims.birth_date),
            source = excluded.source,
            status = 'PENDING_REVIEW',
            didit_session_id = coalesce(excluded.didit_session_id, public.identity_document_claims.didit_session_id),
            manual_review_id = coalesce(excluded.manual_review_id, public.identity_document_claims.manual_review_id),
            claim_metadata = coalesce(public.identity_document_claims.claim_metadata, '{}'::jsonb) || excluded.claim_metadata,
            updated_at = v_now,
            last_seen_at = v_now
      returning id into v_claim_id;

      return jsonb_build_object(
        'decision', 'PENDING_REVIEW',
        'claim_id', v_claim_id,
        'matches', v_matches,
        'duplicate_count', v_duplicate_count,
        'review_reason', v_review_reason,
        'matched_on', v_matched_on,
        'matched_existing_user_id', v_first_match_user_id
      );
    end if;
  end if;

  if v_document_fingerprint is null then
    return jsonb_build_object(
      'decision', 'PENDING_REVIEW',
      'claim_id', null,
      'matches', '[]'::jsonb,
      'duplicate_count', 0,
      'review_reason', 'MISSING_DOCUMENT_FINGERPRINT',
      'matched_on', null
    );
  end if;

  insert into public.identity_document_claims (
    user_id,
    original_user_id,
    normalized_email,
    role,
    document_fingerprint,
    document_type,
    document_type_key,
    document_country,
    verified_full_legal_name,
    normalized_full_legal_name,
    birth_date,
    source,
    status,
    didit_session_id,
    manual_review_id,
    claim_metadata,
    updated_at,
    last_seen_at
  )
  values (
    p_user_id,
    p_user_id,
    nullif(v_email, ''),
    v_role,
    v_document_fingerprint,
    p_document_type,
    p_document_type_key,
    coalesce(nullif(v_country, ''), 'PHL'),
    v_full_legal_name,
    v_normalized_name,
    p_birth_date,
    coalesce(nullif(p_source, ''), 'DIDIT'),
    'APPROVED',
    p_didit_session_id,
    p_manual_review_id,
    coalesce(p_claim_metadata, '{}'::jsonb),
    v_now,
    v_now
  )
  on conflict (user_id, document_fingerprint, role) do update
    set normalized_email = excluded.normalized_email,
        document_type = coalesce(excluded.document_type, public.identity_document_claims.document_type),
        document_type_key = coalesce(excluded.document_type_key, public.identity_document_claims.document_type_key),
        document_country = excluded.document_country,
        verified_full_legal_name = coalesce(excluded.verified_full_legal_name, public.identity_document_claims.verified_full_legal_name),
        normalized_full_legal_name = coalesce(excluded.normalized_full_legal_name, public.identity_document_claims.normalized_full_legal_name),
        birth_date = coalesce(excluded.birth_date, public.identity_document_claims.birth_date),
        source = excluded.source,
        status = 'APPROVED',
        didit_session_id = coalesce(excluded.didit_session_id, public.identity_document_claims.didit_session_id),
        manual_review_id = coalesce(excluded.manual_review_id, public.identity_document_claims.manual_review_id),
        claim_metadata = coalesce(public.identity_document_claims.claim_metadata, '{}'::jsonb) || excluded.claim_metadata,
        updated_at = v_now,
        last_seen_at = v_now
  returning id into v_claim_id;

  return jsonb_build_object(
    'decision', 'APPROVED',
    'claim_id', v_claim_id,
    'matches', '[]'::jsonb,
    'duplicate_count', 0,
    'duplicate_override_applied', p_duplicate_override
  );
end;
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
  v_deleted_booking_request_count INTEGER := 0;
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
    'booking_requests', (SELECT COUNT(*) FROM public.booking_requests WHERE group_id = p_group_id),
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

  DELETE FROM public.booking_requests
  WHERE group_id = p_group_id;

  GET DIAGNOSTICS v_deleted_booking_request_count = ROW_COUNT;

  DELETE FROM public.groups
  WHERE id = p_group_id
    AND owner_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to delete group';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'group_id', p_group_id,
    'deleted_booking_requests', v_deleted_booking_request_count,
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
  v_deleted_booking_request_count INTEGER := 0;
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
    'favorites', (SELECT COUNT(*) FROM public.favorites WHERE studio_id = p_studio_id),
    'booking_requests', (SELECT COUNT(*) FROM public.booking_requests WHERE studio_id = p_studio_id)
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

  DELETE FROM public.booking_requests
  WHERE studio_id = p_studio_id;

  GET DIAGNOSTICS v_deleted_booking_request_count = ROW_COUNT;

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
    'deleted_booking_requests', v_deleted_booking_request_count,
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
  ELSIF TG_TABLE_NAME = 'playlists' THEN
    v_target_types := ARRAY['playlist', 'music'];
    v_entity_label := 'playlist';
  ELSIF TG_TABLE_NAME = 'feed_posts' THEN
    v_target_types := ARRAY['feed_post', 'post', 'feed post', 'feed-post', 'feed_posts'];
    v_entity_label := 'feed post';
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
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'reviewed_by'
  ) INTO v_has_column;
  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'reviewed_by = NULL'::text);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'reviewed_at'
  ) INTO v_has_column;
  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'reviewed_at = timezone(''utc'', now())'::text);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'moderation_action'
  ) INTO v_has_column;
  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'moderation_action = ''none'''::text);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'moderation_notes'
  ) INTO v_has_column;
  IF v_has_column THEN
    v_set_clauses := array_append(
      v_set_clauses,
      'moderation_notes = CASE WHEN moderation_notes IS NULL OR btrim(moderation_notes) = '''' THEN $3 ELSE moderation_notes || E''\n'' || $3 END'::text
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'escalation_status'
  ) INTO v_has_column;
  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'escalation_status = ''none'''::text);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'escalated_at'
  ) INTO v_has_column;
  IF v_has_column THEN
    v_set_clauses := array_append(v_set_clauses, 'escalated_at = NULL'::text);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports' AND column_name = 'escalation_reason'
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


CREATE OR REPLACE FUNCTION public.expire_unresolved_studio_payments(p_threshold_minutes integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE public.studio_bookings sb
  SET
    status = 'cancelled',
    cancellation_reason = 'Payment not received within time limit',
    updated_at = timezone('utc', now())
  WHERE sb.status IN ('pending', 'confirmed')
    AND sb.payment_status IN ('unpaid', 'pending', 'failed')
    AND sb.created_at < timezone('utc', now()) - make_interval(mins => GREATEST(COALESCE(p_threshold_minutes, 30), 1));

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


CREATE OR REPLACE FUNCTION public.guard_profile_sensitive_client_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_client_role text := auth.role();
begin
  if tg_op = 'INSERT' and new.email is not null then
    new.email := lower(new.email);
  end if;

  if v_client_role in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.role := lower(trim(coalesce(new.role, 'musician')));

      if new.id is distinct from auth.uid() then
        raise exception 'Profiles can only be inserted for the signed-in user'
          using errcode = '42501';
      end if;

      if new.role not in ('fan', 'musician') then
        raise exception 'Profile role must be assigned by trusted server code'
          using errcode = '42501';
      end if;

      if new.is_verified is true
        or upper(coalesce(new.verification_status, '')) in ('APPROVED', 'PENDING_REVIEW')
        or new.didit_session_id is not null
        or new.id_verified_at is not null
        or new.id_document_expiry is not null
        or coalesce(new.subscription_status, 'none') <> 'none'
        or new.subscription_expires_at is not null
        or new.subscription_plan_id is not null
        or new.smile_user_id is not null
      then
        raise exception 'Sensitive profile fields must be written by trusted server code'
          using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.email is distinct from old.email
        or new.role is distinct from old.role
        or new.is_verified is distinct from old.is_verified
        or new.verification_status is distinct from old.verification_status
        or new.didit_session_id is distinct from old.didit_session_id
        or new.id_verified_at is distinct from old.id_verified_at
        or new.id_document_expiry is distinct from old.id_document_expiry
        or new.subscription_status is distinct from old.subscription_status
        or new.subscription_expires_at is distinct from old.subscription_expires_at
        or new.subscription_plan_id is distinct from old.subscription_plan_id
        or new.smile_user_id is distinct from old.smile_user_id
      then
        raise exception 'Sensitive profile fields must be updated by trusted server code'
          using errcode = '42501';
      end if;
    end if;
  end if;

  if new.email is not null then
    new.email := lower(new.email);
  end if;

  return new;
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


CREATE OR REPLACE FUNCTION public.increment_post_share_count(p_post_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_share_count integer;
BEGIN
  UPDATE public.feed_posts
  SET share_count = share_count + 1
  WHERE id = p_post_id
  RETURNING share_count INTO v_share_count;

  RETURN coalesce(v_share_count, 0);
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


CREATE OR REPLACE FUNCTION public.normalize_identity_full_legal_name(p_value text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(upper(unaccent(coalesce(p_value, ''))), '[^A-Z0-9]+', ' ', 'g'),
        '\s+',
        ' ',
        'g'
      )
    ),
    ''
  );
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
    WHEN 'post' THEN 'feed_post'
    WHEN 'feed post' THEN 'feed_post'
    WHEN 'feed-post' THEN 'feed_post'
    WHEN 'feed_posts' THEN 'feed_post'
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


CREATE OR REPLACE FUNCTION public.notify_followers_on_feed_post_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_name text := 'Someone';
  v_actor_avatar text;
  v_excerpt text;
begin
  if new.author_id is null
    or coalesce(new.is_hidden, false) = true
    or lower(coalesce(new.visibility, 'public')) not in ('public', 'followers') then
    return new;
  end if;

  select
    coalesce(nullif(btrim(p.full_name), ''), 'Someone'),
    p.avatar_url
  into v_actor_name, v_actor_avatar
  from public.profiles p
  where p.id = new.author_id;

  v_excerpt := nullif(btrim(regexp_replace(coalesce(new.content, ''), '\s+', ' ', 'g')), '');

  perform public.notify_profile_followers(
    new.author_id,
    'followed_post_created',
    v_actor_name || ' posted something new',
    case
      when v_excerpt is not null then v_actor_name || ': ' || left(v_excerpt, 140)
      else v_actor_name || ' shared a new post.'
    end,
    v_actor_avatar,
    jsonb_build_object(
      'post_id', new.id,
      'route', '/post_details',
      'route_params', jsonb_build_object('post_id', new.id),
      'visibility', new.visibility
    )
  );

  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.notify_followers_on_gig_published()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_name text := 'Someone';
  v_actor_avatar text;
  v_was_visible boolean := false;
  v_is_visible boolean := false;
  v_gig_name text;
begin
  v_is_visible :=
    lower(coalesce(new.permit_status, 'pending_review')) = 'approved'
    and lower(coalesce(new.status, 'open')) = 'open';

  if tg_op = 'UPDATE' then
    v_was_visible :=
      lower(coalesce(old.permit_status, 'pending_review')) = 'approved'
      and lower(coalesce(old.status, 'open')) = 'open';

    if v_was_visible or not v_is_visible then
      return new;
    end if;
  elsif not v_is_visible then
    return new;
  end if;

  select
    coalesce(nullif(btrim(p.full_name), ''), 'Someone'),
    p.avatar_url
  into v_actor_name, v_actor_avatar
  from public.profiles p
  where p.id = new.organizer_id;

  v_gig_name := coalesce(nullif(btrim(new.name), ''), 'a new gig');

  perform public.notify_profile_followers(
    new.organizer_id,
    'followed_gig_created',
    v_actor_name || ' created a new gig',
    v_actor_name || ' created "' || left(v_gig_name, 120) || '".',
    v_actor_avatar,
    jsonb_build_object(
      'gig_id', new.id,
      'listing_id', new.id,
      'listing_type', 'gig',
      'listing_name', v_gig_name,
      'route', '/feed',
      'route_params', jsonb_build_object('reopenListingId', new.id)
    )
  );

  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.notify_followers_on_group_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_name text := 'Someone';
  v_actor_avatar text;
  v_group_name text;
begin
  if new.owner_id is null then
    return new;
  end if;

  select
    coalesce(nullif(btrim(p.full_name), ''), 'Someone'),
    p.avatar_url
  into v_actor_name, v_actor_avatar
  from public.profiles p
  where p.id = new.owner_id;

  v_group_name := coalesce(nullif(btrim(new.name), ''), 'a new group');

  perform public.notify_profile_followers(
    new.owner_id,
    'followed_group_created',
    v_actor_name || ' created a new group',
    v_actor_name || ' created "' || left(v_group_name, 120) || '".',
    v_actor_avatar,
    jsonb_build_object(
      'group_id', new.id,
      'listing_id', new.id,
      'listing_type', 'group',
      'listing_name', v_group_name,
      'route', '/group_details',
      'route_params', jsonb_build_object('id', new.id)
    )
  );

  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.notify_followers_on_production_team_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_name text := 'Someone';
  v_actor_avatar text;
  v_team_name text;
begin
  if new.owner_id is null then
    return new;
  end if;

  select
    coalesce(nullif(btrim(p.full_name), ''), 'Someone'),
    p.avatar_url
  into v_actor_name, v_actor_avatar
  from public.profiles p
  where p.id = new.owner_id;

  v_team_name := coalesce(nullif(btrim(new.name), ''), 'a new production team');

  perform public.notify_profile_followers(
    new.owner_id,
    'followed_production_created',
    v_actor_name || ' created a production team',
    v_actor_name || ' created "' || left(v_team_name, 120) || '".',
    coalesce(nullif(btrim(new.logo_url), ''), v_actor_avatar),
    jsonb_build_object(
      'production_team_id', new.id,
      'team_id', new.id,
      'listing_id', new.id,
      'listing_type', 'production_team',
      'listing_name', v_team_name,
      'route', '/production_team',
      'route_params', jsonb_build_object('teamId', new.id)
    )
  );

  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.notify_followers_on_studio_published()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_name text := 'Someone';
  v_actor_avatar text;
  v_actor_role text;
  v_label text := 'studio';
  v_type text := 'followed_studio_created';
  v_was_visible boolean := false;
  v_is_visible boolean := false;
  v_studio_name text;
begin
  v_is_visible := lower(coalesce(new.permit_status, 'pending_review')) = 'approved';

  if tg_op = 'UPDATE' then
    v_was_visible := lower(coalesce(old.permit_status, 'pending_review')) = 'approved';

    if v_was_visible or not v_is_visible then
      return new;
    end if;
  elsif not v_is_visible then
    return new;
  end if;

  select
    coalesce(nullif(btrim(p.full_name), ''), 'Someone'),
    p.avatar_url,
    lower(coalesce(p.role, ''))
  into v_actor_name, v_actor_avatar, v_actor_role
  from public.profiles p
  where p.id = new.owner_id;

  if v_actor_role = 'venue-owner' then
    v_label := 'venue';
    v_type := 'followed_venue_created';
  end if;

  v_studio_name := coalesce(nullif(btrim(new.name), ''), 'a new ' || v_label);

  perform public.notify_profile_followers(
    new.owner_id,
    v_type,
    v_actor_name || ' created a new ' || v_label,
    v_actor_name || ' created "' || left(v_studio_name, 120) || '".',
    v_actor_avatar,
    jsonb_build_object(
      'studio_id', new.id,
      'listing_id', new.id,
      'listing_type', 'studio',
      'display_listing_type', v_label,
      'listing_name', v_studio_name,
      'route', '/feed',
      'route_params', jsonb_build_object('reopenListingId', new.id)
    )
  );

  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.notify_profile_followers(p_actor_id uuid, p_type text, p_title text, p_message text, p_image text DEFAULT NULL::text, p_meta jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inserted integer := 0;
  v_event_type text := nullif(btrim(coalesce(p_type, '')), '');
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
begin
  if p_actor_id is null or v_event_type is null then
    return 0;
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    message,
    image,
    meta,
    read
  )
  select distinct
    f.follower_id,
    'info',
    left(coalesce(nullif(btrim(coalesce(p_title, '')), ''), 'New activity'), 180),
    left(coalesce(nullif(btrim(coalesce(p_message, '')), ''), 'Someone you follow has a new update.'), 500),
    nullif(btrim(coalesce(p_image, '')), ''),
    jsonb_strip_nulls(
      v_meta ||
      jsonb_build_object(
        'event_type', v_event_type,
        'notification_type', v_event_type,
        'type', v_event_type,
        'actor_id', p_actor_id,
        'profile_id', p_actor_id,
        'followed_user_id', p_actor_id
      )
    ),
    false
  from public.follows f
  where f.followed_type = 'profile'
    and f.followed_id = p_actor_id
    and f.follower_id <> p_actor_id;

  get diagnostics v_inserted = row_count;
  return v_inserted;
exception
  when others then
    raise warning 'notify_profile_followers failed for actor %, type %: %', p_actor_id, p_type, sqlerrm;
    return 0;
end;
$function$


CREATE OR REPLACE FUNCTION public.prevent_repeated_gig_application_cancellations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cancelled_count integer := 0;
BEGIN
  IF TG_OP <> 'INSERT' OR NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  IF NEW.production_team_id IS NOT NULL THEN
    SELECT count(*)
    INTO v_cancelled_count
    FROM public.gig_applications ga
    WHERE ga.gig_id = NEW.gig_id
      AND ga.production_team_id = NEW.production_team_id
      AND ga.status = 'cancelled'
      AND ga.updated_at >= timezone('utc', now()) - interval '30 days';
  ELSIF NEW.group_id IS NOT NULL THEN
    SELECT count(*)
    INTO v_cancelled_count
    FROM public.gig_applications ga
    WHERE ga.gig_id = NEW.gig_id
      AND ga.group_id = NEW.group_id
      AND ga.production_team_id IS NULL
      AND ga.status = 'cancelled'
      AND ga.updated_at >= timezone('utc', now()) - interval '30 days';
  ELSE
    SELECT count(*)
    INTO v_cancelled_count
    FROM public.gig_applications ga
    WHERE ga.gig_id = NEW.gig_id
      AND ga.applicant_id = NEW.applicant_id
      AND ga.group_id IS NULL
      AND ga.production_team_id IS NULL
      AND ga.status = 'cancelled'
      AND ga.updated_at >= timezone('utc', now()) - interval '30 days';
  END IF;

  IF v_cancelled_count >= 3 THEN
    RAISE EXCEPTION 'Maximum attempts reached for this gig.'
      USING ERRCODE = 'P0001',
            HINT = 'This applicant entity cancelled applications to this gig 3 times in the last 30 days.';
  END IF;

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


CREATE OR REPLACE FUNCTION public.process_mock_withdrawal(p_user_id uuid, p_payout_method_id uuid, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet public.wallets%ROWTYPE;
  v_payout_method public.payout_methods%ROWTYPE;
  v_amount numeric := round(coalesce(p_amount, 0)::numeric, 2);
  v_fee numeric := 0;
  v_net_amount numeric := 0;
  v_reference text;
  v_withdrawal public.withdrawal_requests%ROWTYPE;
  v_transaction_id uuid;
  v_last_four text;
  v_destination_label text;
  v_new_balance numeric;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing user_id';
  END IF;

  IF p_payout_method_id IS NULL THEN
    RAISE EXCEPTION 'Missing payout_method_id';
  END IF;

  IF v_amount < 100 THEN
    RAISE EXCEPTION 'Minimum withdrawal amount is PHP 100';
  END IF;

  SELECT *
  INTO v_payout_method
  FROM public.payout_methods
  WHERE id = p_payout_method_id
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout method not found';
  END IF;

  IF lower(v_payout_method.type) NOT IN ('gcash', 'maya', 'bank') THEN
    RAISE EXCEPTION 'Unsupported payout type: %. Supported types are GCash, Maya, and Bank.', v_payout_method.type;
  END IF;

  IF lower(v_payout_method.type) = 'bank' AND nullif(trim(coalesce(v_payout_method.bank_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Bank name is required for bank withdrawals';
  END IF;

  SELECT *
  INTO v_wallet
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, balance)
    VALUES (p_user_id, 0)
    RETURNING * INTO v_wallet;
  END IF;

  IF coalesce(v_wallet.balance, 0) < v_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  v_net_amount := v_amount - v_fee;
  v_last_four := right(regexp_replace(coalesce(v_payout_method.account_number, ''), '\s+', '', 'g'), 4);
  IF v_last_four = '' THEN
    v_last_four := '0000';
  END IF;

  v_destination_label := CASE
    WHEN lower(v_payout_method.type) = 'bank'
      THEN coalesce(nullif(trim(v_payout_method.bank_name), ''), 'Bank')
    ELSE upper(v_payout_method.type)
  END;

  v_reference :=
    'mock_wd_' ||
    to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') ||
    '_' ||
    left(replace(extensions.uuid_generate_v4()::text, '-', ''), 8);

  UPDATE public.wallets
  SET balance = coalesce(balance, 0) - v_amount,
      updated_at = timezone('utc'::text, now())
  WHERE id = v_wallet.id
  RETURNING balance INTO v_new_balance;

  INSERT INTO public.withdrawal_requests (
    user_id,
    wallet_id,
    payout_method_id,
    amount,
    fee,
    net_amount,
    status,
    payout_type,
    payout_account_name,
    payout_account_number,
    payout_bank_name,
    reference_number,
    notes,
    processed_at
  )
  VALUES (
    p_user_id,
    v_wallet.id,
    v_payout_method.id,
    v_amount,
    v_fee,
    v_net_amount,
    'completed',
    lower(v_payout_method.type),
    v_payout_method.account_name,
    v_payout_method.account_number,
    v_payout_method.bank_name,
    v_reference,
    'Mock cashout: simulated transfer only; no external money was sent.',
    timezone('utc'::text, now())
  )
  RETURNING * INTO v_withdrawal;

  INSERT INTO public.wallet_transactions (
    wallet_id,
    amount,
    type,
    description,
    reference_id,
    reference_type,
    is_credit,
    status
  )
  VALUES (
    v_wallet.id,
    v_amount,
    'withdrawal',
    '[MOCK] Withdrawal to ' || v_destination_label || ' - ****' || v_last_four,
    v_withdrawal.id,
    'withdrawal',
    false,
    'completed'
  )
  RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'mock_cashout', true,
    'reference', v_reference,
    'balance', v_new_balance,
    'withdrawal', to_jsonb(v_withdrawal),
    'transaction_id', v_transaction_id,
    'net_amount', v_net_amount,
    'destination_label', v_destination_label,
    'message', 'Mock cashout successful. PHP ' || to_char(v_net_amount, 'FM999,999,999,990.00') || ' was deducted from the real wallet balance; no external transfer was sent.'
  );
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


CREATE OR REPLACE FUNCTION public.set_audit_context(p_actor_user_id uuid DEFAULT NULL::uuid, p_source text DEFAULT NULL::text, p_actor_role text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_actor_user_id IS NOT NULL THEN
    PERFORM set_config('app.audit.actor_user_id', p_actor_user_id::text, true);
  END IF;

  IF nullif(btrim(coalesce(p_source, '')), '') IS NOT NULL THEN
    PERFORM set_config('app.audit.source', btrim(p_source), true);
  END IF;

  IF nullif(btrim(coalesce(p_actor_role, '')), '') IS NOT NULL THEN
    PERFORM set_config('app.audit.actor_role', btrim(p_actor_role), true);
  END IF;
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


CREATE OR REPLACE FUNCTION public.set_gig_application_performer_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.production_roster_id IS NOT NULL
    AND (
      TG_OP = 'INSERT'
      OR NEW.production_roster_id IS DISTINCT FROM OLD.production_roster_id
      OR NEW.performer_snapshot IS NULL
      OR NEW.performer_snapshot = '{}'::jsonb
    )
  THEN
    NEW.performer_snapshot := public.build_production_roster_snapshot(NEW.production_roster_id);
  END IF;

  IF NEW.performer_snapshot IS NULL THEN
    NEW.performer_snapshot := '{}'::jsonb;
  END IF;

  RETURN NEW;
END;
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


CREATE OR REPLACE FUNCTION public.set_identity_name_birthdate_normalized()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if new.verified_full_legal_name is not null or new.normalized_full_legal_name is not null then
    new.normalized_full_legal_name := public.normalize_identity_full_legal_name(
      coalesce(new.verified_full_legal_name, new.normalized_full_legal_name)
    );
  end if;

  return new;
end;
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
declare
  v_existing_profile public.profiles%rowtype;
  v_claim record;
  v_should_activate boolean := false;
  v_role text := null;
begin
  if new.email_confirmed_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.email_confirmed_at is not distinct from new.email_confirmed_at
  then
    return new;
  end if;

  select *
  into v_existing_profile
  from public.profiles
  where id = new.id;

  select c.role, c.didit_session_id
  into v_claim
  from public.identity_document_claims c
  where c.status = 'APPROVED'
    and (c.user_id = new.id or c.original_user_id = new.id)
  order by c.last_seen_at desc nulls last, c.updated_at desc nulls last, c.created_at desc
  limit 1;

  v_should_activate :=
    upper(coalesce(v_existing_profile.verification_status, '')) = 'APPROVED'
    or v_claim.role is not null;

  if not v_should_activate then
    return new;
  end if;

  v_role := coalesce(nullif(v_existing_profile.role, ''), nullif(v_claim.role, ''), 'musician');

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
    lower(new.email),
    coalesce(
      nullif(v_existing_profile.full_name, ''),
      split_part(new.email, '@', 1)
    ),
    v_role,
    true,
    'APPROVED',
    coalesce(v_existing_profile.didit_session_id, v_claim.didit_session_id),
    coalesce(v_existing_profile.id_verified_at, new.email_confirmed_at, now())
  )
  on conflict (id) do update
    set email = lower(excluded.email),
        full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
        role = coalesce(nullif(public.profiles.role, ''), excluded.role),
        is_verified = true,
        verification_status = 'APPROVED',
        didit_session_id = coalesce(public.profiles.didit_session_id, excluded.didit_session_id),
        id_verified_at = coalesce(public.profiles.id_verified_at, excluded.id_verified_at);

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
                    'â Your Identity Has Been Verified - MusikaLokal',
                    format(
                        '<h1>ðµ MusikaLokal</h1>
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
      'Gig Terms Updated â Reconfirmation Required',
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
DECLARE
  old_visible boolean := false;
  new_visible boolean := false;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    old_visible :=
      coalesce(OLD.is_hidden, false) = false
      AND coalesce(OLD.moderation_status, 'approved') = 'approved';
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    new_visible :=
      coalesce(NEW.is_hidden, false) = false
      AND coalesce(NEW.moderation_status, 'approved') = 'approved';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF new_visible THEN
      UPDATE public.feed_posts
      SET comment_count = comment_count + 1
      WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF old_visible THEN
      UPDATE public.feed_posts
      SET comment_count = GREATEST(comment_count - 1, 0)
      WHERE id = OLD.post_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.post_id IS DISTINCT FROM NEW.post_id THEN
      IF old_visible THEN
        UPDATE public.feed_posts
        SET comment_count = GREATEST(comment_count - 1, 0)
        WHERE id = OLD.post_id;
      END IF;
      IF new_visible THEN
        UPDATE public.feed_posts
        SET comment_count = comment_count + 1
        WHERE id = NEW.post_id;
      END IF;
    ELSIF old_visible IS DISTINCT FROM new_visible THEN
      UPDATE public.feed_posts
      SET comment_count = GREATEST(comment_count + CASE WHEN new_visible THEN 1 ELSE -1 END, 0)
      WHERE id = NEW.post_id;
    END IF;
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

  IF v_target_type NOT IN ('group', 'studio', 'gig', 'profile', 'product', 'playlist', 'feed_post') THEN
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
  ELSIF v_target_type = 'playlist' THEN
    SELECT EXISTS (SELECT 1 FROM public.playlists WHERE id = NEW.target_id) INTO v_target_exists;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.feed_posts WHERE id = NEW.target_id) INTO v_target_exists;
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
 RETURNS TABLE(wal jsonb, is_rls_enabled boolean, subscription_ids uuid[], errors text[], slot_changes_count bigint)
 LANGUAGE sql
 SET log_min_messages TO 'fatal'
AS $function$
  WITH pub AS (
    SELECT
      concat_ws(
        ',',
        CASE WHEN bool_or(pubinsert) THEN 'insert' ELSE NULL END,
        CASE WHEN bool_or(pubupdate) THEN 'update' ELSE NULL END,
        CASE WHEN bool_or(pubdelete) THEN 'delete' ELSE NULL END
      ) AS w2j_actions,
      coalesce(
        string_agg(
          realtime.quote_wal2json(format('%I.%I', schemaname, tablename)::regclass),
          ','
        ) filter (WHERE ppt.tablename IS NOT NULL AND ppt.tablename NOT LIKE '% %'),
        ''
      ) AS w2j_add_tables
    FROM pg_publication pp
    LEFT JOIN pg_publication_tables ppt ON pp.pubname = ppt.pubname
    WHERE pp.pubname = publication
    GROUP BY pp.pubname
    LIMIT 1
  ),
  -- MATERIALIZED ensures pg_logical_slot_get_changes is called exactly once
  w2j AS MATERIALIZED (
    SELECT x.*, pub.w2j_add_tables
    FROM pub,
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
  ),
  -- Count raw slot entries before apply_rls/subscription filter
  slot_count AS (
    SELECT count(*)::bigint AS cnt
    FROM w2j
    WHERE w2j.w2j_add_tables <> ''
  ),
  -- Apply RLS and filter as before
  rls_filtered AS (
    SELECT xyz.wal, xyz.is_rls_enabled, xyz.subscription_ids, xyz.errors
    FROM w2j,
         realtime.apply_rls(
           wal := w2j.data::jsonb,
           max_record_bytes := max_record_bytes
         ) xyz(wal, is_rls_enabled, subscription_ids, errors)
    WHERE w2j.w2j_add_tables <> ''
      AND xyz.subscription_ids[1] IS NOT NULL
  )
  -- Real rows with slot count attached
  SELECT rf.wal, rf.is_rls_enabled, rf.subscription_ids, rf.errors, sc.cnt
  FROM rls_filtered rf, slot_count sc

  UNION ALL

  -- Sentinel row: always returned when no real rows exist so Elixir can
  -- always read slot_changes_count. Identified by wal IS NULL.
  SELECT null, null, null, null, sc.cnt
  FROM slot_count sc
  WHERE NOT EXISTS (SELECT 1 FROM rls_filtered)
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


CREATE OR REPLACE FUNCTION storage.allow_any_operation(expected_operations text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT CASE
      WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
      ELSE raw_operation
    END AS current_operation
    FROM current_operation
  )
  SELECT EXISTS (
    SELECT 1
    FROM normalized n
    CROSS JOIN LATERAL unnest(expected_operations) AS expected_operation
    WHERE expected_operation IS NOT NULL
      AND expected_operation <> ''
      AND n.current_operation = CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END
  );
$function$


CREATE OR REPLACE FUNCTION storage.allow_only_operation(expected_operation text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  WITH current_operation AS (
    SELECT storage.operation() AS raw_operation
  ),
  normalized AS (
    SELECT
      CASE
        WHEN raw_operation LIKE 'storage.%' THEN substr(raw_operation, 9)
        ELSE raw_operation
      END AS current_operation,
      CASE
        WHEN expected_operation LIKE 'storage.%' THEN substr(expected_operation, 9)
        ELSE expected_operation
      END AS requested_operation
    FROM current_operation
  )
  SELECT CASE
    WHEN requested_operation IS NULL OR requested_operation = '' THEN FALSE
    ELSE COALESCE(current_operation = requested_operation, FALSE)
  END
  FROM normalized;
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
    -- Split on "/" to get path segments
    SELECT string_to_array(name, '/') INTO _parts;
    -- Get the last path segment (the actual filename)
    SELECT _parts[array_length(_parts, 1)] INTO _filename;
    -- Extract extension: reverse, split on '.', then reverse again
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


CREATE OR REPLACE FUNCTION storage.get_size_by_bucket()
 RETURNS TABLE(size bigint, bucket_id text)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
    return query
        select sum((metadata->>'size')::bigint)::bigint as size, obj.bucket_id
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



-- constraint
ALTER TABLE ONLY auth.audit_log_entries ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_authorization_url_https CHECK (authorization_url IS NULL OR authorization_url ~~ 'https://%'::text);

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_authorization_url_length CHECK (authorization_url IS NULL OR char_length(authorization_url) <= 2048);

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_client_id_length CHECK (char_length(client_id) >= 1 AND char_length(client_id) <= 512);

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_discovery_url_length CHECK (discovery_url IS NULL OR char_length(discovery_url) <= 2048);

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_identifier_format CHECK (identifier ~ '^[a-z0-9][a-z0-9:-]{0,48}[a-z0-9]$'::text);

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_identifier_key UNIQUE (identifier);

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_issuer_length CHECK (issuer IS NULL OR char_length(issuer) >= 1 AND char_length(issuer) <= 2048);

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_jwks_uri_https CHECK (jwks_uri IS NULL OR jwks_uri ~~ 'https://%'::text);

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_jwks_uri_length CHECK (jwks_uri IS NULL OR char_length(jwks_uri) <= 2048);

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 100);

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_oauth2_requires_endpoints CHECK (provider_type <> 'oauth2'::text OR authorization_url IS NOT NULL AND token_url IS NOT NULL AND userinfo_url IS NOT NULL);

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_oidc_discovery_url_https CHECK (provider_type <> 'oidc'::text OR discovery_url IS NULL OR discovery_url ~~ 'https://%'::text);

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_oidc_issuer_https CHECK (provider_type <> 'oidc'::text OR issuer IS NULL OR issuer ~~ 'https://%'::text);

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_oidc_requires_issuer CHECK (provider_type <> 'oidc'::text OR issuer IS NOT NULL);

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_provider_type_check CHECK (provider_type = ANY (ARRAY['oauth2'::text, 'oidc'::text]));

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_token_url_https CHECK (token_url IS NULL OR token_url ~~ 'https://%'::text);

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_token_url_length CHECK (token_url IS NULL OR char_length(token_url) <= 2048);

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_userinfo_url_https CHECK (userinfo_url IS NULL OR userinfo_url ~~ 'https://%'::text);

ALTER TABLE ONLY auth.custom_oauth_providers ADD CONSTRAINT custom_oauth_providers_userinfo_url_length CHECK (userinfo_url IS NULL OR char_length(userinfo_url) <= 2048);

ALTER TABLE ONLY auth.flow_state ADD CONSTRAINT flow_state_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.identities ADD CONSTRAINT identities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.identities ADD CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider);

ALTER TABLE ONLY auth.identities ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY auth.instances ADD CONSTRAINT instances_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.mfa_amr_claims ADD CONSTRAINT amr_id_pk PRIMARY KEY (id);

ALTER TABLE ONLY auth.mfa_amr_claims ADD CONSTRAINT mfa_amr_claims_session_id_authentication_method_pkey UNIQUE (session_id, authentication_method);

ALTER TABLE ONLY auth.mfa_amr_claims ADD CONSTRAINT mfa_amr_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;

ALTER TABLE ONLY auth.mfa_challenges ADD CONSTRAINT mfa_challenges_auth_factor_id_fkey FOREIGN KEY (factor_id) REFERENCES auth.mfa_factors(id) ON DELETE CASCADE;

ALTER TABLE ONLY auth.mfa_challenges ADD CONSTRAINT mfa_challenges_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.mfa_factors ADD CONSTRAINT mfa_factors_last_challenged_at_key UNIQUE (last_challenged_at);

ALTER TABLE ONLY auth.mfa_factors ADD CONSTRAINT mfa_factors_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.mfa_factors ADD CONSTRAINT mfa_factors_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY auth.oauth_authorizations ADD CONSTRAINT oauth_authorizations_authorization_code_key UNIQUE (authorization_code);

ALTER TABLE ONLY auth.oauth_authorizations ADD CONSTRAINT oauth_authorizations_authorization_code_length CHECK (char_length(authorization_code) <= 255);

ALTER TABLE ONLY auth.oauth_authorizations ADD CONSTRAINT oauth_authorizations_authorization_id_key UNIQUE (authorization_id);

ALTER TABLE ONLY auth.oauth_authorizations ADD CONSTRAINT oauth_authorizations_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY auth.oauth_authorizations ADD CONSTRAINT oauth_authorizations_code_challenge_length CHECK (char_length(code_challenge) <= 128);

ALTER TABLE ONLY auth.oauth_authorizations ADD CONSTRAINT oauth_authorizations_expires_at_future CHECK (expires_at > created_at);

ALTER TABLE ONLY auth.oauth_authorizations ADD CONSTRAINT oauth_authorizations_nonce_length CHECK (char_length(nonce) <= 255);

ALTER TABLE ONLY auth.oauth_authorizations ADD CONSTRAINT oauth_authorizations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.oauth_authorizations ADD CONSTRAINT oauth_authorizations_redirect_uri_length CHECK (char_length(redirect_uri) <= 2048);

ALTER TABLE ONLY auth.oauth_authorizations ADD CONSTRAINT oauth_authorizations_resource_length CHECK (char_length(resource) <= 2048);

ALTER TABLE ONLY auth.oauth_authorizations ADD CONSTRAINT oauth_authorizations_scope_length CHECK (char_length(scope) <= 4096);

ALTER TABLE ONLY auth.oauth_authorizations ADD CONSTRAINT oauth_authorizations_state_length CHECK (char_length(state) <= 4096);

ALTER TABLE ONLY auth.oauth_authorizations ADD CONSTRAINT oauth_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY auth.oauth_client_states ADD CONSTRAINT oauth_client_states_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.oauth_clients ADD CONSTRAINT oauth_clients_client_name_length CHECK (char_length(client_name) <= 1024);

ALTER TABLE ONLY auth.oauth_clients ADD CONSTRAINT oauth_clients_client_uri_length CHECK (char_length(client_uri) <= 2048);

ALTER TABLE ONLY auth.oauth_clients ADD CONSTRAINT oauth_clients_logo_uri_length CHECK (char_length(logo_uri) <= 2048);

ALTER TABLE ONLY auth.oauth_clients ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.oauth_clients ADD CONSTRAINT oauth_clients_token_endpoint_auth_method_check CHECK (token_endpoint_auth_method = ANY (ARRAY['client_secret_basic'::text, 'client_secret_post'::text, 'none'::text]));

ALTER TABLE ONLY auth.oauth_consents ADD CONSTRAINT oauth_consents_client_id_fkey FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY auth.oauth_consents ADD CONSTRAINT oauth_consents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.oauth_consents ADD CONSTRAINT oauth_consents_revoked_after_granted CHECK (revoked_at IS NULL OR revoked_at >= granted_at);

ALTER TABLE ONLY auth.oauth_consents ADD CONSTRAINT oauth_consents_scopes_length CHECK (char_length(scopes) <= 2048);

ALTER TABLE ONLY auth.oauth_consents ADD CONSTRAINT oauth_consents_scopes_not_empty CHECK (char_length(TRIM(BOTH FROM scopes)) > 0);

ALTER TABLE ONLY auth.oauth_consents ADD CONSTRAINT oauth_consents_user_client_unique UNIQUE (user_id, client_id);

ALTER TABLE ONLY auth.oauth_consents ADD CONSTRAINT oauth_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY auth.one_time_tokens ADD CONSTRAINT one_time_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.one_time_tokens ADD CONSTRAINT one_time_tokens_token_hash_check CHECK (char_length(token_hash) > 0);

ALTER TABLE ONLY auth.one_time_tokens ADD CONSTRAINT one_time_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY auth.refresh_tokens ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.refresh_tokens ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE;

ALTER TABLE ONLY auth.refresh_tokens ADD CONSTRAINT refresh_tokens_token_unique UNIQUE (token);

ALTER TABLE ONLY auth.saml_providers ADD CONSTRAINT "entity_id not empty" CHECK (char_length(entity_id) > 0);

ALTER TABLE ONLY auth.saml_providers ADD CONSTRAINT "metadata_url not empty" CHECK (metadata_url = NULL::text OR char_length(metadata_url) > 0);

ALTER TABLE ONLY auth.saml_providers ADD CONSTRAINT "metadata_xml not empty" CHECK (char_length(metadata_xml) > 0);

ALTER TABLE ONLY auth.saml_providers ADD CONSTRAINT saml_providers_entity_id_key UNIQUE (entity_id);

ALTER TABLE ONLY auth.saml_providers ADD CONSTRAINT saml_providers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.saml_providers ADD CONSTRAINT saml_providers_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;

ALTER TABLE ONLY auth.saml_relay_states ADD CONSTRAINT "request_id not empty" CHECK (char_length(request_id) > 0);

ALTER TABLE ONLY auth.saml_relay_states ADD CONSTRAINT saml_relay_states_flow_state_id_fkey FOREIGN KEY (flow_state_id) REFERENCES auth.flow_state(id) ON DELETE CASCADE;

ALTER TABLE ONLY auth.saml_relay_states ADD CONSTRAINT saml_relay_states_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.saml_relay_states ADD CONSTRAINT saml_relay_states_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;

ALTER TABLE ONLY auth.schema_migrations ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);

ALTER TABLE ONLY auth.sessions ADD CONSTRAINT sessions_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY auth.sessions ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.sessions ADD CONSTRAINT sessions_scopes_length CHECK (char_length(scopes) <= 4096);

ALTER TABLE ONLY auth.sessions ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY auth.sso_domains ADD CONSTRAINT "domain not empty" CHECK (char_length(domain) > 0);

ALTER TABLE ONLY auth.sso_domains ADD CONSTRAINT sso_domains_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.sso_domains ADD CONSTRAINT sso_domains_sso_provider_id_fkey FOREIGN KEY (sso_provider_id) REFERENCES auth.sso_providers(id) ON DELETE CASCADE;

ALTER TABLE ONLY auth.sso_providers ADD CONSTRAINT "resource_id not empty" CHECK (resource_id = NULL::text OR char_length(resource_id) > 0);

ALTER TABLE ONLY auth.sso_providers ADD CONSTRAINT sso_providers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.users ADD CONSTRAINT users_email_change_confirm_status_check CHECK (email_change_confirm_status >= 0 AND email_change_confirm_status <= 2);

ALTER TABLE ONLY auth.users ADD CONSTRAINT users_phone_key UNIQUE (phone);

ALTER TABLE ONLY auth.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.webauthn_challenges ADD CONSTRAINT webauthn_challenges_challenge_type_check CHECK (challenge_type = ANY (ARRAY['signup'::text, 'registration'::text, 'authentication'::text]));

ALTER TABLE ONLY auth.webauthn_challenges ADD CONSTRAINT webauthn_challenges_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.webauthn_challenges ADD CONSTRAINT webauthn_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY auth.webauthn_credentials ADD CONSTRAINT webauthn_credentials_pkey PRIMARY KEY (id);

ALTER TABLE ONLY auth.webauthn_credentials ADD CONSTRAINT webauthn_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY private_archive.venue_invite_member_cleanup_20260513 ADD CONSTRAINT venue_invite_member_cleanup_20260513_pkey PRIMARY KEY (archive_id);

ALTER TABLE ONLY public.address_verification_sessions ADD CONSTRAINT address_verification_sessions_entity_type_check CHECK (entity_type = ANY (ARRAY['studio'::text, 'gig'::text]));

ALTER TABLE ONLY public.address_verification_sessions ADD CONSTRAINT address_verification_sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.address_verification_sessions ADD CONSTRAINT address_verification_sessions_session_id_key UNIQUE (session_id);

ALTER TABLE ONLY public.address_verification_sessions ADD CONSTRAINT address_verification_sessions_status_check CHECK (status = ANY (ARRAY['PENDING'::text, 'SUBMITTED'::text, 'PROCESSING'::text, 'ANALYZED'::text, 'VERIFIED'::text, 'APPROVED'::text, 'DECLINED'::text, 'FAILED'::text, 'REVOKED'::text, 'ABANDONED'::text, 'MANUAL_REVIEW'::text, 'PENDING_REVIEW'::text]));

ALTER TABLE ONLY public.address_verification_sessions ADD CONSTRAINT address_verification_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.audit_event_changes ADD CONSTRAINT audit_event_changes_audit_event_id_fkey FOREIGN KEY (audit_event_id) REFERENCES audit_events(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.audit_event_changes ADD CONSTRAINT audit_event_changes_column_name_check CHECK (length(btrim(column_name)) > 0);

ALTER TABLE ONLY public.audit_event_changes ADD CONSTRAINT audit_event_changes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.audit_events ADD CONSTRAINT audit_events_action_check CHECK (length(btrim(action)) > 0);

ALTER TABLE ONLY public.audit_events ADD CONSTRAINT audit_events_entity_id_check CHECK (length(btrim(entity_id)) > 0);

ALTER TABLE ONLY public.audit_events ADD CONSTRAINT audit_events_entity_table_check CHECK (length(btrim(entity_table)) > 0);

ALTER TABLE ONLY public.audit_events ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.booking_attendance_events ADD CONSTRAINT booking_attendance_events_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio_bookings(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.booking_attendance_events ADD CONSTRAINT booking_attendance_events_event_type_check CHECK (event_type = ANY (ARRAY['booking_started'::text, 'checked_in'::text, 'late'::text, 'not_attending'::text, 'no_show'::text]));

ALTER TABLE ONLY public.booking_attendance_events ADD CONSTRAINT booking_attendance_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.booking_attendance_events ADD CONSTRAINT booking_attendance_events_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.booking_cancellation_policies ADD CONSTRAINT booking_cancellation_policies_check CHECK (full_refund_hours_before > partial_refund_hours_before);

ALTER TABLE ONLY public.booking_cancellation_policies ADD CONSTRAINT booking_cancellation_policies_full_refund_hours_before_check CHECK (full_refund_hours_before > 0);

ALTER TABLE ONLY public.booking_cancellation_policies ADD CONSTRAINT booking_cancellation_policies_late_cancel_penalty_pct_check CHECK (late_cancel_penalty_pct >= 0::numeric AND late_cancel_penalty_pct <= 100::numeric);

ALTER TABLE ONLY public.booking_cancellation_policies ADD CONSTRAINT booking_cancellation_policies_no_show_penalty_pct_check CHECK (no_show_penalty_pct >= 0::numeric AND no_show_penalty_pct <= 100::numeric);

ALTER TABLE ONLY public.booking_cancellation_policies ADD CONSTRAINT booking_cancellation_policies_partial_refund_hours_before_check CHECK (partial_refund_hours_before > 0);

ALTER TABLE ONLY public.booking_cancellation_policies ADD CONSTRAINT booking_cancellation_policies_partial_refund_pct_check CHECK (partial_refund_pct >= 0::numeric AND partial_refund_pct <= 100::numeric);

ALTER TABLE ONLY public.booking_cancellation_policies ADD CONSTRAINT booking_cancellation_policies_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.booking_cancellation_policies ADD CONSTRAINT booking_cancellation_policies_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.booking_holds ADD CONSTRAINT booking_holds_check CHECK (end_time > start_time);

ALTER TABLE ONLY public.booking_holds ADD CONSTRAINT booking_holds_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.booking_holds ADD CONSTRAINT booking_holds_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.booking_holds ADD CONSTRAINT booking_holds_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.booking_incidents ADD CONSTRAINT booking_incidents_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio_bookings(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.booking_incidents ADD CONSTRAINT booking_incidents_counterparty_user_id_fkey FOREIGN KEY (counterparty_user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.booking_incidents ADD CONSTRAINT booking_incidents_issue_type_check CHECK (issue_type = ANY (ARRAY['cannot_access_studio'::text, 'entry_denied'::text, 'no_show_claim'::text, 'other'::text]));

ALTER TABLE ONLY public.booking_incidents ADD CONSTRAINT booking_incidents_penalty_event_id_fkey FOREIGN KEY (penalty_event_id) REFERENCES booking_penalty_events(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.booking_incidents ADD CONSTRAINT booking_incidents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.booking_incidents ADD CONSTRAINT booking_incidents_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.booking_incidents ADD CONSTRAINT booking_incidents_resolved_by_user_id_fkey FOREIGN KEY (resolved_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.booking_incidents ADD CONSTRAINT booking_incidents_status_check CHECK (status = ANY (ARRAY['open'::text, 'responded'::text, 'manual_review'::text, 'resolved_refund'::text, 'resolved_no_refund'::text, 'dismissed'::text]));

ALTER TABLE ONLY public.booking_penalty_events ADD CONSTRAINT booking_penalty_events_beneficiary_user_id_fkey FOREIGN KEY (beneficiary_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.booking_penalty_events ADD CONSTRAINT booking_penalty_events_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio_bookings(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.booking_penalty_events ADD CONSTRAINT booking_penalty_events_booking_total_check CHECK (booking_total >= 0::numeric);

ALTER TABLE ONLY public.booking_penalty_events ADD CONSTRAINT booking_penalty_events_penalized_user_id_fkey FOREIGN KEY (penalized_user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.booking_penalty_events ADD CONSTRAINT booking_penalty_events_penalty_amount_check CHECK (penalty_amount >= 0::numeric);

ALTER TABLE ONLY public.booking_penalty_events ADD CONSTRAINT booking_penalty_events_penalty_type_check CHECK (penalty_type = ANY (ARRAY['late_cancellation'::text, 'no_show'::text, 'deal_cancellation'::text]));

ALTER TABLE ONLY public.booking_penalty_events ADD CONSTRAINT booking_penalty_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.booking_penalty_events ADD CONSTRAINT booking_penalty_events_refund_amount_check CHECK (refund_amount >= 0::numeric);

ALTER TABLE ONLY public.booking_penalty_events ADD CONSTRAINT booking_penalty_events_refund_transaction_id_fkey FOREIGN KEY (refund_transaction_id) REFERENCES wallet_transactions(id);

ALTER TABLE ONLY public.booking_penalty_events ADD CONSTRAINT booking_penalty_events_wallet_transaction_id_fkey FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id);

ALTER TABLE ONLY public.booking_requests ADD CONSTRAINT booking_requests_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id);

ALTER TABLE ONLY public.booking_requests ADD CONSTRAINT booking_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.booking_requests ADD CONSTRAINT booking_requests_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id);

ALTER TABLE ONLY public.booking_requests ADD CONSTRAINT booking_requests_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id);

ALTER TABLE ONLY public.booking_requests ADD CONSTRAINT booking_requests_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id);

ALTER TABLE ONLY public.conversation_participants ADD CONSTRAINT conversation_participants_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.conversation_participants ADD CONSTRAINT conversation_participants_conversation_id_user_id_key UNIQUE (conversation_id, user_id);

ALTER TABLE ONLY public.conversation_participants ADD CONSTRAINT conversation_participants_muted_until_requires_mute CHECK (is_muted OR muted_until IS NULL);

ALTER TABLE ONLY public.conversation_participants ADD CONSTRAINT conversation_participants_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.conversation_participants ADD CONSTRAINT conversation_participants_role_check CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]));

ALTER TABLE ONLY public.conversation_participants ADD CONSTRAINT conversation_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.conversations ADD CONSTRAINT conversations_gig_application_id_fkey FOREIGN KEY (gig_application_id) REFERENCES gig_applications(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.conversations ADD CONSTRAINT conversations_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.conversations ADD CONSTRAINT conversations_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.conversations ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.conversations ADD CONSTRAINT conversations_studio_booking_id_fkey FOREIGN KEY (studio_booking_id) REFERENCES studio_bookings(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.conversations ADD CONSTRAINT conversations_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.didit_webhook_events ADD CONSTRAINT didit_webhook_events_pkey PRIMARY KEY (event_key);

ALTER TABLE ONLY public.email_notifications ADD CONSTRAINT email_notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.external_platform_links ADD CONSTRAINT external_platform_links_click_count_check CHECK (click_count >= 0);

ALTER TABLE ONLY public.external_platform_links ADD CONSTRAINT external_platform_links_label_check CHECK (char_length(label) <= 200);

ALTER TABLE ONLY public.external_platform_links ADD CONSTRAINT external_platform_links_linked_item_id_fkey FOREIGN KEY (linked_item_id) REFERENCES playlist_items(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.external_platform_links ADD CONSTRAINT external_platform_links_linked_playlist_id_fkey FOREIGN KEY (linked_playlist_id) REFERENCES playlists(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.external_platform_links ADD CONSTRAINT external_platform_links_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.external_platform_links ADD CONSTRAINT external_platform_links_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.external_platform_links ADD CONSTRAINT external_platform_links_platform_check CHECK (platform = ANY (ARRAY['spotify'::text, 'apple_music'::text, 'youtube_music'::text, 'soundcloud'::text, 'bandcamp'::text, 'deezer'::text, 'tidal'::text, 'other'::text]));

ALTER TABLE ONLY public.external_platform_links ADD CONSTRAINT external_platform_links_url_check CHECK (char_length(url) >= 1 AND char_length(url) <= 2000);

ALTER TABLE ONLY public.favorites ADD CONSTRAINT fav_one_target CHECK (((group_id IS NOT NULL)::integer + (studio_id IS NOT NULL)::integer + (gig_id IS NOT NULL)::integer + (profile_id IS NOT NULL)::integer) = 1);

ALTER TABLE ONLY public.favorites ADD CONSTRAINT favorites_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.favorites ADD CONSTRAINT favorites_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.favorites ADD CONSTRAINT favorites_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.favorites ADD CONSTRAINT favorites_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.favorites ADD CONSTRAINT favorites_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.favorites ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.feed_posts ADD CONSTRAINT feed_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.feed_posts ADD CONSTRAINT feed_posts_comment_count_check CHECK (comment_count >= 0);

ALTER TABLE ONLY public.feed_posts ADD CONSTRAINT feed_posts_content_check CHECK (char_length(content) <= 5000);

ALTER TABLE ONLY public.feed_posts ADD CONSTRAINT feed_posts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.feed_posts ADD CONSTRAINT feed_posts_post_type_check CHECK (post_type = ANY (ARRAY['text'::text, 'announcement'::text, 'release'::text, 'project_update'::text, 'merch_drop'::text, 'playlist_share'::text, 'station_share'::text]));

ALTER TABLE ONLY public.feed_posts ADD CONSTRAINT feed_posts_reaction_count_check CHECK (reaction_count >= 0);

ALTER TABLE ONLY public.feed_posts ADD CONSTRAINT feed_posts_share_count_check CHECK (share_count >= 0);

ALTER TABLE ONLY public.feed_posts ADD CONSTRAINT feed_posts_visibility_check CHECK (visibility = ANY (ARRAY['public'::text, 'followers'::text, 'unlisted'::text]));

ALTER TABLE ONLY public.feed_posts ADD CONSTRAINT fk_feed_posts_linked_playlist FOREIGN KEY (linked_playlist_id) REFERENCES playlists(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.feed_posts ADD CONSTRAINT fk_feed_posts_linked_product FOREIGN KEY (linked_product_id) REFERENCES products(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.follows ADD CONSTRAINT follows_followed_type_check CHECK (followed_type = ANY (ARRAY['profile'::text, 'group'::text]));

ALTER TABLE ONLY public.follows ADD CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.follows ADD CONSTRAINT follows_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.follows ADD CONSTRAINT follows_profile_self_check CHECK (followed_type <> 'profile'::text OR follower_id <> followed_id);

ALTER TABLE ONLY public.gig_applications ADD CONSTRAINT gig_applications_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.gig_applications ADD CONSTRAINT gig_applications_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.gig_applications ADD CONSTRAINT gig_applications_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.gig_applications ADD CONSTRAINT gig_applications_leader_approval_status_check CHECK (leader_approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]));

ALTER TABLE ONLY public.gig_applications ADD CONSTRAINT gig_applications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.gig_applications ADD CONSTRAINT gig_applications_production_pair_check CHECK (production_team_id IS NULL AND production_roster_id IS NULL OR production_team_id IS NOT NULL AND production_roster_id IS NOT NULL);

ALTER TABLE ONLY public.gig_applications ADD CONSTRAINT gig_applications_production_roster_id_fkey FOREIGN KEY (production_roster_id) REFERENCES production_team_roster(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.gig_applications ADD CONSTRAINT gig_applications_production_team_id_fkey FOREIGN KEY (production_team_id) REFERENCES production_teams(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.gig_applications ADD CONSTRAINT gig_applications_slot_type_check CHECK (slot_type = ANY (ARRAY['solo'::text, 'duo'::text, 'band'::text]));

ALTER TABLE ONLY public.gig_applications ADD CONSTRAINT gig_applications_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'accepted'::text, 'rejected'::text, 'declined'::text, 'cancelled'::text, 'resigned'::text, 'fired'::text, 'completed'::text]));

ALTER TABLE ONLY public.gig_applications ADD CONSTRAINT gig_applications_submitted_by_user_id_fkey FOREIGN KEY (submitted_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.gig_availability_slots ADD CONSTRAINT gig_availability_slots_check CHECK (end_time > start_time);

ALTER TABLE ONLY public.gig_availability_slots ADD CONSTRAINT gig_availability_slots_check1 CHECK (day_of_week IS NOT NULL AND day_of_week >= 0 AND day_of_week <= 6 OR slot_date IS NOT NULL);

ALTER TABLE ONLY public.gig_availability_slots ADD CONSTRAINT gig_availability_slots_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.gig_availability_slots ADD CONSTRAINT gig_availability_slots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.gig_deletion_audit ADD CONSTRAINT gig_deletion_audit_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.gig_deletion_audit ADD CONSTRAINT gig_deletion_audit_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.gig_deletion_audit ADD CONSTRAINT gig_deletion_audit_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.gig_media ADD CONSTRAINT gig_media_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.gig_media ADD CONSTRAINT gig_media_gig_id_media_type_media_url_key UNIQUE (gig_id, media_type, media_url);

ALTER TABLE ONLY public.gig_media ADD CONSTRAINT gig_media_media_type_check CHECK (media_type = ANY (ARRAY['image'::text, 'document'::text]));

ALTER TABLE ONLY public.gig_media ADD CONSTRAINT gig_media_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.gig_requirements ADD CONSTRAINT gig_requirements_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.gig_requirements ADD CONSTRAINT gig_requirements_gig_id_requirement_key_key UNIQUE (gig_id, requirement_key);

ALTER TABLE ONLY public.gig_requirements ADD CONSTRAINT gig_requirements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.gig_slot_fill_applicants ADD CONSTRAINT gig_slot_fill_applicants_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.gig_slot_fill_applicants ADD CONSTRAINT gig_slot_fill_applicants_pkey PRIMARY KEY (gig_id, slot_type, applicant_id);

ALTER TABLE ONLY public.gig_slot_fill_applicants ADD CONSTRAINT gig_slot_fill_applicants_slot_type_check CHECK (slot_type = ANY (ARRAY['solo'::text, 'duo'::text, 'band'::text]));

ALTER TABLE ONLY public.gig_slot_fill_summary ADD CONSTRAINT gig_slot_fill_summary_accepted_count_check CHECK (accepted_count >= 0);

ALTER TABLE ONLY public.gig_slot_fill_summary ADD CONSTRAINT gig_slot_fill_summary_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.gig_slot_fill_summary ADD CONSTRAINT gig_slot_fill_summary_pkey PRIMARY KEY (gig_id, slot_type);

ALTER TABLE ONLY public.gig_slot_fill_summary ADD CONSTRAINT gig_slot_fill_summary_slot_type_check CHECK (slot_type = ANY (ARRAY['solo'::text, 'duo'::text, 'band'::text]));

ALTER TABLE ONLY public.gigs ADD CONSTRAINT gigs_address_verification_status_check CHECK (address_verification_status = ANY (ARRAY['NOT_STARTED'::text, 'PENDING'::text, 'PROCESSING'::text, 'VERIFIED'::text, 'APPROVED'::text, 'DECLINED'::text, 'FAILED'::text, 'ABANDONED'::text, 'MANUAL_REVIEW'::text, 'PENDING_REVIEW'::text]));

ALTER TABLE ONLY public.gigs ADD CONSTRAINT gigs_organizer_id_fkey FOREIGN KEY (organizer_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.gigs ADD CONSTRAINT gigs_permit_resubmissions_used_check CHECK (permit_resubmissions_used >= 0 AND permit_resubmissions_used <= 1);

ALTER TABLE ONLY public.gigs ADD CONSTRAINT gigs_permit_reviewed_by_fkey FOREIGN KEY (permit_reviewed_by) REFERENCES profiles(id);

ALTER TABLE ONLY public.gigs ADD CONSTRAINT gigs_permit_status_check CHECK (permit_status = ANY (ARRAY['pending_review'::text, 'approved'::text, 'rejected'::text, 'resubmitted'::text]));

ALTER TABLE ONLY public.gigs ADD CONSTRAINT gigs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.gigs ADD CONSTRAINT gigs_reapplication_cooldown_days_check CHECK (reapplication_cooldown_days >= 0 AND reapplication_cooldown_days <= 365);

ALTER TABLE ONLY public.gigs ADD CONSTRAINT gigs_status_check CHECK (status = ANY (ARRAY['open'::text, 'closed'::text, 'cancelled'::text]));

ALTER TABLE ONLY public.group_availability_slots ADD CONSTRAINT group_availability_slots_check CHECK (end_time > start_time);

ALTER TABLE ONLY public.group_availability_slots ADD CONSTRAINT group_availability_slots_check1 CHECK (day_of_week IS NOT NULL AND day_of_week >= 0 AND day_of_week <= 6 OR slot_date IS NOT NULL);

ALTER TABLE ONLY public.group_availability_slots ADD CONSTRAINT group_availability_slots_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.group_availability_slots ADD CONSTRAINT group_availability_slots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.group_deletion_audit ADD CONSTRAINT group_deletion_audit_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.group_deletion_audit ADD CONSTRAINT group_deletion_audit_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.group_deletion_audit ADD CONSTRAINT group_deletion_audit_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.group_media ADD CONSTRAINT group_media_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.group_media ADD CONSTRAINT group_media_group_id_media_type_media_url_key UNIQUE (group_id, media_type, media_url);

ALTER TABLE ONLY public.group_media ADD CONSTRAINT group_media_media_type_check CHECK (media_type = 'image'::text);

ALTER TABLE ONLY public.group_media ADD CONSTRAINT group_media_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.group_members ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.group_members ADD CONSTRAINT group_members_group_id_user_id_key UNIQUE (group_id, user_id);

ALTER TABLE ONLY public.group_members ADD CONSTRAINT group_members_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.group_members ADD CONSTRAINT group_members_role_check CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]));

ALTER TABLE ONLY public.group_members ADD CONSTRAINT group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.group_playlists ADD CONSTRAINT group_playlists_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.group_playlists ADD CONSTRAINT group_playlists_group_id_playlist_id_key UNIQUE (group_id, playlist_id);

ALTER TABLE ONLY public.group_playlists ADD CONSTRAINT group_playlists_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.group_playlists ADD CONSTRAINT group_playlists_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.group_playlists ADD CONSTRAINT group_playlists_position_check CHECK ("position" >= 0);

ALTER TABLE ONLY public.group_roster_members ADD CONSTRAINT group_roster_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.group_roster_members ADD CONSTRAINT group_roster_members_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.group_roster_members ADD CONSTRAINT group_roster_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.groups ADD CONSTRAINT groups_group_type_check CHECK (group_type = ANY (ARRAY['duo'::text, 'band'::text]));

ALTER TABLE ONLY public.groups ADD CONSTRAINT groups_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.groups ADD CONSTRAINT groups_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.identity_document_claims ADD CONSTRAINT identity_document_claims_manual_review_id_fkey FOREIGN KEY (manual_review_id) REFERENCES manual_identity_reviews(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.identity_document_claims ADD CONSTRAINT identity_document_claims_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.identity_document_claims ADD CONSTRAINT identity_document_claims_source_check CHECK (source = ANY (ARRAY['DIDIT'::text, 'MANUAL_UPLOAD'::text, 'DIDIT_PENDING'::text, 'DIDIT_DUPLICATE'::text]));

ALTER TABLE ONLY public.identity_document_claims ADD CONSTRAINT identity_document_claims_status_check CHECK (status = ANY (ARRAY['APPROVED'::text, 'PENDING_REVIEW'::text, 'DECLINED'::text, 'REVOKED'::text]));

ALTER TABLE ONLY public.identity_document_claims ADD CONSTRAINT identity_document_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.leadership_transfer_requests ADD CONSTRAINT leadership_transfer_requests_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.leadership_transfer_requests ADD CONSTRAINT leadership_transfer_requests_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.leadership_transfer_requests ADD CONSTRAINT leadership_transfer_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.leadership_transfer_requests ADD CONSTRAINT leadership_transfer_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'cancelled'::text]));

ALTER TABLE ONLY public.leadership_transfer_requests ADD CONSTRAINT leadership_transfer_requests_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.manual_identity_reviews ADD CONSTRAINT manual_identity_reviews_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.manual_identity_reviews ADD CONSTRAINT manual_identity_reviews_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.manual_identity_reviews ADD CONSTRAINT manual_identity_reviews_source_check CHECK (source = ANY (ARRAY['MANUAL_UPLOAD'::text, 'DIDIT_PENDING'::text, 'DIDIT_DUPLICATE'::text]));

ALTER TABLE ONLY public.manual_identity_reviews ADD CONSTRAINT manual_identity_reviews_status_check CHECK (status = ANY (ARRAY['PENDING_REVIEW'::text, 'APPROVED'::text, 'DECLINED'::text]));

ALTER TABLE ONLY public.manual_identity_reviews ADD CONSTRAINT manual_identity_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.message_reactions ADD CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.message_reactions ADD CONSTRAINT message_reactions_message_id_user_id_key UNIQUE (message_id, user_id);

ALTER TABLE ONLY public.message_reactions ADD CONSTRAINT message_reactions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.message_reactions ADD CONSTRAINT message_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.messages ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.messages ADD CONSTRAINT messages_message_type_check CHECK (message_type = ANY (ARRAY['text'::text, 'image'::text, 'file'::text, 'system'::text]));

ALTER TABLE ONLY public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.normalization_exceptions ADD CONSTRAINT normalization_exceptions_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.normalization_exceptions ADD CONSTRAINT normalization_exceptions_pkey PRIMARY KEY (table_name, column_name);

ALTER TABLE ONLY public.notification_preferences ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.notification_preferences ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY['success'::text, 'info'::text, 'warning'::text, 'error'::text]));

ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_fulfillments ADD CONSTRAINT order_fulfillments_carrier_check CHECK (char_length(carrier) <= 100);

ALTER TABLE ONLY public.order_fulfillments ADD CONSTRAINT order_fulfillments_fulfillment_type_check CHECK (fulfillment_type = ANY (ARRAY['shipment'::text, 'digital_release'::text, 'pickup'::text]));

ALTER TABLE ONLY public.order_fulfillments ADD CONSTRAINT order_fulfillments_notes_check CHECK (char_length(notes) <= 1000);

ALTER TABLE ONLY public.order_fulfillments ADD CONSTRAINT order_fulfillments_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_fulfillments ADD CONSTRAINT order_fulfillments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_fulfillments ADD CONSTRAINT order_fulfillments_status_check CHECK (status = ANY (ARRAY['pending'::text, 'preparing'::text, 'shipped'::text, 'in_transit'::text, 'delivered'::text, 'failed'::text, 'returned'::text]));

ALTER TABLE ONLY public.order_fulfillments ADD CONSTRAINT order_fulfillments_tracking_number_check CHECK (char_length(tracking_number) <= 100);

ALTER TABLE ONLY public.order_items ADD CONSTRAINT order_items_line_total_check CHECK (line_total >= 0::numeric);

ALTER TABLE ONLY public.order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.order_items ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.order_items ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.order_items ADD CONSTRAINT order_items_quantity_check CHECK (quantity > 0);

ALTER TABLE ONLY public.order_items ADD CONSTRAINT order_items_unit_price_check CHECK (unit_price >= 0::numeric);

ALTER TABLE ONLY public.order_items ADD CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_notes_check CHECK (char_length(notes) <= 1000);

ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);

ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_shipping_fee_check CHECK (shipping_fee >= 0::numeric);

ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_shipping_profile_id_fkey FOREIGN KEY (shipping_profile_id) REFERENCES shipping_profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_status_check CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text, 'delivered'::text, 'cancelled'::text, 'refunded'::text, 'disputed'::text]));

ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_subtotal_check CHECK (subtotal >= 0::numeric);

ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_total_amount_check CHECK (total_amount >= 0::numeric);

ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_wallet_transaction_id_fkey FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.payout_methods ADD CONSTRAINT payout_methods_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.payout_methods ADD CONSTRAINT payout_methods_type_check CHECK (type = ANY (ARRAY['bank'::text, 'gcash'::text, 'maya'::text, 'paypal'::text]));

ALTER TABLE ONLY public.payout_methods ADD CONSTRAINT payout_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.permit_audit_log ADD CONSTRAINT permit_audit_log_action_check CHECK (action = ANY (ARRAY['submitted'::text, 'approved'::text, 'rejected'::text, 'resubmitted'::text]));

ALTER TABLE ONLY public.permit_audit_log ADD CONSTRAINT permit_audit_log_entity_type_check CHECK (entity_type = ANY (ARRAY['studio'::text, 'gig'::text]));

ALTER TABLE ONLY public.permit_audit_log ADD CONSTRAINT permit_audit_log_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES profiles(id);

ALTER TABLE ONLY public.permit_audit_log ADD CONSTRAINT permit_audit_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.playlist_items ADD CONSTRAINT fk_playlist_items_external_link FOREIGN KEY (external_link_id) REFERENCES external_platform_links(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.playlist_items ADD CONSTRAINT fk_playlist_items_teaser_asset FOREIGN KEY (teaser_asset_id) REFERENCES playlist_teaser_assets(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.playlist_items ADD CONSTRAINT playlist_items_artist_name_check CHECK (char_length(artist_name) <= 200);

ALTER TABLE ONLY public.playlist_items ADD CONSTRAINT playlist_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.playlist_items ADD CONSTRAINT playlist_items_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.playlist_items ADD CONSTRAINT playlist_items_title_check CHECK (char_length(title) >= 1 AND char_length(title) <= 200);

ALTER TABLE ONLY public.playlist_play_events ADD CONSTRAINT playlist_play_events_event_type_check CHECK (event_type = ANY (ARRAY['teaser_play'::text, 'outbound_click'::text, 'station_tune_in'::text, 'station_tune_out'::text]));

ALTER TABLE ONLY public.playlist_play_events ADD CONSTRAINT playlist_play_events_item_id_fkey FOREIGN KEY (item_id) REFERENCES playlist_items(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.playlist_play_events ADD CONSTRAINT playlist_play_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.playlist_play_events ADD CONSTRAINT playlist_play_events_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.playlist_play_events ADD CONSTRAINT playlist_play_events_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.playlist_play_events ADD CONSTRAINT playlist_play_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.playlist_teaser_assets ADD CONSTRAINT playlist_teaser_assets_asset_type_check CHECK (asset_type = ANY (ARRAY['teaser_clip'::text, 'cover_art'::text, 'track_preview'::text]));

ALTER TABLE ONLY public.playlist_teaser_assets ADD CONSTRAINT playlist_teaser_assets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.playlist_teaser_assets ADD CONSTRAINT playlist_teaser_assets_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.playlist_teaser_assets ADD CONSTRAINT playlist_teaser_assets_screen_result_check CHECK (screen_result = ANY (ARRAY['passed'::text, 'failed'::text, 'pending'::text]));

ALTER TABLE ONLY public.playlist_teaser_assets ADD CONSTRAINT playlist_teaser_assets_uploader_id_fkey FOREIGN KEY (uploader_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.playlists ADD CONSTRAINT playlists_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.playlists ADD CONSTRAINT playlists_description_check CHECK (char_length(description) <= 2000);

ALTER TABLE ONLY public.playlists ADD CONSTRAINT playlists_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.playlists ADD CONSTRAINT playlists_title_check CHECK (char_length(title) >= 1 AND char_length(title) <= 200);

ALTER TABLE ONLY public.playlists ADD CONSTRAINT playlists_track_count_check CHECK (track_count >= 0);

ALTER TABLE ONLY public.playlists ADD CONSTRAINT playlists_visibility_check CHECK (visibility = ANY (ARRAY['public'::text, 'unlisted'::text, 'promotional'::text]));

ALTER TABLE ONLY public.post_comments ADD CONSTRAINT post_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.post_comments ADD CONSTRAINT post_comments_content_check CHECK (char_length(content) >= 1 AND char_length(content) <= 2000);

ALTER TABLE ONLY public.post_comments ADD CONSTRAINT post_comments_moderation_status_check CHECK (moderation_status = ANY (ARRAY['approved'::text, 'pending_review'::text, 'blocked'::text]));

ALTER TABLE ONLY public.post_comments ADD CONSTRAINT post_comments_parent_comment_id_fkey FOREIGN KEY (parent_comment_id) REFERENCES post_comments(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.post_comments ADD CONSTRAINT post_comments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.post_comments ADD CONSTRAINT post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES feed_posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.post_media ADD CONSTRAINT post_media_media_type_check CHECK (media_type = ANY (ARRAY['image'::text, 'video'::text, 'teaser_clip'::text, 'cover_art'::text]));

ALTER TABLE ONLY public.post_media ADD CONSTRAINT post_media_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.post_media ADD CONSTRAINT post_media_post_id_fkey FOREIGN KEY (post_id) REFERENCES feed_posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.post_media ADD CONSTRAINT post_media_safety_status_check CHECK (safety_status = ANY (ARRAY['passed'::text, 'pending_review'::text, 'blocked'::text]));

ALTER TABLE ONLY public.post_reactions ADD CONSTRAINT post_reactions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.post_reactions ADD CONSTRAINT post_reactions_post_id_fkey FOREIGN KEY (post_id) REFERENCES feed_posts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.post_reactions ADD CONSTRAINT post_reactions_post_id_user_id_reaction_type_key UNIQUE (post_id, user_id, reaction_type);

ALTER TABLE ONLY public.post_reactions ADD CONSTRAINT post_reactions_reaction_type_check CHECK (reaction_type = ANY (ARRAY['like'::text, 'love'::text, 'fire'::text, 'clap'::text, 'sad'::text]));

ALTER TABLE ONLY public.post_reactions ADD CONSTRAINT post_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_media ADD CONSTRAINT product_media_media_type_check CHECK (media_type = ANY (ARRAY['image'::text, 'video'::text, 'promo_clip'::text]));

ALTER TABLE ONLY public.product_media ADD CONSTRAINT product_media_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_media ADD CONSTRAINT product_media_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_variants ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.product_variants ADD CONSTRAINT product_variants_price_override_check CHECK (price_override IS NULL OR price_override >= 0::numeric);

ALTER TABLE ONLY public.product_variants ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.product_variants ADD CONSTRAINT product_variants_sku_check CHECK (char_length(sku) <= 50);

ALTER TABLE ONLY public.product_variants ADD CONSTRAINT product_variants_stock_quantity_check CHECK (stock_quantity >= 0);

ALTER TABLE ONLY public.product_variants ADD CONSTRAINT product_variants_variant_label_check CHECK (char_length(variant_label) >= 1 AND char_length(variant_label) <= 100);

ALTER TABLE ONLY public.product_variants ADD CONSTRAINT product_variants_variant_type_check CHECK (variant_type = ANY (ARRAY['size'::text, 'color'::text, 'format'::text, 'edition'::text, 'other'::text]));

ALTER TABLE ONLY public.production_team_members ADD CONSTRAINT production_team_members_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.production_team_members ADD CONSTRAINT production_team_members_role_check CHECK (role = ANY (ARRAY['owner'::text, 'manager'::text, 'member'::text]));

ALTER TABLE ONLY public.production_team_members ADD CONSTRAINT production_team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES production_teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.production_team_members ADD CONSTRAINT production_team_members_team_id_user_id_key UNIQUE (team_id, user_id);

ALTER TABLE ONLY public.production_team_members ADD CONSTRAINT production_team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.production_team_roster ADD CONSTRAINT production_team_roster_added_by_user_id_fkey FOREIGN KEY (added_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.production_team_roster ADD CONSTRAINT production_team_roster_entity_kind_check CHECK (entity_kind = ANY (ARRAY['musician'::text, 'duo'::text, 'group'::text]));

ALTER TABLE ONLY public.production_team_roster ADD CONSTRAINT production_team_roster_exactly_one_target CHECK (((profile_id IS NOT NULL)::integer + (group_id IS NOT NULL)::integer) = 1);

ALTER TABLE ONLY public.production_team_roster ADD CONSTRAINT production_team_roster_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.production_team_roster ADD CONSTRAINT production_team_roster_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.production_team_roster ADD CONSTRAINT production_team_roster_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.production_team_roster ADD CONSTRAINT production_team_roster_team_id_fkey FOREIGN KEY (team_id) REFERENCES production_teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.production_teams ADD CONSTRAINT production_teams_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.production_teams ADD CONSTRAINT production_teams_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.products ADD CONSTRAINT products_base_price_check CHECK (base_price >= 0::numeric);

ALTER TABLE ONLY public.products ADD CONSTRAINT products_category_check CHECK (category = ANY (ARRAY['apparel'::text, 'accessories'::text, 'vinyl'::text, 'cd'::text, 'poster'::text, 'sticker'::text, 'digital'::text, 'bundle'::text, 'other'::text]));

ALTER TABLE ONLY public.products ADD CONSTRAINT products_currency_check CHECK (char_length(currency) = 3);

ALTER TABLE ONLY public.products ADD CONSTRAINT products_description_check CHECK (char_length(description) <= 5000);

ALTER TABLE ONLY public.products ADD CONSTRAINT products_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.products ADD CONSTRAINT products_limited_quantity_check CHECK (limited_quantity IS NULL OR limited_quantity > 0);

ALTER TABLE ONLY public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.products ADD CONSTRAINT products_product_type_check CHECK (product_type = ANY (ARRAY['merch'::text, 'digital_drop'::text, 'exclusive_content'::text]));

ALTER TABLE ONLY public.products ADD CONSTRAINT products_review_count_check CHECK (review_count >= 0);

ALTER TABLE ONLY public.products ADD CONSTRAINT products_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.products ADD CONSTRAINT products_status_check CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'sold_out'::text, 'archived'::text, 'suspended'::text]));

ALTER TABLE ONLY public.products ADD CONSTRAINT products_title_check CHECK (char_length(title) >= 1 AND char_length(title) <= 200);

ALTER TABLE ONLY public.products ADD CONSTRAINT products_total_sold_check CHECK (total_sold >= 0);

ALTER TABLE ONLY public.profile_genres ADD CONSTRAINT profile_genres_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profile_genres ADD CONSTRAINT profile_genres_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.profile_genres ADD CONSTRAINT profile_genres_profile_id_genre_key UNIQUE (profile_id, genre);

ALTER TABLE ONLY public.profile_portfolio_urls ADD CONSTRAINT profile_portfolio_urls_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profile_portfolio_urls ADD CONSTRAINT profile_portfolio_urls_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.profile_portfolio_urls ADD CONSTRAINT profile_portfolio_urls_profile_id_portfolio_url_key UNIQUE (profile_id, portfolio_url);

ALTER TABLE ONLY public.profile_skills ADD CONSTRAINT profile_skills_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profile_skills ADD CONSTRAINT profile_skills_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.profile_skills ADD CONSTRAINT profile_skills_profile_id_skill_key UNIQUE (profile_id, skill);

ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_email_key UNIQUE (email);

ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['fan'::text, 'musician'::text, 'studio-owner'::text, 'venue-owner'::text, 'producer'::text, 'admin'::text]));

ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_subscription_plan_id_fkey FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_subscription_status_check CHECK (subscription_status = ANY (ARRAY['none'::text, 'active'::text, 'expired'::text, 'cancelled'::text]));

ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_verification_status_check CHECK (verification_status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'DECLINED'::text, 'ABANDONED'::text, 'PENDING_REVIEW'::text]));

ALTER TABLE ONLY public.push_notification_devices ADD CONSTRAINT push_notification_devices_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.push_notification_devices ADD CONSTRAINT push_notification_devices_platform_check CHECK (platform = ANY (ARRAY['android'::text, 'ios'::text]));

ALTER TABLE ONLY public.push_notification_devices ADD CONSTRAINT push_notification_devices_token_type_check CHECK (token_type = 'expo'::text);

ALTER TABLE ONLY public.push_notification_devices ADD CONSTRAINT push_notification_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.registration_attempts ADD CONSTRAINT registration_attempts_action_check CHECK (action = ANY (ARRAY['create_didit_session'::text, 'create_unverified_user'::text, 'manual_identity_review'::text, 'resend_confirmation_email'::text]));

ALTER TABLE ONLY public.registration_attempts ADD CONSTRAINT registration_attempts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reports ADD CONSTRAINT reports_escalation_status_check CHECK (escalation_status = ANY (ARRAY['none'::text, 'manual_review'::text]));

ALTER TABLE ONLY public.reports ADD CONSTRAINT reports_moderation_action_check CHECK (moderation_action = ANY (ARRAY['none'::text, 'warn_reporter'::text, 'warn_target_owner'::text, 'warn_both'::text, 'manual_review'::text]));

ALTER TABLE ONLY public.reports ADD CONSTRAINT reports_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reports ADD CONSTRAINT reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reports ADD CONSTRAINT reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reports ADD CONSTRAINT reports_status_check CHECK (status = ANY (ARRAY['pending'::text, 'resolved'::text, 'dismissed'::text]));

ALTER TABLE ONLY public.reports ADD CONSTRAINT reports_target_type_check CHECK (target_type = ANY (ARRAY['group'::text, 'studio'::text, 'gig'::text, 'profile'::text, 'product'::text, 'playlist'::text, 'feed_post'::text]));

ALTER TABLE ONLY public.review_likes ADD CONSTRAINT review_likes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.review_likes ADD CONSTRAINT review_likes_review_id_fkey FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.review_likes ADD CONSTRAINT review_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.review_likes ADD CONSTRAINT review_likes_user_id_review_id_key UNIQUE (user_id, review_id);

ALTER TABLE ONLY public.reviews ADD CONSTRAINT one_target_only CHECK (((group_id IS NOT NULL)::integer + (studio_id IS NOT NULL)::integer + (gig_id IS NOT NULL)::integer + (user_id IS NOT NULL)::integer) = 1);

ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_gig_application_id_fkey FOREIGN KEY (gig_application_id) REFERENCES gig_applications(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_gig_id_fkey FOREIGN KEY (gig_id) REFERENCES gigs(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_rating_check CHECK (rating >= 1 AND rating <= 5);

ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_studio_booking_id_fkey FOREIGN KEY (studio_booking_id) REFERENCES studio_bookings(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.shipping_profiles ADD CONSTRAINT shipping_profiles_base_fee_check CHECK (base_fee >= 0::numeric);

ALTER TABLE ONLY public.shipping_profiles ADD CONSTRAINT shipping_profiles_name_check CHECK (char_length(name) >= 1 AND char_length(name) <= 100);

ALTER TABLE ONLY public.shipping_profiles ADD CONSTRAINT shipping_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.shipping_profiles ADD CONSTRAINT shipping_profiles_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.shipping_profiles ADD CONSTRAINT shipping_profiles_shipping_type_check CHECK (shipping_type = ANY (ARRAY['standard'::text, 'express'::text, 'pickup'::text, 'digital'::text]));

ALTER TABLE ONLY public.social_activity_events ADD CONSTRAINT social_activity_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.social_activity_events ADD CONSTRAINT social_activity_events_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES post_comments(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.social_activity_events ADD CONSTRAINT social_activity_events_event_type_check CHECK (event_type = ANY (ARRAY['follow'::text, 'unfollow'::text, 'post_created'::text, 'post_updated'::text, 'post_deleted'::text, 'post_shared'::text, 'reaction_added'::text, 'reaction_removed'::text, 'comment_added'::text, 'comment_deleted'::text, 'comment_moderation_blocked'::text, 'comment_moderation_review'::text, 'comment_moderation_approved'::text, 'comment_hidden'::text, 'comment_restored'::text, 'post_reported'::text, 'post_hidden'::text, 'post_restored'::text]));

ALTER TABLE ONLY public.social_activity_events ADD CONSTRAINT social_activity_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.social_activity_events ADD CONSTRAINT social_activity_events_post_id_fkey FOREIGN KEY (post_id) REFERENCES feed_posts(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.social_activity_events ADD CONSTRAINT social_activity_events_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.station_playlist_slots ADD CONSTRAINT station_playlist_slots_label_check CHECK (char_length(label) <= 200);

ALTER TABLE ONLY public.station_playlist_slots ADD CONSTRAINT station_playlist_slots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.station_playlist_slots ADD CONSTRAINT station_playlist_slots_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.station_playlist_slots ADD CONSTRAINT station_playlist_slots_station_id_fkey FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.stations ADD CONSTRAINT stations_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.stations ADD CONSTRAINT stations_description_check CHECK (char_length(description) <= 2000);

ALTER TABLE ONLY public.stations ADD CONSTRAINT stations_listener_count_check CHECK (listener_count >= 0);

ALTER TABLE ONLY public.stations ADD CONSTRAINT stations_managed_group_id_fkey FOREIGN KEY (managed_group_id) REFERENCES groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.stations ADD CONSTRAINT stations_managed_profile_id_fkey FOREIGN KEY (managed_profile_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.stations ADD CONSTRAINT stations_name_check CHECK (char_length(name) >= 1 AND char_length(name) <= 200);

ALTER TABLE ONLY public.stations ADD CONSTRAINT stations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.stations ADD CONSTRAINT stations_rotation_interval_minutes_check CHECK (rotation_interval_minutes >= 5 AND rotation_interval_minutes <= 120);

ALTER TABLE ONLY public.stations ADD CONSTRAINT stations_stream_status_check CHECK (stream_status = ANY (ARRAY['offline'::text, 'live'::text, 'autoplay'::text]));

ALTER TABLE ONLY public.studio_amenities ADD CONSTRAINT studio_amenities_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.studio_amenities ADD CONSTRAINT studio_amenities_studio_id_amenity_key UNIQUE (studio_id, amenity);

ALTER TABLE ONLY public.studio_amenities ADD CONSTRAINT studio_amenities_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.studio_availability_slots ADD CONSTRAINT studio_availability_slots_check CHECK (end_time > start_time);

ALTER TABLE ONLY public.studio_availability_slots ADD CONSTRAINT studio_availability_slots_check1 CHECK (day_of_week IS NOT NULL AND day_of_week >= 0 AND day_of_week <= 6 OR slot_date IS NOT NULL);

ALTER TABLE ONLY public.studio_availability_slots ADD CONSTRAINT studio_availability_slots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.studio_availability_slots ADD CONSTRAINT studio_availability_slots_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.studio_booking_slots ADD CONSTRAINT studio_booking_slots_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio_bookings(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.studio_booking_slots ADD CONSTRAINT studio_booking_slots_booking_id_start_time_end_time_key UNIQUE (booking_id, start_time, end_time);

ALTER TABLE ONLY public.studio_booking_slots ADD CONSTRAINT studio_booking_slots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.studio_booking_slots ADD CONSTRAINT studio_booking_slots_time_check CHECK (end_time > start_time);

ALTER TABLE ONLY public.studio_bookings ADD CONSTRAINT no_overlapping_bookings EXCLUDE USING gist (studio_id WITH =, booking_date WITH =, tsrange(booking_date + start_time, booking_date + end_time, '[)'::text) WITH &&) WHERE (status <> 'cancelled'::text AND status <> 'rejected'::text);

ALTER TABLE ONLY public.studio_bookings ADD CONSTRAINT studio_bookings_cancellation_policy_id_fkey FOREIGN KEY (cancellation_policy_id) REFERENCES booking_cancellation_policies(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.studio_bookings ADD CONSTRAINT studio_bookings_check CHECK (end_time > start_time);

ALTER TABLE ONLY public.studio_bookings ADD CONSTRAINT studio_bookings_final_price_check CHECK (final_price >= 0::numeric);

ALTER TABLE ONLY public.studio_bookings ADD CONSTRAINT studio_bookings_hours_check CHECK (hours > 0::numeric);

ALTER TABLE ONLY public.studio_bookings ADD CONSTRAINT studio_bookings_payment_status_check CHECK (payment_status = ANY (ARRAY['unpaid'::text, 'pending'::text, 'paid'::text, 'partial'::text, 'failed'::text, 'refunded'::text, 'refund_pending'::text]));

ALTER TABLE ONLY public.studio_bookings ADD CONSTRAINT studio_bookings_payment_type_check CHECK (payment_type = ANY (ARRAY['full'::text, 'downpayment'::text, 'balance'::text]));

ALTER TABLE ONLY public.studio_bookings ADD CONSTRAINT studio_bookings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.studio_bookings ADD CONSTRAINT studio_bookings_remaining_balance_check CHECK (remaining_balance >= 0::numeric);

ALTER TABLE ONLY public.studio_bookings ADD CONSTRAINT studio_bookings_session_type_check CHECK (session_type = ANY (ARRAY['rehearsal'::text, 'recording'::text]));

ALTER TABLE ONLY public.studio_bookings ADD CONSTRAINT studio_bookings_status_check CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text, 'checked_in'::text, 'pending_relocation'::text]));

ALTER TABLE ONLY public.studio_bookings ADD CONSTRAINT studio_bookings_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.studio_bookings ADD CONSTRAINT studio_bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.studio_date_overrides ADD CONSTRAINT studio_date_overrides_check CHECK (is_open = false OR open_time IS NOT NULL AND close_time IS NOT NULL);

ALTER TABLE ONLY public.studio_date_overrides ADD CONSTRAINT studio_date_overrides_check1 CHECK (NOT is_open OR close_time > open_time);

ALTER TABLE ONLY public.studio_date_overrides ADD CONSTRAINT studio_date_overrides_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.studio_date_overrides ADD CONSTRAINT studio_date_overrides_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.studio_date_overrides ADD CONSTRAINT studio_date_overrides_studio_id_override_date_slot_order_key UNIQUE (studio_id, override_date, slot_order);

ALTER TABLE ONLY public.studio_deletion_audit ADD CONSTRAINT studio_deletion_audit_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.studio_deletion_audit ADD CONSTRAINT studio_deletion_audit_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.studio_deletion_audit ADD CONSTRAINT studio_deletion_audit_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.studio_instruments ADD CONSTRAINT studio_instruments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.studio_instruments ADD CONSTRAINT studio_instruments_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.studio_instruments ADD CONSTRAINT studio_instruments_studio_id_instrument_name_image_url_key UNIQUE (studio_id, instrument_name, image_url);

ALTER TABLE ONLY public.studio_media ADD CONSTRAINT studio_media_media_type_check CHECK (media_type = 'image'::text);

ALTER TABLE ONLY public.studio_media ADD CONSTRAINT studio_media_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.studio_media ADD CONSTRAINT studio_media_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.studio_media ADD CONSTRAINT studio_media_studio_id_media_type_media_url_key UNIQUE (studio_id, media_type, media_url);

ALTER TABLE ONLY public.studio_open_dates ADD CONSTRAINT studio_open_dates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.studio_open_dates ADD CONSTRAINT studio_open_dates_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.studio_open_dates ADD CONSTRAINT studio_open_dates_studio_id_open_date_key UNIQUE (studio_id, open_date);

ALTER TABLE ONLY public.studio_operating_hours ADD CONSTRAINT studio_operating_hours_check CHECK (is_open = false OR open_time IS NOT NULL AND close_time IS NOT NULL);

ALTER TABLE ONLY public.studio_operating_hours ADD CONSTRAINT studio_operating_hours_check1 CHECK (NOT is_open OR close_time > open_time);

ALTER TABLE ONLY public.studio_operating_hours ADD CONSTRAINT studio_operating_hours_day_of_week_check CHECK (day_of_week >= 0 AND day_of_week <= 6);

ALTER TABLE ONLY public.studio_operating_hours ADD CONSTRAINT studio_operating_hours_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.studio_operating_hours ADD CONSTRAINT studio_operating_hours_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.studio_operating_hours ADD CONSTRAINT studio_operating_hours_weekly_schedule_dates_check CHECK (weekly_schedule_dates IS NULL OR jsonb_typeof(weekly_schedule_dates) = 'array'::text);

ALTER TABLE ONLY public.studio_operating_hours ADD CONSTRAINT studio_operating_hours_weekly_schedule_scope_check CHECK (weekly_schedule_scope IS NULL OR (weekly_schedule_scope = ANY (ARRAY['indefinite'::text, 'until'::text, 'specific_dates'::text])));

ALTER TABLE ONLY public.studio_owner_penalties ADD CONSTRAINT studio_owner_penalties_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES studio_bookings(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.studio_owner_penalties ADD CONSTRAINT studio_owner_penalties_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.studio_owner_penalties ADD CONSTRAINT studio_owner_penalties_penalty_points_check CHECK (penalty_points > 0);

ALTER TABLE ONLY public.studio_owner_penalties ADD CONSTRAINT studio_owner_penalties_penalty_type_check CHECK (penalty_type = 'forced_relocation_expired'::text);

ALTER TABLE ONLY public.studio_owner_penalties ADD CONSTRAINT studio_owner_penalties_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.studio_owner_penalties ADD CONSTRAINT studio_owner_penalties_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.studio_promotions ADD CONSTRAINT chk_date_range CHECK (is_permanent = true OR start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date);

ALTER TABLE ONLY public.studio_promotions ADD CONSTRAINT chk_percentage_range CHECK (discount_type <> 'percentage'::text OR discount_value > 0::numeric AND discount_value <= 100::numeric);

ALTER TABLE ONLY public.studio_promotions ADD CONSTRAINT studio_promotions_applies_to_check CHECK (applies_to = ANY (ARRAY['rehearsal'::text, 'recording'::text, 'both'::text]));

ALTER TABLE ONLY public.studio_promotions ADD CONSTRAINT studio_promotions_discount_type_check CHECK (discount_type = ANY (ARRAY['percentage'::text, 'fixed_amount'::text]));

ALTER TABLE ONLY public.studio_promotions ADD CONSTRAINT studio_promotions_discount_value_check CHECK (discount_value > 0::numeric);

ALTER TABLE ONLY public.studio_promotions ADD CONSTRAINT studio_promotions_minimum_booking_hours_check CHECK (minimum_booking_hours IS NULL OR minimum_booking_hours > 0::numeric);

ALTER TABLE ONLY public.studio_promotions ADD CONSTRAINT studio_promotions_minimum_spend_check CHECK (minimum_spend IS NULL OR minimum_spend > 0::numeric);

ALTER TABLE ONLY public.studio_promotions ADD CONSTRAINT studio_promotions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.studio_promotions ADD CONSTRAINT studio_promotions_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.studio_settings ADD CONSTRAINT studio_settings_booking_horizon_days_check CHECK (booking_horizon_days > 0);

ALTER TABLE ONLY public.studio_settings ADD CONSTRAINT studio_settings_buffer_minutes_check CHECK (buffer_minutes >= 0);

ALTER TABLE ONLY public.studio_settings ADD CONSTRAINT studio_settings_bulk_discount_percentage_check CHECK (bulk_discount_percentage >= 0::numeric AND bulk_discount_percentage <= 100::numeric);

ALTER TABLE ONLY public.studio_settings ADD CONSTRAINT studio_settings_holiday_multiplier_check CHECK (holiday_multiplier >= 1.0);

ALTER TABLE ONLY public.studio_settings ADD CONSTRAINT studio_settings_late_night_multiplier_check CHECK (late_night_multiplier >= 1.0);

ALTER TABLE ONLY public.studio_settings ADD CONSTRAINT studio_settings_lead_time_hours_check CHECK (lead_time_hours >= 0);

ALTER TABLE ONLY public.studio_settings ADD CONSTRAINT studio_settings_max_booking_duration_hours_check CHECK (max_booking_duration_hours <= 24::numeric);

ALTER TABLE ONLY public.studio_settings ADD CONSTRAINT studio_settings_min_booking_duration_hours_check CHECK (min_booking_duration_hours > 0::numeric);

ALTER TABLE ONLY public.studio_settings ADD CONSTRAINT studio_settings_off_peak_multiplier_check CHECK (off_peak_multiplier >= 0.5 AND off_peak_multiplier <= 1.0);

ALTER TABLE ONLY public.studio_settings ADD CONSTRAINT studio_settings_peak_season_multiplier_check CHECK (peak_season_multiplier >= 1.0);

ALTER TABLE ONLY public.studio_settings ADD CONSTRAINT studio_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.studio_settings ADD CONSTRAINT studio_settings_recording_hours_per_block_check CHECK (recording_hours_per_block > 0::numeric);

ALTER TABLE ONLY public.studio_settings ADD CONSTRAINT studio_settings_recording_songs_per_block_check CHECK (recording_songs_per_block > 0);

ALTER TABLE ONLY public.studio_settings ADD CONSTRAINT studio_settings_slot_increment_minutes_check CHECK (slot_increment_minutes = ANY (ARRAY[15, 30, 60]));

ALTER TABLE ONLY public.studio_settings ADD CONSTRAINT studio_settings_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.studio_settings ADD CONSTRAINT studio_settings_studio_id_key UNIQUE (studio_id);

ALTER TABLE ONLY public.studio_settings ADD CONSTRAINT studio_settings_weekend_multiplier_check CHECK (weekend_multiplier >= 1.0);

ALTER TABLE ONLY public.studio_settings ADD CONSTRAINT studio_settings_weekly_schedule_dates_check CHECK (jsonb_typeof(weekly_schedule_dates) = 'array'::text);

ALTER TABLE ONLY public.studio_settings ADD CONSTRAINT studio_settings_weekly_schedule_scope_check CHECK (weekly_schedule_scope = ANY (ARRAY['indefinite'::text, 'until'::text, 'specific_dates'::text]));

ALTER TABLE ONLY public.studio_types ADD CONSTRAINT studio_types_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.studio_types ADD CONSTRAINT studio_types_studio_id_fkey FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.studio_types ADD CONSTRAINT studio_types_studio_id_studio_type_key UNIQUE (studio_id, studio_type);

ALTER TABLE ONLY public.studios ADD CONSTRAINT studios_address_verification_status_check CHECK (address_verification_status = ANY (ARRAY['NOT_STARTED'::text, 'PENDING'::text, 'PROCESSING'::text, 'VERIFIED'::text, 'APPROVED'::text, 'DECLINED'::text, 'FAILED'::text, 'ABANDONED'::text, 'MANUAL_REVIEW'::text, 'PENDING_REVIEW'::text]));

ALTER TABLE ONLY public.studios ADD CONSTRAINT studios_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.studios ADD CONSTRAINT studios_permit_resubmissions_used_check CHECK (permit_resubmissions_used >= 0 AND permit_resubmissions_used <= 1);

ALTER TABLE ONLY public.studios ADD CONSTRAINT studios_permit_reviewed_by_fkey FOREIGN KEY (permit_reviewed_by) REFERENCES profiles(id);

ALTER TABLE ONLY public.studios ADD CONSTRAINT studios_permit_status_check CHECK (permit_status = ANY (ARRAY['pending_review'::text, 'approved'::text, 'rejected'::text, 'resubmitted'::text]));

ALTER TABLE ONLY public.studios ADD CONSTRAINT studios_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.subscription_payments ADD CONSTRAINT subscription_payments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.subscription_payments ADD CONSTRAINT subscription_payments_status_check CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text]));

ALTER TABLE ONLY public.subscription_payments ADD CONSTRAINT subscription_payments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.subscription_payments ADD CONSTRAINT subscription_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.subscription_plans ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_status_check CHECK (status = ANY (ARRAY['active'::text, 'cancelled'::text, 'expired'::text, 'pending'::text, 'past_due'::text]));

ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.subscriptions ADD CONSTRAINT unique_active_subscription UNIQUE (user_id);

ALTER TABLE ONLY public.verification_sessions ADD CONSTRAINT verification_sessions_pkey PRIMARY KEY (session_ref);

ALTER TABLE ONLY public.wallet_deposits ADD CONSTRAINT wallet_deposits_checkout_session_id_key UNIQUE (checkout_session_id);

ALTER TABLE ONLY public.wallet_deposits ADD CONSTRAINT wallet_deposits_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.wallet_deposits ADD CONSTRAINT wallet_deposits_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.wallet_transactions ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.wallet_transactions ADD CONSTRAINT wallet_transactions_reference_type_check CHECK (reference_type = ANY (ARRAY['booking'::text, 'booking_payment'::text, 'booking_downpayment'::text, 'booking_balance'::text, 'deal_deposit'::text, 'deal_settlement'::text, 'penalty'::text, 'refund'::text, 'withdrawal'::text, 'deposit'::text]));

ALTER TABLE ONLY public.wallet_transactions ADD CONSTRAINT wallet_transactions_status_check CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text]));

ALTER TABLE ONLY public.wallet_transactions ADD CONSTRAINT wallet_transactions_type_check CHECK (type = ANY (ARRAY['deposit'::text, 'withdrawal'::text, 'payment'::text, 'refund'::text, 'earning'::text]));

ALTER TABLE ONLY public.wallet_transactions ADD CONSTRAINT wallet_transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.wallets ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.wallets ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.wallets ADD CONSTRAINT wallets_user_id_key UNIQUE (user_id);

ALTER TABLE ONLY public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_amount_check CHECK (amount > 0::numeric);

ALTER TABLE ONLY public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_payout_method_id_fkey FOREIGN KEY (payout_method_id) REFERENCES payout_methods(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES profiles(id);

ALTER TABLE ONLY public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]));

ALTER TABLE ONLY public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE;

ALTER TABLE ONLY realtime.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id, inserted_at);

ALTER TABLE ONLY realtime.schema_migrations ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);

ALTER TABLE ONLY realtime.subscription ADD CONSTRAINT pk_subscription PRIMARY KEY (id);

ALTER TABLE ONLY realtime.subscription ADD CONSTRAINT subscription_action_filter_check CHECK (action_filter = ANY (ARRAY['*'::text, 'INSERT'::text, 'UPDATE'::text, 'DELETE'::text]));

ALTER TABLE ONLY storage.buckets ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY storage.buckets_analytics ADD CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id);

ALTER TABLE ONLY storage.buckets_vectors ADD CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id);

ALTER TABLE ONLY storage.migrations ADD CONSTRAINT migrations_name_key UNIQUE (name);

ALTER TABLE ONLY storage.migrations ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY storage.objects ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);

ALTER TABLE ONLY storage.objects ADD CONSTRAINT objects_pkey PRIMARY KEY (id);

ALTER TABLE ONLY storage.s3_multipart_uploads ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);

ALTER TABLE ONLY storage.s3_multipart_uploads ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);

ALTER TABLE ONLY storage.s3_multipart_uploads_parts ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);

ALTER TABLE ONLY storage.s3_multipart_uploads_parts ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY storage.s3_multipart_uploads_parts ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;

ALTER TABLE ONLY storage.vector_indexes ADD CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id);

ALTER TABLE ONLY storage.vector_indexes ADD CONSTRAINT vector_indexes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY supabase_migrations.schema_migrations ADD CONSTRAINT schema_migrations_idempotency_key_key UNIQUE (idempotency_key);

ALTER TABLE ONLY supabase_migrations.schema_migrations ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


-- index
CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);

CREATE INDEX custom_oauth_providers_created_at_idx ON auth.custom_oauth_providers USING btree (created_at);

CREATE INDEX custom_oauth_providers_enabled_idx ON auth.custom_oauth_providers USING btree (enabled);

CREATE INDEX custom_oauth_providers_identifier_idx ON auth.custom_oauth_providers USING btree (identifier);

CREATE INDEX custom_oauth_providers_provider_type_idx ON auth.custom_oauth_providers USING btree (provider_type);

CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at);

CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC);

CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops);

CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id);

CREATE INDEX idx_address_verification_sessions_archive ON public.address_verification_sessions USING btree (archive_id);

CREATE INDEX idx_address_verification_sessions_entity ON public.address_verification_sessions USING btree (entity_type, entity_id);

CREATE INDEX idx_address_verification_sessions_session_id ON public.address_verification_sessions USING btree (session_id);

CREATE INDEX idx_address_verification_sessions_smile_user ON public.address_verification_sessions USING btree (smile_user_id);

CREATE INDEX idx_address_verification_sessions_user ON public.address_verification_sessions USING btree (user_id);

CREATE INDEX idx_audit_event_changes_event ON public.audit_event_changes USING btree (audit_event_id);

CREATE INDEX idx_audit_events_action ON public.audit_events USING btree (action, occurred_at DESC);

CREATE INDEX idx_audit_events_actor ON public.audit_events USING btree (actor_user_id, occurred_at DESC);

CREATE INDEX idx_audit_events_entity ON public.audit_events USING btree (entity_table, entity_id, occurred_at DESC);

CREATE INDEX idx_audit_events_occurred_at ON public.audit_events USING btree (occurred_at DESC);

CREATE INDEX idx_audit_events_target ON public.audit_events USING btree (target_user_id, occurred_at DESC);

CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code);

CREATE INDEX idx_bcp_studio ON public.booking_cancellation_policies USING btree (studio_id);

CREATE INDEX idx_bcp_studio_active ON public.booking_cancellation_policies USING btree (studio_id) WHERE (is_active = true);

CREATE INDEX idx_bi_penalty ON public.booking_incidents USING btree (penalty_event_id) WHERE (penalty_event_id IS NOT NULL);

CREATE INDEX idx_booking_attendance_events_booking_late_created ON public.booking_attendance_events USING btree (booking_id, created_at DESC) WHERE (event_type = 'late'::text);

CREATE INDEX idx_booking_holds_expiry ON public.booking_holds USING btree (expires_at);

CREATE INDEX idx_booking_holds_studio_date ON public.booking_holds USING btree (studio_id, booking_date);

CREATE INDEX idx_booking_incidents_booking_status ON public.booking_incidents USING btree (booking_id, status, created_at DESC);

CREATE INDEX idx_booking_incidents_counterparty_deadline ON public.booking_incidents USING btree (counterparty_user_id, status, response_deadline_at);

CREATE INDEX idx_booking_requests_group_member_applications ON public.booking_requests USING btree (group_id, status, created_at DESC) WHERE ((group_id IS NOT NULL) AND (event_details @> '{"type": "listing_connection_request", "request_kind": "application", "application_scope": "group_member"}'::jsonb));

CREATE INDEX idx_booking_requests_group_status_created ON public.booking_requests USING btree (group_id, status, created_at DESC) WHERE (group_id IS NOT NULL);

CREATE INDEX idx_booking_requests_receiver_status_created ON public.booking_requests USING btree (receiver_id, status, created_at DESC);

CREATE INDEX idx_booking_requests_sender_status_created ON public.booking_requests USING btree (sender_id, status, created_at DESC);

CREATE INDEX idx_bpe_beneficiary ON public.booking_penalty_events USING btree (beneficiary_user_id) WHERE (beneficiary_user_id IS NOT NULL);

CREATE INDEX idx_bpe_booking ON public.booking_penalty_events USING btree (booking_id);

CREATE INDEX idx_bpe_penalized ON public.booking_penalty_events USING btree (penalized_user_id);

CREATE INDEX idx_conversation_participants_conversation_id ON public.conversation_participants USING btree (conversation_id);

CREATE INDEX idx_conversation_participants_conversation_user ON public.conversation_participants USING btree (conversation_id, user_id);

CREATE INDEX idx_conversation_participants_muted_by_user ON public.conversation_participants USING btree (user_id, conversation_id, muted_until) WHERE (is_muted = true);

CREATE INDEX idx_conversation_participants_user_conversation ON public.conversation_participants USING btree (user_id, conversation_id);

CREATE INDEX idx_conversation_participants_user_id ON public.conversation_participants USING btree (user_id);

CREATE INDEX idx_conversations_group_id_is_group ON public.conversations USING btree (group_id) WHERE (group_id IS NOT NULL);

CREATE INDEX idx_conversations_is_group ON public.conversations USING btree (is_group) WHERE (is_group = true);

CREATE INDEX idx_email_notifications_status ON public.email_notifications USING btree (status) WHERE (status = 'pending'::text);

CREATE INDEX idx_external_links_owner ON public.external_platform_links USING btree (owner_id);

CREATE INDEX idx_external_links_playlist ON public.external_platform_links USING btree (linked_playlist_id) WHERE (linked_playlist_id IS NOT NULL);

CREATE INDEX idx_favorites_profile_id ON public.favorites USING btree (profile_id);

CREATE INDEX idx_favorites_user_id ON public.favorites USING btree (user_id);

CREATE INDEX idx_feed_posts_author ON public.feed_posts USING btree (author_id);

CREATE INDEX idx_feed_posts_author_visible_created_desc ON public.feed_posts USING btree (author_id, created_at DESC) WHERE (is_hidden = false);

CREATE INDEX idx_feed_posts_created ON public.feed_posts USING btree (created_at DESC) WHERE (is_hidden = false);

CREATE INDEX idx_feed_posts_public_created_desc ON public.feed_posts USING btree (created_at DESC) WHERE ((visibility = 'public'::text) AND (is_hidden = false));

CREATE INDEX idx_feed_posts_public_feed ON public.feed_posts USING btree (created_at DESC) WHERE ((visibility = 'public'::text) AND (is_hidden = false));

CREATE INDEX idx_feed_posts_type ON public.feed_posts USING btree (post_type);

CREATE INDEX idx_follows_followed ON public.follows USING btree (followed_id);

CREATE INDEX idx_follows_follower ON public.follows USING btree (follower_id);

CREATE INDEX idx_follows_follower_type_followed ON public.follows USING btree (follower_id, followed_type, followed_id);

CREATE INDEX idx_follows_target_type_follower ON public.follows USING btree (followed_type, followed_id, follower_id);

CREATE INDEX idx_fulfillments_order ON public.order_fulfillments USING btree (order_id);

CREATE INDEX idx_fulfillments_status ON public.order_fulfillments USING btree (status);

CREATE INDEX idx_gig_applications_applicant_created_desc ON public.gig_applications USING btree (applicant_id, created_at DESC);

CREATE INDEX idx_gig_applications_applicant_id ON public.gig_applications USING btree (applicant_id);

CREATE INDEX idx_gig_applications_cancelled_recent ON public.gig_applications USING btree (applicant_id, gig_id, updated_at DESC) WHERE (status = 'cancelled'::text);

CREATE INDEX idx_gig_applications_gig_applicant ON public.gig_applications USING btree (gig_id, applicant_id);

CREATE INDEX idx_gig_applications_gig_id ON public.gig_applications USING btree (gig_id);

CREATE INDEX idx_gig_applications_gig_status_created_desc ON public.gig_applications USING btree (gig_id, status, created_at DESC);

CREATE INDEX idx_gig_applications_group_completion_perf ON public.gig_applications USING btree (group_id, status) WHERE ((group_id IS NOT NULL) AND (status = ANY (ARRAY['completed'::text, 'cancelled'::text, 'fired'::text])));

CREATE INDEX idx_gig_applications_group_leader_approval ON public.gig_applications USING btree (group_id, leader_approval_status, created_at DESC);

CREATE INDEX idx_gig_applications_production_roster_id ON public.gig_applications USING btree (production_roster_id) WHERE (production_roster_id IS NOT NULL);

CREATE INDEX idx_gig_applications_production_team_id ON public.gig_applications USING btree (production_team_id) WHERE (production_team_id IS NOT NULL);

CREATE INDEX idx_gig_applications_reconfirm_due ON public.gig_applications USING btree (gig_id, reconfirmation_due_at) WHERE ((status = 'pending'::text) AND (reconfirmation_due_at IS NOT NULL));

CREATE INDEX idx_gig_applications_rejected_at ON public.gig_applications USING btree (gig_id, applicant_id, rejected_at) WHERE (status = 'rejected'::text);

CREATE INDEX idx_gig_applications_solo_completion_perf ON public.gig_applications USING btree (applicant_id, status) WHERE ((group_id IS NULL) AND (status = ANY (ARRAY['completed'::text, 'cancelled'::text, 'fired'::text])));

CREATE INDEX idx_gig_applications_status ON public.gig_applications USING btree (status);

CREATE INDEX idx_gig_applications_submitted_leader_created_desc ON public.gig_applications USING btree (submitted_by_user_id, leader_approval_status, created_at DESC);

CREATE INDEX idx_gig_availability_slots_gig_id ON public.gig_availability_slots USING btree (gig_id);

CREATE INDEX idx_gig_media_gig_id ON public.gig_media USING btree (gig_id);

CREATE INDEX idx_gig_requirements_gig_id ON public.gig_requirements USING btree (gig_id);

CREATE INDEX idx_gig_slot_fill_applicants_gig_id ON public.gig_slot_fill_applicants USING btree (gig_id);

CREATE INDEX idx_gigs_organizer_created_desc ON public.gigs USING btree (organizer_id, created_at DESC);

CREATE INDEX idx_gigs_permit_pending ON public.gigs USING btree (created_at DESC) WHERE (permit_status = ANY (ARRAY['pending'::text, 'resubmitted'::text]));

CREATE INDEX idx_gigs_permit_queue ON public.gigs USING btree (permit_status, created_at DESC);

CREATE INDEX idx_gigs_permit_status ON public.gigs USING btree (permit_status);

CREATE INDEX idx_gigs_permit_status_created ON public.gigs USING btree (permit_status, created_at DESC);

CREATE INDEX idx_gigs_slots_status ON public.gigs USING btree (status) WHERE (status = 'open'::text);

CREATE INDEX idx_group_availability_slots_group_id ON public.group_availability_slots USING btree (group_id);

CREATE INDEX idx_group_media_group_id ON public.group_media USING btree (group_id);

CREATE INDEX idx_group_members_group ON public.group_members USING btree (group_id);

CREATE INDEX idx_group_members_user ON public.group_members USING btree (user_id);

CREATE INDEX idx_group_playlists_group ON public.group_playlists USING btree (group_id, "position");

CREATE INDEX idx_group_playlists_playlist ON public.group_playlists USING btree (playlist_id);

CREATE INDEX idx_group_roster_members_group_id ON public.group_roster_members USING btree (group_id);

CREATE INDEX idx_group_roster_members_user_id ON public.group_roster_members USING btree (user_id);

CREATE INDEX idx_groups_owner_id ON public.groups USING btree (owner_id);

CREATE INDEX idx_identity_document_claims_duplicate_lookup ON public.identity_document_claims USING btree (document_fingerprint, role, status);

CREATE INDEX idx_identity_document_claims_name_birth_approved ON public.identity_document_claims USING btree (role, normalized_full_legal_name, birth_date) WHERE ((status = 'APPROVED'::text) AND (normalized_full_legal_name IS NOT NULL) AND (birth_date IS NOT NULL));

CREATE INDEX idx_identity_document_claims_normalized_email ON public.identity_document_claims USING btree (normalized_email) WHERE (normalized_email IS NOT NULL);

CREATE INDEX idx_identity_document_claims_original_user ON public.identity_document_claims USING btree (original_user_id);

CREATE INDEX idx_identity_document_claims_user_status ON public.identity_document_claims USING btree (user_id, status);

CREATE INDEX idx_leadership_transfer_from ON public.leadership_transfer_requests USING btree (from_user_id);

CREATE INDEX idx_leadership_transfer_group ON public.leadership_transfer_requests USING btree (group_id);

CREATE INDEX idx_leadership_transfer_status ON public.leadership_transfer_requests USING btree (status);

CREATE INDEX idx_leadership_transfer_to ON public.leadership_transfer_requests USING btree (to_user_id);

CREATE INDEX idx_leadership_transfer_to_user ON public.leadership_transfer_requests USING btree (to_user_id);

CREATE INDEX idx_manual_identity_reviews_document_fingerprint ON public.manual_identity_reviews USING btree (document_fingerprint) WHERE (document_fingerprint IS NOT NULL);

CREATE INDEX idx_manual_identity_reviews_name_birth_pending ON public.manual_identity_reviews USING btree (submitted_role, normalized_full_legal_name, birth_date) WHERE ((status = 'PENDING_REVIEW'::text) AND (normalized_full_legal_name IS NOT NULL) AND (birth_date IS NOT NULL));

CREATE INDEX idx_manual_identity_reviews_status_created ON public.manual_identity_reviews USING btree (status, created_at DESC);

CREATE INDEX idx_manual_identity_reviews_user_status ON public.manual_identity_reviews USING btree (user_id, status, created_at DESC);

CREATE INDEX idx_message_reactions_message_id ON public.message_reactions USING btree (message_id);

CREATE INDEX idx_message_reactions_user_id ON public.message_reactions USING btree (user_id);

CREATE INDEX idx_messages_conversation_id ON public.messages USING btree (conversation_id);

CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at DESC);

CREATE INDEX idx_messages_sender_id ON public.messages USING btree (sender_id);

CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at);

CREATE INDEX idx_notifications_user_created_desc ON public.notifications USING btree (user_id, created_at DESC);

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);

CREATE INDEX idx_notifications_user_unread_created_desc ON public.notifications USING btree (user_id, created_at DESC) WHERE (read = false);

CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at);

CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C");

CREATE INDEX idx_objects_bucket_id_name_lower ON storage.objects USING btree (bucket_id, lower(name) COLLATE "C");

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);

CREATE INDEX idx_order_items_product ON public.order_items USING btree (product_id);

CREATE INDEX idx_orders_buyer ON public.orders USING btree (buyer_id);

CREATE INDEX idx_orders_created ON public.orders USING btree (created_at DESC);

CREATE INDEX idx_orders_number ON public.orders USING btree (order_number);

CREATE INDEX idx_orders_seller ON public.orders USING btree (seller_id);

CREATE INDEX idx_orders_status ON public.orders USING btree (status);

CREATE INDEX idx_owner_penalties_owner_created ON public.studio_owner_penalties USING btree (owner_id, created_at DESC);

CREATE INDEX idx_payout_methods_user ON public.payout_methods USING btree (user_id);

CREATE INDEX idx_permit_audit_created ON public.permit_audit_log USING btree (created_at DESC);

CREATE INDEX idx_permit_audit_entity ON public.permit_audit_log USING btree (entity_type, entity_id);

CREATE INDEX idx_permit_audit_performed_by ON public.permit_audit_log USING btree (performed_by);

CREATE INDEX idx_play_events_playlist ON public.playlist_play_events USING btree (playlist_id) WHERE (playlist_id IS NOT NULL);

CREATE INDEX idx_play_events_station ON public.playlist_play_events USING btree (station_id) WHERE (station_id IS NOT NULL);

CREATE INDEX idx_play_events_type ON public.playlist_play_events USING btree (event_type, created_at DESC);

CREATE INDEX idx_play_events_user ON public.playlist_play_events USING btree (user_id) WHERE (user_id IS NOT NULL);

CREATE INDEX idx_playlist_items_playlist ON public.playlist_items USING btree (playlist_id, "position");

CREATE INDEX idx_playlists_creator ON public.playlists USING btree (creator_id);

CREATE INDEX idx_playlists_featured ON public.playlists USING btree (created_at DESC) WHERE ((is_featured = true) AND (is_hidden = false));

CREATE INDEX idx_playlists_genre ON public.playlists USING btree (genre) WHERE (genre IS NOT NULL);

CREATE INDEX idx_playlists_public ON public.playlists USING btree (created_at DESC) WHERE ((visibility = 'public'::text) AND (is_hidden = false));

CREATE INDEX idx_post_comments_author ON public.post_comments USING btree (author_id);

CREATE INDEX idx_post_comments_moderation_status ON public.post_comments USING btree (moderation_status, created_at DESC) WHERE ((moderation_status <> 'approved'::text) OR (is_hidden = true));

CREATE INDEX idx_post_comments_parent ON public.post_comments USING btree (parent_comment_id) WHERE (parent_comment_id IS NOT NULL);

CREATE INDEX idx_post_comments_post ON public.post_comments USING btree (post_id);

CREATE INDEX idx_post_comments_post_visible_created ON public.post_comments USING btree (post_id, created_at) WHERE ((is_hidden = false) AND (moderation_status = 'approved'::text));

CREATE INDEX idx_post_media_post ON public.post_media USING btree (post_id);

CREATE INDEX idx_post_media_post_display_order ON public.post_media USING btree (post_id, display_order);

CREATE INDEX idx_post_reactions_post ON public.post_reactions USING btree (post_id);

CREATE INDEX idx_post_reactions_user ON public.post_reactions USING btree (user_id);

CREATE INDEX idx_post_reactions_user_post ON public.post_reactions USING btree (user_id, post_id);

CREATE INDEX idx_product_media_product ON public.product_media USING btree (product_id);

CREATE INDEX idx_product_variants_available ON public.product_variants USING btree (product_id) WHERE ((is_available = true) AND (stock_quantity > 0));

CREATE INDEX idx_product_variants_product ON public.product_variants USING btree (product_id);

CREATE INDEX idx_production_team_members_team ON public.production_team_members USING btree (team_id);

CREATE INDEX idx_production_team_members_user ON public.production_team_members USING btree (user_id);

CREATE INDEX idx_production_team_roster_group ON public.production_team_roster USING btree (group_id) WHERE (group_id IS NOT NULL);

CREATE INDEX idx_production_team_roster_profile ON public.production_team_roster USING btree (profile_id) WHERE (profile_id IS NOT NULL);

CREATE INDEX idx_production_team_roster_team ON public.production_team_roster USING btree (team_id);

CREATE INDEX idx_production_team_roster_team_kind ON public.production_team_roster USING btree (team_id, entity_kind);

CREATE INDEX idx_production_teams_owner ON public.production_teams USING btree (owner_id);

CREATE INDEX idx_products_active ON public.products USING btree (created_at DESC) WHERE (status = 'active'::text);

CREATE INDEX idx_products_category ON public.products USING btree (category) WHERE (category IS NOT NULL);

CREATE INDEX idx_products_featured ON public.products USING btree (created_at DESC) WHERE ((is_featured = true) AND (status = 'active'::text));

CREATE INDEX idx_products_group ON public.products USING btree (group_id) WHERE (group_id IS NOT NULL);

CREATE INDEX idx_products_seller ON public.products USING btree (seller_id);

CREATE INDEX idx_products_status ON public.products USING btree (status);

CREATE INDEX idx_products_type ON public.products USING btree (product_type);

CREATE INDEX idx_profile_genres_profile_id ON public.profile_genres USING btree (profile_id);

CREATE INDEX idx_profile_portfolio_urls_profile_id ON public.profile_portfolio_urls USING btree (profile_id);

CREATE INDEX idx_profile_skills_profile_id ON public.profile_skills USING btree (profile_id);

CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);

CREATE INDEX idx_profiles_smile_user_id ON public.profiles USING btree (smile_user_id);

CREATE INDEX idx_profiles_verification_status ON public.profiles USING btree (verification_status);

CREATE INDEX idx_push_notification_devices_token_active ON public.push_notification_devices USING btree (push_token) WHERE (is_active = true);

CREATE INDEX idx_push_notification_devices_user_active ON public.push_notification_devices USING btree (user_id, last_seen_at DESC) WHERE (is_active = true);

CREATE INDEX idx_registration_attempts_action_created ON public.registration_attempts USING btree (action, created_at DESC);

CREATE INDEX idx_registration_attempts_device_action_created ON public.registration_attempts USING btree (device_hash, action, created_at DESC) WHERE (device_hash IS NOT NULL);

CREATE INDEX idx_registration_attempts_email_action_created ON public.registration_attempts USING btree (email_hash, action, created_at DESC) WHERE (email_hash IS NOT NULL);

CREATE INDEX idx_registration_attempts_ip_action_created ON public.registration_attempts USING btree (ip_hash, action, created_at DESC) WHERE (ip_hash IS NOT NULL);

CREATE INDEX idx_reports_escalation_status_created_at ON public.reports USING btree (escalation_status, created_at DESC);

CREATE INDEX idx_reports_reviewed_at ON public.reports USING btree (reviewed_at DESC);

CREATE INDEX idx_reports_reviewed_by ON public.reports USING btree (reviewed_by);

CREATE INDEX idx_reports_status_created_at ON public.reports USING btree (status, created_at DESC);

CREATE INDEX idx_review_likes_review_id ON public.review_likes USING btree (review_id);

CREATE INDEX idx_reviews_gig_application_id ON public.reviews USING btree (gig_application_id);

CREATE INDEX idx_reviews_gig_id ON public.reviews USING btree (gig_id);

CREATE INDEX idx_reviews_group_id ON public.reviews USING btree (group_id);

CREATE INDEX idx_reviews_studio_booking_id ON public.reviews USING btree (studio_booking_id);

CREATE INDEX idx_reviews_studio_id ON public.reviews USING btree (studio_id);

CREATE INDEX idx_reviews_user_id ON public.reviews USING btree (user_id);

CREATE INDEX idx_sb_cancellation_policy ON public.studio_bookings USING btree (cancellation_policy_id) WHERE (cancellation_policy_id IS NOT NULL);

CREATE INDEX idx_shipping_profiles_seller ON public.shipping_profiles USING btree (seller_id);

CREATE INDEX idx_social_events_actor ON public.social_activity_events USING btree (actor_id);

CREATE INDEX idx_social_events_post ON public.social_activity_events USING btree (post_id) WHERE (post_id IS NOT NULL);

CREATE INDEX idx_social_events_target ON public.social_activity_events USING btree (target_user_id) WHERE (target_user_id IS NOT NULL);

CREATE INDEX idx_social_events_type ON public.social_activity_events USING btree (event_type, created_at DESC);

CREATE INDEX idx_station_slots_active ON public.station_playlist_slots USING btree (station_id) WHERE (is_active = true);

CREATE INDEX idx_station_slots_playlist ON public.station_playlist_slots USING btree (playlist_id);

CREATE INDEX idx_station_slots_station ON public.station_playlist_slots USING btree (station_id, "position");

CREATE INDEX idx_stations_active ON public.stations USING btree (created_at DESC) WHERE (is_active = true);

CREATE INDEX idx_stations_creator ON public.stations USING btree (creator_id);

CREATE INDEX idx_stations_featured ON public.stations USING btree (created_at DESC) WHERE ((is_featured = true) AND (is_active = true));

CREATE INDEX idx_stations_group_station ON public.stations USING btree (managed_group_id) WHERE (managed_group_id IS NOT NULL);

CREATE INDEX idx_stations_managed_group ON public.stations USING btree (managed_group_id) WHERE (managed_group_id IS NOT NULL);

CREATE INDEX idx_stations_managed_profile ON public.stations USING btree (managed_profile_id);

CREATE INDEX idx_stations_profile_station ON public.stations USING btree (managed_profile_id) WHERE ((managed_profile_id IS NOT NULL) AND (managed_group_id IS NULL));

CREATE INDEX idx_studio_amenities_studio_id ON public.studio_amenities USING btree (studio_id);

CREATE INDEX idx_studio_availability_slots_studio_id ON public.studio_availability_slots USING btree (studio_id);

CREATE INDEX idx_studio_booking_slots_booking_id ON public.studio_booking_slots USING btree (booking_id);

CREATE INDEX idx_studio_bookings_checkout_session ON public.studio_bookings USING btree (checkout_session_id);

CREATE INDEX idx_studio_bookings_date_status ON public.studio_bookings USING btree (studio_id, booking_date, status);

CREATE INDEX idx_studio_bookings_payment_status ON public.studio_bookings USING btree (payment_status);

CREATE INDEX idx_studio_bookings_studio_id ON public.studio_bookings USING btree (studio_id);

CREATE INDEX idx_studio_bookings_studio_status_date ON public.studio_bookings USING btree (studio_id, status, booking_date DESC);

CREATE INDEX idx_studio_bookings_unpaid_user ON public.studio_bookings USING btree (user_id, booking_date) WHERE ((remaining_balance > (0)::numeric) AND (status = ANY (ARRAY['pending'::text, 'confirmed'::text])));

CREATE INDEX idx_studio_bookings_user_id ON public.studio_bookings USING btree (user_id);

CREATE INDEX idx_studio_bookings_user_status_date ON public.studio_bookings USING btree (user_id, status, booking_date DESC);

CREATE INDEX idx_studio_bookings_user_studio_status ON public.studio_bookings USING btree (user_id, studio_id, status);

CREATE INDEX idx_studio_date_overrides_lookup ON public.studio_date_overrides USING btree (studio_id, override_date, slot_order);

CREATE INDEX idx_studio_date_overrides_studio_date_slot ON public.studio_date_overrides USING btree (studio_id, override_date, slot_order);

CREATE INDEX idx_studio_instruments_studio_id ON public.studio_instruments USING btree (studio_id);

CREATE INDEX idx_studio_media_studio_id ON public.studio_media USING btree (studio_id);

CREATE INDEX idx_studio_open_dates_studio_id ON public.studio_open_dates USING btree (studio_id);

CREATE INDEX idx_studio_operating_hours_lookup ON public.studio_operating_hours USING btree (studio_id, day_of_week, slot_order);

CREATE INDEX idx_studio_promotions_active_lookup ON public.studio_promotions USING btree (studio_id, start_date, end_date) WHERE (is_active = true);

CREATE INDEX idx_studio_promotions_studio_active ON public.studio_promotions USING btree (studio_id, is_active) WHERE (is_active = true);

CREATE INDEX idx_studio_types_studio_id ON public.studio_types USING btree (studio_id);

CREATE INDEX idx_studios_permit_pending ON public.studios USING btree (created_at DESC) WHERE (permit_status = ANY (ARRAY['pending'::text, 'resubmitted'::text]));

CREATE INDEX idx_studios_permit_queue ON public.studios USING btree (permit_status, created_at DESC);

CREATE INDEX idx_studios_permit_status ON public.studios USING btree (permit_status);

CREATE INDEX idx_studios_permit_status_created ON public.studios USING btree (permit_status, created_at DESC);

CREATE INDEX idx_subscription_payments_subscription_id ON public.subscription_payments USING btree (subscription_id);

CREATE INDEX idx_subscription_payments_user_id ON public.subscription_payments USING btree (user_id);

CREATE INDEX idx_subscriptions_period_end ON public.subscriptions USING btree (current_period_end);

CREATE INDEX idx_subscriptions_status ON public.subscriptions USING btree (status);

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions USING btree (user_id);

CREATE INDEX idx_teaser_assets_playlist ON public.playlist_teaser_assets USING btree (playlist_id);

CREATE INDEX idx_teaser_assets_uploader ON public.playlist_teaser_assets USING btree (uploader_id);

CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method);

CREATE INDEX idx_verification_sessions_email_status ON public.verification_sessions USING btree (((verification_data ->> 'email'::text)), status) WHERE (verification_data ? 'email'::text);

CREATE INDEX idx_verification_sessions_session_nonce_hash ON public.verification_sessions USING btree (((verification_data ->> 'session_nonce_hash'::text))) WHERE (verification_data ? 'session_nonce_hash'::text);

CREATE INDEX idx_verification_sessions_user_ref ON public.verification_sessions USING btree (((verification_data ->> 'user_ref'::text))) WHERE (verification_data ? 'user_ref'::text);

CREATE INDEX idx_wallet_deposits_session ON public.wallet_deposits USING btree (checkout_session_id);

CREATE INDEX idx_wallet_deposits_user_id ON public.wallet_deposits USING btree (user_id);

CREATE INDEX idx_wallet_transactions_booking_earnings ON public.wallet_transactions USING btree (wallet_id, created_at DESC) WHERE ((type = 'earning'::text) AND ((reference_type IS NULL) OR (reference_type = ANY (ARRAY['booking'::text, 'booking_payment'::text, 'booking_downpayment'::text, 'booking_balance'::text]))));

CREATE INDEX idx_wallet_transactions_wallet_created_desc ON public.wallet_transactions USING btree (wallet_id, created_at DESC);

CREATE INDEX idx_withdrawal_requests_status ON public.withdrawal_requests USING btree (status);

CREATE INDEX idx_withdrawal_requests_user ON public.withdrawal_requests USING btree (user_id);

CREATE INDEX idx_withdrawal_requests_wallet ON public.withdrawal_requests USING btree (wallet_id);

CREATE INDEX ix_realtime_subscription_entity ON realtime.subscription USING btree (entity);

CREATE INDEX messages_2026_05_16_inserted_at_topic_idx ON realtime.messages_2026_05_16 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));

CREATE INDEX messages_2026_05_17_inserted_at_topic_idx ON realtime.messages_2026_05_17 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));

CREATE INDEX messages_2026_05_18_inserted_at_topic_idx ON realtime.messages_2026_05_18 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));

CREATE INDEX messages_2026_05_19_inserted_at_topic_idx ON realtime.messages_2026_05_19 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));

CREATE INDEX messages_2026_05_20_inserted_at_topic_idx ON realtime.messages_2026_05_20 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));

CREATE INDEX messages_2026_05_21_inserted_at_topic_idx ON realtime.messages_2026_05_21 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));

CREATE INDEX messages_2026_05_22_inserted_at_topic_idx ON realtime.messages_2026_05_22 USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));

CREATE INDEX messages_inserted_at_topic_index ON ONLY realtime.messages USING btree (inserted_at DESC, topic) WHERE ((extension = 'broadcast'::text) AND (private IS TRUE));

CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC);

CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id);

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);

CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status);

CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at);

CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL);

CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL);

CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC);

CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to);

CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash);

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

CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id);

CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops);

CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at);

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text));

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);

CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous);

CREATE INDEX webauthn_challenges_expires_at_idx ON auth.webauthn_challenges USING btree (expires_at);

CREATE INDEX webauthn_challenges_user_id_idx ON auth.webauthn_challenges USING btree (user_id);

CREATE INDEX webauthn_credentials_user_id_idx ON auth.webauthn_credentials USING btree (user_id);

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);

CREATE UNIQUE INDEX booking_attendance_events_unique_report ON public.booking_attendance_events USING btree (booking_id, event_type, COALESCE(reporter_user_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);

CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text);

CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text);

CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text);

CREATE UNIQUE INDEX idx_booking_incidents_single_open_per_booking ON public.booking_incidents USING btree (booking_id) WHERE (status = ANY (ARRAY['open'::text, 'responded'::text, 'manual_review'::text]));

CREATE UNIQUE INDEX idx_booking_requests_unique_active_listing_request ON public.booking_requests USING btree (sender_id, receiver_id, COALESCE((group_id)::text, ''::text), COALESCE((studio_id)::text, ''::text), COALESCE((event_details ->> 'sender_entity_type'::text), ''::text), COALESCE((event_details ->> 'sender_entity_id'::text), ''::text), COALESCE((event_details ->> 'receiver_entity_type'::text), ''::text), COALESCE((event_details ->> 'receiver_entity_id'::text), ''::text), COALESCE((event_details ->> 'production_team_id'::text), ''::text), COALESCE((event_details ->> 'request_kind'::text), ''::text), COALESCE((event_details ->> 'application_scope'::text), ''::text)) WHERE ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'approved'::text, 'connected'::text])) AND (created_at >= '2026-05-04 12:00:00+00'::timestamp with time zone) AND (event_details @> '{"type": "listing_connection_request"}'::jsonb));

CREATE UNIQUE INDEX idx_follows_unique_target ON public.follows USING btree (follower_id, followed_type, followed_id);

CREATE UNIQUE INDEX idx_gig_applications_unique_active_direct_applicant ON public.gig_applications USING btree (gig_id, applicant_id) WHERE ((group_id IS NULL) AND (production_team_id IS NULL) AND (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'approved'::text])));

CREATE UNIQUE INDEX idx_gig_applications_unique_active_group_application ON public.gig_applications USING btree (gig_id, group_id) WHERE ((group_id IS NOT NULL) AND (production_team_id IS NULL) AND (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'approved'::text])));

CREATE UNIQUE INDEX idx_gig_applications_unique_active_production_team ON public.gig_applications USING btree (gig_id, production_team_id) WHERE ((production_team_id IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'approved'::text])));

CREATE UNIQUE INDEX idx_identity_document_claims_approved_fingerprint_role_unique ON public.identity_document_claims USING btree (document_fingerprint, role) WHERE (status = 'APPROVED'::text);

CREATE UNIQUE INDEX idx_identity_document_claims_user_fingerprint_role ON public.identity_document_claims USING btree (user_id, document_fingerprint, role);

CREATE UNIQUE INDEX idx_leadership_transfer_pending ON public.leadership_transfer_requests USING btree (group_id) WHERE (status = 'pending'::text);

CREATE UNIQUE INDEX idx_manual_identity_reviews_pending_manual_unique ON public.manual_identity_reviews USING btree (user_id) WHERE ((status = 'PENDING_REVIEW'::text) AND (source = 'MANUAL_UPLOAD'::text));

CREATE UNIQUE INDEX idx_manual_identity_reviews_pending_user_source_unique ON public.manual_identity_reviews USING btree (user_id, source) WHERE (status = 'PENDING_REVIEW'::text);

CREATE UNIQUE INDEX idx_owner_penalties_unique_booking_type ON public.studio_owner_penalties USING btree (booking_id, penalty_type);

CREATE UNIQUE INDEX idx_post_media_one_cover_per_post ON public.post_media USING btree (post_id) WHERE (is_cover = true);

CREATE UNIQUE INDEX idx_production_team_roster_unique_group ON public.production_team_roster USING btree (team_id, group_id) WHERE (group_id IS NOT NULL);

CREATE UNIQUE INDEX idx_production_team_roster_unique_profile ON public.production_team_roster USING btree (team_id, profile_id) WHERE (profile_id IS NOT NULL);

CREATE UNIQUE INDEX idx_profiles_email_lower_unique ON public.profiles USING btree (lower(email));

CREATE UNIQUE INDEX idx_reports_unique_pending_by_reporter_target_reason ON public.reports USING btree (COALESCE(reporter_id, '00000000-0000-0000-0000-000000000000'::uuid), target_type, target_id, lower(reason)) WHERE (lower(COALESCE(status, 'pending'::text)) = 'pending'::text);

CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text);

CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type);

CREATE UNIQUE INDEX push_notification_devices_installation_id_key ON public.push_notification_devices USING btree (installation_id);

CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text);

CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text);

CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain));

CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id));

CREATE UNIQUE INDEX subscription_subscription_id_entity_filters_action_filter_key ON realtime.subscription USING btree (subscription_id, entity, filters, action_filter);

CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone);

CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false);

CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id);

CREATE UNIQUE INDEX webauthn_credentials_credential_id_key ON auth.webauthn_credentials USING btree (credential_id);


-- view
CREATE OR REPLACE VIEW public.admin_permit_metrics AS
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

CREATE OR REPLACE VIEW public.booking_penalty_events_with_summary AS
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

CREATE OR REPLACE VIEW public.conversations_display_projection AS
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

CREATE OR REPLACE VIEW public.follow_counts AS
 SELECT id AS user_id,
    ( SELECT count(*) AS count
           FROM follows f
          WHERE f.followed_type = 'profile'::text AND f.followed_id = p.id) AS follower_count,
    ( SELECT count(*) AS count
           FROM follows f
          WHERE f.follower_id = p.id) AS following_count
   FROM profiles p;;

CREATE OR REPLACE VIEW public.gigs_availability_projection AS
 SELECT id AS gig_id,
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('day_of_week', gas.day_of_week, 'date', gas.slot_date, 'start', to_char(gas.start_time::interval, 'HH24:MI'::text), 'end', to_char(gas.end_time::interval, 'HH24:MI'::text), 'is_available', gas.is_available)) ORDER BY gas.day_of_week, gas.slot_date, gas.start_time) AS jsonb_agg
           FROM gig_availability_slots gas
          WHERE gas.gig_id = g.id), '[]'::jsonb) AS availability
   FROM gigs g;;

CREATE OR REPLACE VIEW public.gigs_legacy_projection AS
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

CREATE OR REPLACE VIEW public.gigs_slots_filled_projection AS
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

CREATE OR REPLACE VIEW public.gigs_with_stats AS
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

CREATE OR REPLACE VIEW public.gigs_with_verification AS
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

CREATE OR REPLACE VIEW public.groups_availability_projection AS
 SELECT id AS group_id,
    COALESCE(( SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('day_of_week', gas.day_of_week, 'date', gas.slot_date, 'start', to_char(gas.start_time::interval, 'HH24:MI'::text), 'end', to_char(gas.end_time::interval, 'HH24:MI'::text), 'is_available', gas.is_available)) ORDER BY gas.day_of_week, gas.slot_date, gas.start_time) AS jsonb_agg
           FROM group_availability_slots gas
          WHERE gas.group_id = g.id), '[]'::jsonb) AS availability
   FROM groups g;;

CREATE OR REPLACE VIEW public.groups_legacy_projection AS
 SELECT id,
    COALESCE(( SELECT jsonb_agg(COALESCE(rm.raw_member, jsonb_strip_nulls(jsonb_build_object('name', rm.member_name, 'role', rm.member_role, 'user_id', rm.user_id, 'avatar_url', rm.avatar_url, 'instrument', rm.instrument) || COALESCE(rm.metadata, '{}'::jsonb))) ORDER BY rm.sort_order, rm.created_at) AS jsonb_agg
           FROM group_roster_members rm
          WHERE rm.group_id = g.id), '[]'::jsonb) AS members,
    COALESCE(( SELECT array_agg(gm.media_url ORDER BY gm.sort_order, gm.created_at) AS array_agg
           FROM group_media gm
          WHERE gm.group_id = g.id AND gm.media_type = 'image'::text), ARRAY[]::text[]) AS images
   FROM groups g;;

CREATE OR REPLACE VIEW public.groups_with_stats AS
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

CREATE OR REPLACE VIEW public.musician_performed_gigs AS
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

CREATE OR REPLACE VIEW public.orders_with_summary AS
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

CREATE OR REPLACE VIEW public.products_with_summary AS
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

CREATE OR REPLACE VIEW public.profiles_legacy_projection AS
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

CREATE OR REPLACE VIEW public.profiles_with_stats AS
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

CREATE OR REPLACE VIEW public.reviews_with_stats AS
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

CREATE OR REPLACE VIEW public.studio_bookings_legacy_projection AS
 SELECT id,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('start', to_char(sbs.start_time::interval, 'HH24:MI'::text), 'end', to_char(sbs.end_time::interval, 'HH24:MI'::text)) ORDER BY sbs.sort_order, sbs.created_at) AS jsonb_agg
           FROM studio_booking_slots sbs
          WHERE sbs.booking_id = sb.id), '[]'::jsonb) AS time_slots
   FROM studio_bookings sb;;

CREATE OR REPLACE VIEW public.studio_bookings_with_cost AS
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

CREATE OR REPLACE VIEW public.studios_availability_projection AS
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

CREATE OR REPLACE VIEW public.studios_legacy_projection AS
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

CREATE OR REPLACE VIEW public.studios_with_stats AS
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

CREATE OR REPLACE VIEW public.studios_with_verification AS
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


-- trigger
CREATE TRIGGER audit_capture_address_verification_sessions AFTER INSERT OR DELETE OR UPDATE ON address_verification_sessions FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_booking_attendance_events AFTER INSERT OR DELETE OR UPDATE ON booking_attendance_events FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_booking_cancellation_policies AFTER INSERT OR DELETE OR UPDATE ON booking_cancellation_policies FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_booking_holds AFTER INSERT OR DELETE OR UPDATE ON booking_holds FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_booking_incidents AFTER INSERT OR DELETE OR UPDATE ON booking_incidents FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_booking_penalty_events AFTER INSERT OR DELETE OR UPDATE ON booking_penalty_events FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_booking_requests AFTER INSERT OR DELETE OR UPDATE ON booking_requests FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_conversation_participants AFTER INSERT OR DELETE OR UPDATE ON conversation_participants FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_conversations AFTER INSERT OR DELETE OR UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_didit_webhook_events AFTER INSERT OR DELETE OR UPDATE ON didit_webhook_events FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_email_notifications AFTER INSERT OR DELETE OR UPDATE ON email_notifications FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_external_platform_links AFTER INSERT OR DELETE OR UPDATE ON external_platform_links FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_favorites AFTER INSERT OR DELETE OR UPDATE ON favorites FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_feed_posts AFTER INSERT OR DELETE OR UPDATE ON feed_posts FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_follows AFTER INSERT OR DELETE OR UPDATE ON follows FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_gig_applications AFTER INSERT OR DELETE OR UPDATE ON gig_applications FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_gig_availability_slots AFTER INSERT OR DELETE OR UPDATE ON gig_availability_slots FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_gig_media AFTER INSERT OR DELETE OR UPDATE ON gig_media FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_gig_requirements AFTER INSERT OR DELETE OR UPDATE ON gig_requirements FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_gig_slot_fill_applicants AFTER INSERT OR DELETE OR UPDATE ON gig_slot_fill_applicants FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_gig_slot_fill_summary AFTER INSERT OR DELETE OR UPDATE ON gig_slot_fill_summary FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_gigs AFTER INSERT OR DELETE OR UPDATE ON gigs FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_group_availability_slots AFTER INSERT OR DELETE OR UPDATE ON group_availability_slots FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_group_media AFTER INSERT OR DELETE OR UPDATE ON group_media FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_group_members AFTER INSERT OR DELETE OR UPDATE ON group_members FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_group_playlists AFTER INSERT OR DELETE OR UPDATE ON group_playlists FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_group_roster_members AFTER INSERT OR DELETE OR UPDATE ON group_roster_members FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_groups AFTER INSERT OR DELETE OR UPDATE ON groups FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_identity_document_claims AFTER INSERT OR DELETE OR UPDATE ON identity_document_claims FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_leadership_transfer_requests AFTER INSERT OR DELETE OR UPDATE ON leadership_transfer_requests FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_manual_identity_reviews AFTER INSERT OR DELETE OR UPDATE ON manual_identity_reviews FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_message_reactions AFTER INSERT OR DELETE OR UPDATE ON message_reactions FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_messages AFTER INSERT OR DELETE OR UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_normalization_exceptions AFTER INSERT OR DELETE OR UPDATE ON normalization_exceptions FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_notification_preferences AFTER INSERT OR DELETE OR UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_notifications AFTER INSERT OR DELETE OR UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_order_fulfillments AFTER INSERT OR DELETE OR UPDATE ON order_fulfillments FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_order_items AFTER INSERT OR DELETE OR UPDATE ON order_items FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_orders AFTER INSERT OR DELETE OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_payout_methods AFTER INSERT OR DELETE OR UPDATE ON payout_methods FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_playlist_items AFTER INSERT OR DELETE OR UPDATE ON playlist_items FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_playlist_play_events AFTER INSERT OR DELETE OR UPDATE ON playlist_play_events FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_playlist_teaser_assets AFTER INSERT OR DELETE OR UPDATE ON playlist_teaser_assets FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_playlists AFTER INSERT OR DELETE OR UPDATE ON playlists FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_post_comments AFTER INSERT OR DELETE OR UPDATE ON post_comments FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_post_media AFTER INSERT OR DELETE OR UPDATE ON post_media FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_post_reactions AFTER INSERT OR DELETE OR UPDATE ON post_reactions FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_product_media AFTER INSERT OR DELETE OR UPDATE ON product_media FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_product_variants AFTER INSERT OR DELETE OR UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_production_team_members AFTER INSERT OR DELETE OR UPDATE ON production_team_members FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_production_team_roster AFTER INSERT OR DELETE OR UPDATE ON production_team_roster FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_production_teams AFTER INSERT OR DELETE OR UPDATE ON production_teams FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_products AFTER INSERT OR DELETE OR UPDATE ON products FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_profile_genres AFTER INSERT OR DELETE OR UPDATE ON profile_genres FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_profile_portfolio_urls AFTER INSERT OR DELETE OR UPDATE ON profile_portfolio_urls FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_profile_skills AFTER INSERT OR DELETE OR UPDATE ON profile_skills FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_profiles AFTER INSERT OR DELETE OR UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_push_notification_devices AFTER INSERT OR DELETE OR UPDATE ON push_notification_devices FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_registration_attempts AFTER INSERT OR DELETE OR UPDATE ON registration_attempts FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_reports AFTER INSERT OR DELETE OR UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_review_likes AFTER INSERT OR DELETE OR UPDATE ON review_likes FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_reviews AFTER INSERT OR DELETE OR UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_shipping_profiles AFTER INSERT OR DELETE OR UPDATE ON shipping_profiles FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_social_activity_events AFTER INSERT OR DELETE OR UPDATE ON social_activity_events FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_station_playlist_slots AFTER INSERT OR DELETE OR UPDATE ON station_playlist_slots FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_stations AFTER INSERT OR DELETE OR UPDATE ON stations FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_studio_amenities AFTER INSERT OR DELETE OR UPDATE ON studio_amenities FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_studio_availability_slots AFTER INSERT OR DELETE OR UPDATE ON studio_availability_slots FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_studio_booking_slots AFTER INSERT OR DELETE OR UPDATE ON studio_booking_slots FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_studio_bookings AFTER INSERT OR DELETE OR UPDATE ON studio_bookings FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_studio_date_overrides AFTER INSERT OR DELETE OR UPDATE ON studio_date_overrides FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_studio_instruments AFTER INSERT OR DELETE OR UPDATE ON studio_instruments FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_studio_media AFTER INSERT OR DELETE OR UPDATE ON studio_media FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_studio_open_dates AFTER INSERT OR DELETE OR UPDATE ON studio_open_dates FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_studio_operating_hours AFTER INSERT OR DELETE OR UPDATE ON studio_operating_hours FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_studio_owner_penalties AFTER INSERT OR DELETE OR UPDATE ON studio_owner_penalties FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_studio_promotions AFTER INSERT OR DELETE OR UPDATE ON studio_promotions FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_studio_settings AFTER INSERT OR DELETE OR UPDATE ON studio_settings FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_studio_types AFTER INSERT OR DELETE OR UPDATE ON studio_types FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_studios AFTER INSERT OR DELETE OR UPDATE ON studios FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_subscription_payments AFTER INSERT OR DELETE OR UPDATE ON subscription_payments FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_subscription_plans AFTER INSERT OR DELETE OR UPDATE ON subscription_plans FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_subscriptions AFTER INSERT OR DELETE OR UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_verification_sessions AFTER INSERT OR DELETE OR UPDATE ON verification_sessions FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_wallet_deposits AFTER INSERT OR DELETE OR UPDATE ON wallet_deposits FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_wallet_transactions AFTER INSERT OR DELETE OR UPDATE ON wallet_transactions FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_wallets AFTER INSERT OR DELETE OR UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER audit_capture_withdrawal_requests AFTER INSERT OR DELETE OR UPDATE ON withdrawal_requests FOR EACH ROW EXECUTE FUNCTION audit_capture_row_change();

CREATE TRIGGER auto_add_group_owner_trigger AFTER INSERT ON groups FOR EACH ROW EXECUTE FUNCTION auto_add_group_owner_to_members();

CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();

CREATE TRIGGER on_withdrawal_status_change AFTER UPDATE OF status ON withdrawal_requests FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION process_withdrawal_balance();

CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

CREATE TRIGGER sync_group_conversation_on_member_change AFTER INSERT OR DELETE OR UPDATE ON group_members FOR EACH ROW EXECUTE FUNCTION sync_group_conversation_members();

CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();

CREATE TRIGGER trg_booking_cancellation_policies_updated_at BEFORE UPDATE ON booking_cancellation_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_booking_incidents_updated_at BEFORE UPDATE ON booking_incidents FOR EACH ROW EXECUTE FUNCTION set_updated_at_booking_incidents();

CREATE TRIGGER trg_dispatch_push_notification_on_insert AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION dispatch_push_notification_on_insert();

CREATE TRIGGER trg_enforce_single_permit_resubmission_on_gigs BEFORE INSERT OR UPDATE OF permit_status, permit_resubmissions_used ON gigs FOR EACH ROW EXECUTE FUNCTION enforce_single_permit_resubmission();

CREATE TRIGGER trg_enforce_single_permit_resubmission_on_studios BEFORE INSERT OR UPDATE OF permit_status, permit_resubmissions_used ON studios FOR EACH ROW EXECUTE FUNCTION enforce_single_permit_resubmission();

CREATE TRIGGER trg_feed_posts_updated_at BEFORE UPDATE ON feed_posts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_fulfillments_updated_at BEFORE UPDATE ON order_fulfillments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_gig_application_performer_snapshot BEFORE INSERT OR UPDATE OF production_roster_id, performer_snapshot ON gig_applications FOR EACH ROW EXECUTE FUNCTION set_gig_application_performer_snapshot();

CREATE TRIGGER trg_gig_applications_updated_at BEFORE UPDATE ON gig_applications FOR EACH ROW EXECUTE FUNCTION set_gig_applications_updated_at();

CREATE TRIGGER trg_guard_profile_sensitive_client_writes BEFORE INSERT OR UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_sensitive_client_writes();

CREATE TRIGGER trg_identity_document_claims_name_birthdate_normalized BEFORE INSERT OR UPDATE OF verified_full_legal_name, normalized_full_legal_name, birth_date ON identity_document_claims FOR EACH ROW EXECUTE FUNCTION set_identity_name_birthdate_normalized();

CREATE TRIGGER trg_manual_identity_reviews_name_birthdate_normalized BEFORE INSERT OR UPDATE OF verified_full_legal_name, normalized_full_legal_name, birth_date ON manual_identity_reviews FOR EACH ROW EXECUTE FUNCTION set_identity_name_birthdate_normalized();

CREATE TRIGGER trg_manual_identity_reviews_updated_at BEFORE UPDATE ON manual_identity_reviews FOR EACH ROW EXECUTE FUNCTION set_manual_identity_reviews_updated_at();

CREATE TRIGGER trg_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION set_notification_preferences_updated_at();

CREATE TRIGGER trg_notify_booking_attendance_event AFTER INSERT ON booking_attendance_events FOR EACH ROW EXECUTE FUNCTION notify_booking_attendance_event();

CREATE TRIGGER trg_notify_followers_on_feed_post_created AFTER INSERT ON feed_posts FOR EACH ROW EXECUTE FUNCTION notify_followers_on_feed_post_created();

CREATE TRIGGER trg_notify_followers_on_gig_published AFTER INSERT OR UPDATE OF permit_status, status ON gigs FOR EACH ROW EXECUTE FUNCTION notify_followers_on_gig_published();

CREATE TRIGGER trg_notify_followers_on_group_created AFTER INSERT ON groups FOR EACH ROW EXECUTE FUNCTION notify_followers_on_group_created();

CREATE TRIGGER trg_notify_followers_on_production_team_created AFTER INSERT ON production_teams FOR EACH ROW EXECUTE FUNCTION notify_followers_on_production_team_created();

CREATE TRIGGER trg_notify_followers_on_studio_published AFTER INSERT OR UPDATE OF permit_status ON studios FOR EACH ROW EXECUTE FUNCTION notify_followers_on_studio_published();

CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_playlist_items_count AFTER INSERT OR DELETE ON playlist_items FOR EACH ROW EXECUTE FUNCTION update_playlist_track_count();

CREATE TRIGGER trg_playlists_updated_at BEFORE UPDATE ON playlists FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_post_comments_count AFTER INSERT OR DELETE OR UPDATE OF post_id, is_hidden, moderation_status ON post_comments FOR EACH ROW EXECUTE FUNCTION update_post_comment_count();

CREATE TRIGGER trg_post_comments_updated_at BEFORE UPDATE ON post_comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_post_reactions_count AFTER INSERT OR DELETE ON post_reactions FOR EACH ROW EXECUTE FUNCTION update_post_reaction_count();

CREATE TRIGGER trg_prevent_repeated_gig_application_cancellations BEFORE INSERT ON gig_applications FOR EACH ROW EXECUTE FUNCTION prevent_repeated_gig_application_cancellations();

CREATE TRIGGER trg_prevent_withdrawal_snapshot_mutation BEFORE UPDATE ON withdrawal_requests FOR EACH ROW EXECUTE FUNCTION prevent_withdrawal_snapshot_mutation();

CREATE TRIGGER trg_production_teams_updated_at BEFORE UPDATE ON production_teams FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_reports_cleanup_on_feed_post_delete AFTER DELETE ON feed_posts FOR EACH ROW EXECUTE FUNCTION dismiss_reports_for_deleted_target();

CREATE TRIGGER trg_reports_cleanup_on_gig_delete AFTER DELETE ON gigs FOR EACH ROW EXECUTE FUNCTION dismiss_reports_for_deleted_target();

CREATE TRIGGER trg_reports_cleanup_on_group_delete AFTER DELETE ON groups FOR EACH ROW EXECUTE FUNCTION dismiss_reports_for_deleted_target();

CREATE TRIGGER trg_reports_cleanup_on_playlist_delete AFTER DELETE ON playlists FOR EACH ROW EXECUTE FUNCTION dismiss_reports_for_deleted_target();

CREATE TRIGGER trg_reports_cleanup_on_product_delete AFTER DELETE ON products FOR EACH ROW EXECUTE FUNCTION dismiss_reports_for_deleted_target();

CREATE TRIGGER trg_reports_cleanup_on_profile_delete AFTER DELETE ON profiles FOR EACH ROW EXECUTE FUNCTION dismiss_reports_for_deleted_target();

CREATE TRIGGER trg_reports_cleanup_on_studio_delete AFTER DELETE ON studios FOR EACH ROW EXECUTE FUNCTION dismiss_reports_for_deleted_target();

CREATE TRIGGER trg_stations_updated_at BEFORE UPDATE ON stations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_studio_promotions_updated_at BEFORE UPDATE ON studio_promotions FOR EACH ROW EXECUTE FUNCTION set_updated_at_studio_promotions();

CREATE TRIGGER trg_sync_didit_profile_after_email_confirmation AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW EXECUTE FUNCTION sync_didit_profile_after_email_confirmation();

CREATE TRIGGER trg_validate_report_target_before_write BEFORE INSERT OR UPDATE OF target_type, target_id, reason ON reports FOR EACH ROW EXECUTE FUNCTION validate_report_target_before_write();

CREATE TRIGGER trigger_insert_slot_counts AFTER INSERT ON gig_applications FOR EACH ROW WHEN (new.status = 'accepted'::text) EXECUTE FUNCTION update_gig_slot_counts();

CREATE TRIGGER trigger_update_conversation_timestamp AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION update_conversation_timestamp();

CREATE TRIGGER trigger_update_rejected_at BEFORE UPDATE ON gig_applications FOR EACH ROW EXECUTE FUNCTION update_application_rejected_at();

CREATE TRIGGER trigger_update_slot_counts AFTER UPDATE ON gig_applications FOR EACH ROW EXECUTE FUNCTION update_gig_slot_counts();

CREATE TRIGGER trigger_validate_production_gig_application BEFORE INSERT OR UPDATE OF production_team_id, production_roster_id, group_id ON gig_applications FOR EACH ROW EXECUTE FUNCTION validate_production_gig_application();

CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


-- rls
ALTER TABLE auth.audit_log_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE auth.flow_state ENABLE ROW LEVEL SECURITY;

ALTER TABLE auth.identities ENABLE ROW LEVEL SECURITY;

ALTER TABLE auth.instances ENABLE ROW LEVEL SECURITY;

ALTER TABLE auth.mfa_amr_claims ENABLE ROW LEVEL SECURITY;

ALTER TABLE auth.mfa_challenges ENABLE ROW LEVEL SECURITY;

ALTER TABLE auth.mfa_factors ENABLE ROW LEVEL SECURITY;

ALTER TABLE auth.one_time_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE auth.refresh_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE auth.saml_providers ENABLE ROW LEVEL SECURITY;

ALTER TABLE auth.saml_relay_states ENABLE ROW LEVEL SECURITY;

ALTER TABLE auth.schema_migrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE auth.sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE auth.sso_domains ENABLE ROW LEVEL SECURITY;

ALTER TABLE auth.sso_providers ENABLE ROW LEVEL SECURITY;

ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.address_verification_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_event_changes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.booking_attendance_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.booking_cancellation_policies ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.booking_holds ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.booking_incidents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.booking_penalty_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.didit_webhook_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.external_platform_links ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gig_applications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gig_availability_slots ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gig_deletion_audit ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gig_media ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gig_requirements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gig_slot_fill_applicants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gig_slot_fill_summary ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gigs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_availability_slots ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_deletion_audit ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_media ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_playlists ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.group_roster_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.identity_document_claims ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leadership_transfer_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.manual_identity_reviews ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.normalization_exceptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_fulfillments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payout_methods ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.permit_audit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.playlist_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.playlist_play_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.playlist_teaser_assets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_media ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.production_team_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.production_team_roster ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.production_teams ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profile_genres ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profile_portfolio_urls ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profile_skills ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.push_notification_devices ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.registration_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.review_likes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.shipping_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.social_activity_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.station_playlist_slots ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.studio_amenities ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.studio_availability_slots ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.studio_booking_slots ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.studio_bookings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.studio_date_overrides ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.studio_deletion_audit ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.studio_instruments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.studio_media ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.studio_open_dates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.studio_operating_hours ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.studio_owner_penalties ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.studio_promotions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.studio_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.studio_types ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.studios ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.verification_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.wallet_deposits ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

ALTER TABLE storage.buckets_analytics ENABLE ROW LEVEL SECURITY;

ALTER TABLE storage.buckets_vectors ENABLE ROW LEVEL SECURITY;

ALTER TABLE storage.migrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

ALTER TABLE storage.s3_multipart_uploads ENABLE ROW LEVEL SECURITY;

ALTER TABLE storage.s3_multipart_uploads_parts ENABLE ROW LEVEL SECURITY;

ALTER TABLE storage.vector_indexes ENABLE ROW LEVEL SECURITY;


-- policy
CREATE POLICY "Accepted profile timeline applications are publicly visible" ON public.gig_applications AS PERMISSIVE FOR SELECT TO PUBLIC USING (((status = 'accepted'::text) AND (show_on_profile = true)));

CREATE POLICY "Admin can update booking incidents" ON public.booking_incidents AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Admin can view all booking incidents" ON public.booking_incidents AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Admins can insert permit audit logs" ON public.permit_audit_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can read all gigs" ON public.gigs AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Admins can read all permit audit logs" ON public.permit_audit_log AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Admins can read all studios" ON public.studios AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Admins can read audit event changes" ON public.audit_event_changes AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Admins can read audit events" ON public.audit_events AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update gig permit status" ON public.gigs AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Admins can update studio permit status" ON public.studios AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));

CREATE POLICY "Anyone can view active cancellation policies" ON public.booking_cancellation_policies AS PERMISSIVE FOR SELECT TO authenticated USING ((is_active = true));

CREATE POLICY "Anyone can view active subscription plans" ON public.subscription_plans AS PERMISSIVE FOR SELECT TO PUBLIC USING ((is_active = true));

CREATE POLICY "Anyone can view chat attachments" ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = 'chat-attachments'::text));

CREATE POLICY "Anyone can view group memberships" ON public.group_members AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Applicants can update own applications" ON public.gig_applications AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = applicant_id));

CREATE POLICY "Applicants can view own applications" ON public.gig_applications AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = applicant_id));

CREATE POLICY "Authenticated users can browse team members" ON public.production_team_members AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM production_teams pt
  WHERE (pt.id = production_team_members.team_id))));

CREATE POLICY "Authenticated users can browse teams" ON public.production_teams AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can upload chat attachments" ON storage.objects AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((bucket_id = 'chat-attachments'::text) AND (auth.role() = 'authenticated'::text)));

CREATE POLICY "Authors can delete their reviews" ON public.reviews AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = author_id));

CREATE POLICY "Authors can update their reviews" ON public.reviews AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = author_id));

CREATE POLICY "Avatars are publicly viewable" ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = 'avatars'::text));

CREATE POLICY "Booking participants can view penalties" ON public.booking_penalty_events AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM studio_bookings sb
  WHERE ((sb.id = booking_penalty_events.booking_id) AND ((sb.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM studios s
          WHERE ((s.id = sb.studio_id) AND (s.owner_id = auth.uid())))))))));

CREATE POLICY "Conversation admins can remove participants" ON public.conversation_participants AS PERMISSIVE FOR DELETE TO PUBLIC USING (((user_id = auth.uid()) OR is_conversation_admin(conversation_id)));

CREATE POLICY "Documents are publicly viewable" ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = 'documents'::text));

CREATE POLICY "Gig organizers can update applications" ON public.gig_applications AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM gigs
  WHERE ((gigs.id = gig_applications.gig_id) AND (gigs.organizer_id = auth.uid())))));

CREATE POLICY "Gig organizers can view applications" ON public.gig_applications AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM gigs
  WHERE ((gigs.id = gig_applications.gig_id) AND (gigs.organizer_id = auth.uid())))));

CREATE POLICY "Gigs are viewable by everyone" ON public.gigs AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Group owners can create transfer requests" ON public.leadership_transfer_requests AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((auth.uid() = from_user_id) AND (EXISTS ( SELECT 1
   FROM groups
  WHERE ((groups.id = leadership_transfer_requests.group_id) AND (groups.owner_id = auth.uid()))))));

CREATE POLICY "Groups are viewable by everyone" ON public.groups AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Listings are publicly viewable" ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = 'listings'::text));

CREATE POLICY "Members can view their own team memberships" ON public.production_team_members AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Organizers can delete their gigs" ON public.gigs AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = organizer_id));

CREATE POLICY "Organizers can update their gigs" ON public.gigs AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = organizer_id));

CREATE POLICY "Owners can create transfer requests" ON public.leadership_transfer_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((from_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM groups
  WHERE ((groups.id = leadership_transfer_requests.group_id) AND (groups.owner_id = auth.uid()))))));

CREATE POLICY "Owners can delete their groups" ON public.groups AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = owner_id));

CREATE POLICY "Owners can delete their studios" ON public.studios AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = owner_id));

CREATE POLICY "Owners can read their permit audit logs" ON public.permit_audit_log AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((entity_type = 'studio'::text) AND (entity_id IN ( SELECT studios.id
   FROM studios
  WHERE (studios.owner_id = auth.uid())))) OR ((entity_type = 'gig'::text) AND (entity_id IN ( SELECT gigs.id
   FROM gigs
  WHERE (gigs.organizer_id = auth.uid()))))));

CREATE POLICY "Owners can update member roles" ON public.group_members AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM groups
  WHERE ((groups.id = group_members.group_id) AND (groups.owner_id = auth.uid())))));

CREATE POLICY "Owners can update their groups" ON public.groups AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = owner_id));

CREATE POLICY "Owners can update their studios" ON public.studios AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = owner_id));

CREATE POLICY "Participants can insert attendance events" ON public.booking_attendance_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((reporter_user_id = auth.uid()) AND (event_type = ANY (ARRAY['checked_in'::text, 'late'::text, 'not_attending'::text, 'no_show'::text])) AND (EXISTS ( SELECT 1
   FROM (studio_bookings sb
     JOIN studios s ON ((s.id = sb.studio_id)))
  WHERE ((sb.id = booking_attendance_events.booking_id) AND ((sb.user_id = auth.uid()) OR (s.owner_id = auth.uid())))))));

CREATE POLICY "Participants can insert booking incidents" ON public.booking_incidents AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = reporter_user_id));

CREATE POLICY "Participants can update booking incidents" ON public.booking_incidents AS PERMISSIVE FOR UPDATE TO authenticated USING (((auth.uid() = reporter_user_id) OR (auth.uid() = counterparty_user_id))) WITH CHECK (((auth.uid() = reporter_user_id) OR (auth.uid() = counterparty_user_id)));

CREATE POLICY "Participants can view attendance events" ON public.booking_attendance_events AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (studio_bookings sb
     JOIN studios s ON ((s.id = sb.studio_id)))
  WHERE ((sb.id = booking_attendance_events.booking_id) AND ((sb.user_id = auth.uid()) OR (s.owner_id = auth.uid()))))));

CREATE POLICY "Participants can view booking incidents" ON public.booking_incidents AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.uid() = reporter_user_id) OR (auth.uid() = counterparty_user_id)));

CREATE POLICY "Penalized users can view their penalties" ON public.booking_penalty_events AS PERMISSIVE FOR SELECT TO authenticated USING (((penalized_user_id = auth.uid()) OR (beneficiary_user_id = auth.uid())));

CREATE POLICY "Performance videos are publicly viewable" ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[2] = 'performance-videos'::text)));

CREATE POLICY "Portfolio is publicly viewable" ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = 'portfolio'::text));

CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Receivers can update status" ON public.booking_requests AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((auth.uid() = receiver_id) OR (auth.uid() IN ( SELECT groups.owner_id
   FROM groups
  WHERE (groups.id = booking_requests.group_id)))));

CREATE POLICY "Recipient can respond to transfer" ON public.leadership_transfer_requests AS PERMISSIVE FOR UPDATE TO authenticated USING ((((to_user_id = auth.uid()) AND (status = 'pending'::text)) OR ((from_user_id = auth.uid()) AND (status = 'pending'::text))));

CREATE POLICY "Review likes are public" ON public.review_likes AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Reviews are viewable by everyone" ON public.reviews AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Selected performers and group members can view applications" ON public.gig_applications AS PERMISSIVE FOR SELECT TO authenticated USING (( SELECT can_view_gig_application_readonly_participant(gig_applications.id) AS can_view_gig_application_readonly_participant));

CREATE POLICY "Service role can manage address verification sessions" ON public.address_verification_sessions AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text));

CREATE POLICY "Service role can manage deposits" ON public.wallet_deposits AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage subscription payments" ON public.subscription_payments AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text));

CREATE POLICY "Service role can manage subscriptions" ON public.subscriptions AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text));

CREATE POLICY "Studio owners can manage cancellation policies" ON public.booking_cancellation_policies AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = booking_cancellation_policies.studio_id) AND (s.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = booking_cancellation_policies.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY "Studio owners can update bookings for their studios" ON public.studio_bookings AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios
  WHERE ((studios.id = studio_bookings.studio_id) AND (studios.owner_id = auth.uid())))));

CREATE POLICY "Studio owners can view bookings for their studios" ON public.studio_bookings AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios
  WHERE ((studios.id = studio_bookings.studio_id) AND (studios.owner_id = auth.uid())))));

CREATE POLICY "Studios are viewable by everyone" ON public.studios AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Team managers can manage production roster" ON public.production_team_roster AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM production_team_members ptm
  WHERE ((ptm.team_id = production_team_roster.team_id) AND (ptm.user_id = auth.uid()) AND (ptm.role = ANY (ARRAY['owner'::text, 'manager'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM production_team_members ptm
  WHERE ((ptm.team_id = production_team_roster.team_id) AND (ptm.user_id = auth.uid()) AND (ptm.role = ANY (ARRAY['owner'::text, 'manager'::text]))))));

CREATE POLICY "Team members can view production roster" ON public.production_team_roster AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM production_team_members ptm
  WHERE ((ptm.team_id = production_team_roster.team_id) AND (ptm.user_id = auth.uid())))));

CREATE POLICY "Team owner insert bootstrap" ON public.production_team_members AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM production_teams pt
  WHERE ((pt.id = production_team_members.team_id) AND (pt.owner_id = auth.uid())))));

CREATE POLICY "Team owners and managers can delete members" ON public.production_team_members AS PERMISSIVE FOR DELETE TO authenticated USING (( SELECT can_manage_production_team_members(production_team_members.team_id) AS can_manage_production_team_members));

CREATE POLICY "Team owners and managers can insert members" ON public.production_team_members AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (( SELECT can_manage_production_team_members(production_team_members.team_id) AS can_manage_production_team_members));

CREATE POLICY "Team owners and managers can update members" ON public.production_team_members AS PERMISSIVE FOR UPDATE TO authenticated USING (( SELECT can_manage_production_team_members(production_team_members.team_id) AS can_manage_production_team_members)) WITH CHECK (( SELECT can_manage_production_team_members(production_team_members.team_id) AS can_manage_production_team_members));

CREATE POLICY "Team owners can manage their teams" ON public.production_teams AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() = owner_id)) WITH CHECK ((auth.uid() = owner_id));

CREATE POLICY "Users can add reactions" ON public.message_reactions AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM (messages m
     JOIN conversation_participants cp ON ((cp.conversation_id = m.conversation_id)))
  WHERE ((m.id = message_reactions.message_id) AND (cp.user_id = auth.uid()))))));

CREATE POLICY "Users can cancel their pending withdrawal requests" ON public.withdrawal_requests AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((auth.uid() = user_id) AND (status = 'pending'::text)));

CREATE POLICY "Users can create applications" ON public.gig_applications AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = applicant_id));

CREATE POLICY "Users can create bookings" ON public.studio_bookings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can create conversations" ON public.conversations AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() IS NOT NULL));

CREATE POLICY "Users can create gigs" ON public.gigs AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = organizer_id));

CREATE POLICY "Users can create groups" ON public.groups AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = owner_id));

CREATE POLICY "Users can create reviews" ON public.reviews AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = author_id));

CREATE POLICY "Users can create studios" ON public.studios AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = owner_id));

CREATE POLICY "Users can create withdrawal requests" ON public.withdrawal_requests AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete own favorites" ON public.favorites AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY "Users can delete own reactions" ON public.message_reactions AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can delete their own chat attachments" ON storage.objects AS PERMISSIVE FOR DELETE TO PUBLIC USING (((bucket_id = 'chat-attachments'::text) AND ((auth.uid())::text = (storage.foldername(name))[2])));

CREATE POLICY "Users can delete their own payout methods" ON public.payout_methods AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can insert into conversation participants" ON public.conversation_participants AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((user_id = auth.uid()) OR is_conversation_admin(conversation_id)));

CREATE POLICY "Users can insert own favorites" ON public.favorites AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can insert own notifications" ON public.notifications AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can insert reports" ON public.reports AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = reporter_id));

CREATE POLICY "Users can insert requests" ON public.booking_requests AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = sender_id));

CREATE POLICY "Users can insert their own payout methods" ON public.payout_methods AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can insert their own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = id));

CREATE POLICY "Users can join groups or owners can add members" ON public.group_members AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM groups
  WHERE ((groups.id = group_members.group_id) AND (groups.owner_id = auth.uid()))))));

CREATE POLICY "Users can leave or owners can remove members" ON public.group_members AS PERMISSIVE FOR DELETE TO authenticated USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM groups
  WHERE ((groups.id = group_members.group_id) AND (groups.owner_id = auth.uid()))))));

CREATE POLICY "Users can remove review likes" ON public.review_likes AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY "Users can send messages in their conversations" ON public.messages AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM conversation_participants cp
  WHERE ((cp.conversation_id = messages.conversation_id) AND (cp.user_id = auth.uid()))))));

CREATE POLICY "Users can send messages to their conversations" ON public.messages AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM conversation_participants cp
  WHERE ((cp.conversation_id = messages.conversation_id) AND (cp.user_id = auth.uid()))))));

CREATE POLICY "Users can toggle review likes" ON public.review_likes AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update messages" ON public.messages AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM conversation_participants cp
  WHERE ((cp.conversation_id = messages.conversation_id) AND (cp.user_id = auth.uid())))));

CREATE POLICY "Users can update own bookings" ON public.studio_bookings AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY "Users can update own notifications" ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY "Users can update own participation" ON public.conversation_participants AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = id));

CREATE POLICY "Users can update own reactions" ON public.message_reactions AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can update own subscription" ON public.subscriptions AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can update requests they are part of" ON public.leadership_transfer_requests AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((auth.uid() = from_user_id) OR (auth.uid() = to_user_id)));

CREATE POLICY "Users can update their conversations" ON public.conversations AS PERMISSIVE FOR UPDATE TO PUBLIC USING (is_conversation_member(id));

CREATE POLICY "Users can update their own messages" ON public.messages AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((sender_id = auth.uid()));

CREATE POLICY "Users can update their own payout methods" ON public.payout_methods AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can upload avatars" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

CREATE POLICY "Users can upload documents" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'documents'::text));

CREATE POLICY "Users can upload listings" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'listings'::text));

CREATE POLICY "Users can upload performance videos" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[2] = 'performance-videos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

CREATE POLICY "Users can upload portfolio" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'portfolio'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

CREATE POLICY "Users can view conversation participants" ON public.conversation_participants AS PERMISSIVE FOR SELECT TO PUBLIC USING (((user_id = auth.uid()) OR is_conversation_member(conversation_id)));

CREATE POLICY "Users can view documents in their folder" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'documents'::text) AND (((auth.uid())::text = (storage.foldername(name))[2]) OR ((storage.foldername(name))[1] = 'contracts'::text))));

CREATE POLICY "Users can view messages in their conversations" ON public.messages AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM conversation_participants cp
  WHERE ((cp.conversation_id = messages.conversation_id) AND (cp.user_id = auth.uid())))));

CREATE POLICY "Users can view own address verification sessions" ON public.address_verification_sessions AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own bookings" ON public.studio_bookings AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own deposits" ON public.wallet_deposits AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own favorites" ON public.favorites AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own reports" ON public.reports AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = reporter_id));

CREATE POLICY "Users can view own subscription payments" ON public.subscription_payments AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own subscription" ON public.subscriptions AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can view reactions in their conversations" ON public.message_reactions AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM (messages m
     JOIN conversation_participants cp ON ((cp.conversation_id = m.conversation_id)))
  WHERE ((m.id = message_reactions.message_id) AND (cp.user_id = auth.uid())))));

CREATE POLICY "Users can view requests for their studios" ON public.booking_requests AS PERMISSIVE FOR SELECT TO PUBLIC USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id) OR (auth.uid() IN ( SELECT studios.owner_id
   FROM studios
  WHERE (studios.id = booking_requests.studio_id)))));

CREATE POLICY "Users can view their conversations" ON public.conversations AS PERMISSIVE FOR SELECT TO PUBLIC USING (is_conversation_member(id));

CREATE POLICY "Users can view their own payout methods" ON public.payout_methods AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can view their own sent or received requests" ON public.booking_requests AS PERMISSIVE FOR SELECT TO PUBLIC USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id) OR (auth.uid() IN ( SELECT groups.owner_id
   FROM groups
  WHERE (groups.id = booking_requests.group_id)))));

CREATE POLICY "Users can view their own transfer requests" ON public.leadership_transfer_requests AS PERMISSIVE FOR SELECT TO PUBLIC USING (((auth.uid() = from_user_id) OR (auth.uid() = to_user_id)));

CREATE POLICY "Users can view their own withdrawal requests" ON public.withdrawal_requests AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));

CREATE POLICY "Users can view their performance videos" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'documents'::text) AND ((storage.foldername(name))[2] = 'performance-videos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

CREATE POLICY "Users can view their push devices" ON public.push_notification_devices AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY "Users can view their transfer requests" ON public.leadership_transfer_requests AS PERMISSIVE FOR SELECT TO authenticated USING (((from_user_id = auth.uid()) OR (to_user_id = auth.uid())));

CREATE POLICY booking_holds_participant_read ON public.booking_holds AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = booking_holds.studio_id) AND (s.owner_id = auth.uid()))))));

CREATE POLICY booking_holds_user_delete ON public.booking_holds AS PERMISSIVE FOR DELETE TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = booking_holds.studio_id) AND (s.owner_id = auth.uid()))))));

CREATE POLICY booking_holds_user_insert ON public.booking_holds AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

CREATE POLICY didit_webhook_events_service_manage ON public.didit_webhook_events AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));

CREATE POLICY external_links_delete ON public.external_platform_links AS PERMISSIVE FOR DELETE TO PUBLIC USING ((owner_id = auth.uid()));

CREATE POLICY external_links_insert ON public.external_platform_links AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((owner_id = auth.uid()));

CREATE POLICY external_links_select ON public.external_platform_links AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY external_links_update ON public.external_platform_links AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((owner_id = auth.uid()));

CREATE POLICY feed_posts_delete ON public.feed_posts AS PERMISSIVE FOR DELETE TO PUBLIC USING (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

CREATE POLICY feed_posts_insert ON public.feed_posts AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((author_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['musician'::text, 'producer'::text, 'studio-owner'::text, 'venue-owner'::text, 'admin'::text])))))));

CREATE POLICY feed_posts_select ON public.feed_posts AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((visibility = 'public'::text) AND (is_hidden = false)) OR (author_id = auth.uid()) OR ((visibility = 'followers'::text) AND (is_hidden = false) AND (EXISTS ( SELECT 1
   FROM follows f
  WHERE ((f.follower_id = auth.uid()) AND (f.followed_type = 'profile'::text) AND (f.followed_id = feed_posts.author_id))))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

CREATE POLICY feed_posts_update ON public.feed_posts AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

CREATE POLICY follows_delete ON public.follows AS PERMISSIVE FOR DELETE TO PUBLIC USING ((follower_id = auth.uid()));

CREATE POLICY follows_insert ON public.follows AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((follower_id = auth.uid()));

CREATE POLICY follows_select ON public.follows AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY fulfillments_insert ON public.order_fulfillments AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_fulfillments.order_id) AND (o.seller_id = auth.uid())))));

CREATE POLICY fulfillments_select ON public.order_fulfillments AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_fulfillments.order_id) AND ((o.buyer_id = auth.uid()) OR (o.seller_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))))));

CREATE POLICY fulfillments_update ON public.order_fulfillments AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_fulfillments.order_id) AND (o.seller_id = auth.uid())))));

CREATE POLICY gig_availability_owner_delete ON public.gig_availability_slots AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM gigs g
  WHERE ((g.id = gig_availability_slots.gig_id) AND (g.organizer_id = auth.uid())))));

CREATE POLICY gig_availability_owner_insert ON public.gig_availability_slots AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM gigs g
  WHERE ((g.id = gig_availability_slots.gig_id) AND (g.organizer_id = auth.uid())))));

CREATE POLICY gig_availability_owner_update ON public.gig_availability_slots AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM gigs g
  WHERE ((g.id = gig_availability_slots.gig_id) AND (g.organizer_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM gigs g
  WHERE ((g.id = gig_availability_slots.gig_id) AND (g.organizer_id = auth.uid())))));

CREATE POLICY gig_availability_public_read ON public.gig_availability_slots AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY gig_media_owner_delete ON public.gig_media AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM gigs g
  WHERE ((g.id = gig_media.gig_id) AND (g.organizer_id = auth.uid())))));

CREATE POLICY gig_media_owner_insert ON public.gig_media AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM gigs g
  WHERE ((g.id = gig_media.gig_id) AND (g.organizer_id = auth.uid())))));

CREATE POLICY gig_media_owner_update ON public.gig_media AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM gigs g
  WHERE ((g.id = gig_media.gig_id) AND (g.organizer_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM gigs g
  WHERE ((g.id = gig_media.gig_id) AND (g.organizer_id = auth.uid())))));

CREATE POLICY gig_media_public_read ON public.gig_media AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY gig_requirements_owner_delete ON public.gig_requirements AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM gigs g
  WHERE ((g.id = gig_requirements.gig_id) AND (g.organizer_id = auth.uid())))));

CREATE POLICY gig_requirements_owner_insert ON public.gig_requirements AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM gigs g
  WHERE ((g.id = gig_requirements.gig_id) AND (g.organizer_id = auth.uid())))));

CREATE POLICY gig_requirements_owner_update ON public.gig_requirements AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM gigs g
  WHERE ((g.id = gig_requirements.gig_id) AND (g.organizer_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM gigs g
  WHERE ((g.id = gig_requirements.gig_id) AND (g.organizer_id = auth.uid())))));

CREATE POLICY gig_requirements_public_read ON public.gig_requirements AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY gig_slot_fill_applicants_public_read ON public.gig_slot_fill_applicants AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY gig_slot_fill_summary_public_read ON public.gig_slot_fill_summary AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY gigs_permit_resubmit_owner ON public.gigs AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((organizer_id = auth.uid())) WITH CHECK ((organizer_id = auth.uid()));

CREATE POLICY gigs_permit_update_admin ON public.gigs AS PERMISSIVE FOR UPDATE TO PUBLIC USING (is_admin());

CREATE POLICY group_availability_owner_delete ON public.group_availability_slots AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_availability_slots.group_id) AND (g.owner_id = auth.uid())))));

CREATE POLICY group_availability_owner_insert ON public.group_availability_slots AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_availability_slots.group_id) AND (g.owner_id = auth.uid())))));

CREATE POLICY group_availability_owner_update ON public.group_availability_slots AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_availability_slots.group_id) AND (g.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_availability_slots.group_id) AND (g.owner_id = auth.uid())))));

CREATE POLICY group_availability_public_read ON public.group_availability_slots AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY group_media_owner_delete ON public.group_media AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_media.group_id) AND (g.owner_id = auth.uid())))));

CREATE POLICY group_media_owner_insert ON public.group_media AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_media.group_id) AND (g.owner_id = auth.uid())))));

CREATE POLICY group_media_owner_update ON public.group_media AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_media.group_id) AND (g.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_media.group_id) AND (g.owner_id = auth.uid())))));

CREATE POLICY group_media_public_read ON public.group_media AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY group_playlists_delete ON public.group_playlists AS PERMISSIVE FOR DELETE TO PUBLIC USING (((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_playlists.group_id) AND (g.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = group_playlists.playlist_id) AND (pl.creator_id = auth.uid()))))));

CREATE POLICY group_playlists_insert ON public.group_playlists AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_playlists.group_id) AND (g.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = group_playlists.playlist_id) AND (pl.creator_id = auth.uid()))))));

CREATE POLICY group_playlists_select ON public.group_playlists AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = group_playlists.playlist_id) AND ((pl.creator_id = auth.uid()) OR ((pl.visibility = 'public'::text) AND (COALESCE(pl.is_hidden, false) = false)) OR (EXISTS ( SELECT 1
           FROM profiles profile
          WHERE ((profile.id = auth.uid()) AND (profile.role = 'admin'::text)))))))));

CREATE POLICY group_playlists_update ON public.group_playlists AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_playlists.group_id) AND (g.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = group_playlists.playlist_id) AND (pl.creator_id = auth.uid())))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_playlists.group_id) AND (g.owner_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = group_playlists.playlist_id) AND (pl.creator_id = auth.uid()))))));

CREATE POLICY group_roster_owner_delete ON public.group_roster_members AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_roster_members.group_id) AND (g.owner_id = auth.uid())))));

CREATE POLICY group_roster_owner_insert ON public.group_roster_members AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_roster_members.group_id) AND (g.owner_id = auth.uid())))));

CREATE POLICY group_roster_owner_update ON public.group_roster_members AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_roster_members.group_id) AND (g.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM groups g
  WHERE ((g.id = group_roster_members.group_id) AND (g.owner_id = auth.uid())))));

CREATE POLICY group_roster_public_read ON public.group_roster_members AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY identity_document_claims_service_manage ON public.identity_document_claims AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));

CREATE POLICY manual_identity_reviews_select_own ON public.manual_identity_reviews AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY notification_preferences_insert_own ON public.notification_preferences AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

CREATE POLICY notification_preferences_select_own ON public.notification_preferences AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY notification_preferences_update_own ON public.notification_preferences AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY order_items_insert ON public.order_items AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND (o.buyer_id = auth.uid())))));

CREATE POLICY order_items_select ON public.order_items AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND ((o.buyer_id = auth.uid()) OR (o.seller_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))))));

CREATE POLICY orders_insert ON public.orders AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((buyer_id = auth.uid()));

CREATE POLICY orders_select ON public.orders AS PERMISSIVE FOR SELECT TO PUBLIC USING (((buyer_id = auth.uid()) OR (seller_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

CREATE POLICY orders_update ON public.orders AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((buyer_id = auth.uid()) OR (seller_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

CREATE POLICY play_events_insert ON public.playlist_play_events AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (true);

CREATE POLICY play_events_select ON public.playlist_play_events AS PERMISSIVE FOR SELECT TO PUBLIC USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

CREATE POLICY playlist_items_delete ON public.playlist_items AS PERMISSIVE FOR DELETE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = playlist_items.playlist_id) AND (pl.creator_id = auth.uid())))));

CREATE POLICY playlist_items_insert ON public.playlist_items AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = playlist_items.playlist_id) AND (pl.creator_id = auth.uid())))));

CREATE POLICY playlist_items_select ON public.playlist_items AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = playlist_items.playlist_id) AND ((pl.visibility = 'public'::text) OR (pl.creator_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))))));

CREATE POLICY playlist_items_update ON public.playlist_items AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = playlist_items.playlist_id) AND (pl.creator_id = auth.uid())))));

CREATE POLICY playlists_delete ON public.playlists AS PERMISSIVE FOR DELETE TO PUBLIC USING ((creator_id = auth.uid()));

CREATE POLICY playlists_insert ON public.playlists AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((creator_id = auth.uid()));

CREATE POLICY playlists_select ON public.playlists AS PERMISSIVE FOR SELECT TO PUBLIC USING ((((visibility = 'public'::text) AND (is_hidden = false)) OR (creator_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

CREATE POLICY playlists_update ON public.playlists AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((creator_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

CREATE POLICY post_comments_delete ON public.post_comments AS PERMISSIVE FOR DELETE TO PUBLIC USING (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

CREATE POLICY post_comments_insert ON public.post_comments AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((author_id = auth.uid()));

CREATE POLICY post_comments_select ON public.post_comments AS PERMISSIVE FOR SELECT TO PUBLIC USING (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))) OR ((is_hidden = false) AND (moderation_status = 'approved'::text) AND (EXISTS ( SELECT 1
   FROM feed_posts fp
  WHERE ((fp.id = post_comments.post_id) AND (fp.is_hidden = false) AND ((fp.visibility = 'public'::text) OR (fp.author_id = auth.uid()) OR ((fp.visibility = 'followers'::text) AND (EXISTS ( SELECT 1
           FROM follows f
          WHERE ((f.follower_id = auth.uid()) AND (f.followed_id = fp.author_id))))))))))));

CREATE POLICY post_comments_update ON public.post_comments AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((author_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

CREATE POLICY post_media_authenticated_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'post-media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY post_media_delete ON public.post_media AS PERMISSIVE FOR DELETE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM feed_posts fp
  WHERE ((fp.id = post_media.post_id) AND (fp.author_id = auth.uid())))));

CREATE POLICY post_media_insert ON public.post_media AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM feed_posts fp
  WHERE ((fp.id = post_media.post_id) AND (fp.author_id = auth.uid())))));

CREATE POLICY post_media_owner_delete ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'post-media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

CREATE POLICY post_media_public_select ON storage.objects AS PERMISSIVE FOR SELECT TO PUBLIC USING ((bucket_id = 'post-media'::text));

CREATE POLICY post_media_select ON public.post_media AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM feed_posts fp
  WHERE ((fp.id = post_media.post_id) AND ((EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))) OR (fp.author_id = auth.uid()) OR ((fp.visibility = 'public'::text) AND (fp.is_hidden = false)) OR ((fp.visibility = 'followers'::text) AND (fp.is_hidden = false) AND (EXISTS ( SELECT 1
           FROM follows f
          WHERE ((f.follower_id = auth.uid()) AND (f.followed_id = fp.author_id))))))))));

CREATE POLICY post_reactions_delete ON public.post_reactions AS PERMISSIVE FOR DELETE TO PUBLIC USING ((user_id = auth.uid()));

CREATE POLICY post_reactions_insert ON public.post_reactions AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((user_id = auth.uid()));

CREATE POLICY post_reactions_select ON public.post_reactions AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY product_media_delete ON public.product_media AS PERMISSIVE FOR DELETE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_media.product_id) AND (p.seller_id = auth.uid())))));

CREATE POLICY product_media_insert ON public.product_media AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_media.product_id) AND (p.seller_id = auth.uid())))));

CREATE POLICY product_media_select ON public.product_media AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_media.product_id) AND ((p.status = 'active'::text) OR (p.seller_id = auth.uid()))))));

CREATE POLICY product_variants_delete ON public.product_variants AS PERMISSIVE FOR DELETE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_variants.product_id) AND (p.seller_id = auth.uid())))));

CREATE POLICY product_variants_insert ON public.product_variants AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_variants.product_id) AND (p.seller_id = auth.uid())))));

CREATE POLICY product_variants_select ON public.product_variants AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_variants.product_id) AND ((p.status = 'active'::text) OR (p.seller_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))))));

CREATE POLICY product_variants_update ON public.product_variants AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_variants.product_id) AND (p.seller_id = auth.uid())))));

CREATE POLICY products_delete ON public.products AS PERMISSIVE FOR DELETE TO PUBLIC USING ((seller_id = auth.uid()));

CREATE POLICY products_insert ON public.products AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((seller_id = auth.uid()));

CREATE POLICY products_select ON public.products AS PERMISSIVE FOR SELECT TO PUBLIC USING (((status = 'active'::text) OR (seller_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

CREATE POLICY products_update ON public.products AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((seller_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

CREATE POLICY profile_genres_owner_delete ON public.profile_genres AS PERMISSIVE FOR DELETE TO authenticated USING ((profile_id = auth.uid()));

CREATE POLICY profile_genres_owner_insert ON public.profile_genres AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((profile_id = auth.uid()));

CREATE POLICY profile_genres_public_read ON public.profile_genres AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY profile_portfolio_owner_delete ON public.profile_portfolio_urls AS PERMISSIVE FOR DELETE TO authenticated USING ((profile_id = auth.uid()));

CREATE POLICY profile_portfolio_owner_insert ON public.profile_portfolio_urls AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((profile_id = auth.uid()));

CREATE POLICY profile_portfolio_owner_update ON public.profile_portfolio_urls AS PERMISSIVE FOR UPDATE TO authenticated USING ((profile_id = auth.uid())) WITH CHECK ((profile_id = auth.uid()));

CREATE POLICY profile_portfolio_public_read ON public.profile_portfolio_urls AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY profile_skills_owner_delete ON public.profile_skills AS PERMISSIVE FOR DELETE TO authenticated USING ((profile_id = auth.uid()));

CREATE POLICY profile_skills_owner_insert ON public.profile_skills AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((profile_id = auth.uid()));

CREATE POLICY profile_skills_public_read ON public.profile_skills AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY registration_attempts_service_manage ON public.registration_attempts AS PERMISSIVE FOR ALL TO PUBLIC USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));

CREATE POLICY shipping_profiles_delete ON public.shipping_profiles AS PERMISSIVE FOR DELETE TO PUBLIC USING ((seller_id = auth.uid()));

CREATE POLICY shipping_profiles_insert ON public.shipping_profiles AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((seller_id = auth.uid()));

CREATE POLICY shipping_profiles_select ON public.shipping_profiles AS PERMISSIVE FOR SELECT TO PUBLIC USING (((seller_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

CREATE POLICY shipping_profiles_update ON public.shipping_profiles AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((seller_id = auth.uid()));

CREATE POLICY social_events_insert ON public.social_activity_events AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((actor_id = auth.uid()));

CREATE POLICY social_events_select ON public.social_activity_events AS PERMISSIVE FOR SELECT TO PUBLIC USING (((actor_id = auth.uid()) OR (target_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

CREATE POLICY station_slots_delete ON public.station_playlist_slots AS PERMISSIVE FOR DELETE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM stations s
  WHERE ((s.id = station_playlist_slots.station_id) AND (s.creator_id = auth.uid())))));

CREATE POLICY station_slots_insert ON public.station_playlist_slots AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((EXISTS ( SELECT 1
   FROM stations s
  WHERE ((s.id = station_playlist_slots.station_id) AND (s.creator_id = auth.uid())))));

CREATE POLICY station_slots_select ON public.station_playlist_slots AS PERMISSIVE FOR SELECT TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM stations s
  WHERE ((s.id = station_playlist_slots.station_id) AND ((s.is_active = true) OR (s.creator_id = auth.uid()) OR (s.managed_profile_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM profiles
          WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))))));

CREATE POLICY station_slots_update ON public.station_playlist_slots AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((EXISTS ( SELECT 1
   FROM stations s
  WHERE ((s.id = station_playlist_slots.station_id) AND (s.creator_id = auth.uid())))));

CREATE POLICY stations_delete ON public.stations AS PERMISSIVE FOR DELETE TO PUBLIC USING ((creator_id = auth.uid()));

CREATE POLICY stations_insert ON public.stations AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((creator_id = auth.uid()));

CREATE POLICY stations_select ON public.stations AS PERMISSIVE FOR SELECT TO PUBLIC USING (((is_active = true) OR (creator_id = auth.uid()) OR (managed_profile_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

CREATE POLICY stations_update ON public.stations AS PERMISSIVE FOR UPDATE TO PUBLIC USING (((creator_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

CREATE POLICY studio_amenities_owner_delete ON public.studio_amenities AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_amenities.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_amenities_owner_insert ON public.studio_amenities AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_amenities.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_amenities_public_read ON public.studio_amenities AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY studio_availability_owner_delete ON public.studio_availability_slots AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_availability_slots.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_availability_owner_insert ON public.studio_availability_slots AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_availability_slots.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_availability_owner_update ON public.studio_availability_slots AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_availability_slots.studio_id) AND (s.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_availability_slots.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_availability_public_read ON public.studio_availability_slots AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY studio_booking_slots_participant_read ON public.studio_booking_slots AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (studio_bookings sb
     JOIN studios s ON ((s.id = sb.studio_id)))
  WHERE ((sb.id = studio_booking_slots.booking_id) AND ((sb.user_id = auth.uid()) OR (s.owner_id = auth.uid()))))));

CREATE POLICY studio_hours_owner_delete ON public.studio_operating_hours AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_operating_hours.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_hours_owner_insert ON public.studio_operating_hours AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_operating_hours.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_hours_owner_update ON public.studio_operating_hours AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_operating_hours.studio_id) AND (s.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_operating_hours.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_hours_public_read ON public.studio_operating_hours AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY studio_instruments_owner_delete ON public.studio_instruments AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_instruments.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_instruments_owner_insert ON public.studio_instruments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_instruments.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_instruments_owner_update ON public.studio_instruments AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_instruments.studio_id) AND (s.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_instruments.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_instruments_public_read ON public.studio_instruments AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY studio_media_owner_delete ON public.studio_media AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_media.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_media_owner_insert ON public.studio_media AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_media.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_media_owner_update ON public.studio_media AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_media.studio_id) AND (s.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_media.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_media_public_read ON public.studio_media AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY studio_open_dates_owner_delete ON public.studio_open_dates AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_open_dates.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_open_dates_owner_insert ON public.studio_open_dates AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_open_dates.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_open_dates_owner_update ON public.studio_open_dates AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_open_dates.studio_id) AND (s.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_open_dates.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_open_dates_public_read ON public.studio_open_dates AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY studio_overrides_owner_delete ON public.studio_date_overrides AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_date_overrides.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_overrides_owner_insert ON public.studio_date_overrides AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_date_overrides.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_overrides_owner_update ON public.studio_date_overrides AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_date_overrides.studio_id) AND (s.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_date_overrides.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_overrides_public_read ON public.studio_date_overrides AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY studio_owner_penalties_owner_read ON public.studio_owner_penalties AS PERMISSIVE FOR SELECT TO authenticated USING ((owner_id = auth.uid()));

CREATE POLICY studio_promotions_owner_delete ON public.studio_promotions AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_promotions.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_promotions_owner_insert ON public.studio_promotions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_promotions.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_promotions_owner_update ON public.studio_promotions AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_promotions.studio_id) AND (s.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_promotions.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_promotions_public_read ON public.studio_promotions AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY studio_settings_owner_delete ON public.studio_settings AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_settings.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_settings_owner_insert ON public.studio_settings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_settings.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_settings_owner_update ON public.studio_settings AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_settings.studio_id) AND (s.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_settings.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_settings_public_read ON public.studio_settings AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY studio_types_owner_delete ON public.studio_types AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_types.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_types_owner_insert ON public.studio_types AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM studios s
  WHERE ((s.id = studio_types.studio_id) AND (s.owner_id = auth.uid())))));

CREATE POLICY studio_types_public_read ON public.studio_types AS PERMISSIVE FOR SELECT TO PUBLIC USING (true);

CREATE POLICY studios_permit_resubmit_owner ON public.studios AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));

CREATE POLICY studios_permit_update_admin ON public.studios AS PERMISSIVE FOR UPDATE TO PUBLIC USING (is_admin());

CREATE POLICY teaser_assets_delete ON public.playlist_teaser_assets AS PERMISSIVE FOR DELETE TO PUBLIC USING ((uploader_id = auth.uid()));

CREATE POLICY teaser_assets_insert ON public.playlist_teaser_assets AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((uploader_id = auth.uid()));

CREATE POLICY teaser_assets_select ON public.playlist_teaser_assets AS PERMISSIVE FOR SELECT TO PUBLIC USING (((uploader_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM playlists pl
  WHERE ((pl.id = playlist_teaser_assets.playlist_id) AND ((pl.visibility = 'public'::text) OR (pl.creator_id = auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));

CREATE POLICY wallet_transactions_owner_read ON public.wallet_transactions AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM wallets w
  WHERE ((w.id = wallet_transactions.wallet_id) AND (w.user_id = auth.uid())))));

CREATE POLICY wallets_owner_read ON public.wallets AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));


-- comment
COMMENT ON SCHEMA public IS 'standard public schema';

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';

COMMENT ON TABLE auth.flow_state IS 'Stores metadata for all OAuth/SSO login flows';

COMMENT ON TABLE auth.identities IS 'Auth: Stores identities associated to a user.';

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';

COMMENT ON TABLE auth.mfa_amr_claims IS 'auth: stores authenticator method reference claims for multi factor authentication';

COMMENT ON TABLE auth.mfa_challenges IS 'auth: stores metadata about challenge requests made';

COMMENT ON TABLE auth.mfa_factors IS 'auth: stores metadata about factors';

COMMENT ON TABLE auth.oauth_client_states IS 'Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.';

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';

COMMENT ON TABLE auth.saml_providers IS 'Auth: Manages SAML Identity Provider connections.';

COMMENT ON TABLE auth.saml_relay_states IS 'Auth: Contains SAML Relay State information for each Service Provider initiated login.';

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';

COMMENT ON TABLE auth.sessions IS 'Auth: Stores session data associated to a user.';

COMMENT ON TABLE auth.sso_domains IS 'Auth: Manages SSO email address domain mapping to an SSO Identity Provider.';

COMMENT ON TABLE auth.sso_providers IS 'Auth: Manages SSO identity provider information; see saml_providers for SAML.';

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';

COMMENT ON TABLE public.address_verification_sessions IS 'Tracks Didit Proof of Address verification sessions for studios and gigs';

COMMENT ON TABLE public.audit_event_changes IS 'One row per changed column for normalized audit details.';

COMMENT ON TABLE public.audit_events IS 'Append-only audit event header for CRUD and business actions across MusikaLokal.';

COMMENT ON TABLE public.booking_holds IS 'Temporary cart locks (3NF)';

COMMENT ON TABLE public.conversation_participants IS 'Participants in group conversations. For 1-on-1 chats, participant_1 and participant_2 columns in conversations table are used instead.';

COMMENT ON TABLE public.studio_date_overrides IS 'Date-specific exceptions (3NF)';

COMMENT ON TABLE public.studio_operating_hours IS 'Weekly operating hours template (3NF)';

COMMENT ON TABLE public.studio_settings IS 'Booking rules and pricing modifiers (3NF)';

COMMENT ON VIEW public.musician_performed_gigs IS 'Accepted gig applications enriched with gig details and derived performance_status. Used on home feed and profile pages.';

COMMENT ON COLUMN auth.identities.email IS 'Auth: Email is a generated column that references the optional email property in the identity_data';

COMMENT ON COLUMN auth.mfa_factors.last_webauthn_challenge_data IS 'Stores the latest WebAuthn challenge data including attestation/assertion for customer verification';

COMMENT ON COLUMN auth.sessions.not_after IS 'Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired.';

COMMENT ON COLUMN auth.sessions.refresh_token_counter IS 'Holds the ID (counter) of the last issued refresh token.';

COMMENT ON COLUMN auth.sessions.refresh_token_hmac_key IS 'Holds a HMAC-SHA256 key used to sign refresh tokens for this session.';

COMMENT ON COLUMN auth.sso_providers.resource_id IS 'Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code.';

COMMENT ON COLUMN auth.users.is_sso_user IS 'Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails.';

COMMENT ON COLUMN public.address_verification_sessions.archive_id IS 'Smile Identity archive/document ID';

COMMENT ON COLUMN public.address_verification_sessions.entity_type IS 'Type of entity being verified (studio or gig)';

COMMENT ON COLUMN public.address_verification_sessions.expected_address IS 'Address entered by user for the studio/gig';

COMMENT ON COLUMN public.address_verification_sessions.expected_name IS 'Verified name of the owner from ID verification';

COMMENT ON COLUMN public.address_verification_sessions.extracted_address IS 'Address extracted from utility bill by Didit';

COMMENT ON COLUMN public.address_verification_sessions.extracted_name IS 'Name extracted from utility bill by Didit';

COMMENT ON COLUMN public.address_verification_sessions.provider IS 'Verification provider (smile)';

COMMENT ON COLUMN public.address_verification_sessions.session_id IS 'Didit session ID';

COMMENT ON COLUMN public.address_verification_sessions.smile_user_id IS 'Smile Identity user ID';

COMMENT ON COLUMN public.address_verification_sessions.verification_result IS 'Full verification result from Smile API';

COMMENT ON COLUMN public.audit_events.actor_user_id IS 'Historical actor profile id. Intentionally not a foreign key so profile deletion cannot erase audit attribution.';

COMMENT ON COLUMN public.audit_events.metadata IS 'Small contextual payload for historical audit evidence. Registered as a controlled 3NF exception.';

COMMENT ON COLUMN public.audit_events.target_user_id IS 'Historical target profile id. Intentionally not a foreign key so profile deletion cannot erase audit attribution.';

COMMENT ON COLUMN public.gig_applications.cv_url IS 'URL to the uploaded CV file';

COMMENT ON COLUMN public.gig_applications.is_solo_application IS 'True if user applied as individual, false if applied as part of a group';

COMMENT ON COLUMN public.gig_applications.performer_snapshot IS 'Immutable-ish display snapshot of the selected production roster performer at application time.';

COMMENT ON COLUMN public.gig_applications.production_roster_id IS 'Optional production roster entry representing the selected musician, duo, or group for a production application.';

COMMENT ON COLUMN public.gig_applications.production_team_id IS 'Optional production team wrapper for applications submitted as one production organization.';

COMMENT ON COLUMN public.gig_applications.rejected_at IS 'Timestamp when the application was rejected, used for cooldown calculation';

COMMENT ON COLUMN public.gig_applications.show_on_profile IS 'Musician/group choice to show this accepted gig on their public profile and home feed. 3NF: depends only on application PK.';

COMMENT ON COLUMN public.gig_applications.slot_type IS 'The slot type this application is for: solo, duo, or band';

COMMENT ON COLUMN public.gigs.address_verification_completed_at IS 'Timestamp when address verification was completed';

COMMENT ON COLUMN public.gigs.address_verification_status IS 'Status of address verification: NOT_STARTED, PENDING, APPROVED, DECLINED, ABANDONED, MANUAL_REVIEW, PENDING_REVIEW';

COMMENT ON COLUMN public.gigs.business_permit_url IS 'URL to the uploaded business permit document (PDF or image)';

COMMENT ON COLUMN public.gigs.contract_url IS 'URL to contract document in Supabase storage';

COMMENT ON COLUMN public.gigs.permit_resubmissions_used IS 'Number of permit resubmissions used after rejection. Capped at 1.';

COMMENT ON COLUMN public.gigs.reapplication_cooldown_days IS 'Number of days a rejected musician must wait before reapplying. 0 = can reapply immediately, NULL = system default (30 days)';

COMMENT ON COLUMN public.gigs.total_slots_filled IS 'Quick count of total accepted applications across all slot types';

COMMENT ON COLUMN public.gigs.verified_address IS 'Address extracted and verified from utility bill';

COMMENT ON COLUMN public.groups.group_type IS 'Type of musical group: duo (exactly 2 members) or band (3+ members)';

COMMENT ON COLUMN public.production_teams.open_production_applications IS 'Controls whether musicians, duos, and groups can apply to join a production team.';

COMMENT ON COLUMN public.profiles.smile_user_id IS 'Smile Identity user ID for document verification';

COMMENT ON COLUMN public.reports.escalated_at IS 'Timestamp when report was escalated to manual review.';

COMMENT ON COLUMN public.reports.escalation_reason IS 'Optional reason for escalation.';

COMMENT ON COLUMN public.reports.escalation_status IS 'Escalation state for admin triage.';

COMMENT ON COLUMN public.reports.moderation_action IS 'Last moderation action taken by admin.';

COMMENT ON COLUMN public.reports.moderation_notes IS 'Optional admin moderation notes.';

COMMENT ON COLUMN public.reports.reviewed_at IS 'Timestamp when the report was last reviewed by an admin.';

COMMENT ON COLUMN public.reports.reviewed_by IS 'Admin user id that last reviewed this report.';

COMMENT ON COLUMN public.stations.last_seen_live_at IS 'Last time the station was confirmed live by the broadcast/control plane.';

COMMENT ON COLUMN public.stations.managed_group_id IS 'Group or duo whose radio station this row represents. Null means the station represents managed_profile_id directly.';

COMMENT ON COLUMN public.stations.managed_profile_id IS 'Profile whose radio station this row represents. Admins may manage the row while creator_id points at the admin account.';

COMMENT ON COLUMN public.stations.stream_status IS 'Current broadcast state for stream_url stations: offline, live, or autoplay fallback.';

COMMENT ON COLUMN public.stations.stream_url IS 'Public listener URL for a real continuous station stream, such as Icecast, HLS, or managed radio output.';

COMMENT ON COLUMN public.studio_bookings.checkout_session_id IS 'PayMongo checkout session ID';

COMMENT ON COLUMN public.studio_bookings.paid_at IS 'Timestamp when payment was completed';

COMMENT ON COLUMN public.studio_bookings.payment_amount IS 'Amount paid in PHP';

COMMENT ON COLUMN public.studio_bookings.payment_intent_id IS 'PayMongo payment intent ID';

COMMENT ON COLUMN public.studio_bookings.payment_method IS 'Payment method used (gcash, card, maya, etc.)';

COMMENT ON COLUMN public.studio_bookings.payment_status IS 'Payment status: unpaid, pending, paid, failed, refunded';

COMMENT ON COLUMN public.studio_bookings.payment_type IS 'Type of payment: full (100%), downpayment (50%), or balance (remaining amount)';

COMMENT ON COLUMN public.studio_bookings.remaining_balance IS 'Remaining amount to be paid (for downpayments)';

COMMENT ON COLUMN public.studio_settings.holiday_multiplier IS 'Multiplier for holidays (e.g., 1.5 = 50% increase)';

COMMENT ON COLUMN public.studio_settings.off_peak_dates IS 'Array of date ranges for off-peak season. Format: [{start: "YYYY-MM-DD", end: "YYYY-MM-DD"}]';

COMMENT ON COLUMN public.studio_settings.off_peak_multiplier IS 'Discount multiplier for off-peak dates (e.g., 0.8 = 20% discount)';

COMMENT ON COLUMN public.studio_settings.peak_season_dates IS 'Array of date ranges for peak season. Format: [{start: "YYYY-MM-DD", end: "YYYY-MM-DD"}]';

COMMENT ON COLUMN public.studio_settings.peak_season_multiplier IS 'Multiplier for peak season dates (e.g., 1.2 = 20% increase)';

COMMENT ON COLUMN public.studios.address_verification_completed_at IS 'Timestamp when address verification was completed';

COMMENT ON COLUMN public.studios.address_verification_status IS 'Status of address verification: NOT_STARTED, PENDING, APPROVED, DECLINED, ABANDONED, MANUAL_REVIEW, PENDING_REVIEW';

COMMENT ON COLUMN public.studios.business_permit_url IS 'URL to the uploaded business permit document (PDF or image)';

COMMENT ON COLUMN public.studios.contract_url IS 'URL to contract document in Supabase storage';

COMMENT ON COLUMN public.studios.pax IS 'Maximum number of people/capacity for the studio';

COMMENT ON COLUMN public.studios.permit_resubmissions_used IS 'Number of permit resubmissions used after rejection. Capped at 1.';

COMMENT ON COLUMN public.studios.verified_address IS 'Address extracted and verified from utility bill';

COMMENT ON COLUMN public.withdrawal_requests.payout_account_name IS 'Optional immutable snapshot for audit display only.';

COMMENT ON COLUMN public.withdrawal_requests.payout_account_number IS 'Optional immutable snapshot for audit display only.';

COMMENT ON COLUMN public.withdrawal_requests.payout_bank_name IS 'Optional immutable snapshot for audit display only.';

COMMENT ON COLUMN public.withdrawal_requests.payout_method_id IS 'Relational source of truth for payout routing.';

COMMENT ON COLUMN public.withdrawal_requests.payout_type IS 'Optional immutable snapshot for audit display only.';

COMMENT ON COLUMN storage.buckets.owner IS 'Field is deprecated, use owner_id instead';

COMMENT ON COLUMN storage.objects.owner IS 'Field is deprecated, use owner_id instead';


-- publication
CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');

CREATE PUBLICATION supabase_realtime_messages_publication WITH (publish = 'insert, update, delete, truncate');


-- publication_table
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE realtime.messages_2026_05_16;

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE realtime.messages_2026_05_17;

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE realtime.messages_2026_05_18;

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE realtime.messages_2026_05_19;

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE realtime.messages_2026_05_20;

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE realtime.messages_2026_05_21;

ALTER PUBLICATION supabase_realtime_messages_publication ADD TABLE realtime.messages_2026_05_22;


-- grant_relation
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.audit_log_entries TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.audit_log_entries TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.custom_oauth_providers TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.custom_oauth_providers TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.custom_oauth_providers TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.flow_state TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.flow_state TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.identities TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.identities TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.instances TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.instances TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.mfa_amr_claims TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.mfa_amr_claims TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.mfa_challenges TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.mfa_challenges TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.mfa_factors TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.mfa_factors TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.oauth_authorizations TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.oauth_authorizations TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.oauth_authorizations TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.oauth_client_states TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.oauth_client_states TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.oauth_client_states TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.oauth_clients TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.oauth_clients TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.oauth_clients TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.oauth_consents TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.oauth_consents TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.oauth_consents TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.one_time_tokens TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.one_time_tokens TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.refresh_tokens TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.refresh_tokens TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.saml_providers TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.saml_providers TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.saml_relay_states TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.saml_relay_states TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.schema_migrations TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.sessions TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.sessions TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.sso_domains TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.sso_domains TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.sso_providers TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.sso_providers TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.users TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.users TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.webauthn_challenges TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.webauthn_challenges TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.webauthn_challenges TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.webauthn_credentials TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.webauthn_credentials TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.webauthn_credentials TO supabase_auth_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE private_archive.venue_partnership_deals_20260427 TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE private_archive.venue_partnership_deals_20260427 TO supabase_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.address_verification_sessions TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.address_verification_sessions TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.address_verification_sessions TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.address_verification_sessions TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_permit_metrics TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_permit_metrics TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_permit_metrics TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_permit_metrics TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_event_changes TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_event_changes TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_events TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_events TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_attendance_events TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_attendance_events TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_attendance_events TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_attendance_events TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_cancellation_policies TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_cancellation_policies TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_cancellation_policies TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_cancellation_policies TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_holds TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_holds TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_holds TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_holds TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_incidents TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_incidents TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_incidents TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_incidents TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_penalty_events TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_penalty_events TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_penalty_events TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_penalty_events TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_penalty_events_with_summary TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_penalty_events_with_summary TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_penalty_events_with_summary TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_penalty_events_with_summary TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_requests TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_requests TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_requests TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.booking_requests TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversation_participants TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversation_participants TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversation_participants TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversation_participants TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversations TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversations TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversations TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversations TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversations_display_projection TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversations_display_projection TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversations_display_projection TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.conversations_display_projection TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.didit_webhook_events TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.didit_webhook_events TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.didit_webhook_events TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.didit_webhook_events TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_notifications TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_notifications TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_notifications TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_notifications TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.external_platform_links TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.external_platform_links TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.external_platform_links TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.external_platform_links TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.favorites TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.favorites TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.favorites TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.favorites TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.feed_posts TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.feed_posts TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.feed_posts TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.feed_posts TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.follow_counts TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.follow_counts TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.follow_counts TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.follow_counts TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.follows TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.follows TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.follows TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.follows TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_applications TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_applications TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_applications TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_applications TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_availability_slots TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_availability_slots TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_availability_slots TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_availability_slots TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_deletion_audit TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_deletion_audit TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_deletion_audit TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_deletion_audit TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_media TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_media TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_media TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_media TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_requirements TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_requirements TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_requirements TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_requirements TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_slot_fill_applicants TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_slot_fill_applicants TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_slot_fill_applicants TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_slot_fill_applicants TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_slot_fill_summary TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_slot_fill_summary TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_slot_fill_summary TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gig_slot_fill_summary TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_availability_projection TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_availability_projection TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_availability_projection TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_availability_projection TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_legacy_projection TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_legacy_projection TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_legacy_projection TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_legacy_projection TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_slots_filled_projection TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_slots_filled_projection TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_slots_filled_projection TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_slots_filled_projection TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_with_stats TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_with_stats TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_with_stats TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_with_stats TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_with_verification TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_with_verification TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_with_verification TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.gigs_with_verification TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_availability_slots TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_availability_slots TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_availability_slots TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_availability_slots TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_deletion_audit TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_deletion_audit TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_deletion_audit TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_deletion_audit TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_media TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_media TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_media TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_media TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_members TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_members TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_members TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_members TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_playlists TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_playlists TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_playlists TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_playlists TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_roster_members TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_roster_members TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_roster_members TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.group_roster_members TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups_availability_projection TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups_availability_projection TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups_availability_projection TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups_availability_projection TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups_legacy_projection TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups_legacy_projection TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups_legacy_projection TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups_legacy_projection TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups_with_stats TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups_with_stats TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups_with_stats TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.groups_with_stats TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.identity_document_claims TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.identity_document_claims TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.identity_document_claims TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.identity_document_claims TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.leadership_transfer_requests TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.leadership_transfer_requests TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.leadership_transfer_requests TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.leadership_transfer_requests TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.manual_identity_reviews TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.manual_identity_reviews TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.manual_identity_reviews TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.manual_identity_reviews TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.message_reactions TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.message_reactions TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.message_reactions TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.message_reactions TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.messages TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.messages TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.messages TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.messages TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.musician_performed_gigs TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.musician_performed_gigs TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.musician_performed_gigs TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.musician_performed_gigs TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.normalization_exceptions TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.normalization_exceptions TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.normalization_exceptions TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.normalization_exceptions TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notification_preferences TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notification_preferences TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notification_preferences TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notification_preferences TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.order_fulfillments TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.order_fulfillments TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.order_fulfillments TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.order_fulfillments TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.order_items TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.order_items TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.order_items TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.order_items TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.orders TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.orders TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.orders TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.orders TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.orders_with_summary TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.orders_with_summary TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.orders_with_summary TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.orders_with_summary TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payout_methods TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payout_methods TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payout_methods TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payout_methods TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.permit_audit_log TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.permit_audit_log TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.permit_audit_log TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.permit_audit_log TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.playlist_items TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.playlist_items TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.playlist_items TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.playlist_items TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.playlist_play_events TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.playlist_play_events TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.playlist_play_events TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.playlist_play_events TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.playlist_teaser_assets TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.playlist_teaser_assets TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.playlist_teaser_assets TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.playlist_teaser_assets TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.playlists TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.playlists TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.playlists TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.playlists TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.post_comments TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.post_comments TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.post_comments TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.post_comments TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.post_media TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.post_media TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.post_media TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.post_media TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.post_reactions TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.post_reactions TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.post_reactions TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.post_reactions TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.product_media TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.product_media TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.product_media TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.product_media TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.product_variants TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.product_variants TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.product_variants TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.product_variants TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_team_members TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_team_members TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_team_members TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_team_members TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_team_roster TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_team_roster TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_team_roster TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_team_roster TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_teams TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_teams TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_teams TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.production_teams TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.products TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.products TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.products TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.products TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.products_with_summary TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.products_with_summary TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.products_with_summary TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.products_with_summary TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profile_genres TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profile_genres TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profile_genres TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profile_genres TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profile_portfolio_urls TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profile_portfolio_urls TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profile_portfolio_urls TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profile_portfolio_urls TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profile_skills TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profile_skills TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profile_skills TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profile_skills TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles_legacy_projection TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles_legacy_projection TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles_legacy_projection TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles_legacy_projection TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles_with_stats TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles_with_stats TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles_with_stats TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles_with_stats TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.push_notification_devices TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.push_notification_devices TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.push_notification_devices TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.push_notification_devices TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.registration_attempts TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.registration_attempts TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.registration_attempts TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.registration_attempts TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.reports TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.reports TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.reports TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.reports TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.review_likes TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.review_likes TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.review_likes TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.review_likes TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.reviews TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.reviews TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.reviews TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.reviews TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.reviews_with_stats TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.reviews_with_stats TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.reviews_with_stats TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.reviews_with_stats TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.shipping_profiles TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.shipping_profiles TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.shipping_profiles TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.shipping_profiles TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.social_activity_events TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.social_activity_events TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.social_activity_events TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.social_activity_events TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.station_playlist_slots TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.station_playlist_slots TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.station_playlist_slots TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.station_playlist_slots TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stations TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stations TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stations TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stations TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_amenities TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_amenities TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_amenities TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_amenities TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_availability_slots TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_availability_slots TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_availability_slots TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_availability_slots TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_booking_slots TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_booking_slots TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_booking_slots TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_booking_slots TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_bookings TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_bookings TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_bookings TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_bookings TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_bookings_legacy_projection TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_bookings_legacy_projection TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_bookings_legacy_projection TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_bookings_legacy_projection TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_bookings_with_cost TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_bookings_with_cost TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_bookings_with_cost TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_bookings_with_cost TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_date_overrides TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_date_overrides TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_date_overrides TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_date_overrides TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_deletion_audit TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_deletion_audit TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_deletion_audit TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_deletion_audit TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_instruments TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_instruments TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_instruments TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_instruments TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_media TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_media TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_media TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_media TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_open_dates TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_open_dates TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_open_dates TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_open_dates TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_operating_hours TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_operating_hours TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_operating_hours TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_operating_hours TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_owner_penalties TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_owner_penalties TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_owner_penalties TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_owner_penalties TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_promotions TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_promotions TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_promotions TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_promotions TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_settings TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_settings TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_settings TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_settings TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_types TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_types TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_types TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studio_types TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios_availability_projection TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios_availability_projection TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios_availability_projection TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios_availability_projection TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios_legacy_projection TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios_legacy_projection TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios_legacy_projection TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios_legacy_projection TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios_with_stats TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios_with_stats TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios_with_stats TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios_with_stats TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios_with_verification TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios_with_verification TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios_with_verification TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.studios_with_verification TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_payments TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_payments TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_payments TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_payments TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_plans TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_plans TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_plans TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_plans TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscriptions TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscriptions TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscriptions TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscriptions TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.verification_sessions TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.verification_sessions TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.verification_sessions TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.verification_sessions TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wallet_deposits TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wallet_deposits TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wallet_deposits TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wallet_deposits TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wallet_transactions TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wallet_transactions TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wallet_transactions TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wallet_transactions TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wallets TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wallets TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wallets TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.wallets TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.withdrawal_requests TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.withdrawal_requests TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.withdrawal_requests TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.withdrawal_requests TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages TO supabase_realtime_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_16 TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_16 TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_16 TO supabase_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_17 TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_17 TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_17 TO supabase_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_18 TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_18 TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_18 TO supabase_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_19 TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_19 TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_19 TO supabase_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_20 TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_20 TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_20 TO supabase_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_21 TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_21 TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_21 TO supabase_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_22 TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_22 TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.messages_2026_05_22 TO supabase_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.schema_migrations TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.schema_migrations TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.schema_migrations TO supabase_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.schema_migrations TO supabase_realtime_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.subscription TO dashboard_user;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.subscription TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.subscription TO supabase_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE realtime.subscription TO supabase_realtime_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.buckets TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.buckets TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.buckets TO postgres WITH GRANT OPTION;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.buckets TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.buckets TO supabase_storage_admin WITH GRANT OPTION;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.buckets_analytics TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.buckets_analytics TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.buckets_analytics TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.buckets_analytics TO supabase_storage_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.buckets_vectors TO supabase_storage_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.objects TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.objects TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.objects TO postgres WITH GRANT OPTION;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.objects TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.objects TO supabase_storage_admin WITH GRANT OPTION;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.s3_multipart_uploads TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.s3_multipart_uploads TO supabase_storage_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.s3_multipart_uploads_parts TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.s3_multipart_uploads_parts TO supabase_storage_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE storage.vector_indexes TO supabase_storage_admin;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.audit_log_entries TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.flow_state TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.identities TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.instances TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.mfa_amr_claims TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.mfa_challenges TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.mfa_factors TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.one_time_tokens TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.refresh_tokens TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.saml_providers TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.saml_relay_states TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.sessions TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.sso_domains TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.sso_providers TO postgres;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE auth.users TO postgres;

GRANT INSERT, SELECT, UPDATE ON TABLE realtime.messages TO anon;

GRANT INSERT, SELECT, UPDATE ON TABLE realtime.messages TO authenticated;

GRANT INSERT, SELECT, UPDATE ON TABLE realtime.messages TO service_role;

GRANT SELECT ON TABLE auth.audit_log_entries TO postgres WITH GRANT OPTION;

GRANT SELECT ON TABLE auth.flow_state TO postgres WITH GRANT OPTION;

GRANT SELECT ON TABLE auth.identities TO postgres WITH GRANT OPTION;

GRANT SELECT ON TABLE auth.instances TO postgres WITH GRANT OPTION;

GRANT SELECT ON TABLE auth.mfa_amr_claims TO postgres WITH GRANT OPTION;

GRANT SELECT ON TABLE auth.mfa_challenges TO postgres WITH GRANT OPTION;

GRANT SELECT ON TABLE auth.mfa_factors TO postgres WITH GRANT OPTION;

GRANT SELECT ON TABLE auth.one_time_tokens TO postgres WITH GRANT OPTION;

GRANT SELECT ON TABLE auth.refresh_tokens TO postgres WITH GRANT OPTION;

GRANT SELECT ON TABLE auth.saml_providers TO postgres WITH GRANT OPTION;

GRANT SELECT ON TABLE auth.saml_relay_states TO postgres WITH GRANT OPTION;

GRANT SELECT ON TABLE auth.schema_migrations TO postgres WITH GRANT OPTION;

GRANT SELECT ON TABLE auth.sessions TO postgres WITH GRANT OPTION;

GRANT SELECT ON TABLE auth.sso_domains TO postgres WITH GRANT OPTION;

GRANT SELECT ON TABLE auth.sso_providers TO postgres WITH GRANT OPTION;

GRANT SELECT ON TABLE auth.users TO postgres WITH GRANT OPTION;

GRANT SELECT ON TABLE private_archive.venue_partnership_deals_20260427 TO service_role;

GRANT SELECT ON TABLE public.audit_event_changes TO authenticated;

GRANT SELECT ON TABLE public.audit_events TO authenticated;

GRANT SELECT ON TABLE realtime.schema_migrations TO anon;

GRANT SELECT ON TABLE realtime.schema_migrations TO authenticated;

GRANT SELECT ON TABLE realtime.schema_migrations TO service_role;

GRANT SELECT ON TABLE realtime.subscription TO anon;

GRANT SELECT ON TABLE realtime.subscription TO authenticated;

GRANT SELECT ON TABLE realtime.subscription TO service_role;

GRANT SELECT ON TABLE storage.buckets_vectors TO anon;

GRANT SELECT ON TABLE storage.buckets_vectors TO authenticated;

GRANT SELECT ON TABLE storage.buckets_vectors TO service_role;

GRANT SELECT ON TABLE storage.s3_multipart_uploads TO anon;

GRANT SELECT ON TABLE storage.s3_multipart_uploads TO authenticated;

GRANT SELECT ON TABLE storage.s3_multipart_uploads_parts TO anon;

GRANT SELECT ON TABLE storage.s3_multipart_uploads_parts TO authenticated;

GRANT SELECT ON TABLE storage.vector_indexes TO anon;

GRANT SELECT ON TABLE storage.vector_indexes TO authenticated;

GRANT SELECT ON TABLE storage.vector_indexes TO service_role;

GRANT SELECT, UPDATE, USAGE ON SEQUENCE auth.refresh_tokens_id_seq TO dashboard_user;

GRANT SELECT, UPDATE, USAGE ON SEQUENCE auth.refresh_tokens_id_seq TO postgres;

GRANT SELECT, UPDATE, USAGE ON SEQUENCE auth.refresh_tokens_id_seq TO supabase_auth_admin;

GRANT SELECT, UPDATE, USAGE ON SEQUENCE realtime.subscription_id_seq TO dashboard_user;

GRANT SELECT, UPDATE, USAGE ON SEQUENCE realtime.subscription_id_seq TO postgres;

GRANT SELECT, UPDATE, USAGE ON SEQUENCE realtime.subscription_id_seq TO supabase_admin;

GRANT SELECT, UPDATE, USAGE ON SEQUENCE realtime.subscription_id_seq TO supabase_realtime_admin;

GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO anon;

GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO authenticated;

GRANT USAGE ON SEQUENCE realtime.subscription_id_seq TO service_role;


-- grant_function
GRANT EXECUTE ON FUNCTION auth.email() TO PUBLIC;

GRANT EXECUTE ON FUNCTION auth.email() TO dashboard_user;

GRANT EXECUTE ON FUNCTION auth.email() TO supabase_auth_admin;

GRANT EXECUTE ON FUNCTION auth.jwt() TO PUBLIC;

GRANT EXECUTE ON FUNCTION auth.jwt() TO dashboard_user;

GRANT EXECUTE ON FUNCTION auth.jwt() TO postgres;

GRANT EXECUTE ON FUNCTION auth.jwt() TO supabase_auth_admin;

GRANT EXECUTE ON FUNCTION auth.role() TO PUBLIC;

GRANT EXECUTE ON FUNCTION auth.role() TO dashboard_user;

GRANT EXECUTE ON FUNCTION auth.role() TO supabase_auth_admin;

GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;

GRANT EXECUTE ON FUNCTION auth.uid() TO dashboard_user;

GRANT EXECUTE ON FUNCTION auth.uid() TO supabase_auth_admin;

GRANT EXECUTE ON FUNCTION extensions.grant_pg_cron_access() TO PUBLIC;

GRANT EXECUTE ON FUNCTION extensions.grant_pg_cron_access() TO dashboard_user;

GRANT EXECUTE ON FUNCTION extensions.grant_pg_cron_access() TO supabase_admin WITH GRANT OPTION;

GRANT EXECUTE ON FUNCTION extensions.grant_pg_graphql_access() TO PUBLIC;

GRANT EXECUTE ON FUNCTION extensions.grant_pg_graphql_access() TO postgres WITH GRANT OPTION;

GRANT EXECUTE ON FUNCTION extensions.grant_pg_graphql_access() TO supabase_admin;

GRANT EXECUTE ON FUNCTION extensions.grant_pg_net_access() TO PUBLIC;

GRANT EXECUTE ON FUNCTION extensions.grant_pg_net_access() TO dashboard_user;

GRANT EXECUTE ON FUNCTION extensions.grant_pg_net_access() TO supabase_admin WITH GRANT OPTION;

GRANT EXECUTE ON FUNCTION extensions.pgrst_ddl_watch() TO PUBLIC;

GRANT EXECUTE ON FUNCTION extensions.pgrst_ddl_watch() TO postgres WITH GRANT OPTION;

GRANT EXECUTE ON FUNCTION extensions.pgrst_ddl_watch() TO supabase_admin;

GRANT EXECUTE ON FUNCTION extensions.pgrst_drop_watch() TO PUBLIC;

GRANT EXECUTE ON FUNCTION extensions.pgrst_drop_watch() TO postgres WITH GRANT OPTION;

GRANT EXECUTE ON FUNCTION extensions.pgrst_drop_watch() TO supabase_admin;

GRANT EXECUTE ON FUNCTION extensions.set_graphql_placeholder() TO PUBLIC;

GRANT EXECUTE ON FUNCTION extensions.set_graphql_placeholder() TO postgres WITH GRANT OPTION;

GRANT EXECUTE ON FUNCTION extensions.set_graphql_placeholder() TO supabase_admin;

GRANT EXECUTE ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO PUBLIC;

GRANT EXECUTE ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO anon;

GRANT EXECUTE ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO authenticated;

GRANT EXECUTE ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO postgres;

GRANT EXECUTE ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO supabase_admin;

GRANT EXECUTE ON FUNCTION pgbouncer.get_auth(p_usename text) TO pgbouncer;

GRANT EXECUTE ON FUNCTION pgbouncer.get_auth(p_usename text) TO supabase_admin;

GRANT EXECUTE ON FUNCTION public.accept_gig_application_safely(p_application_id uuid, p_actor_user_id uuid, p_new_status text) TO postgres;

GRANT EXECUTE ON FUNCTION public.accept_gig_application_safely(p_application_id uuid, p_actor_user_id uuid, p_new_status text) TO service_role;

GRANT EXECUTE ON FUNCTION public.accept_leadership_transfer(request_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.accept_leadership_transfer(request_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.accept_leadership_transfer(request_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.accept_leadership_transfer(request_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.accept_leadership_transfer(request_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.admin_audit_feed(p_limit integer, p_offset integer) TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_audit_feed(p_limit integer, p_offset integer) TO postgres;

GRANT EXECUTE ON FUNCTION public.admin_audit_feed(p_limit integer, p_offset integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.admin_fetch_booking_incidents(p_status_filter text, p_limit integer) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_fetch_booking_incidents(p_status_filter text, p_limit integer) TO anon;

GRANT EXECUTE ON FUNCTION public.admin_fetch_booking_incidents(p_status_filter text, p_limit integer) TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_fetch_booking_incidents(p_status_filter text, p_limit integer) TO postgres;

GRANT EXECUTE ON FUNCTION public.admin_fetch_booking_incidents(p_status_filter text, p_limit integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.admin_resolve_booking_incident(p_incident_id uuid, p_resolution text, p_admin_notes text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_resolve_booking_incident(p_incident_id uuid, p_resolution text, p_admin_notes text) TO anon;

GRANT EXECUTE ON FUNCTION public.admin_resolve_booking_incident(p_incident_id uuid, p_resolution text, p_admin_notes text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_resolve_booking_incident(p_incident_id uuid, p_resolution text, p_admin_notes text) TO postgres;

GRANT EXECUTE ON FUNCTION public.admin_resolve_booking_incident(p_incident_id uuid, p_resolution text, p_admin_notes text) TO service_role;

GRANT EXECUTE ON FUNCTION public.apply_booking_penalty(p_booking_id uuid, p_penalty_type text, p_notes text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.apply_booking_penalty(p_booking_id uuid, p_penalty_type text, p_notes text) TO anon;

GRANT EXECUTE ON FUNCTION public.apply_booking_penalty(p_booking_id uuid, p_penalty_type text, p_notes text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.apply_booking_penalty(p_booking_id uuid, p_penalty_type text, p_notes text) TO postgres;

GRANT EXECUTE ON FUNCTION public.apply_booking_penalty(p_booking_id uuid, p_penalty_type text, p_notes text) TO service_role;

GRANT EXECUTE ON FUNCTION public.apply_studio_promotion(p_studio_id uuid, p_booking_date date, p_session_type text, p_base_price numeric, p_hours numeric) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.apply_studio_promotion(p_studio_id uuid, p_booking_date date, p_session_type text, p_base_price numeric, p_hours numeric) TO anon;

GRANT EXECUTE ON FUNCTION public.apply_studio_promotion(p_studio_id uuid, p_booking_date date, p_session_type text, p_base_price numeric, p_hours numeric) TO authenticated;

GRANT EXECUTE ON FUNCTION public.apply_studio_promotion(p_studio_id uuid, p_booking_date date, p_session_type text, p_base_price numeric, p_hours numeric) TO postgres;

GRANT EXECUTE ON FUNCTION public.apply_studio_promotion(p_studio_id uuid, p_booking_date date, p_session_type text, p_base_price numeric, p_hours numeric) TO service_role;

GRANT EXECUTE ON FUNCTION public.are_slots_available(p_studio_id uuid, p_booking_date date, p_time_slots jsonb, p_user_id uuid, p_exclude_booking_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.are_slots_available(p_studio_id uuid, p_booking_date date, p_time_slots jsonb, p_user_id uuid, p_exclude_booking_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.are_slots_available(p_studio_id uuid, p_booking_date date, p_time_slots jsonb, p_user_id uuid, p_exclude_booking_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.are_slots_available(p_studio_id uuid, p_booking_date date, p_time_slots jsonb, p_user_id uuid, p_exclude_booking_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.are_slots_available(p_studio_id uuid, p_booking_date date, p_time_slots jsonb, p_user_id uuid, p_exclude_booking_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.audit_capture_row_change() TO postgres;

GRANT EXECUTE ON FUNCTION public.audit_capture_row_change() TO service_role;

GRANT EXECUTE ON FUNCTION public.audit_current_actor_id() TO postgres;

GRANT EXECUTE ON FUNCTION public.audit_current_actor_id() TO service_role;

GRANT EXECUTE ON FUNCTION public.audit_current_actor_role() TO postgres;

GRANT EXECUTE ON FUNCTION public.audit_current_actor_role() TO service_role;

GRANT EXECUTE ON FUNCTION public.audit_current_source() TO postgres;

GRANT EXECUTE ON FUNCTION public.audit_current_source() TO service_role;

GRANT EXECUTE ON FUNCTION public.audit_entity_label(p_table text, p_row jsonb) TO postgres;

GRANT EXECUTE ON FUNCTION public.audit_entity_label(p_table text, p_row jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION public.audit_redact_row(p_row jsonb) TO postgres;

GRANT EXECUTE ON FUNCTION public.audit_redact_row(p_row jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION public.audit_row_id(p_row jsonb) TO postgres;

GRANT EXECUTE ON FUNCTION public.audit_row_id(p_row jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION public.audit_semantic_action(p_table text, p_old jsonb, p_new jsonb, p_operation text) TO postgres;

GRANT EXECUTE ON FUNCTION public.audit_semantic_action(p_table text, p_old jsonb, p_new jsonb, p_operation text) TO service_role;

GRANT EXECUTE ON FUNCTION public.audit_text_value(p_value jsonb) TO postgres;

GRANT EXECUTE ON FUNCTION public.audit_text_value(p_value jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION public.audit_uuid_from_row(p_row jsonb, p_keys text[]) TO postgres;

GRANT EXECUTE ON FUNCTION public.audit_uuid_from_row(p_row jsonb, p_keys text[]) TO service_role;

GRANT EXECUTE ON FUNCTION public.auto_add_group_owner_to_members() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.auto_add_group_owner_to_members() TO anon;

GRANT EXECUTE ON FUNCTION public.auto_add_group_owner_to_members() TO authenticated;

GRANT EXECUTE ON FUNCTION public.auto_add_group_owner_to_members() TO postgres;

GRANT EXECUTE ON FUNCTION public.auto_add_group_owner_to_members() TO service_role;

GRANT EXECUTE ON FUNCTION public.build_production_roster_snapshot(p_roster_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.build_production_roster_snapshot(p_roster_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.calculate_booking_cancellation_penalty(p_booking_id uuid, p_cancellation_time timestamp with time zone) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.calculate_booking_cancellation_penalty(p_booking_id uuid, p_cancellation_time timestamp with time zone) TO anon;

GRANT EXECUTE ON FUNCTION public.calculate_booking_cancellation_penalty(p_booking_id uuid, p_cancellation_time timestamp with time zone) TO authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_booking_cancellation_penalty(p_booking_id uuid, p_cancellation_time timestamp with time zone) TO postgres;

GRANT EXECUTE ON FUNCTION public.calculate_booking_cancellation_penalty(p_booking_id uuid, p_cancellation_time timestamp with time zone) TO service_role;

GRANT EXECUTE ON FUNCTION public.calculate_booking_cost(p_studio_id uuid, p_start_time time without time zone, p_end_time time without time zone) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.calculate_booking_cost(p_studio_id uuid, p_start_time time without time zone, p_end_time time without time zone) TO anon;

GRANT EXECUTE ON FUNCTION public.calculate_booking_cost(p_studio_id uuid, p_start_time time without time zone, p_end_time time without time zone) TO authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_booking_cost(p_studio_id uuid, p_start_time time without time zone, p_end_time time without time zone) TO postgres;

GRANT EXECUTE ON FUNCTION public.calculate_booking_cost(p_studio_id uuid, p_start_time time without time zone, p_end_time time without time zone) TO service_role;

GRANT EXECUTE ON FUNCTION public.calculate_booking_price(p_studio_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_total_cart_hours numeric) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.calculate_booking_price(p_studio_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_total_cart_hours numeric) TO anon;

GRANT EXECUTE ON FUNCTION public.calculate_booking_price(p_studio_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_total_cart_hours numeric) TO authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_booking_price(p_studio_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_total_cart_hours numeric) TO postgres;

GRANT EXECUTE ON FUNCTION public.calculate_booking_price(p_studio_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_total_cart_hours numeric) TO service_role;

GRANT EXECUTE ON FUNCTION public.calculate_multi_slot_price(p_studio_id uuid, p_booking_date date, p_time_slots jsonb) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.calculate_multi_slot_price(p_studio_id uuid, p_booking_date date, p_time_slots jsonb) TO anon;

GRANT EXECUTE ON FUNCTION public.calculate_multi_slot_price(p_studio_id uuid, p_booking_date date, p_time_slots jsonb) TO authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_multi_slot_price(p_studio_id uuid, p_booking_date date, p_time_slots jsonb) TO postgres;

GRANT EXECUTE ON FUNCTION public.calculate_multi_slot_price(p_studio_id uuid, p_booking_date date, p_time_slots jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION public.can_manage_production_team_members(target_team_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.can_manage_production_team_members(target_team_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.can_manage_production_team_members(target_team_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.can_manage_production_team_members(target_team_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.can_musician_reapply(p_gig_id uuid, p_applicant_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_musician_reapply(p_gig_id uuid, p_applicant_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.can_musician_reapply(p_gig_id uuid, p_applicant_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.can_musician_reapply(p_gig_id uuid, p_applicant_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.can_musician_reapply(p_gig_id uuid, p_applicant_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.can_view_gig_application_readonly_participant(p_application_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.can_view_gig_application_readonly_participant(p_application_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.can_view_gig_application_readonly_participant(p_application_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.can_view_gig_application_readonly_participant(p_application_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.cancel_leadership_transfer(request_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.cancel_leadership_transfer(request_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.cancel_leadership_transfer(request_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_leadership_transfer(request_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.cancel_leadership_transfer(request_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.check_verification_session(p_session_ref text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.check_verification_session(p_session_ref text) TO anon;

GRANT EXECUTE ON FUNCTION public.check_verification_session(p_session_ref text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.check_verification_session(p_session_ref text) TO postgres;

GRANT EXECUTE ON FUNCTION public.check_verification_session(p_session_ref text) TO service_role;

GRANT EXECUTE ON FUNCTION public.claim_identity_document_approval(p_user_id uuid, p_role text, p_document_fingerprint text, p_normalized_email text, p_document_type text, p_document_type_key text, p_document_country text, p_source text, p_didit_session_id text, p_manual_review_id uuid, p_claim_metadata jsonb, p_duplicate_override boolean) TO postgres;

GRANT EXECUTE ON FUNCTION public.claim_identity_document_approval(p_user_id uuid, p_role text, p_document_fingerprint text, p_normalized_email text, p_document_type text, p_document_type_key text, p_document_country text, p_source text, p_didit_session_id text, p_manual_review_id uuid, p_claim_metadata jsonb, p_duplicate_override boolean) TO service_role;

GRANT EXECUTE ON FUNCTION public.claim_identity_document_approval_v2(p_user_id uuid, p_role text, p_document_fingerprint text, p_normalized_email text, p_document_type text, p_document_type_key text, p_document_country text, p_full_legal_name text, p_normalized_full_legal_name text, p_birth_date date, p_source text, p_didit_session_id text, p_manual_review_id uuid, p_claim_metadata jsonb, p_duplicate_override boolean) TO postgres;

GRANT EXECUTE ON FUNCTION public.claim_identity_document_approval_v2(p_user_id uuid, p_role text, p_document_fingerprint text, p_normalized_email text, p_document_type text, p_document_type_key text, p_document_country text, p_full_legal_name text, p_normalized_full_legal_name text, p_birth_date date, p_source text, p_didit_session_id text, p_manual_review_id uuid, p_claim_metadata jsonb, p_duplicate_override boolean) TO service_role;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_holds() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_holds() TO anon;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_holds() TO authenticated;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_holds() TO postgres;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_holds() TO service_role;

GRANT EXECUTE ON FUNCTION public.contract_3nf_preflight() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.contract_3nf_preflight() TO anon;

GRANT EXECUTE ON FUNCTION public.contract_3nf_preflight() TO authenticated;

GRANT EXECUTE ON FUNCTION public.contract_3nf_preflight() TO postgres;

GRANT EXECUTE ON FUNCTION public.contract_3nf_preflight() TO service_role;

GRANT EXECUTE ON FUNCTION public.contract_3nf_ready() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.contract_3nf_ready() TO anon;

GRANT EXECUTE ON FUNCTION public.contract_3nf_ready() TO authenticated;

GRANT EXECUTE ON FUNCTION public.contract_3nf_ready() TO postgres;

GRANT EXECUTE ON FUNCTION public.contract_3nf_ready() TO service_role;

GRANT EXECUTE ON FUNCTION public.create_group_conversation(p_group_id uuid, p_creator_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_group_conversation(p_group_id uuid, p_creator_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.create_group_conversation(p_group_id uuid, p_creator_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_group_conversation(p_group_id uuid, p_creator_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.create_group_conversation(p_group_id uuid, p_creator_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.decline_leadership_transfer(request_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.decline_leadership_transfer(request_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.decline_leadership_transfer(request_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.decline_leadership_transfer(request_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.decline_leadership_transfer(request_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.delete_gig_safely(p_gig_id uuid, p_reason text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.delete_gig_safely(p_gig_id uuid, p_reason text) TO anon;

GRANT EXECUTE ON FUNCTION public.delete_gig_safely(p_gig_id uuid, p_reason text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.delete_gig_safely(p_gig_id uuid, p_reason text) TO postgres;

GRANT EXECUTE ON FUNCTION public.delete_gig_safely(p_gig_id uuid, p_reason text) TO service_role;

GRANT EXECUTE ON FUNCTION public.delete_group_safely(p_group_id uuid, p_reason text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.delete_group_safely(p_group_id uuid, p_reason text) TO anon;

GRANT EXECUTE ON FUNCTION public.delete_group_safely(p_group_id uuid, p_reason text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.delete_group_safely(p_group_id uuid, p_reason text) TO postgres;

GRANT EXECUTE ON FUNCTION public.delete_group_safely(p_group_id uuid, p_reason text) TO service_role;

GRANT EXECUTE ON FUNCTION public.delete_studio_safely(p_studio_id uuid, p_reason text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.delete_studio_safely(p_studio_id uuid, p_reason text) TO anon;

GRANT EXECUTE ON FUNCTION public.delete_studio_safely(p_studio_id uuid, p_reason text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.delete_studio_safely(p_studio_id uuid, p_reason text) TO postgres;

GRANT EXECUTE ON FUNCTION public.delete_studio_safely(p_studio_id uuid, p_reason text) TO service_role;

GRANT EXECUTE ON FUNCTION public.dismiss_reports_for_deleted_target() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.dismiss_reports_for_deleted_target() TO anon;

GRANT EXECUTE ON FUNCTION public.dismiss_reports_for_deleted_target() TO authenticated;

GRANT EXECUTE ON FUNCTION public.dismiss_reports_for_deleted_target() TO postgres;

GRANT EXECUTE ON FUNCTION public.dismiss_reports_for_deleted_target() TO service_role;

GRANT EXECUTE ON FUNCTION public.dispatch_push_notification_on_insert() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.dispatch_push_notification_on_insert() TO anon;

GRANT EXECUTE ON FUNCTION public.dispatch_push_notification_on_insert() TO authenticated;

GRANT EXECUTE ON FUNCTION public.dispatch_push_notification_on_insert() TO postgres;

GRANT EXECUTE ON FUNCTION public.dispatch_push_notification_on_insert() TO service_role;

GRANT EXECUTE ON FUNCTION public.drain_legacy_3nf(p_batch_size integer) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.drain_legacy_3nf(p_batch_size integer) TO anon;

GRANT EXECUTE ON FUNCTION public.drain_legacy_3nf(p_batch_size integer) TO authenticated;

GRANT EXECUTE ON FUNCTION public.drain_legacy_3nf(p_batch_size integer) TO postgres;

GRANT EXECUTE ON FUNCTION public.drain_legacy_3nf(p_batch_size integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.enforce_single_permit_resubmission() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.enforce_single_permit_resubmission() TO anon;

GRANT EXECUTE ON FUNCTION public.enforce_single_permit_resubmission() TO authenticated;

GRANT EXECUTE ON FUNCTION public.enforce_single_permit_resubmission() TO postgres;

GRANT EXECUTE ON FUNCTION public.enforce_single_permit_resubmission() TO service_role;

GRANT EXECUTE ON FUNCTION public.expire_stale_invites() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.expire_stale_invites() TO anon;

GRANT EXECUTE ON FUNCTION public.expire_stale_invites() TO authenticated;

GRANT EXECUTE ON FUNCTION public.expire_stale_invites() TO postgres;

GRANT EXECUTE ON FUNCTION public.expire_stale_invites() TO service_role;

GRANT EXECUTE ON FUNCTION public.expire_unresolved_studio_payments(p_threshold_minutes integer) TO postgres;

GRANT EXECUTE ON FUNCTION public.expire_unresolved_studio_payments(p_threshold_minutes integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_ai_recommendations(p_user_id uuid, p_limit integer) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_ai_recommendations(p_user_id uuid, p_limit integer) TO anon;

GRANT EXECUTE ON FUNCTION public.get_ai_recommendations(p_user_id uuid, p_limit integer) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_ai_recommendations(p_user_id uuid, p_limit integer) TO postgres;

GRANT EXECUTE ON FUNCTION public.get_ai_recommendations(p_user_id uuid, p_limit integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_entity_rating(entity_type text, entity_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_entity_rating(entity_type text, entity_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.get_entity_rating(entity_type text, entity_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_entity_rating(entity_type text, entity_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.get_entity_rating(entity_type text, entity_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.gig_has_available_slots(p_gig_id uuid, p_slot_type text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.gig_has_available_slots(p_gig_id uuid, p_slot_type text) TO anon;

GRANT EXECUTE ON FUNCTION public.gig_has_available_slots(p_gig_id uuid, p_slot_type text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.gig_has_available_slots(p_gig_id uuid, p_slot_type text) TO postgres;

GRANT EXECUTE ON FUNCTION public.gig_has_available_slots(p_gig_id uuid, p_slot_type text) TO service_role;

GRANT EXECUTE ON FUNCTION public.guard_profile_sensitive_client_writes() TO postgres;

GRANT EXECUTE ON FUNCTION public.guard_profile_sensitive_client_writes() TO service_role;

GRANT EXECUTE ON FUNCTION public.hold_booking_payout(p_booking_id uuid, p_reason text, p_reverse_existing boolean) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.hold_booking_payout(p_booking_id uuid, p_reason text, p_reverse_existing boolean) TO anon;

GRANT EXECUTE ON FUNCTION public.hold_booking_payout(p_booking_id uuid, p_reason text, p_reverse_existing boolean) TO authenticated;

GRANT EXECUTE ON FUNCTION public.hold_booking_payout(p_booking_id uuid, p_reason text, p_reverse_existing boolean) TO postgres;

GRANT EXECUTE ON FUNCTION public.hold_booking_payout(p_booking_id uuid, p_reason text, p_reverse_existing boolean) TO service_role;

GRANT EXECUTE ON FUNCTION public.increment_post_share_count(p_post_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.increment_post_share_count(p_post_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.increment_post_share_count(p_post_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.increment_post_share_count(p_post_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.is_admin() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin() TO postgres;

GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;

GRANT EXECUTE ON FUNCTION public.is_admin(user_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_admin(user_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.is_admin(user_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin(user_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.is_admin(user_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.is_conversation_admin(conv_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_conversation_admin(conv_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.is_conversation_admin(conv_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_conversation_admin(conv_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.is_conversation_admin(conv_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.is_conversation_member(conv_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_conversation_member(conv_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.is_conversation_member(conv_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_conversation_member(conv_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.is_conversation_member(conv_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.is_slot_available(p_studio_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_user_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_slot_available(p_studio_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_user_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.is_slot_available(p_studio_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_user_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_slot_available(p_studio_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_user_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.is_slot_available(p_studio_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_user_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.link_verification_session(p_session_ref text, p_user_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.link_verification_session(p_session_ref text, p_user_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.link_verification_session(p_session_ref text, p_user_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.link_verification_session(p_session_ref text, p_user_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.link_verification_session(p_session_ref text, p_user_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.match_listings(query_embedding vector, match_threshold double precision, match_count integer, listing_type text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.match_listings(query_embedding vector, match_threshold double precision, match_count integer, listing_type text) TO anon;

GRANT EXECUTE ON FUNCTION public.match_listings(query_embedding vector, match_threshold double precision, match_count integer, listing_type text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.match_listings(query_embedding vector, match_threshold double precision, match_count integer, listing_type text) TO postgres;

GRANT EXECUTE ON FUNCTION public.match_listings(query_embedding vector, match_threshold double precision, match_count integer, listing_type text) TO service_role;

GRANT EXECUTE ON FUNCTION public.migration_duplicate_check() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.migration_duplicate_check() TO anon;

GRANT EXECUTE ON FUNCTION public.migration_duplicate_check() TO authenticated;

GRANT EXECUTE ON FUNCTION public.migration_duplicate_check() TO postgres;

GRANT EXECUTE ON FUNCTION public.migration_duplicate_check() TO service_role;

GRANT EXECUTE ON FUNCTION public.migration_row_count_parity() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.migration_row_count_parity() TO anon;

GRANT EXECUTE ON FUNCTION public.migration_row_count_parity() TO authenticated;

GRANT EXECUTE ON FUNCTION public.migration_row_count_parity() TO postgres;

GRANT EXECUTE ON FUNCTION public.migration_row_count_parity() TO service_role;

GRANT EXECUTE ON FUNCTION public.normalize_identity_full_legal_name(p_value text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.normalize_identity_full_legal_name(p_value text) TO anon;

GRANT EXECUTE ON FUNCTION public.normalize_identity_full_legal_name(p_value text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.normalize_identity_full_legal_name(p_value text) TO postgres;

GRANT EXECUTE ON FUNCTION public.normalize_identity_full_legal_name(p_value text) TO service_role;

GRANT EXECUTE ON FUNCTION public.normalize_report_target_type(raw_target_type text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.normalize_report_target_type(raw_target_type text) TO anon;

GRANT EXECUTE ON FUNCTION public.normalize_report_target_type(raw_target_type text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.normalize_report_target_type(raw_target_type text) TO postgres;

GRANT EXECUTE ON FUNCTION public.normalize_report_target_type(raw_target_type text) TO service_role;

GRANT EXECUTE ON FUNCTION public.notify_booking_attendance_event() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.notify_booking_attendance_event() TO anon;

GRANT EXECUTE ON FUNCTION public.notify_booking_attendance_event() TO authenticated;

GRANT EXECUTE ON FUNCTION public.notify_booking_attendance_event() TO postgres;

GRANT EXECUTE ON FUNCTION public.notify_booking_attendance_event() TO service_role;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_feed_post_created() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_feed_post_created() TO anon;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_feed_post_created() TO authenticated;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_feed_post_created() TO postgres;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_feed_post_created() TO service_role;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_gig_published() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_gig_published() TO anon;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_gig_published() TO authenticated;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_gig_published() TO postgres;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_gig_published() TO service_role;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_group_created() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_group_created() TO anon;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_group_created() TO authenticated;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_group_created() TO postgres;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_group_created() TO service_role;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_production_team_created() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_production_team_created() TO anon;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_production_team_created() TO authenticated;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_production_team_created() TO postgres;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_production_team_created() TO service_role;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_studio_published() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_studio_published() TO anon;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_studio_published() TO authenticated;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_studio_published() TO postgres;

GRANT EXECUTE ON FUNCTION public.notify_followers_on_studio_published() TO service_role;

GRANT EXECUTE ON FUNCTION public.notify_profile_followers(p_actor_id uuid, p_type text, p_title text, p_message text, p_image text, p_meta jsonb) TO anon;

GRANT EXECUTE ON FUNCTION public.notify_profile_followers(p_actor_id uuid, p_type text, p_title text, p_message text, p_image text, p_meta jsonb) TO authenticated;

GRANT EXECUTE ON FUNCTION public.notify_profile_followers(p_actor_id uuid, p_type text, p_title text, p_message text, p_image text, p_meta jsonb) TO postgres;

GRANT EXECUTE ON FUNCTION public.notify_profile_followers(p_actor_id uuid, p_type text, p_title text, p_message text, p_image text, p_meta jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION public.prevent_repeated_gig_application_cancellations() TO postgres;

GRANT EXECUTE ON FUNCTION public.prevent_repeated_gig_application_cancellations() TO service_role;

GRANT EXECUTE ON FUNCTION public.prevent_withdrawal_snapshot_mutation() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.prevent_withdrawal_snapshot_mutation() TO anon;

GRANT EXECUTE ON FUNCTION public.prevent_withdrawal_snapshot_mutation() TO authenticated;

GRANT EXECUTE ON FUNCTION public.prevent_withdrawal_snapshot_mutation() TO postgres;

GRANT EXECUTE ON FUNCTION public.prevent_withdrawal_snapshot_mutation() TO service_role;

GRANT EXECUTE ON FUNCTION public.process_booking_auto_complete() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.process_booking_auto_complete() TO anon;

GRANT EXECUTE ON FUNCTION public.process_booking_auto_complete() TO authenticated;

GRANT EXECUTE ON FUNCTION public.process_booking_auto_complete() TO postgres;

GRANT EXECUTE ON FUNCTION public.process_booking_auto_complete() TO service_role;

GRANT EXECUTE ON FUNCTION public.process_booking_auto_start() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.process_booking_auto_start() TO anon;

GRANT EXECUTE ON FUNCTION public.process_booking_auto_start() TO authenticated;

GRANT EXECUTE ON FUNCTION public.process_booking_auto_start() TO postgres;

GRANT EXECUTE ON FUNCTION public.process_booking_auto_start() TO service_role;

GRANT EXECUTE ON FUNCTION public.process_expired_pending_relocations() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.process_expired_pending_relocations() TO anon;

GRANT EXECUTE ON FUNCTION public.process_expired_pending_relocations() TO authenticated;

GRANT EXECUTE ON FUNCTION public.process_expired_pending_relocations() TO postgres;

GRANT EXECUTE ON FUNCTION public.process_expired_pending_relocations() TO service_role;

GRANT EXECUTE ON FUNCTION public.process_mock_withdrawal(p_user_id uuid, p_payout_method_id uuid, p_amount numeric) TO postgres;

GRANT EXECUTE ON FUNCTION public.process_mock_withdrawal(p_user_id uuid, p_payout_method_id uuid, p_amount numeric) TO service_role;

GRANT EXECUTE ON FUNCTION public.process_overdue_booking_incidents() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.process_overdue_booking_incidents() TO anon;

GRANT EXECUTE ON FUNCTION public.process_overdue_booking_incidents() TO authenticated;

GRANT EXECUTE ON FUNCTION public.process_overdue_booking_incidents() TO postgres;

GRANT EXECUTE ON FUNCTION public.process_overdue_booking_incidents() TO service_role;

GRANT EXECUTE ON FUNCTION public.process_release_eligible_booking_payouts() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.process_release_eligible_booking_payouts() TO anon;

GRANT EXECUTE ON FUNCTION public.process_release_eligible_booking_payouts() TO authenticated;

GRANT EXECUTE ON FUNCTION public.process_release_eligible_booking_payouts() TO postgres;

GRANT EXECUTE ON FUNCTION public.process_release_eligible_booking_payouts() TO service_role;

GRANT EXECUTE ON FUNCTION public.process_withdrawal_balance() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.process_withdrawal_balance() TO anon;

GRANT EXECUTE ON FUNCTION public.process_withdrawal_balance() TO authenticated;

GRANT EXECUTE ON FUNCTION public.process_withdrawal_balance() TO postgres;

GRANT EXECUTE ON FUNCTION public.process_withdrawal_balance() TO service_role;

GRANT EXECUTE ON FUNCTION public.record_booking_attendance(p_booking_id uuid, p_event_type text, p_notes text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_booking_attendance(p_booking_id uuid, p_event_type text, p_notes text) TO anon;

GRANT EXECUTE ON FUNCTION public.record_booking_attendance(p_booking_id uuid, p_event_type text, p_notes text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.record_booking_attendance(p_booking_id uuid, p_event_type text, p_notes text) TO postgres;

GRANT EXECUTE ON FUNCTION public.record_booking_attendance(p_booking_id uuid, p_event_type text, p_notes text) TO service_role;

GRANT EXECUTE ON FUNCTION public.register_push_device(p_installation_id text, p_push_token text, p_platform text, p_device_name text, p_app_version text, p_project_id text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.register_push_device(p_installation_id text, p_push_token text, p_platform text, p_device_name text, p_app_version text, p_project_id text) TO anon;

GRANT EXECUTE ON FUNCTION public.register_push_device(p_installation_id text, p_push_token text, p_platform text, p_device_name text, p_app_version text, p_project_id text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.register_push_device(p_installation_id text, p_push_token text, p_platform text, p_device_name text, p_app_version text, p_project_id text) TO postgres;

GRANT EXECUTE ON FUNCTION public.register_push_device(p_installation_id text, p_push_token text, p_platform text, p_device_name text, p_app_version text, p_project_id text) TO service_role;

GRANT EXECUTE ON FUNCTION public.release_booking_payout(p_booking_id uuid, p_reason text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.release_booking_payout(p_booking_id uuid, p_reason text) TO anon;

GRANT EXECUTE ON FUNCTION public.release_booking_payout(p_booking_id uuid, p_reason text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.release_booking_payout(p_booking_id uuid, p_reason text) TO postgres;

GRANT EXECUTE ON FUNCTION public.release_booking_payout(p_booking_id uuid, p_reason text) TO service_role;

GRANT EXECUTE ON FUNCTION public.send_verification_email(p_email text, p_name text, p_subject text, p_html text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.send_verification_email(p_email text, p_name text, p_subject text, p_html text) TO anon;

GRANT EXECUTE ON FUNCTION public.send_verification_email(p_email text, p_name text, p_subject text, p_html text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.send_verification_email(p_email text, p_name text, p_subject text, p_html text) TO postgres;

GRANT EXECUTE ON FUNCTION public.send_verification_email(p_email text, p_name text, p_subject text, p_html text) TO service_role;

GRANT EXECUTE ON FUNCTION public.set_audit_context(p_actor_user_id uuid, p_source text, p_actor_role text) TO postgres;

GRANT EXECUTE ON FUNCTION public.set_audit_context(p_actor_user_id uuid, p_source text, p_actor_role text) TO service_role;

GRANT EXECUTE ON FUNCTION public.set_conversation_mute(p_conversation_id uuid, p_muted boolean, p_muted_until timestamp with time zone) TO anon;

GRANT EXECUTE ON FUNCTION public.set_conversation_mute(p_conversation_id uuid, p_muted boolean, p_muted_until timestamp with time zone) TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_conversation_mute(p_conversation_id uuid, p_muted boolean, p_muted_until timestamp with time zone) TO postgres;

GRANT EXECUTE ON FUNCTION public.set_conversation_mute(p_conversation_id uuid, p_muted boolean, p_muted_until timestamp with time zone) TO service_role;

GRANT EXECUTE ON FUNCTION public.set_gig_application_performer_snapshot() TO postgres;

GRANT EXECUTE ON FUNCTION public.set_gig_application_performer_snapshot() TO service_role;

GRANT EXECUTE ON FUNCTION public.set_gig_applications_updated_at() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_gig_applications_updated_at() TO anon;

GRANT EXECUTE ON FUNCTION public.set_gig_applications_updated_at() TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_gig_applications_updated_at() TO postgres;

GRANT EXECUTE ON FUNCTION public.set_gig_applications_updated_at() TO service_role;

GRANT EXECUTE ON FUNCTION public.set_identity_name_birthdate_normalized() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_identity_name_birthdate_normalized() TO anon;

GRANT EXECUTE ON FUNCTION public.set_identity_name_birthdate_normalized() TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_identity_name_birthdate_normalized() TO postgres;

GRANT EXECUTE ON FUNCTION public.set_identity_name_birthdate_normalized() TO service_role;

GRANT EXECUTE ON FUNCTION public.set_manual_identity_reviews_updated_at() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_manual_identity_reviews_updated_at() TO anon;

GRANT EXECUTE ON FUNCTION public.set_manual_identity_reviews_updated_at() TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_manual_identity_reviews_updated_at() TO postgres;

GRANT EXECUTE ON FUNCTION public.set_manual_identity_reviews_updated_at() TO service_role;

GRANT EXECUTE ON FUNCTION public.set_notification_preferences_updated_at() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_notification_preferences_updated_at() TO anon;

GRANT EXECUTE ON FUNCTION public.set_notification_preferences_updated_at() TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_notification_preferences_updated_at() TO postgres;

GRANT EXECUTE ON FUNCTION public.set_notification_preferences_updated_at() TO service_role;

GRANT EXECUTE ON FUNCTION public.set_updated_at() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_updated_at() TO anon;

GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_updated_at() TO postgres;

GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;

GRANT EXECUTE ON FUNCTION public.set_updated_at_booking_incidents() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_updated_at_booking_incidents() TO anon;

GRANT EXECUTE ON FUNCTION public.set_updated_at_booking_incidents() TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_updated_at_booking_incidents() TO postgres;

GRANT EXECUTE ON FUNCTION public.set_updated_at_booking_incidents() TO service_role;

GRANT EXECUTE ON FUNCTION public.set_updated_at_studio_promotions() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_updated_at_studio_promotions() TO anon;

GRANT EXECUTE ON FUNCTION public.set_updated_at_studio_promotions() TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_updated_at_studio_promotions() TO postgres;

GRANT EXECUTE ON FUNCTION public.set_updated_at_studio_promotions() TO service_role;

GRANT EXECUTE ON FUNCTION public.sync_didit_profile_after_email_confirmation() TO postgres;

GRANT EXECUTE ON FUNCTION public.sync_didit_profile_after_email_confirmation() TO service_role;

GRANT EXECUTE ON FUNCTION public.sync_gig_3nf(p_gig_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.sync_gig_3nf(p_gig_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.sync_gig_3nf(p_gig_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.sync_gig_3nf(p_gig_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.sync_gig_3nf(p_gig_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.sync_group_3nf(p_group_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.sync_group_3nf(p_group_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.sync_group_3nf(p_group_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.sync_group_3nf(p_group_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.sync_group_3nf(p_group_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.sync_group_conversation_members() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.sync_group_conversation_members() TO anon;

GRANT EXECUTE ON FUNCTION public.sync_group_conversation_members() TO authenticated;

GRANT EXECUTE ON FUNCTION public.sync_group_conversation_members() TO postgres;

GRANT EXECUTE ON FUNCTION public.sync_group_conversation_members() TO service_role;

GRANT EXECUTE ON FUNCTION public.sync_profile_3nf(p_profile_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.sync_profile_3nf(p_profile_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.sync_profile_3nf(p_profile_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.sync_profile_3nf(p_profile_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.sync_profile_3nf(p_profile_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.sync_studio_3nf(p_studio_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.sync_studio_3nf(p_studio_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.sync_studio_3nf(p_studio_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.sync_studio_3nf(p_studio_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.sync_studio_3nf(p_studio_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.sync_studio_booking_slots_3nf(p_booking_id uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.sync_studio_booking_slots_3nf(p_booking_id uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.sync_studio_booking_slots_3nf(p_booking_id uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.sync_studio_booking_slots_3nf(p_booking_id uuid) TO postgres;

GRANT EXECUTE ON FUNCTION public.sync_studio_booking_slots_3nf(p_booking_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.trigger_verification_email() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.trigger_verification_email() TO anon;

GRANT EXECUTE ON FUNCTION public.trigger_verification_email() TO authenticated;

GRANT EXECUTE ON FUNCTION public.trigger_verification_email() TO postgres;

GRANT EXECUTE ON FUNCTION public.trigger_verification_email() TO service_role;

GRANT EXECUTE ON FUNCTION public.unregister_push_device(p_installation_id text, p_reason text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.unregister_push_device(p_installation_id text, p_reason text) TO anon;

GRANT EXECUTE ON FUNCTION public.unregister_push_device(p_installation_id text, p_reason text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.unregister_push_device(p_installation_id text, p_reason text) TO postgres;

GRANT EXECUTE ON FUNCTION public.unregister_push_device(p_installation_id text, p_reason text) TO service_role;

GRANT EXECUTE ON FUNCTION public.update_application_rejected_at() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_application_rejected_at() TO anon;

GRANT EXECUTE ON FUNCTION public.update_application_rejected_at() TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_application_rejected_at() TO postgres;

GRANT EXECUTE ON FUNCTION public.update_application_rejected_at() TO service_role;

GRANT EXECUTE ON FUNCTION public.update_conversation_timestamp() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_conversation_timestamp() TO anon;

GRANT EXECUTE ON FUNCTION public.update_conversation_timestamp() TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_conversation_timestamp() TO postgres;

GRANT EXECUTE ON FUNCTION public.update_conversation_timestamp() TO service_role;

GRANT EXECUTE ON FUNCTION public.update_gig_safely(p_gig_id uuid, p_payload jsonb, p_reason text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_gig_safely(p_gig_id uuid, p_payload jsonb, p_reason text) TO anon;

GRANT EXECUTE ON FUNCTION public.update_gig_safely(p_gig_id uuid, p_payload jsonb, p_reason text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_gig_safely(p_gig_id uuid, p_payload jsonb, p_reason text) TO postgres;

GRANT EXECUTE ON FUNCTION public.update_gig_safely(p_gig_id uuid, p_payload jsonb, p_reason text) TO service_role;

GRANT EXECUTE ON FUNCTION public.update_gig_slot_counts() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_gig_slot_counts() TO anon;

GRANT EXECUTE ON FUNCTION public.update_gig_slot_counts() TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_gig_slot_counts() TO postgres;

GRANT EXECUTE ON FUNCTION public.update_gig_slot_counts() TO service_role;

GRANT EXECUTE ON FUNCTION public.update_playlist_track_count() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_playlist_track_count() TO anon;

GRANT EXECUTE ON FUNCTION public.update_playlist_track_count() TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_playlist_track_count() TO postgres;

GRANT EXECUTE ON FUNCTION public.update_playlist_track_count() TO service_role;

GRANT EXECUTE ON FUNCTION public.update_post_comment_count() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_post_comment_count() TO anon;

GRANT EXECUTE ON FUNCTION public.update_post_comment_count() TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_post_comment_count() TO postgres;

GRANT EXECUTE ON FUNCTION public.update_post_comment_count() TO service_role;

GRANT EXECUTE ON FUNCTION public.update_post_reaction_count() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_post_reaction_count() TO anon;

GRANT EXECUTE ON FUNCTION public.update_post_reaction_count() TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_post_reaction_count() TO postgres;

GRANT EXECUTE ON FUNCTION public.update_post_reaction_count() TO service_role;

GRANT EXECUTE ON FUNCTION public.update_user_interest(p_user_id uuid, p_item_vector vector, p_weight double precision) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_user_interest(p_user_id uuid, p_item_vector vector, p_weight double precision) TO anon;

GRANT EXECUTE ON FUNCTION public.update_user_interest(p_user_id uuid, p_item_vector vector, p_weight double precision) TO authenticated;

GRANT EXECUTE ON FUNCTION public.update_user_interest(p_user_id uuid, p_item_vector vector, p_weight double precision) TO postgres;

GRANT EXECUTE ON FUNCTION public.update_user_interest(p_user_id uuid, p_item_vector vector, p_weight double precision) TO service_role;

GRANT EXECUTE ON FUNCTION public.validate_production_gig_application() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.validate_production_gig_application() TO anon;

GRANT EXECUTE ON FUNCTION public.validate_production_gig_application() TO authenticated;

GRANT EXECUTE ON FUNCTION public.validate_production_gig_application() TO postgres;

GRANT EXECUTE ON FUNCTION public.validate_production_gig_application() TO service_role;

GRANT EXECUTE ON FUNCTION public.validate_report_target_before_write() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.validate_report_target_before_write() TO anon;

GRANT EXECUTE ON FUNCTION public.validate_report_target_before_write() TO authenticated;

GRANT EXECUTE ON FUNCTION public.validate_report_target_before_write() TO postgres;

GRANT EXECUTE ON FUNCTION public.validate_report_target_before_write() TO service_role;

GRANT EXECUTE ON FUNCTION public.validate_time_slots(slots jsonb) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.validate_time_slots(slots jsonb) TO anon;

GRANT EXECUTE ON FUNCTION public.validate_time_slots(slots jsonb) TO authenticated;

GRANT EXECUTE ON FUNCTION public.validate_time_slots(slots jsonb) TO postgres;

GRANT EXECUTE ON FUNCTION public.validate_time_slots(slots jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION realtime."cast"(val text, type_ regtype) TO PUBLIC;

GRANT EXECUTE ON FUNCTION realtime."cast"(val text, type_ regtype) TO anon;

GRANT EXECUTE ON FUNCTION realtime."cast"(val text, type_ regtype) TO authenticated;

GRANT EXECUTE ON FUNCTION realtime."cast"(val text, type_ regtype) TO dashboard_user;

GRANT EXECUTE ON FUNCTION realtime."cast"(val text, type_ regtype) TO postgres;

GRANT EXECUTE ON FUNCTION realtime."cast"(val text, type_ regtype) TO service_role;

GRANT EXECUTE ON FUNCTION realtime."cast"(val text, type_ regtype) TO supabase_admin;

GRANT EXECUTE ON FUNCTION realtime."cast"(val text, type_ regtype) TO supabase_realtime_admin;

GRANT EXECUTE ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO PUBLIC;

GRANT EXECUTE ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO anon;

GRANT EXECUTE ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO authenticated;

GRANT EXECUTE ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO dashboard_user;

GRANT EXECUTE ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO postgres;

GRANT EXECUTE ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO service_role;

GRANT EXECUTE ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO supabase_admin;

GRANT EXECUTE ON FUNCTION realtime.apply_rls(wal jsonb, max_record_bytes integer) TO supabase_realtime_admin;

GRANT EXECUTE ON FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) TO dashboard_user;

GRANT EXECUTE ON FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) TO postgres;

GRANT EXECUTE ON FUNCTION realtime.broadcast_changes(topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text) TO supabase_admin;

GRANT EXECUTE ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO PUBLIC;

GRANT EXECUTE ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO anon;

GRANT EXECUTE ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO authenticated;

GRANT EXECUTE ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO dashboard_user;

GRANT EXECUTE ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO postgres;

GRANT EXECUTE ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO service_role;

GRANT EXECUTE ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO supabase_admin;

GRANT EXECUTE ON FUNCTION realtime.build_prepared_statement_sql(prepared_statement_name text, entity regclass, columns realtime.wal_column[]) TO supabase_realtime_admin;

GRANT EXECUTE ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO anon;

GRANT EXECUTE ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO authenticated;

GRANT EXECUTE ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO dashboard_user;

GRANT EXECUTE ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO postgres;

GRANT EXECUTE ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO service_role;

GRANT EXECUTE ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO supabase_admin;

GRANT EXECUTE ON FUNCTION realtime.check_equality_op(op realtime.equality_op, type_ regtype, val_1 text, val_2 text) TO supabase_realtime_admin;

GRANT EXECUTE ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO PUBLIC;

GRANT EXECUTE ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO anon;

GRANT EXECUTE ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO authenticated;

GRANT EXECUTE ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO dashboard_user;

GRANT EXECUTE ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO postgres;

GRANT EXECUTE ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO service_role;

GRANT EXECUTE ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO supabase_admin;

GRANT EXECUTE ON FUNCTION realtime.is_visible_through_filters(columns realtime.wal_column[], filters realtime.user_defined_filter[]) TO supabase_realtime_admin;

GRANT EXECUTE ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO PUBLIC;

GRANT EXECUTE ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO dashboard_user;

GRANT EXECUTE ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO postgres;

GRANT EXECUTE ON FUNCTION realtime.list_changes(publication name, slot_name name, max_changes integer, max_record_bytes integer) TO supabase_admin;

GRANT EXECUTE ON FUNCTION realtime.quote_wal2json(entity regclass) TO PUBLIC;

GRANT EXECUTE ON FUNCTION realtime.quote_wal2json(entity regclass) TO anon;

GRANT EXECUTE ON FUNCTION realtime.quote_wal2json(entity regclass) TO authenticated;

GRANT EXECUTE ON FUNCTION realtime.quote_wal2json(entity regclass) TO dashboard_user;

GRANT EXECUTE ON FUNCTION realtime.quote_wal2json(entity regclass) TO postgres;

GRANT EXECUTE ON FUNCTION realtime.quote_wal2json(entity regclass) TO service_role;

GRANT EXECUTE ON FUNCTION realtime.quote_wal2json(entity regclass) TO supabase_admin;

GRANT EXECUTE ON FUNCTION realtime.quote_wal2json(entity regclass) TO supabase_realtime_admin;

GRANT EXECUTE ON FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) TO PUBLIC;

GRANT EXECUTE ON FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) TO dashboard_user;

GRANT EXECUTE ON FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) TO postgres;

GRANT EXECUTE ON FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean) TO supabase_admin;

GRANT EXECUTE ON FUNCTION realtime.subscription_check_filters() TO PUBLIC;

GRANT EXECUTE ON FUNCTION realtime.subscription_check_filters() TO anon;

GRANT EXECUTE ON FUNCTION realtime.subscription_check_filters() TO authenticated;

GRANT EXECUTE ON FUNCTION realtime.subscription_check_filters() TO dashboard_user;

GRANT EXECUTE ON FUNCTION realtime.subscription_check_filters() TO postgres;

GRANT EXECUTE ON FUNCTION realtime.subscription_check_filters() TO service_role;

GRANT EXECUTE ON FUNCTION realtime.subscription_check_filters() TO supabase_admin;

GRANT EXECUTE ON FUNCTION realtime.subscription_check_filters() TO supabase_realtime_admin;

GRANT EXECUTE ON FUNCTION realtime.to_regrole(role_name text) TO PUBLIC;

GRANT EXECUTE ON FUNCTION realtime.to_regrole(role_name text) TO anon;

GRANT EXECUTE ON FUNCTION realtime.to_regrole(role_name text) TO authenticated;

GRANT EXECUTE ON FUNCTION realtime.to_regrole(role_name text) TO dashboard_user;

GRANT EXECUTE ON FUNCTION realtime.to_regrole(role_name text) TO postgres;

GRANT EXECUTE ON FUNCTION realtime.to_regrole(role_name text) TO service_role;

GRANT EXECUTE ON FUNCTION realtime.to_regrole(role_name text) TO supabase_admin;

GRANT EXECUTE ON FUNCTION realtime.to_regrole(role_name text) TO supabase_realtime_admin;

GRANT EXECUTE ON FUNCTION realtime.topic() TO PUBLIC;

GRANT EXECUTE ON FUNCTION realtime.topic() TO dashboard_user;

GRANT EXECUTE ON FUNCTION realtime.topic() TO postgres;

GRANT EXECUTE ON FUNCTION realtime.topic() TO supabase_realtime_admin;
