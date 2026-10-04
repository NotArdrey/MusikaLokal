-- Keep media out of CV fields while allowing existing applications to be reviewed.
create or replace function public.is_cv_document_reference(value text)
returns boolean language sql immutable set search_path = '' as $$
  select value is null or btrim(value) = '' or
    lower(split_part(split_part(value, '?', 1), '#', 1)) ~ '\.(pdf|doc|docx|odt|rtf|txt|md)$';
$$;

create or replace function public.cv_document_references(row_data jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'cv_url', row_data->>'cv_url',
    'cv_storage_path', row_data->>'cv_storage_path',
    'event_cv', row_data#>>'{event_details,cv_url}',
    'request_cv', row_data#>>'{event_details,request_details,cv_url}',
    'attachment', case when lower(coalesce(
      row_data#>>'{event_details,request_details,request_kind}',
      row_data#>>'{event_details,request_kind}', row_data->>'request_kind', ''
    )) = 'application' then row_data->>'attachment_url' end
  );
$$;

create or replace function public.enforce_cv_document_references()
returns trigger language plpgsql set search_path = '' as $$
declare
  previous_refs jsonb := '{}'::jsonb;
  reference record;
begin
  if tg_op = 'UPDATE' then
    previous_refs := public.cv_document_references(to_jsonb(old));
  end if;
  for reference in select key, value from jsonb_each_text(public.cv_document_references(to_jsonb(new))) loop
    if reference.value is distinct from (previous_refs->>reference.key)
      and not public.is_cv_document_reference(reference.value) then
      raise exception using errcode = '23514',
        message = 'CV/resume uploads must be document files (PDF, DOC, DOCX, ODT, RTF, TXT, or MD). Images and videos are not allowed.';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.enforce_cv_document_references() from public;

drop trigger if exists enforce_cv_documents on public.gig_applications;
create trigger enforce_cv_documents before insert or update on public.gig_applications
for each row execute function public.enforce_cv_document_references();

drop trigger if exists enforce_cv_documents on public.gig_application_members;
create trigger enforce_cv_documents before insert or update on public.gig_application_members
for each row execute function public.enforce_cv_document_references();

drop trigger if exists enforce_cv_documents on public.booking_requests;
create trigger enforce_cv_documents before insert or update on public.booking_requests
for each row execute function public.enforce_cv_document_references();

update storage.buckets set allowed_mime_types = array[
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text', 'application/rtf', 'text/rtf',
  'text/plain', 'text/markdown'
]::text[] where id = 'application-cvs';

-- The shared documents bucket also holds other media, so restrict only CV paths.
drop policy if exists "CV uploads require document types" on storage.objects;
create policy "CV uploads require document types" on storage.objects
as restrictive for insert to authenticated
with check (
  not (bucket_id = 'application-cvs' or (bucket_id = 'documents' and name ~ '^[^/]+/(cvs|applications|gig-applications)/'))
  or (public.is_cv_document_reference(name) and metadata->>'mimetype' in (
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text', 'application/rtf', 'text/rtf',
    'text/plain', 'text/markdown'
  ))
);

drop policy if exists "CV replacements require document types" on storage.objects;
create policy "CV replacements require document types" on storage.objects
as restrictive for update to authenticated
using (true)
with check (
  not (bucket_id = 'application-cvs' or (bucket_id = 'documents' and name ~ '^[^/]+/(cvs|applications|gig-applications)/'))
  or (public.is_cv_document_reference(name) and metadata->>'mimetype' in (
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text', 'application/rtf', 'text/rtf',
    'text/plain', 'text/markdown'
  ))
);
