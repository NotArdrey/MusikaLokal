-- Create a function to check if a verification session was successful
-- This acts as a gatekeeper before account creation to prevent spoofing
CREATE OR REPLACE FUNCTION check_verification_session(p_session_ref TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_data JSONB;
    v_status TEXT;
BEGIN
    SELECT verification_data, status INTO v_data, v_status
    FROM verification_sessions
    WHERE session_ref = p_session_ref;

    IF v_status = 'APPROVED' THEN
        RETURN jsonb_build_object('valid', true, 'data', v_data);
    ELSE
        RETURN jsonb_build_object('valid', false);
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION check_verification_session TO anon, authenticated, service_role;
