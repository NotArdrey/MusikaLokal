begin;

alter table public.studios
  alter column permit_status set default 'approved';

update public.studios
set
  permit_status = 'approved',
  permit_rejection_reason = null,
  permit_admin_notes = null,
  permit_reviewed_by = null,
  permit_reviewed_at = null
where permit_status is distinct from 'approved'
   or permit_rejection_reason is not null
   or permit_admin_notes is not null
   or permit_reviewed_by is not null
   or permit_reviewed_at is not null;

commit;