BEGIN;

REVOKE ALL ON FUNCTION public.process_mock_withdrawal(uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_mock_withdrawal(uuid, uuid, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.process_mock_withdrawal(uuid, uuid, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_mock_withdrawal(uuid, uuid, numeric) TO service_role;

COMMIT;
