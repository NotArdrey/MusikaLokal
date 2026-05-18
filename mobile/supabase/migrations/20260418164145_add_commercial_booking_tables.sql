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
-- 3. booking_cancellation_policies
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

-- studio_bookings: add cancellation policy references
ALTER TABLE public.studio_bookings
    ADD COLUMN IF NOT EXISTS cancellation_policy_id uuid REFERENCES public.booking_cancellation_policies(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cancellation_policy_snapshot jsonb;

-- wallet_transactions: add reference_type for penalty/refund typing
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
CREATE INDEX IF NOT EXISTS idx_sb_cancellation_policy ON public.studio_bookings(cancellation_policy_id);
CREATE INDEX IF NOT EXISTS idx_bi_penalty_event ON public.booking_incidents(penalty_event_id);


