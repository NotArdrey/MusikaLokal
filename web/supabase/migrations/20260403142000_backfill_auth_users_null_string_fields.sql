-- Backfill nullable auth string fields that can break GoTrue scan paths when NULL.
-- Seen in Auth logs as:
--   error finding user: sql: Scan error ... converting NULL to string is unsupported
--   500: Database error querying schema

BEGIN;

UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, '')
WHERE confirmation_token IS NULL
   OR recovery_token IS NULL
   OR email_change_token_new IS NULL
   OR email_change IS NULL;

COMMIT;
