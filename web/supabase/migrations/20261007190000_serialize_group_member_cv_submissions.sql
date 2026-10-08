-- Serialize CV submissions against withdrawal/finalization and recompute the
-- roster counts in the same transaction. Only authenticated Edge handlers call it.
begin;

create or replace function public.submit_group_application_member_cv(
  p_application_id uuid,
  p_actor_user_id uuid,
  p_storage_path text,
  p_filename text,
  p_ai_review_consent boolean,
  p_member_verification_consent boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_application public.gig_applications%rowtype;
  v_member_id uuid;
  v_required integer;
  v_submitted integer;
  v_status text;
begin
  select * into v_application from public.gig_applications
    where id = p_application_id for update;
  if not found then raise exception 'Group application not found'; end if;

  select id into v_member_id from public.gig_application_members
    where application_id = p_application_id and user_id = p_actor_user_id;
  if not found then raise exception 'You are not a member of this application roster'; end if;
  if v_application.status <> 'pending' or v_application.member_cv_status not in ('collecting', 'ready') then
    raise exception 'This application is no longer collecting member CVs';
  end if;
  if p_storage_path is null or p_storage_path not like
    p_actor_user_id::text || '/gig-applications/' || p_application_id::text || '/%'
    or p_storage_path ~ '(^|/)\.\.(/|$)' then
    raise exception 'Your uploaded CV must belong to this application';
  end if;

  update public.gig_application_members set
    cv_storage_bucket = 'application-cvs', cv_storage_path = p_storage_path,
    cv_filename = coalesce(nullif(trim(p_filename), ''), 'CV'), cv_status = 'submitted',
    ai_review_consent = coalesce(p_ai_review_consent, false),
    member_verification_consent = coalesce(p_member_verification_consent, false),
    cv_submitted_at = now(), updated_at = now()
    where id = v_member_id;

  select count(*), count(*) filter (where cv_status = 'submitted' and nullif(cv_storage_path, '') is not null)
    into v_required, v_submitted from public.gig_application_members
    where application_id = p_application_id;
  v_status := case when v_required > 0 and v_required = v_submitted then 'ready' else 'collecting' end;
  update public.gig_applications set
    member_cv_status = v_status, member_cv_required_count = v_required,
    member_cv_submitted_count = v_submitted where id = p_application_id;
  return jsonb_build_object('application_id', p_application_id, 'status', v_status,
    'required_count', v_required, 'submitted_count', v_submitted,
    'became_ready', v_status = 'ready' and v_application.member_cv_status <> 'ready');
end;
$$;

revoke all on function public.submit_group_application_member_cv(uuid, uuid, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.submit_group_application_member_cv(uuid, uuid, text, text, boolean, boolean) to service_role;

commit;
