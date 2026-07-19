-- Immutable group-lineup snapshot and per-member advisory face similarity.
-- Results remain evidence-only and must never change an application decision or score.

alter table public.gig_applications
  add column if not exists ai_review_group_member_ids uuid[] not null default '{}'::uuid[];

alter table public.gig_application_ai_reviews
  add column if not exists group_face_similarity jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'gig_application_ai_reviews_group_face_similarity_check'
      and conrelid = 'public.gig_application_ai_reviews'::regclass
  ) then
    alter table public.gig_application_ai_reviews
      add constraint gig_application_ai_reviews_group_face_similarity_check
      check (jsonb_typeof(group_face_similarity) = 'array');
  end if;
end $$;

create or replace function public.snapshot_gig_ai_review_group_members()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not coalesce(new.ai_portfolio_review_consent, false) or new.group_id is null then
    new.ai_review_group_member_ids := '{}'::uuid[];
    return new;
  end if;

  select coalesce(array_agg(lineup.user_id order by lineup.is_owner desc, lineup.joined_at nulls first, lineup.user_id), '{}'::uuid[])
  into new.ai_review_group_member_ids
  from (
    select gm.user_id, gm.user_id = g.owner_id as is_owner, gm.joined_at
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.group_id = new.group_id

    union all

    select g.owner_id, true, null::timestamptz
    from public.groups g
    where g.id = new.group_id
      and not exists (
        select 1
        from public.group_members gm
        where gm.group_id = g.id
          and gm.user_id = g.owner_id
      )
  ) lineup;

  return new;
end;
$$;

revoke all on function public.snapshot_gig_ai_review_group_members() from public, anon, authenticated;
grant execute on function public.snapshot_gig_ai_review_group_members() to service_role;

drop trigger if exists trg_snapshot_gig_ai_review_group_members on public.gig_applications;
create trigger trg_snapshot_gig_ai_review_group_members
before insert or update of group_id, ai_portfolio_review_consent, ai_review_group_member_ids
on public.gig_applications
for each row
execute function public.snapshot_gig_ai_review_group_members();

update public.gig_applications
set ai_review_group_member_ids = ai_review_group_member_ids
where group_id is not null
  and ai_portfolio_review_consent = true;

comment on column public.gig_applications.ai_review_group_member_ids is
  'Immutable-at-submission snapshot of group profile IDs covered by the submitter authorization for advisory face similarity.';

comment on column public.gig_application_ai_reviews.group_face_similarity is
  'Per-member advisory visual similarity results for the snapshotted group lineup. Never identity verification or an automated decision.';
