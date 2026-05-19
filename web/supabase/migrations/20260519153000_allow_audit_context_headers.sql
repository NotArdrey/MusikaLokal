-- Allow service-role Edge Functions to attribute trigger-based audit rows to
-- the authenticated admin that initiated the request.

CREATE OR REPLACE FUNCTION public.audit_current_actor_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public, auth
AS $$
DECLARE
  configured_actor text;
  header_actor text;
  jwt_actor text;
  request_headers jsonb;
BEGIN
  configured_actor := nullif(current_setting('app.audit.actor_user_id', true), '');
  IF configured_actor IS NOT NULL THEN
    BEGIN
      RETURN configured_actor::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
  END IF;

  BEGIN
    request_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    header_actor := nullif(btrim(coalesce(request_headers ->> 'x-audit-actor-user-id', '')), '');
  EXCEPTION WHEN others THEN
    header_actor := NULL;
  END;

  IF header_actor IS NOT NULL THEN
    BEGIN
      RETURN header_actor::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
  END IF;

  BEGIN
    RETURN auth.uid();
  EXCEPTION WHEN others THEN
    NULL;
  END;

  jwt_actor := nullif(current_setting('request.jwt.claim.sub', true), '');
  IF jwt_actor IS NOT NULL THEN
    BEGIN
      RETURN jwt_actor::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_current_actor_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  configured_role text;
  header_role text;
  jwt_role text;
  request_headers jsonb;
BEGIN
  configured_role := nullif(current_setting('app.audit.actor_role', true), '');
  IF configured_role IS NOT NULL THEN
    RETURN configured_role;
  END IF;

  BEGIN
    request_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    header_role := nullif(btrim(coalesce(request_headers ->> 'x-audit-actor-role', '')), '');
  EXCEPTION WHEN others THEN
    header_role := NULL;
  END;

  IF header_role IS NOT NULL THEN
    RETURN header_role;
  END IF;

  jwt_role := nullif(current_setting('request.jwt.claim.role', true), '');
  IF jwt_role IS NOT NULL THEN
    RETURN jwt_role;
  END IF;

  RETURN current_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_current_source()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  configured_source text;
  header_source text;
  jwt_role text;
  request_headers jsonb;
BEGIN
  configured_source := nullif(current_setting('app.audit.source', true), '');
  IF configured_source IS NOT NULL THEN
    RETURN configured_source;
  END IF;

  BEGIN
    request_headers := nullif(current_setting('request.headers', true), '')::jsonb;
    header_source := nullif(btrim(coalesce(request_headers ->> 'x-audit-source', '')), '');
  EXCEPTION WHEN others THEN
    header_source := NULL;
  END;

  IF header_source IS NOT NULL THEN
    RETURN header_source;
  END IF;

  jwt_role := nullif(current_setting('request.jwt.claim.role', true), '');
  IF jwt_role = 'service_role' THEN
    RETURN 'service_role';
  END IF;

  IF nullif(current_setting('request.method', true), '') IS NOT NULL THEN
    RETURN 'client';
  END IF;

  RETURN 'database';
END;
$$;

REVOKE ALL ON FUNCTION public.audit_current_actor_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_current_actor_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_current_source() FROM PUBLIC, anon, authenticated;
