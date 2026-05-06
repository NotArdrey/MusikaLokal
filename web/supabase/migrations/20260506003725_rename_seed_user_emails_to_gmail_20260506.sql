do $$
begin
  if exists (
    with target(old_email, new_email) as (
      values
        ('anya.cruz@musikalokal.app', 'anya.cruz@gmail.com'),
        ('joel.santos@musikalokal.app', 'joel.santos@gmail.com'),
        ('kai.delacruz@musikalokal.app', 'kai.delacruz@gmail.com'),
        ('lio.ramos@musikalokal.app', 'lio.ramos@gmail.com'),
        ('mara.reyes@musikalokal.app', 'mara.reyes@gmail.com'),
        ('nina.tan@musikalokal.app', 'nina.tan@gmail.com')
    )
    select 1
    from target t
    where exists (
      select 1
      from auth.users u
      where lower(u.email) = t.new_email
        and lower(u.email) <> t.old_email
    )
    or exists (
      select 1
      from public.profiles p
      where lower(p.email) = t.new_email
        and lower(p.email) <> t.old_email
    )
  ) then
    raise exception 'Cannot rename emails because one or more target Gmail addresses already exists.';
  end if;
end $$;

with target(old_email, new_email) as (
  values
    ('anya.cruz@musikalokal.app', 'anya.cruz@gmail.com'),
    ('joel.santos@musikalokal.app', 'joel.santos@gmail.com'),
    ('kai.delacruz@musikalokal.app', 'kai.delacruz@gmail.com'),
    ('lio.ramos@musikalokal.app', 'lio.ramos@gmail.com'),
    ('mara.reyes@musikalokal.app', 'mara.reyes@gmail.com'),
    ('nina.tan@musikalokal.app', 'nina.tan@gmail.com')
), user_map as (
  select u.id, t.new_email
  from target t
  join auth.users u on lower(u.email) = t.old_email
)
update auth.users u
set
  email = m.new_email,
  email_confirmed_at = coalesce(u.email_confirmed_at, now()),
  confirmation_token = '',
  email_change = '',
  email_change_token_new = '',
  email_change_token_current = '',
  recovery_token = coalesce(u.recovery_token, ''),
  phone_change = coalesce(u.phone_change, ''),
  phone_change_token = coalesce(u.phone_change_token, ''),
  reauthentication_token = coalesce(u.reauthentication_token, ''),
  raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('email', m.new_email, 'email_verified', true),
  updated_at = now()
from user_map m
where u.id = m.id;

with target(old_email, new_email) as (
  values
    ('anya.cruz@musikalokal.app', 'anya.cruz@gmail.com'),
    ('joel.santos@musikalokal.app', 'joel.santos@gmail.com'),
    ('kai.delacruz@musikalokal.app', 'kai.delacruz@gmail.com'),
    ('lio.ramos@musikalokal.app', 'lio.ramos@gmail.com'),
    ('mara.reyes@musikalokal.app', 'mara.reyes@gmail.com'),
    ('nina.tan@musikalokal.app', 'nina.tan@gmail.com')
), user_map as (
  select u.id, t.new_email
  from target t
  join auth.users u on lower(u.email) = t.new_email
)
update auth.identities i
set
  identity_data = coalesce(i.identity_data, '{}'::jsonb)
    || jsonb_build_object('email', m.new_email, 'email_verified', true, 'sub', m.id::text),
  updated_at = now()
from user_map m
where i.user_id = m.id
  and i.provider = 'email';

with target(old_email, new_email) as (
  values
    ('anya.cruz@musikalokal.app', 'anya.cruz@gmail.com'),
    ('joel.santos@musikalokal.app', 'joel.santos@gmail.com'),
    ('kai.delacruz@musikalokal.app', 'kai.delacruz@gmail.com'),
    ('lio.ramos@musikalokal.app', 'lio.ramos@gmail.com'),
    ('mara.reyes@musikalokal.app', 'mara.reyes@gmail.com'),
    ('nina.tan@musikalokal.app', 'nina.tan@gmail.com')
)
update public.profiles p
set email = t.new_email
from target t
where lower(p.email) = t.old_email;
