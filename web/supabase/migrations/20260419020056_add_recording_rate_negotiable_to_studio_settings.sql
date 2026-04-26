-- Phase 1: Add recording_rate_negotiable flag to studio_settings
ALTER TABLE public.studio_settings
    ADD COLUMN IF NOT EXISTS recording_rate_negotiable boolean NOT NULL DEFAULT false;
