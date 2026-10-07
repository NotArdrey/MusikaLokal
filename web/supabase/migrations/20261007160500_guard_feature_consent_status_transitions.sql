begin;

-- Check explicit feature edits even when the same UPDATE changes status.
-- The later prepare_gig_feature_consent trigger still resets lifecycle consent.
create or replace function public.guard_gig_feature_consent_update()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_group_id uuid;
  v_performer_id uuid;
begin
  if coalesce(auth.role(), '') <> 'authenticated'
     or (new.show_on_profile is not distinct from old.show_on_profile
         and new.show_on_gig_page is not distinct from old.show_on_gig_page
         and new.feature_consent_status is not distinct from old.feature_consent_status) then
    return new;
  end if;
  select coalesce(r.group_id, old.group_id), coalesce(r.profile_id, old.applicant_id)
    into v_group_id, v_performer_id
    from (select 1) seed left join public.production_team_roster r on r.id = old.production_roster_id;
  if v_group_id is not null then
    if not exists(select 1 from public.groups where id = v_group_id and owner_id = auth.uid())
       and not exists(select 1 from public.group_members where group_id = v_group_id
         and user_id = auth.uid() and role in ('owner', 'admin')) then
      raise exception 'Only an authorized group leader can change the band feature' using errcode = '42501';
    end if;
  elsif v_performer_id is distinct from auth.uid() then
    raise exception 'Only the selected performer can change featuring permission' using errcode = '42501';
  end if;
  return new;
end;
$$;

commit;
