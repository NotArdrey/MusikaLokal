-- Add promotion support to calculate_booking_price
-- This migration adds a wrapper function that applies promotions after base price calculation
-- The original calculate_booking_price function is preserved; this adds a new function

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
$$;
