-- Phase 1 Commercial Booking: New tables + extensions to existing tables

-- ============================================================
-- 1. production_teams
-- ============================================================
CREATE TABLE IF NOT EXISTS public.production_teams (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    logo_url text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT production_teams_pkey PRIMARY KEY (id)
);
ALTER TABLE public.production_teams ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. production_team_members
-- ============================================================
CREATE TABLE IF NOT EXISTS public.production_team_members (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.production_teams(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'member'::text,
    joined_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT production_team_members_pkey PRIMARY KEY (id),
    CONSTRAINT production_team_members_team_id_user_id_key UNIQUE (team_id, user_id)
);
ALTER TABLE public.production_team_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. venue_partnership_deals
-- ============================================================
CREATE TABLE IF NOT EXISTS public.venue_partnership_deals (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    venue_owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    production_team_id uuid NOT NULL REFERENCES public.production_teams(id) ON DELETE CASCADE,
    gig_id uuid REFERENCES public.gigs(id) ON DELETE SET NULL,
    title text NOT NULL,
    status text NOT NULL DEFAULT 'proposed'::text,
    proposed_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    accepted_term_version_id uuid,
    settled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT venue_partnership_deals_pkey PRIMARY KEY (id)
);
ALTER TABLE public.venue_partnership_deals ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. deal_term_versions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.deal_term_versions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    deal_id uuid NOT NULL REFERENCES public.venue_partnership_deals(id) ON DELETE CASCADE,
    version_number integer NOT NULL DEFAULT 1,
    revenue_split_venue_pct numeric NOT NULL,
    revenue_split_production_pct numeric NOT NULL,
    fixed_fee numeric,
    deposit_amount numeric,
    event_date date,
    event_notes text,
    cancellation_notice_days integer,
    cancellation_penalty_pct numeric,
    additional_terms text,
    proposed_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT deal_term_versions_pkey PRIMARY KEY (id),
    CONSTRAINT deal_term_versions_deal_id_version_number_key UNIQUE (deal_id, version_number)
);
ALTER TABLE public.deal_term_versions ENABLE ROW LEVEL SECURITY;

