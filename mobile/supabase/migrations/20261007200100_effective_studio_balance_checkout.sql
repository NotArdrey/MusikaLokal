begin;

-- Derive legacy partial balances during confirmed settlement without rewriting
-- historical bookings. Keep the provider, amount, ownership and replay guards.
do $$
declare
  v_definition text := pg_get_functiondef('public.confirm_online_studio_payment(text,uuid[],text,numeric,text,timestamptz,text,text)'::regprocedure);
  v_balance text := 'greatest(coalesce(booking.remaining_balance, 0), coalesce(booking.final_price, 0) - coalesce(booking.payment_amount, 0), 0)';
begin
  if (length(v_definition) - length(replace(v_definition, 'booking.remaining_balance', ''))) / length('booking.remaining_balance') <> 3 then
    raise exception 'Unexpected balance allocation in confirm_online_studio_payment';
  end if;
  execute replace(v_definition, 'booking.remaining_balance', v_balance);
end;
$$;

commit;
