-- Enable pg_net extension for HTTP requests from PostgreSQL
-- This allows sending emails through external APIs from database triggers/functions
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create email_notifications table to queue emails
CREATE TABLE IF NOT EXISTS email_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,
    subject TEXT NOT NULL,
    html_content TEXT,
    text_content TEXT,
    template_type TEXT,
    status TEXT DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for processing pending emails
CREATE INDEX IF NOT EXISTS idx_email_notifications_status 
ON email_notifications(status) WHERE status = 'pending';

-- Function to send verification email using Supabase's configured SMTP
-- This uses pg_net to call an Edge Function that handles the actual sending
CREATE OR REPLACE FUNCTION send_verification_email(
    p_email TEXT,
    p_name TEXT,
    p_subject TEXT,
    p_html TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_project_url TEXT;
    v_service_key TEXT;
BEGIN
    -- Get Supabase project URL from environment (set in Vault)
    v_project_url := current_setting('app.settings.supabase_url', TRUE);
    v_service_key := current_setting('app.settings.service_role_key', TRUE);
    
    -- If settings not available, just log and return
    IF v_project_url IS NULL OR v_service_key IS NULL THEN
        RAISE NOTICE 'Email settings not configured, skipping email send';
        RETURN FALSE;
    END IF;
    
    -- Queue the email for sending via Edge Function
    INSERT INTO email_notifications (
        recipient_email,
        recipient_name,
        subject,
        html_content,
        template_type,
        status
    ) VALUES (
        p_email,
        p_name,
        p_subject,
        p_html,
        'verification_complete',
        'pending'
    );
    
    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error queuing email: %', SQLERRM;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to send email when user is verified
CREATE OR REPLACE FUNCTION trigger_verification_email()
RETURNS TRIGGER AS $$
DECLARE
    v_user_email TEXT;
    v_display_name TEXT;
BEGIN
    -- Only trigger when is_verified changes from false to true
    IF NEW.is_verified = TRUE AND (OLD.is_verified IS NULL OR OLD.is_verified = FALSE) THEN
        v_display_name := COALESCE(NEW.first_name, NEW.display_name, NEW.full_name, 'there');
        
        -- Get email from auth.users
        SELECT email INTO v_user_email 
        FROM auth.users 
        WHERE id = NEW.id;
        
        IF v_user_email IS NOT NULL THEN
            -- Insert into email queue
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
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on profiles table
DROP TRIGGER IF EXISTS on_profile_verified ON profiles;
CREATE TRIGGER on_profile_verified
    AFTER UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION trigger_verification_email();

-- Grant necessary permissions
GRANT SELECT, INSERT ON email_notifications TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;
