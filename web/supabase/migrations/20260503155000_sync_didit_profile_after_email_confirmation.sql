create or replace function public.sync_didit_profile_after_email_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null
    and (
      tg_op = 'INSERT'
      or old.email_confirmed_at is distinct from new.email_confirmed_at
    )
    and (
      lower(coalesce(new.raw_user_meta_data ->> 'is_verified', 'false')) in ('true', '1', 'yes')
      or upper(coalesce(new.raw_user_meta_data ->> 'verification_status', '')) = 'APPROVED'
    )
  then
    insert into public.profiles (
      id,
      email,
      full_name,
      role,
      is_verified,
      verification_status,
      didit_session_id,
      id_verified_at
    )
    values (
      new.id,
      new.email,
      coalesce(
        nullif(new.raw_user_meta_data ->> 'full_name', ''),
        nullif(new.raw_user_meta_data ->> 'name', ''),
        split_part(new.email, '@', 1)
      ),
      coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'musician'),
      true,
      'APPROVED',
      nullif(
        coalesce(
          new.raw_user_meta_data ->> 'didit_session_id',
          new.raw_user_meta_data ->> 'diditSessionId'
        ),
        ''
      ),
      coalesce(new.email_confirmed_at, now())
    )
    on conflict (id) do update
      set email = excluded.email,
          full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
          role = coalesce(nullif(public.profiles.role, ''), excluded.role),
          is_verified = true,
          verification_status = 'APPROVED',
          didit_session_id = coalesce(public.profiles.didit_session_id, excluded.didit_session_id),
          id_verified_at = coalesce(public.profiles.id_verified_at, excluded.id_verified_at);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_didit_profile_after_email_confirmation on auth.users;

create trigger trg_sync_didit_profile_after_email_confirmation
after insert or update of email_confirmed_at on auth.users
for each row
execute function public.sync_didit_profile_after_email_confirmation();

insert into public.profiles (
  id,
  email,
  full_name,
  role,
  is_verified,
  verification_status,
  didit_session_id,
  id_verified_at
)
select
  u.id,
  u.email,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', ''),
    split_part(u.email, '@', 1)
  ),
  coalesce(nullif(u.raw_user_meta_data ->> 'role', ''), 'musician'),
  true,
  'APPROVED',
  nullif(
    coalesce(
      u.raw_user_meta_data ->> 'didit_session_id',
      u.raw_user_meta_data ->> 'diditSessionId'
    ),
    ''
  ),
  coalesce(u.email_confirmed_at, now())
from auth.users u
where u.email_confirmed_at is not null
  and (
    lower(coalesce(u.raw_user_meta_data ->> 'is_verified', 'false')) in ('true', '1', 'yes')
    or upper(coalesce(u.raw_user_meta_data ->> 'verification_status', '')) = 'APPROVED'
  )
on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
      role = coalesce(nullif(public.profiles.role, ''), excluded.role),
      is_verified = true,
      verification_status = 'APPROVED',
      didit_session_id = coalesce(public.profiles.didit_session_id, excluded.didit_session_id),
      id_verified_at = coalesce(public.profiles.id_verified_at, excluded.id_verified_at);
