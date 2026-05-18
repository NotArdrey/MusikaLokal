BEGIN;

CREATE OR REPLACE FUNCTION public.process_mock_withdrawal(
  p_user_id uuid,
  p_payout_method_id uuid,
  p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.process_mock_withdrawal(uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_mock_withdrawal(uuid, uuid, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.process_mock_withdrawal(uuid, uuid, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_mock_withdrawal(uuid, uuid, numeric) TO service_role;

COMMIT;
