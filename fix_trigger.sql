-- FIX: Remove the broken trigger that references non-existent columns
-- Run this in Supabase SQL Editor IMMEDIATELY

-- Drop the broken trigger
DROP TRIGGER IF EXISTS on_profile_verified ON profiles;

-- Drop the broken function
DROP FUNCTION IF EXISTS trigger_verification_email();

-- Recreate the function with correct column names (only full_name exists)
CREATE OR REPLACE FUNCTION trigger_verification_email()
RETURNS TRIGGER AS $$
DECLARE
    v_user_email TEXT;
    v_display_name TEXT;
BEGIN
    -- Only trigger when is_verified changes from false to true
    IF NEW.is_verified = TRUE AND (OLD.is_verified IS NULL OR OLD.is_verified = FALSE) THEN
        -- Use full_name only (first_name and display_name don't exist in profiles table)
        v_display_name := COALESCE(NEW.full_name, 'there');
        
        -- Get email from auth.users
        SELECT email INTO v_user_email 
        FROM auth.users 
        WHERE id = NEW.id;
        
        IF v_user_email IS NOT NULL THEN
            -- Insert into email queue (if table exists)
            BEGIN
                INSERT INTO email_notifications (
                    recipient_email,
                    recipient_name,
                    subject,
                    html_content,
                    template_type,
                    status
                ) VALUES (
                    v_user_email,
                    v_display_name,
                    '✅ Your Identity Has Been Verified - MusikaLokal',
                    format(
                        '<h1>🎵 MusikaLokal</h1>
                        <p>Hi %s,</p>
                        <p>Great news! Your identity has been successfully verified. 
                        You now have full access to all MusikaLokal features.</p>
                        <p><a href="musikalokal://login?verified=true">Open MusikaLokal App</a></p>',
                        v_display_name
                    ),
                    'verification_complete',
                    'pending'
                );
                
                RAISE NOTICE 'Verification email queued for %', v_user_email;
            EXCEPTION WHEN undefined_table THEN
                RAISE NOTICE 'email_notifications table does not exist, skipping email queue';
            END;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER on_profile_verified
    AFTER UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION trigger_verification_email();

-- Also fix the send_verification_email function
CREATE OR REPLACE FUNCTION send_verification_email(
    p_email TEXT,
    p_name TEXT,
    p_subject TEXT,
    p_html TEXT
) RETURNS BOOLEAN AS $$
BEGIN
    -- Just log for now - actual email sending is handled by Edge Function
    RAISE NOTICE 'Email requested for % with subject: %', p_email, p_subject;
    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error in send_verification_email: %', SQLERRM;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify the fix
SELECT 'Trigger fixed successfully!' as status;
