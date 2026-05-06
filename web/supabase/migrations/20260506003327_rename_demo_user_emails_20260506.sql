do $$
begin
  if exists (
    with target(old_email, new_email) as (
      values
        ('demo.anya.cruz.20260506@musikalokal.app', 'anya.cruz@musikalokal.app'),
        ('demo.joel.santos.20260506@musikalokal.app', 'joel.santos@musikalokal.app'),
        ('demo.kai.delacruz.20260506@musikalokal.app', 'kai.delacruz@musikalokal.app'),
        ('demo.lio.ramos.20260506@musikalokal.app', 'lio.ramos@musikalokal.app'),
        ('demo.mara.reyes.20260506@musikalokal.app', 'mara.reyes@musikalokal.app'),
        ('demo.nina.tan.20260506@musikalokal.app', 'nina.tan@musikalokal.app')
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
    raise exception 'Cannot rename demo emails because one or more target emails already exists.';
  end if;
end $$;

with target(old_email, new_email) as (
  values
    ('demo.anya.cruz.20260506@musikalokal.app', 'anya.cruz@musikalokal.app'),
    ('demo.joel.santos.20260506@musikalokal.app', 'joel.santos@musikalokal.app'),
    ('demo.kai.delacruz.20260506@musikalokal.app', 'kai.delacruz@musikalokal.app'),
    ('demo.lio.ramos.20260506@musikalokal.app', 'lio.ramos@musikalokal.app'),
    ('demo.mara.reyes.20260506@musikalokal.app', 'mara.reyes@musikalokal.app'),
    ('demo.nina.tan.20260506@musikalokal.app', 'nina.tan@musikalokal.app')
), user_map as (
  select u.id, t.new_email
  from target t
  join auth.users u on lower(u.email) = t.old_email
)
update auth.users u
set
  instance_id = coalesce(u.instance_id, '00000000-0000-0000-0000-000000000000'::uuid),
  email = m.new_email,
  email_confirmed_at = coalesce(u.email_confirmed_at, now()),
  confirmation_token = '',
  email_change = '',
  email_change_token_new = '',
  email_change_token_current = '',
  raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('email', m.new_email, 'email_verified', true),
  updated_at = now()
from user_map m
where u.id = m.id;

with target(old_email, new_email) as (
  values
    ('demo.anya.cruz.20260506@musikalokal.app', 'anya.cruz@musikalokal.app'),
    ('demo.joel.santos.20260506@musikalokal.app', 'joel.santos@musikalokal.app'),
    ('demo.kai.delacruz.20260506@musikalokal.app', 'kai.delacruz@musikalokal.app'),
    ('demo.lio.ramos.20260506@musikalokal.app', 'lio.ramos@musikalokal.app'),
    ('demo.mara.reyes.20260506@musikalokal.app', 'mara.reyes@musikalokal.app'),
    ('demo.nina.tan.20260506@musikalokal.app', 'nina.tan@musikalokal.app')
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
    ('demo.anya.cruz.20260506@musikalokal.app', 'anya.cruz@musikalokal.app'),
    ('demo.joel.santos.20260506@musikalokal.app', 'joel.santos@musikalokal.app'),
    ('demo.kai.delacruz.20260506@musikalokal.app', 'kai.delacruz@musikalokal.app'),
    ('demo.lio.ramos.20260506@musikalokal.app', 'lio.ramos@musikalokal.app'),
    ('demo.mara.reyes.20260506@musikalokal.app', 'mara.reyes@musikalokal.app'),
    ('demo.nina.tan.20260506@musikalokal.app', 'nina.tan@musikalokal.app')
)
update public.profiles p
set email = t.new_email
from target t
where lower(p.email) = t.old_email;
