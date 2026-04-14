-- Add structured optional condition fields for studio promotions.
-- This keeps simple promos working while allowing enforceable conditional promos.

ALTER TABLE public.studio_promotions
  ADD COLUMN IF NOT EXISTS criteria TEXT,
  ADD COLUMN IF NOT EXISTS minimum_booking_hours NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS minimum_spend NUMERIC(12,2);

-- Backfill structured fields from legacy description prefixes.
WITH legacy AS (
  SELECT
    id,
    NULLIF(
      trim(substring(description FROM '(?im)^\s*How to get promo:\s*(.+)$')),
      ''
    ) AS legacy_criteria,
    NULLIF(
      trim(
        substring(
          description
          FROM '(?im)^\s*Minimum booking hours:\s*([0-9]+(?:\.[0-9]+)?)\s*$'
        )
      ),
      ''
    )::NUMERIC AS legacy_minimum_booking_hours,
    NULLIF(
      trim(
        substring(
          description
          FROM '(?im)^\s*Minimum spend:\s*([0-9]+(?:\.[0-9]+)?)\s*$'
        )
      ),
      ''
    )::NUMERIC AS legacy_minimum_spend,
    NULLIF(
      trim(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              COALESCE(description, ''),
              '(?im)^\s*How to get promo:.*(?:\r?\n)?',
              '',
              'g'
            ),
            '(?im)^\s*Minimum booking hours:.*(?:\r?\n)?',
            '',
            'g'
          ),
          '(?im)^\s*Minimum spend:.*(?:\r?\n)?',
          '',
          'g'
        )
      ),
      ''
    ) AS cleaned_description
  FROM public.studio_promotions
)
UPDATE public.studio_promotions AS sp
SET
  criteria = COALESCE(NULLIF(sp.criteria, ''), legacy.legacy_criteria),
  minimum_booking_hours = COALESCE(
    sp.minimum_booking_hours,
    legacy.legacy_minimum_booking_hours
  ),
  minimum_spend = COALESCE(sp.minimum_spend, legacy.legacy_minimum_spend),
  description = CASE
    WHEN sp.description IS NULL THEN NULL
    WHEN legacy.cleaned_description IS NOT NULL THEN legacy.cleaned_description
    ELSE NULL
  END
FROM legacy
WHERE sp.id = legacy.id;

DO $$
BEGIN
  ALTER TABLE public.studio_promotions
    ADD CONSTRAINT studio_promotions_minimum_booking_hours_check
    CHECK (minimum_booking_hours IS NULL OR minimum_booking_hours > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER TABLE public.studio_promotions
    ADD CONSTRAINT studio_promotions_minimum_spend_check
    CHECK (minimum_spend IS NULL OR minimum_spend > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- Recreate promo application function to enforce optional conditions.
CREATE OR REPLACE FUNCTION public.apply_studio_promotion(
  p_studio_id UUID,
  p_booking_date DATE,
  p_session_type TEXT DEFAULT 'rehearsal',
  p_base_price NUMERIC DEFAULT 0,
  p_hours NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
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
$$;
