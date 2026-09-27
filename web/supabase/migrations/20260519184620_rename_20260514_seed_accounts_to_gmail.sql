
do $$
begin
  if exists (
    with target(old_email, new_email) as (
      values
        ('juan.delacruz.20260514@musikalokal.app', 'juan.delacruz.20260514@gmail.com'),
        ('mara.reyes.20260514@musikalokal.app', 'mara.reyes.20260514@gmail.com')
    )
    select 1
    from target t
    where exists (
      select 1
      from auth.users u
      where lower(u.email) = lower(t.new_email)
        and lower(u.email) <> lower(t.old_email)
    )
    or exists (
      select 1
      from public.profiles p
      where lower(p.email) = lower(t.new_email)
        and lower(p.email) <> lower(t.old_email)
    )
  ) then
    raise exception 'Cannot rename emails because one or more target Gmail addresses already exists.';
  end if;
end $$;

with target(old_email, new_email) as (
  values
    ('juan.delacruz.20260514@musikalokal.app', 'juan.delacruz.20260514@gmail.com'),
    ('mara.reyes.20260514@musikalokal.app', 'mara.reyes.20260514@gmail.com')
), user_map as (
  select u.id, t.old_email, t.new_email
  from target t
  join auth.users u on lower(u.email) = lower(t.old_email)
), upd_auth as (
  update auth.users u
  set
    instance_id = coalesce(u.instance_id, '00000000-0000-0000-0000-000000000000'::uuid),
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
  where u.id = m.id
  returning u.id
), upd_identity as (
  update auth.identities i
  set
    identity_data = coalesce(i.identity_data, '{}'::jsonb)
      || jsonb_build_object('email', m.new_email, 'email_verified', true, 'sub', m.id::text),
    updated_at = now()
  from user_map m
  where i.user_id = m.id
    and i.provider = 'email'
  returning i.user_id
), upd_profile as (
  update public.profiles p
  set email = m.new_email
  from user_map m
  where p.id = m.id
  returning p.id
)
select
  (select count(*) from user_map)::int as target_users,
  (select count(*) from upd_auth)::int as auth_users_updated,
  (select count(*) from upd_identity)::int as identities_updated,
  (select count(*) from upd_profile)::int as profiles_updated;
;
