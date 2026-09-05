-- A missing staff assignment can return NULL; only an explicit true grants access.
begin;

create or replace function public.update_gig_with_cooldown_safely(
  p_gig_id uuid,
  p_payload jsonb,
  p_cooldown_hours integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_uid uuid := auth.uid();
  v_organizer_id uuid;
  v_result jsonb;
  v_normalized_hours integer;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  v_normalized_hours := coalesce(p_cooldown_hours, 720);
  if v_normalized_hours < 0 or v_normalized_hours > 8760 then
    raise exception 'Reapplication cooldown must be between 0 and 8,760 hours';
  end if;

  select g.organizer_id
  into v_organizer_id
  from public.gigs g
  where g.id = p_gig_id;

  if not found then
    return jsonb_build_object(
      'success', false,
      'code', 'GIG_NOT_FOUND',
      'message', 'Gig not found.'
    );
  end if;

  if v_organizer_id is distinct from v_uid
    and not coalesce(public.staff_can_edit_gig(v_uid, p_gig_id), false)
  then
    raise exception 'Not authorized to update this gig';
  end if;

  v_result := public.update_gig_safely(
    p_gig_id,
    coalesce(p_payload, '{}'::jsonb) - 'reapplication_cooldown_days',
    p_reason
  );

  if coalesce((v_result->>'success')::boolean, false) is not true then
    return v_result;
  end if;

  update public.gigs
  set reapplication_cooldown_days = v_normalized_hours::numeric / 24
  where id = p_gig_id;

  return v_result || jsonb_build_object(
    'reapplication_cooldown_hours', v_normalized_hours,
    'reapplication_cooldown_days', v_normalized_hours::numeric / 24
  );
end;
$$;

revoke all on function public.update_gig_with_cooldown_safely(uuid, jsonb, integer, text) from public;
grant execute on function public.update_gig_with_cooldown_safely(uuid, jsonb, integer, text) to authenticated;

notify pgrst, 'reload schema';

commit;
