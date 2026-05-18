-- Remove retired subscription billing schema.
-- Safety: user/payment-bearing subscription records must be empty before drop.

SET lock_timeout = '5s';
SET statement_timeout = '30s';

DO $$
DECLARE
  existing_rows bigint;
  has_status_column boolean;
  has_expires_column boolean;
  has_plan_column boolean;
  profile_check_sql text;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'subscription_status'
  ) INTO has_status_column;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'subscription_expires_at'
  ) INTO has_expires_column;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'subscription_plan_id'
  ) INTO has_plan_column;

  IF has_status_column OR has_expires_column OR has_plan_column THEN
    profile_check_sql := 'SELECT count(*) FROM public.profiles WHERE false';

    IF has_status_column THEN
      profile_check_sql := profile_check_sql ||
        ' OR coalesce(nullif(lower(subscription_status), ''''), ''none'') <> ''none''';
    END IF;

    IF has_expires_column THEN
      profile_check_sql := profile_check_sql || ' OR subscription_expires_at IS NOT NULL';
    END IF;

    IF has_plan_column THEN
      profile_check_sql := profile_check_sql || ' OR subscription_plan_id IS NOT NULL';
    END IF;

    EXECUTE profile_check_sql INTO existing_rows;
    IF existing_rows <> 0 THEN
      RAISE EXCEPTION 'Refusing to drop profile subscription columns because % profile row(s) still contain subscription data', existing_rows;
    END IF;
  END IF;

  IF to_regclass('public.subscription_payments') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.subscription_payments' INTO existing_rows;
    IF existing_rows <> 0 THEN
      RAISE EXCEPTION 'Refusing to drop public.subscription_payments because it contains % row(s)', existing_rows;
    END IF;
  END IF;

  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.subscriptions' INTO existing_rows;
    IF existing_rows <> 0 THEN
      RAISE EXCEPTION 'Refusing to drop public.subscriptions because it contains % row(s)', existing_rows;
    END IF;
  END IF;

  IF has_plan_column THEN
    ALTER TABLE public.profiles DROP COLUMN IF EXISTS subscription_plan_id;
  END IF;

  IF has_expires_column THEN
    ALTER TABLE public.profiles DROP COLUMN IF EXISTS subscription_expires_at;
  END IF;

  IF has_status_column THEN
    ALTER TABLE public.profiles DROP COLUMN IF EXISTS subscription_status;
  END IF;

  DROP TABLE IF EXISTS public.subscription_payments;
  DROP TABLE IF EXISTS public.subscriptions;
  DROP TABLE IF EXISTS public.subscription_plans;
END $$;
