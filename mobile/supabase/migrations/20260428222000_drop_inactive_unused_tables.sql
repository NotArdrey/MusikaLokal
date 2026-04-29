-- Drop inactive tables that have no mobile CRUD/fetch path and no DB-side dependency.
-- review_likes is intentionally retained because reviews_with_stats depends on it.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

DO $$
DECLARE
  existing_rows bigint;
BEGIN
  IF to_regclass('public.admin_audit_log') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.admin_audit_log' INTO existing_rows;
    IF existing_rows <> 0 THEN
      RAISE EXCEPTION 'Refusing to drop public.admin_audit_log because it contains % rows', existing_rows;
    END IF;

    EXECUTE 'DROP TABLE public.admin_audit_log';
  END IF;

  IF to_regclass('public.review_comments') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.review_comments' INTO existing_rows;
    IF existing_rows <> 0 THEN
      RAISE EXCEPTION 'Refusing to drop public.review_comments because it contains % rows', existing_rows;
    END IF;

    EXECUTE 'DROP TABLE public.review_comments';
  END IF;

  IF to_regclass('public.user_entitlements') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.user_entitlements' INTO existing_rows;
    IF existing_rows <> 0 THEN
      RAISE EXCEPTION 'Refusing to drop public.user_entitlements because it contains % rows', existing_rows;
    END IF;

    EXECUTE 'DROP TABLE public.user_entitlements';
  END IF;
END $$;
