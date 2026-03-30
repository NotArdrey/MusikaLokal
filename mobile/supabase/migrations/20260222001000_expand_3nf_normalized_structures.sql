BEGIN;

-- ============================================================
-- Phase 1 (Expand): Add normalized structures only.
-- Backward compatible: no legacy column drops, no behavior changes.
-- ============================================================

CREATE TABLE IF NOT EXISTS profile_skills (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  UNIQUE (profile_id, skill)
);

CREATE TABLE IF NOT EXISTS profile_genres (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  genre TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  UNIQUE (profile_id, genre)
);

CREATE TABLE IF NOT EXISTS profile_portfolio_urls (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  portfolio_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  UNIQUE (profile_id, portfolio_url)
);

CREATE INDEX IF NOT EXISTS idx_profile_skills_profile_id ON profile_skills(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_genres_profile_id ON profile_genres(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_portfolio_urls_profile_id ON profile_portfolio_urls(profile_id);

CREATE TABLE IF NOT EXISTS gig_requirements (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  gig_id UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  requirement_key TEXT NOT NULL,
  requirement_value JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  UNIQUE (gig_id, requirement_key)
);

CREATE TABLE IF NOT EXISTS gig_media (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  gig_id UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'document')),
  media_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  UNIQUE (gig_id, media_type, media_url)
);

CREATE TABLE IF NOT EXISTS gig_availability_slots (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  gig_id UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  day_of_week SMALLINT,
  slot_date DATE,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  CHECK (end_time > start_time),
  CHECK ((day_of_week IS NOT NULL AND day_of_week BETWEEN 0 AND 6) OR slot_date IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_gig_requirements_gig_id ON gig_requirements(gig_id);
CREATE INDEX IF NOT EXISTS idx_gig_media_gig_id ON gig_media(gig_id);
CREATE INDEX IF NOT EXISTS idx_gig_availability_slots_gig_id ON gig_availability_slots(gig_id);

CREATE TABLE IF NOT EXISTS studio_amenities (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  amenity TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  UNIQUE (studio_id, amenity)
);

CREATE TABLE IF NOT EXISTS studio_types (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  studio_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  UNIQUE (studio_id, studio_type)
);

CREATE TABLE IF NOT EXISTS studio_media (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('image')),
  media_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  UNIQUE (studio_id, media_type, media_url)
);

CREATE TABLE IF NOT EXISTS studio_instruments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  instrument_name TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  UNIQUE (studio_id, instrument_name, image_url)
);

CREATE TABLE IF NOT EXISTS studio_availability_slots (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  day_of_week SMALLINT,
  slot_date DATE,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_open BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  CHECK (end_time > start_time),
  CHECK ((day_of_week IS NOT NULL AND day_of_week BETWEEN 0 AND 6) OR slot_date IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS studio_open_dates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  open_date DATE NOT NULL,
  is_open BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  UNIQUE (studio_id, open_date)
);

CREATE INDEX IF NOT EXISTS idx_studio_amenities_studio_id ON studio_amenities(studio_id);
CREATE INDEX IF NOT EXISTS idx_studio_types_studio_id ON studio_types(studio_id);
CREATE INDEX IF NOT EXISTS idx_studio_media_studio_id ON studio_media(studio_id);
CREATE INDEX IF NOT EXISTS idx_studio_instruments_studio_id ON studio_instruments(studio_id);
CREATE INDEX IF NOT EXISTS idx_studio_availability_slots_studio_id ON studio_availability_slots(studio_id);
CREATE INDEX IF NOT EXISTS idx_studio_open_dates_studio_id ON studio_open_dates(studio_id);

-- Snapshot payout fields remain optional immutable audit data.
ALTER TABLE IF EXISTS withdrawal_requests
  ALTER COLUMN payout_type DROP NOT NULL,
  ALTER COLUMN payout_account_name DROP NOT NULL,
  ALTER COLUMN payout_account_number DROP NOT NULL;

COMMENT ON COLUMN withdrawal_requests.payout_method_id IS
  'Relational source of truth for payout routing.';
COMMENT ON COLUMN withdrawal_requests.payout_type IS
  'Optional immutable snapshot for audit display only.';
COMMENT ON COLUMN withdrawal_requests.payout_account_name IS
  'Optional immutable snapshot for audit display only.';
COMMENT ON COLUMN withdrawal_requests.payout_account_number IS
  'Optional immutable snapshot for audit display only.';
COMMENT ON COLUMN withdrawal_requests.payout_bank_name IS
  'Optional immutable snapshot for audit display only.';

CREATE OR REPLACE FUNCTION public.prevent_withdrawal_snapshot_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.payout_type IS DISTINCT FROM OLD.payout_type
     OR NEW.payout_account_name IS DISTINCT FROM OLD.payout_account_name
     OR NEW.payout_account_number IS DISTINCT FROM OLD.payout_account_number
     OR NEW.payout_bank_name IS DISTINCT FROM OLD.payout_bank_name THEN
    RAISE EXCEPTION 'Withdrawal payout snapshot fields are immutable after insert';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_withdrawal_snapshot_mutation ON public.withdrawal_requests;
CREATE TRIGGER trg_prevent_withdrawal_snapshot_mutation
BEFORE UPDATE ON public.withdrawal_requests
FOR EACH ROW
EXECUTE FUNCTION public.prevent_withdrawal_snapshot_mutation();

COMMENT ON COLUMN groups.members IS
  'LEGACY snapshot JSON. Source of truth is group_members during and after cutover.';
COMMENT ON COLUMN conversations.group_name IS
  'LEGACY/derived display field; source relationship is group_id.';
COMMENT ON COLUMN conversations.group_avatar_url IS
  'LEGACY/derived display field; source relationship is group_id.';

COMMIT;
