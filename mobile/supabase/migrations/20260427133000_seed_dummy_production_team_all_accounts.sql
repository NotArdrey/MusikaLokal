-- Seed a dummy production team that every existing profile account can see.
-- This is for broad QA coverage across role-specific account flows.

DO $$
DECLARE
  v_team_id uuid := '11111111-1111-4111-8111-111111111118';
  v_owner_id uuid;
BEGIN
  SELECT p.id
  INTO v_owner_id
  FROM public.profiles p
  WHERE lower(coalesce(p.email, '')) = 'producer@test.com'
  LIMIT 1;

  IF v_owner_id IS NULL THEN
    SELECT p.id
    INTO v_owner_id
    FROM public.profiles p
    WHERE lower(coalesce(p.role, '')) = 'producer'
    ORDER BY p.created_at NULLS LAST, p.id
    LIMIT 1;
  END IF;

  IF v_owner_id IS NULL THEN
    SELECT p.id
    INTO v_owner_id
    FROM public.profiles p
    ORDER BY p.created_at NULLS LAST, p.id
    LIMIT 1;
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE NOTICE 'Skipping dummy production team seed because no profile accounts exist.';
    RETURN;
  END IF;

  INSERT INTO public.production_teams (
    id,
    owner_id,
    name,
    description,
    logo_url
  )
  VALUES (
    v_team_id,
    v_owner_id,
    'Harborlight Production Collective',
    'Dummy production team shared across all accounts for QA coverage of production dashboards, team details, member lists, and cross-role navigation.',
    'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800&fit=crop'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    owner_id = EXCLUDED.owner_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    logo_url = EXCLUDED.logo_url,
    updated_at = timezone('utc'::text, now());

  INSERT INTO public.production_team_members (
    team_id,
    user_id,
    role
  )
  SELECT
    v_team_id,
    p.id,
    CASE
      WHEN p.id = v_owner_id THEN 'owner'
      WHEN lower(coalesce(p.role, '')) = 'producer' THEN 'manager'
      ELSE 'member'
    END
  FROM public.profiles p
  ON CONFLICT (team_id, user_id) DO UPDATE
  SET role = EXCLUDED.role;
END
$$;
