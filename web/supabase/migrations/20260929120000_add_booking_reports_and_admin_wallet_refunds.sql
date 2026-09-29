BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_report_target_type(raw_target_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
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
    WHEN 'studio booking' THEN 'booking'
    WHEN 'studio_booking' THEN 'booking'
    ELSE lower(btrim(coalesce(raw_target_type, '')))
  END;
$$;

ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_target_type_check;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN ('group', 'studio', 'gig', 'profile', 'product', 'playlist', 'feed_post', 'booking'));

CREATE OR REPLACE FUNCTION public.validate_report_target_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_target_type text;
  v_target_exists boolean := false;
BEGIN
  v_target_type := public.normalize_report_target_type(NEW.target_type);

  IF v_target_type NOT IN ('group', 'studio', 'gig', 'profile', 'product', 'playlist', 'feed_post', 'booking') THEN
    RAISE EXCEPTION 'Invalid report target_type: %', NEW.target_type
      USING ERRCODE = '23514';
  END IF;

  NEW.target_type := v_target_type;
  NEW.reason := btrim(coalesce(NEW.reason, ''));

  IF NEW.reason = '' THEN
    RAISE EXCEPTION 'Report reason is required.' USING ERRCODE = '23514';
  END IF;

  IF NEW.target_id IS NULL THEN
    RAISE EXCEPTION 'Report target_id is required.' USING ERRCODE = '23502';
  END IF;

  CASE v_target_type
    WHEN 'group' THEN SELECT EXISTS (SELECT 1 FROM public.groups WHERE id = NEW.target_id) INTO v_target_exists;
    WHEN 'studio' THEN SELECT EXISTS (SELECT 1 FROM public.studios WHERE id = NEW.target_id) INTO v_target_exists;
    WHEN 'gig' THEN SELECT EXISTS (SELECT 1 FROM public.gigs WHERE id = NEW.target_id) INTO v_target_exists;
    WHEN 'profile' THEN SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.target_id) INTO v_target_exists;
    WHEN 'product' THEN SELECT EXISTS (SELECT 1 FROM public.products WHERE id = NEW.target_id) INTO v_target_exists;
    WHEN 'playlist' THEN SELECT EXISTS (SELECT 1 FROM public.playlists WHERE id = NEW.target_id) INTO v_target_exists;
    WHEN 'feed_post' THEN SELECT EXISTS (SELECT 1 FROM public.feed_posts WHERE id = NEW.target_id) INTO v_target_exists;
    WHEN 'booking' THEN SELECT EXISTS (SELECT 1 FROM public.studio_bookings WHERE id = NEW.target_id) INTO v_target_exists;
  END CASE;

  IF NOT v_target_exists THEN
    RAISE EXCEPTION 'Cannot report missing target: % %', v_target_type, NEW.target_id
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_report_target_before_write ON public.reports;
CREATE TRIGGER trg_validate_report_target_before_write
BEFORE INSERT OR UPDATE OF target_type, target_id, reason
ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.validate_report_target_before_write();

CREATE OR REPLACE FUNCTION public.dismiss_booking_reports_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.reports
  SET
    status = 'dismissed',
    reviewed_by = NULL,
    reviewed_at = timezone('utc', now()),
    moderation_action = 'none',
    moderation_notes = CASE
      WHEN moderation_notes IS NULL OR btrim(moderation_notes) = ''
        THEN 'Auto-dismissed because the booking was deleted.'
      ELSE moderation_notes || E'\nAuto-dismissed because the booking was deleted.'
    END,
    escalation_status = 'none',
    escalated_at = NULL,
    escalation_reason = NULL
  WHERE target_type = 'booking'
    AND target_id = OLD.id
    AND lower(coalesce(status, 'pending')) = 'pending';

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_reports_cleanup_on_booking_delete ON public.studio_bookings;
CREATE TRIGGER trg_reports_cleanup_on_booking_delete
AFTER DELETE ON public.studio_bookings
FOR EACH ROW EXECUTE FUNCTION public.dismiss_booking_reports_on_delete();

