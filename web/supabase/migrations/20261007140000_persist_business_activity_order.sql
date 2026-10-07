-- Persist business activity independently of event schedules and automated reviews.
begin;

alter table public.studio_bookings add column if not exists activity_at timestamptz;
alter table public.gig_applications add column if not exists activity_at timestamptz;
alter table public.booking_requests add column if not exists activity_at timestamptz;

-- ALTER TABLE holds transaction-scoped locks. Suspend and restore each existing
-- user trigger's exact state during historical metadata backfill so it cannot
-- change updated_at, run workflows, or generate artificial business/audit events.
do $$
declare
  v_table text;
  v_trigger record;
  v_states jsonb;
begin
  foreach v_table in array array['studio_bookings', 'gig_applications', 'booking_requests'] loop
    select coalesce(jsonb_agg(jsonb_build_object('name', tgname, 'state', tgenabled)), '[]'::jsonb)
    into v_states from pg_trigger
    where tgrelid = format('public.%I', v_table)::regclass and not tgisinternal;
    execute format('alter table public.%I disable trigger user', v_table);

    if v_table = 'studio_bookings' then
      update public.studio_bookings b set activity_at = greatest(
        b.created_at, b.paid_at, b.refunded_at, b.check_in_time,
        b.relocation_requested_at, b.payout_hold_at, b.payout_released_at,
        (select max(r.created_at) from public.reviews r where r.studio_booking_id = b.id)
      ) where b.activity_at is null;
    elsif v_table = 'gig_applications' then
      update public.gig_applications a set activity_at = greatest(
        a.created_at, a.rejected_at, a.fired_at, a.leader_reviewed_at,
        a.reconfirmation_required_at, a.feature_consent_responded_at, a.member_cv_completed_at,
        (select max(r.created_at) from public.reviews r where r.gig_application_id = a.id)
      ) where a.activity_at is null;
    else
      update public.booking_requests set activity_at = created_at where activity_at is null;
    end if;

    for v_trigger in select * from jsonb_to_recordset(v_states) as x(name text, state text) loop
      execute format('alter table public.%I %s trigger %I', v_table,
        case v_trigger.state when 'D' then 'disable' when 'R' then 'enable replica'
          when 'A' then 'enable always' else 'enable' end, v_trigger.name);
    end loop;
  end loop;
end;
$$;

create or replace function public.stamp_business_activity()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'INSERT' then
    new.activity_at := statement_timestamp();
  else
    select jsonb_object_agg(key, value) into v_old from jsonb_each(to_jsonb(old)) where key = any(tg_argv);
    select jsonb_object_agg(key, value) into v_new from jsonb_each(to_jsonb(new)) where key = any(tg_argv);
    if v_old is distinct from v_new then
      new.activity_at := greatest(old.activity_at, statement_timestamp());
    else
      -- Ignore no-op retries, automated metadata changes, and client-supplied times.
      new.activity_at := old.activity_at;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.stamp_business_activity() from public, anon, authenticated;

-- Run after the existing BEFORE triggers have normalized the business values.
drop trigger if exists zz_stamp_business_activity on public.studio_bookings;
create trigger zz_stamp_business_activity before insert or update on public.studio_bookings
for each row execute function public.stamp_business_activity(
  'status', 'payment_status', 'payment_amount', 'remaining_balance', 'paid_at',
  'refund_amount', 'refunded_at', 'payment_type', 'checkout_session_id',
  'reviewed_by_customer', 'reviewed_by_owner', 'cancellation_reason', 'check_in_time',
  'booking_date', 'start_time', 'end_time', 'relocation_requested_at',
  'relocation_proposed_date', 'relocation_proposed_start_time', 'relocation_proposed_end_time',
  'payout_hold', 'payout_released_at', 'proof_url', 'notes'
);
drop trigger if exists zz_stamp_business_activity on public.gig_applications;
create trigger zz_stamp_business_activity before insert or update on public.gig_applications
for each row execute function public.stamp_business_activity(
  'status', 'leader_approval_status', 'leader_reviewed_at', 'reconfirmation_required_at',
  'reviewed_by_applicant', 'reviewed_by_organizer', 'cancellation_reason', 'fired_at',
  'pitch_message', 'cv_url', 'video_url', 'slot_type', 'note', 'member_cv_completed_at',
  'feature_consent_status', 'show_on_gig_page', 'show_on_profile'
);
drop trigger if exists zz_stamp_business_activity on public.booking_requests;
create trigger zz_stamp_business_activity before insert or update on public.booking_requests
for each row execute function public.stamp_business_activity('status', 'message', 'attachment_url');

-- Persist the review action and its parent flag in the same transaction as the
-- review, including direct writes which do not use the Edge Function.
create or replace function public.record_review_business_activity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.studio_booking_id is not null then
    update public.studio_bookings set
      reviewed_by_customer = case when user_id = new.author_id then true else reviewed_by_customer end,
      reviewed_by_owner = case when user_id <> new.author_id then true else reviewed_by_owner end
    where id = new.studio_booking_id;
  elsif new.gig_application_id is not null then
    if public.is_user_represented_by_gig_application(new.author_id, new.gig_application_id) then
      update public.gig_applications set reviewed_by_applicant = true where id = new.gig_application_id;
    else
      update public.gig_applications set reviewed_by_organizer = true where id = new.gig_application_id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.record_review_business_activity() from public, anon, authenticated;
drop trigger if exists trg_record_review_business_activity on public.reviews;
create trigger trg_record_review_business_activity after insert on public.reviews
for each row execute function public.record_review_business_activity();

create index if not exists studio_bookings_user_activity_idx on public.studio_bookings(user_id, activity_at desc, id);
create index if not exists studio_bookings_studio_activity_idx on public.studio_bookings(studio_id, activity_at desc, id);
create index if not exists gig_applications_activity_idx on public.gig_applications(activity_at desc, id);
create index if not exists booking_requests_activity_idx on public.booking_requests(activity_at desc, id);

-- Realtime still applies the tables' existing RLS; no visibility policies change.
do $$
declare v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables) then
    foreach v_table in array array['studio_bookings', 'gig_applications', 'booking_requests'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = v_table) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$$;

commit;