-- Self-referencing FK for accepted_term_version_id (deferred because deal_term_versions hadn't existed yet)
ALTER TABLE public.venue_partnership_deals
    ADD CONSTRAINT venue_partnership_deals_accepted_term_version_id_fkey
    FOREIGN KEY (accepted_term_version_id)
    REFERENCES public.deal_term_versions(id) ON DELETE SET NULL;

-- ============================================================
-- 5. deal_negotiation_events
-- ============================================================
CREATE TABLE IF NOT EXISTS public.deal_negotiation_events (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    deal_id uuid NOT NULL REFERENCES public.venue_partnership_deals(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    term_version_id uuid REFERENCES public.deal_term_versions(id) ON DELETE SET NULL,
    notes text,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT deal_negotiation_events_pkey PRIMARY KEY (id)
);
ALTER TABLE public.deal_negotiation_events ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. studio_recording_deals
-- ============================================================
CREATE TABLE IF NOT EXISTS public.studio_recording_deals (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    studio_id uuid NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    counterparty_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title text NOT NULL,
    status text NOT NULL DEFAULT 'proposed'::text,
    proposed_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    valid_from date,
    valid_until date,
    notes text,
    accepted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT studio_recording_deals_pkey PRIMARY KEY (id)
);
ALTER TABLE public.studio_recording_deals ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. recording_deal_packages
-- ============================================================
CREATE TABLE IF NOT EXISTS public.recording_deal_packages (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    deal_id uuid NOT NULL REFERENCES public.studio_recording_deals(id) ON DELETE CASCADE,
    name text NOT NULL,
    hours_included numeric,
    songs_included integer,
    price numeric NOT NULL,
    max_sessions integer,
    description text,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT recording_deal_packages_pkey PRIMARY KEY (id)
);
ALTER TABLE public.recording_deal_packages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. booking_cancellation_policies
-- ============================================================
CREATE TABLE IF NOT EXISTS public.booking_cancellation_policies (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    studio_id uuid NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
    name text NOT NULL DEFAULT 'Standard Policy'::text,
    full_refund_hours_before integer NOT NULL DEFAULT 48,
    partial_refund_hours_before integer NOT NULL DEFAULT 24,
    partial_refund_pct numeric NOT NULL DEFAULT 50,
    no_show_penalty_pct numeric NOT NULL DEFAULT 100,
    late_cancel_penalty_pct numeric NOT NULL DEFAULT 50,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT booking_cancellation_policies_pkey PRIMARY KEY (id)
);
ALTER TABLE public.booking_cancellation_policies ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 9. booking_penalty_events
-- ============================================================
CREATE TABLE IF NOT EXISTS public.booking_penalty_events (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    booking_id uuid NOT NULL REFERENCES public.studio_bookings(id) ON DELETE CASCADE,
    policy_snapshot jsonb,
    penalty_type text NOT NULL,
    penalty_amount numeric NOT NULL,
    refund_amount numeric NOT NULL DEFAULT 0,
    booking_total numeric NOT NULL,
    penalized_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    beneficiary_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    wallet_transaction_id uuid REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
    refund_transaction_id uuid REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
    notes text,
    created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT booking_penalty_events_pkey PRIMARY KEY (id)
);
ALTER TABLE public.booking_penalty_events ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Extensions to existing tables
-- ============================================================

-- studio_bookings: add deal, package, and cancellation policy references
ALTER TABLE public.studio_bookings
    ADD COLUMN IF NOT EXISTS recording_deal_id uuid REFERENCES public.studio_recording_deals(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS recording_deal_package_id uuid REFERENCES public.recording_deal_packages(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cancellation_policy_id uuid REFERENCES public.booking_cancellation_policies(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cancellation_policy_snapshot jsonb;

-- wallet_transactions: add reference_type for deal/penalty/settlement/refund typing
ALTER TABLE public.wallet_transactions
    ADD COLUMN IF NOT EXISTS reference_type text;

-- booking_incidents: add penalty and settlement-hold linkage
ALTER TABLE public.booking_incidents
    ADD COLUMN IF NOT EXISTS penalty_event_id uuid REFERENCES public.booking_penalty_events(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS settlement_hold boolean NOT NULL DEFAULT false;

-- ============================================================
-- Indexes (every FK + partial indexes for active/open states)
-- ============================================================

-- production_teams
CREATE INDEX IF NOT EXISTS idx_production_teams_owner ON public.production_teams(owner_id);

-- production_team_members
CREATE INDEX IF NOT EXISTS idx_ptm_team ON public.production_team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_ptm_user ON public.production_team_members(user_id);

-- venue_partnership_deals
CREATE INDEX IF NOT EXISTS idx_vpd_venue_owner ON public.venue_partnership_deals(venue_owner_id);
CREATE INDEX IF NOT EXISTS idx_vpd_production_team ON public.venue_partnership_deals(production_team_id);
CREATE INDEX IF NOT EXISTS idx_vpd_proposed_by ON public.venue_partnership_deals(proposed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_vpd_gig ON public.venue_partnership_deals(gig_id);
CREATE INDEX IF NOT EXISTS idx_vpd_status_active ON public.venue_partnership_deals(status) WHERE status IN ('proposed', 'countered', 'accepted');

-- deal_term_versions
CREATE INDEX IF NOT EXISTS idx_dtv_deal ON public.deal_term_versions(deal_id);
CREATE INDEX IF NOT EXISTS idx_dtv_proposed_by ON public.deal_term_versions(proposed_by_user_id);

-- deal_negotiation_events
CREATE INDEX IF NOT EXISTS idx_dne_deal ON public.deal_negotiation_events(deal_id);
CREATE INDEX IF NOT EXISTS idx_dne_actor ON public.deal_negotiation_events(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_dne_term_version ON public.deal_negotiation_events(term_version_id);

-- studio_recording_deals
CREATE INDEX IF NOT EXISTS idx_srd_studio ON public.studio_recording_deals(studio_id);
CREATE INDEX IF NOT EXISTS idx_srd_counterparty ON public.studio_recording_deals(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_srd_proposed_by ON public.studio_recording_deals(proposed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_srd_status_active ON public.studio_recording_deals(status) WHERE status IN ('proposed', 'accepted');

-- recording_deal_packages
CREATE INDEX IF NOT EXISTS idx_rdp_deal ON public.recording_deal_packages(deal_id);

-- booking_cancellation_policies
CREATE INDEX IF NOT EXISTS idx_bcp_studio ON public.booking_cancellation_policies(studio_id);
CREATE INDEX IF NOT EXISTS idx_bcp_studio_active ON public.booking_cancellation_policies(studio_id) WHERE is_active = true;

-- booking_penalty_events
CREATE INDEX IF NOT EXISTS idx_bpe_booking ON public.booking_penalty_events(booking_id);
CREATE INDEX IF NOT EXISTS idx_bpe_penalized ON public.booking_penalty_events(penalized_user_id);
CREATE INDEX IF NOT EXISTS idx_bpe_beneficiary ON public.booking_penalty_events(beneficiary_user_id);
CREATE INDEX IF NOT EXISTS idx_bpe_wallet_tx ON public.booking_penalty_events(wallet_transaction_id);
CREATE INDEX IF NOT EXISTS idx_bpe_refund_tx ON public.booking_penalty_events(refund_transaction_id);

-- Extensions: new FK columns on existing tables
CREATE INDEX IF NOT EXISTS idx_sb_recording_deal ON public.studio_bookings(recording_deal_id);
CREATE INDEX IF NOT EXISTS idx_sb_recording_package ON public.studio_bookings(recording_deal_package_id);
CREATE INDEX IF NOT EXISTS idx_sb_cancellation_policy ON public.studio_bookings(cancellation_policy_id);
CREATE INDEX IF NOT EXISTS idx_bi_penalty_event ON public.booking_incidents(penalty_event_id);
