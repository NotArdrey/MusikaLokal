-- Create studio_promotions table for optional discounts/promotions
CREATE TABLE IF NOT EXISTS public.studio_promotions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  studio_id UUID NOT NULL REFERENCES public.studios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
  discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  is_permanent BOOLEAN NOT NULL DEFAULT false,
  start_date DATE,
  end_date DATE,
  applies_to TEXT NOT NULL DEFAULT 'both' CHECK (applies_to IN ('rehearsal', 'recording', 'both')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_date_range CHECK (
    is_permanent = true
    OR (start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date)
  ),
  CONSTRAINT chk_percentage_range CHECK (
    discount_type <> 'percentage' OR (discount_value > 0 AND discount_value <= 100)
  )
);

-- Index for efficient lookup of active promotions by studio
CREATE INDEX IF NOT EXISTS idx_studio_promotions_studio_active
  ON public.studio_promotions(studio_id, is_active)
  WHERE is_active = true;

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at_studio_promotions()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_studio_promotions_updated_at
  BEFORE UPDATE ON public.studio_promotions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_studio_promotions();
