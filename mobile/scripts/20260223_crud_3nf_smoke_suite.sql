-- Post-3NF CRUD smoke suite (read-only)

-- 1) Legacy base-table columns must be gone
select 'legacy_base_columns_removed' as check_name,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as status,
       count(*) as issues
from information_schema.columns c
join information_schema.tables t
  on t.table_schema=c.table_schema and t.table_name=c.table_name
where c.table_schema='public'
  and t.table_type='BASE TABLE'
  and (
    (c.table_name='conversations' and c.column_name in ('participant_1','participant_2','group_name','group_avatar_url'))
    or (c.table_name='gigs' and c.column_name in ('availability','slots_filled'))
    or (c.table_name='groups' and c.column_name in ('availability'))
    or (c.table_name='studios' and c.column_name in ('availability','open_dates'))
  );

-- 2) No stale policy references to removed columns
select 'stale_policy_references' as check_name,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as status,
       count(*) as issues
from pg_policies p
where p.schemaname='public'
  and (
    coalesce(p.qual,'') ilike '%participant_1%'
    or coalesce(p.qual,'') ilike '%participant_2%'
    or coalesce(p.with_check,'') ilike '%participant_1%'
    or coalesce(p.with_check,'') ilike '%participant_2%'
    or coalesce(p.qual,'') ilike '%group_name%'
    or coalesce(p.with_check,'') ilike '%group_name%'
    or coalesce(p.qual,'') ilike '%group_avatar_url%'
    or coalesce(p.with_check,'') ilike '%group_avatar_url%'
    or coalesce(p.qual,'') ilike '%slots_filled%'
    or coalesce(p.with_check,'') ilike '%slots_filled%'
  );

-- 3) No stale function references to removed columns
select 'stale_function_references' as check_name,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as status,
       count(*) as issues
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.prokind='f'
  and (
    pg_get_functiondef(p.oid) ilike '%conversations.participant_1%'
    or pg_get_functiondef(p.oid) ilike '%conversations.participant_2%'
    or pg_get_functiondef(p.oid) ilike '%new.participant_1%'
    or pg_get_functiondef(p.oid) ilike '%new.participant_2%'
    or pg_get_functiondef(p.oid) ilike '%conversations.group_name%'
    or pg_get_functiondef(p.oid) ilike '%conversations.group_avatar_url%'
    or pg_get_functiondef(p.oid) ilike '%new.group_name%'
    or pg_get_functiondef(p.oid) ilike '%new.group_avatar_url%'
    or pg_get_functiondef(p.oid) ilike '%gigs.availability%'
    or pg_get_functiondef(p.oid) ilike '%groups.availability%'
    or pg_get_functiondef(p.oid) ilike '%studios.availability%'
    or pg_get_functiondef(p.oid) ilike '%studios.open_dates%'
    or pg_get_functiondef(p.oid) ilike '%gigs.slots_filled%'
  );

-- 4) Required normalized objects exist
with required(name, object_type) as (
  values
    ('conversation_participants','table'),
    ('conversations_display_projection','view'),
    ('gig_slot_fill_summary','table'),
    ('gig_slot_fill_applicants','table'),
    ('gigs_slots_filled_projection','view'),
    ('gig_availability_slots','table'),
    ('group_availability_slots','table'),
    ('studio_availability_slots','table'),
    ('studio_open_dates','table'),
    ('gigs_availability_projection','view'),
    ('groups_availability_projection','view'),
    ('studios_availability_projection','view')
), present as (
  select table_name as name,
         case when table_type='BASE TABLE' then 'table' else 'view' end as object_type
  from information_schema.tables
  where table_schema='public'
)
select 'required_normalized_objects' as check_name,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as status,
       count(*) as missing_count
from required r
left join present p on p.name=r.name and p.object_type=r.object_type
where p.name is null;

-- 5) JSONB exception ledger coverage
select 'jsonb_exception_coverage' as check_name,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as status,
       count(*) as uncovered_jsonb_columns
from (
  select c.table_name, c.column_name
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema=c.table_schema and t.table_name=c.table_name
  where c.table_schema='public'
    and t.table_type='BASE TABLE'
    and c.data_type='jsonb'
  except
  select ne.table_name, ne.column_name
  from public.normalization_exceptions ne
) x;

-- 6) Audit tables must be profile-linked (3NF user lineage)
with required(conrelid, conname) as (
  values
    ('public.studio_deletion_audit'::regclass, 'studio_deletion_audit_owner_id_fkey'),
    ('public.studio_deletion_audit'::regclass, 'studio_deletion_audit_deleted_by_fkey'),
    ('public.gig_deletion_audit'::regclass, 'gig_deletion_audit_organizer_id_fkey'),
    ('public.gig_deletion_audit'::regclass, 'gig_deletion_audit_deleted_by_fkey'),
    ('public.group_deletion_audit'::regclass, 'group_deletion_audit_owner_id_fkey'),
    ('public.group_deletion_audit'::regclass, 'group_deletion_audit_deleted_by_fkey'),
    ('public.normalization_exceptions'::regclass, 'normalization_exceptions_approved_by_user_id_fkey')
)
select 'audit_user_fk_presence' as check_name,
       case when count(*) = 7 then 'PASS' else 'FAIL' end as status,
       count(*) as present_fk_count
from required r
join pg_constraint c
  on c.conrelid = r.conrelid
 and c.conname = r.conname;

-- 7) Audit tables must not contain dangling user ids
select 'audit_user_fk_orphans' as check_name,
       case when sum(orphans) = 0 then 'PASS' else 'FAIL' end as status,
       sum(orphans) as orphan_count
from (
  select count(*) filter (
    where owner_id is not null
      and not exists (select 1 from public.profiles p where p.id = s.owner_id)
  ) as orphans
  from public.studio_deletion_audit s

  union all

  select count(*) filter (
    where deleted_by is not null
      and not exists (select 1 from public.profiles p where p.id = s.deleted_by)
  ) as orphans
  from public.studio_deletion_audit s

  union all

  select count(*) filter (
    where organizer_id is not null
      and not exists (select 1 from public.profiles p where p.id = g.organizer_id)
  ) as orphans
  from public.gig_deletion_audit g

  union all

  select count(*) filter (
    where deleted_by is not null
      and not exists (select 1 from public.profiles p where p.id = g.deleted_by)
  ) as orphans
  from public.gig_deletion_audit g

  union all

  select count(*) filter (
    where owner_id is not null
      and not exists (select 1 from public.profiles p where p.id = gr.owner_id)
  ) as orphans
  from public.group_deletion_audit gr

  union all

  select count(*) filter (
    where deleted_by is not null
      and not exists (select 1 from public.profiles p where p.id = gr.deleted_by)
  ) as orphans
  from public.group_deletion_audit gr
) q;