CREATE OR REPLACE FUNCTION public.admin_refund_reported_booking(
  p_report_id uuid,
  p_admin_user_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report public.reports%ROWTYPE;
  v_booking record;
  v_wallet_id uuid;
  v_wallet_balance numeric := 0;
  v_refund_transaction_id uuid;
  v_existing_refund_amount numeric;
  v_refund_amount numeric := 0;
  v_now timestamptz := timezone('utc', now());
  v_notes text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_admin_user_id
      AND lower(coalesce(role, '')) = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin role required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_report
  FROM public.reports
  WHERE id = p_report_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found.' USING ERRCODE = 'P0002';
  END IF;

  IF public.normalize_report_target_type(v_report.target_type) <> 'booking' THEN
    RAISE EXCEPTION 'This report is not linked to a studio booking.' USING ERRCODE = '22023';
  END IF;

  SELECT
    b.*,
    s.name AS studio_name
  INTO v_booking
  FROM public.studio_bookings b
  LEFT JOIN public.studios s ON s.id = b.studio_id
  WHERE b.id = v_report.target_id
  FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_report.reporter_id IS DISTINCT FROM v_booking.user_id THEN
    RAISE EXCEPTION 'The report owner does not match the booking customer.' USING ERRCODE = '42501';
  END IF;

  IF lower(coalesce(v_booking.payment_status, 'unpaid')) = 'refunded' THEN
    UPDATE public.reports
    SET
      status = 'resolved',
      reviewed_by = p_admin_user_id,
      reviewed_at = v_now,
      moderation_action = 'none',
      moderation_notes = coalesce(nullif(btrim(p_notes), ''), 'Booking was already refunded.'),
      escalation_status = 'none',
      escalated_at = NULL,
      escalation_reason = NULL
    WHERE id = p_report_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_refunded', true,
      'refund_amount', coalesce(v_booking.refund_amount, 0),
      'booking_id', v_booking.id,
      'report_id', p_report_id
    );
  END IF;

  IF lower(coalesce(v_booking.payment_status, 'unpaid')) NOT IN ('paid', 'partial', 'refund_pending') THEN
    RAISE EXCEPTION 'This booking has no refundable payment.' USING ERRCODE = '22023';
  END IF;

  v_refund_amount := coalesce(
    nullif(coalesce(v_booking.payment_amount, 0), 0),
    greatest(coalesce(v_booking.final_price, 0) - coalesce(v_booking.remaining_balance, 0), 0)
  );

  IF v_refund_amount <= 0 THEN
    RAISE EXCEPTION 'This booking has no refundable amount.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.wallets (user_id, balance)
  VALUES (v_booking.user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id, coalesce(balance, 0)
  INTO v_wallet_id, v_wallet_balance
  FROM public.wallets
  WHERE user_id = v_booking.user_id
  FOR UPDATE;

  SELECT id, amount
  INTO v_refund_transaction_id, v_existing_refund_amount
  FROM public.wallet_transactions
  WHERE wallet_id = v_wallet_id
    AND reference_id = v_booking.id
    AND reference_type = 'refund'
    AND type = 'refund'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_refund_transaction_id IS NULL THEN
    UPDATE public.wallets
    SET
      balance = v_wallet_balance + v_refund_amount,
      updated_at = v_now
    WHERE id = v_wallet_id;

    INSERT INTO public.wallet_transactions (
      wallet_id,
      amount,
      type,
      description,
      reference_id,
      reference_type,
      is_credit,
      status
    ) VALUES (
      v_wallet_id,
      v_refund_amount,
      'refund',
      'Admin-approved refund for booking at ' || coalesce(v_booking.studio_name, 'Studio'),
      v_booking.id,
      'refund',
      true,
      'completed'
    )
    RETURNING id INTO v_refund_transaction_id;
  ELSE
    v_refund_amount := coalesce(nullif(v_existing_refund_amount, 0), v_refund_amount);
  END IF;

  UPDATE public.studio_bookings
  SET
    status = 'cancelled',
    payment_status = 'refunded',
    refund_amount = v_refund_amount,
    refund_id = v_refund_transaction_id::text,
    refunded_at = v_now,
    cancellation_reason = coalesce(nullif(btrim(p_notes), ''), 'Refund approved by admin after booking report review.'),
    updated_at = v_now
  WHERE id = v_booking.id;

  v_notes := coalesce(
    nullif(btrim(p_notes), ''),
    'Resolved with a PHP ' || trim(to_char(v_refund_amount, 'FM999999999990.00')) || ' wallet refund.'
  );

  UPDATE public.reports
  SET
    status = 'resolved',
    reviewed_by = p_admin_user_id,
    reviewed_at = v_now,
    moderation_action = 'none',
    moderation_notes = v_notes,
    escalation_status = 'none',
    escalated_at = NULL,
    escalation_reason = NULL
  WHERE id = p_report_id;

  INSERT INTO public.notifications (user_id, type, title, message, read, meta)
  VALUES (
    v_booking.user_id,
    'success',
    'Booking Refund Approved',
    'Your report was reviewed and PHP ' || trim(to_char(v_refund_amount, 'FM999999999990.00')) || ' was credited to your MusikaLokal Wallet.',
    false,
    jsonb_build_object(
      'event_type', 'admin_booking_refund',
      'report_id', p_report_id,
      'booking_id', v_booking.id,
      'refund_id', v_refund_transaction_id,
      'refund_amount', v_refund_amount
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'already_refunded', v_existing_refund_amount IS NOT NULL,
    'refund_amount', v_refund_amount,
    'refund_transaction_id', v_refund_transaction_id,
    'booking_id', v_booking.id,
    'report_id', p_report_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_refund_reported_booking(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_refund_reported_booking(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_refund_reported_booking(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refund_reported_booking(uuid, uuid, text) TO service_role;

COMMIT;
