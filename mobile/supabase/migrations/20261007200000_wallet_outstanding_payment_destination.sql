begin;

-- Pending balance checkouts still owe only the confirmed downpayment's remainder.
-- Intended initial checkout amounts are not treated as confirmed payments.
create or replace function public.outstanding_studio_payments(p_user_id uuid, p_excluded_ids uuid[] default '{}')
returns jsonb
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'studio_id', b.studio_id, 'studio_name', s.name,
    'booking_date', b.booking_date, 'payment_status', b.payment_status,
    'remaining_balance', greatest(coalesce(b.remaining_balance, 0),
      case when b.payment_status = 'partial' or (b.paid_at is not null and b.payment_status in ('pending', 'failed'))
        then coalesce(b.final_price, 0) - coalesce(b.payment_amount, 0)
        when coalesce(b.payment_status, 'unpaid') <> 'paid' then coalesce(b.final_price, 0) else 0 end, 0)
  ) order by b.created_at, b.id), '[]'::jsonb)
  from public.studio_bookings b left join public.studios s on s.id = b.studio_id
  where b.user_id = p_user_id and not (b.id = any(p_excluded_ids))
    and coalesce(b.status, 'pending') not in ('cancelled', 'declined', 'rejected', 'expired')
    and (coalesce(b.remaining_balance, 0) > 0
      or (coalesce(b.payment_status, 'unpaid') in ('unpaid', 'pending', 'failed') and b.paid_at is null and coalesce(b.final_price, 0) > 0)
      or ((b.payment_status = 'partial' or (b.paid_at is not null and b.payment_status in ('pending', 'failed')))
        and coalesce(b.final_price, 0) > coalesce(b.payment_amount, 0)));
$$;

-- Wallet reads the same effective debt as the reservation guard, through the
-- authenticated server handler. The helper remains inaccessible to clients.
grant execute on function public.outstanding_studio_payments(uuid, uuid[]) to service_role;

-- Preserve the existing concurrency guard and change only the action payload.
do $$
declare
  v_signature text;
  v_definition text;
  v_old text := '''pathname'', ''/bookings'', ''params'', jsonb_build_object(''tab'', ''Pending'')';
  v_new text := '''pathname'', ''/wallet'', ''params'', jsonb_build_object(''section'', ''outstanding'', ''bookingId'', case when jsonb_array_length(v_bookings) = 1 then v_bookings->0->>''id'' else null end)';
begin
  foreach v_signature in array array[
    'public.get_studio_payment_eligibility()',
    'public.enforce_studio_payment_eligibility()'
  ] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    if position(v_old in v_definition) = 0 then
      raise exception 'Unexpected payment destination in %', v_signature;
    end if;
    execute replace(v_definition, v_old, v_new);
  end loop;
end;
$$;

commit;
