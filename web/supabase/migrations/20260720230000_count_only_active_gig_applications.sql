-- Card and detail-modal applicant totals represent applications that still need
-- an organizer decision. Historical accepted/declined outcomes are excluded.

drop index if exists public.idx_gig_applications_gig_countable;
create index idx_gig_applications_gig_countable
  on public.gig_applications (gig_id)
  where status = 'pending'
    and (leader_approval_status is null or leader_approval_status = 'approved');

create or replace function public.get_visible_gig_application_counts(p_gig_ids uuid[])
returns table (gig_id uuid, applicant_count bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  viewer_role text;
begin
  if auth.uid() is null or coalesce(array_length(p_gig_ids, 1), 0) = 0 then
    return;
  end if;

  select lower(trim(p.role))
  into viewer_role
  from public.profiles p
  where p.id = auth.uid();

  if viewer_role is null or viewer_role = 'fan' then
    return;
  end if;

  return query
  select ga.gig_id, count(*)::bigint
  from public.gig_applications ga
  where ga.gig_id = any (p_gig_ids)
    and ga.status = 'pending'
    and (ga.leader_approval_status is null or ga.leader_approval_status = 'approved')
  group by ga.gig_id;
end;
$$;

revoke all on function public.get_visible_gig_application_counts(uuid[]) from public, anon;
grant execute on function public.get_visible_gig_application_counts(uuid[]) to authenticated;

comment on function public.get_visible_gig_application_counts(uuid[]) is
  'Returns pending, manager-visible gig applications for authenticated non-fan users.';
