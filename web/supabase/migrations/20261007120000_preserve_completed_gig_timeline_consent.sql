begin;

-- Finishing a performance retains its existing display choices. Cancellation,
-- rejection, and termination still revoke those choices.
create or replace function public.prepare_gig_feature_consent()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status in ('accepted', 'approved')
     and (tg_op = 'INSERT' or old.status not in ('accepted', 'approved', 'completed')) then
    new.feature_consent_status := 'pending';
    new.show_on_gig_page := false;
    new.show_on_profile := false;
    new.feature_consent_requested_at := now();
    new.feature_consent_responded_at := null;
  elsif tg_op = 'UPDATE'
        and old.status in ('accepted', 'approved', 'completed')
        and new.status not in ('accepted', 'approved', 'completed') then
    new.feature_consent_status := 'revoked';
    new.show_on_gig_page := false;
    new.show_on_profile := false;
    new.feature_consent_responded_at := now();
  end if;

  return new;
end;
$$;

drop policy if exists "Accepted profile timeline applications are publicly visible"
  on public.gig_applications;

create policy "Accepted profile timeline applications are publicly visible"
  on public.gig_applications
  as permissive
  for select
  to public
  using (
    status in ('accepted', 'approved', 'completed')
    and feature_consent_status = 'accepted'
    and show_on_profile = true
  );

-- Previously revoked choices cannot be reconstructed safely; do not backfill
-- public consent for existing completed applications.
commit;
