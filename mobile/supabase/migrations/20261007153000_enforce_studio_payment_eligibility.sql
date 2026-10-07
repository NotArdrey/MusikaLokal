begin;

-- Internal query shared by the display check and the transactional insert guard.
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
      case when b.payment_status = 'partial' then coalesce(b.final_price, 0) - coalesce(b.payment_amount, 0)
        when coalesce(b.payment_status, 'unpaid') <> 'paid' then coalesce(b.final_price, 0) else 0 end, 0)
  ) order by b.created_at, b.id), '[]'::jsonb)
  from public.studio_bookings b left join public.studios s on s.id = b.studio_id
  where b.user_id = p_user_id and not (b.id = any(p_excluded_ids))
    and coalesce(b.status, 'pending') not in ('cancelled', 'declined', 'rejected', 'expired')
    and (coalesce(b.remaining_balance, 0) > 0
      or (coalesce(b.payment_status, 'unpaid') in ('unpaid', 'pending', 'failed') and coalesce(b.final_price, 0) > 0)
      or (b.payment_status = 'partial' and coalesce(b.final_price, 0) > coalesce(b.payment_amount, 0)));
$$;

create or replace function public.get_studio_payment_eligibility()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_bookings jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  v_bookings := public.outstanding_studio_payments(auth.uid());
  return jsonb_build_object('eligible', jsonb_array_length(v_bookings) = 0,
    'code', case when jsonb_array_length(v_bookings) > 0 then 'OUTSTANDING_STUDIO_PAYMENT' end,
    'bookings', v_bookings, 'pay_now', jsonb_build_object('pathname', '/bookings', 'params', jsonb_build_object('tab', 'Pending')));
end;
$$;

-- Transition rows exclude only this statement's new bookings. Clients cannot
-- bypass the rule by inserting directly or by reusing a client-supplied batch id.
create or replace function public.enforce_studio_payment_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_new_ids uuid[];
  v_bookings jsonb;
begin
  for v_user in select distinct user_id from new_reservations order by user_id loop
    -- Every creation path uses this same per-user row lock. Locking before the
    -- subsequent query gives it a fresh READ COMMITTED snapshot after waiting.
    perform 1 from public.profiles where id = v_user for update;
    if not found then raise exception 'Booking user not found' using errcode = '23503'; end if;
    select array_agg(id) into v_new_ids from new_reservations where user_id = v_user;
    v_bookings := public.outstanding_studio_payments(v_user, v_new_ids);
    if jsonb_array_length(v_bookings) > 0 then
      raise exception 'OUTSTANDING_STUDIO_PAYMENT' using errcode = 'P0001',
        detail = jsonb_build_object('code', 'OUTSTANDING_STUDIO_PAYMENT', 'bookings', v_bookings,
          'pay_now', jsonb_build_object('pathname', '/bookings', 'params', jsonb_build_object('tab', 'Pending')))::text;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists enforce_studio_payment_eligibility on public.studio_bookings;
create trigger enforce_studio_payment_eligibility after insert on public.studio_bookings
  referencing new table as new_reservations for each statement
  execute function public.enforce_studio_payment_eligibility();

-- Only the authenticated Edge Function may supply prepared server-priced rows.
-- All days and their slots are inserted atomically in one eligibility check.
create or replace function public.create_studio_reservation_batch(p_user_id uuid, p_reservations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_requests jsonb; v_results jsonb;
begin
  if jsonb_typeof(p_reservations) is distinct from 'array'
    or jsonb_array_length(p_reservations) not between 1 and 31 then
    raise exception 'A reservation batch must contain 1 to 31 sessions' using errcode = '22023';
  end if;
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Booking user not found' using errcode = '23503'; end if;
  if exists(select 1 from jsonb_array_elements(p_reservations) r where
      jsonb_typeof(r->'slots') is distinct from 'array' or jsonb_array_length(r->'slots') not between 1 and 100) then
    raise exception 'Each session requires valid time slots' using errcode = '22023';
  end if;
  select jsonb_agg(r || jsonb_build_object('id', gen_random_uuid()) order by ord)
    into v_requests from jsonb_array_elements(p_reservations) with ordinality as inputs(r, ord);
  insert into public.studio_bookings(id, user_id, studio_id, booking_date, start_time, end_time,
    notes, status, payment_status, session_type, base_rate, hours, subtotal, modifiers_applied,
    final_price, cancellation_policy_id, cancellation_policy_snapshot)
  select (r->>'id')::uuid, p_user_id, b.studio_id, b.booking_date, b.start_time, b.end_time,
    b.notes, 'pending', 'unpaid', b.session_type, b.base_rate, b.hours, b.subtotal, b.modifiers_applied,
    b.final_price, b.cancellation_policy_id, b.cancellation_policy_snapshot
  from jsonb_array_elements(v_requests) r
    cross join lateral jsonb_populate_record(null::public.studio_bookings, r->'payload') b;

  insert into public.studio_booking_slots(booking_id, start_time, end_time, sort_order)
  select (r->>'id')::uuid, (slot->>'start')::time, (slot->>'end')::time, (ord - 1)::integer
    from jsonb_array_elements(v_requests) r
    cross join lateral jsonb_array_elements(r->'slots') with ordinality as slots(slot, ord);
  select jsonb_agg(to_jsonb(b) order by ord) into v_results
    from jsonb_array_elements(v_requests) with ordinality as inputs(r, ord)
    join public.studio_bookings b on b.id = (r->>'id')::uuid;
  return v_results;
end;
$$;

revoke all on function public.outstanding_studio_payments(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.enforce_studio_payment_eligibility() from public, anon, authenticated;
revoke all on function public.get_studio_payment_eligibility() from public, anon;
grant execute on function public.get_studio_payment_eligibility() to authenticated;
revoke all on function public.create_studio_reservation_batch(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_studio_reservation_batch(uuid, jsonb) to service_role;

commit;
