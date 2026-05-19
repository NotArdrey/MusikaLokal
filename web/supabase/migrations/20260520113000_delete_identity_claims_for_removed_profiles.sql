delete from public.identity_document_claims c
where (
    c.user_id is null
    and c.original_user_id is not null
    and not exists (
      select 1
      from public.profiles p
      where p.id = c.original_user_id
    )
  )
  or (
    c.user_id is not null
    and not exists (
      select 1
      from public.profiles p
      where p.id = c.user_id
    )
  );

alter table public.identity_document_claims
  drop constraint if exists identity_document_claims_user_id_fkey;

alter table public.identity_document_claims
  add constraint identity_document_claims_user_id_fkey
  foreign key (user_id)
  references public.profiles(id)
  on delete cascade;

comment on constraint identity_document_claims_user_id_fkey on public.identity_document_claims is
  'Identity claims are removed when the owning profile is removed, including admin-deleted accounts.';
