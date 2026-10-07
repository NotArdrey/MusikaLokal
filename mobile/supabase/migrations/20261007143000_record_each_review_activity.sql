-- A second participant review is a new action even when the shared flag is true.
begin;

alter table public.studio_bookings add column if not exists last_reviewed_at timestamptz;
alter table public.gig_applications add column if not exists last_reviewed_at timestamptz;

drop trigger if exists zz_stamp_business_activity on public.studio_bookings;
create trigger zz_stamp_business_activity before insert or update on public.studio_bookings
for each row execute function public.stamp_business_activity(
  'status', 'payment_status', 'payment_amount', 'remaining_balance', 'paid_at',
  'refund_amount', 'refunded_at', 'payment_type', 'checkout_session_id',
  'reviewed_by_customer', 'reviewed_by_owner', 'cancellation_reason', 'check_in_time',
  'booking_date', 'start_time', 'end_time', 'relocation_requested_at',
  'relocation_proposed_date', 'relocation_proposed_start_time', 'relocation_proposed_end_time',
  'payout_hold', 'payout_released_at', 'proof_url', 'notes', 'last_reviewed_at'
);
drop trigger if exists zz_stamp_business_activity on public.gig_applications;
create trigger zz_stamp_business_activity before insert or update on public.gig_applications
for each row execute function public.stamp_business_activity(
  'status', 'leader_approval_status', 'leader_reviewed_at', 'reconfirmation_required_at',
  'reviewed_by_applicant', 'reviewed_by_organizer', 'cancellation_reason', 'fired_at',
  'pitch_message', 'cv_url', 'video_url', 'slot_type', 'note', 'member_cv_completed_at',
  'feature_consent_status', 'show_on_gig_page', 'show_on_profile', 'last_reviewed_at'
);

create or replace function public.record_review_business_activity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.studio_booking_id is not null then
    update public.studio_bookings set
      last_reviewed_at = statement_timestamp(),
      reviewed_by_customer = case when user_id = new.author_id then true else reviewed_by_customer end,
      reviewed_by_owner = case when user_id <> new.author_id then true else reviewed_by_owner end
    where id = new.studio_booking_id;
  elsif new.gig_application_id is not null then
    if public.is_user_represented_by_gig_application(new.author_id, new.gig_application_id) then
      update public.gig_applications set reviewed_by_applicant = true,
        last_reviewed_at = statement_timestamp() where id = new.gig_application_id;
    else
      update public.gig_applications set reviewed_by_organizer = true,
        last_reviewed_at = statement_timestamp() where id = new.gig_application_id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.record_review_business_activity() from public, anon, authenticated;

commit;
