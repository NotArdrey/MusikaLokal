// @ts-nocheck
import { decode as base64Decode } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature',
}

// Webhook secret key for signature validation
const WEBHOOK_SECRET_KEY = 'NI3SI6-68go4my2TjpQOCyvNs90aZ9PLjZV-zB0Ed7w';

/**
 * Didit Webhook Handler with Signature Validation
 * 
 * Handles all Didit verification states:
 * - Approved: is_verified = true, verification_status = APPROVED
 * - Declined: is_verified = false, verification_status = DECLINED, clear session
 * - Abandoned: is_verified = false, verification_status = ABANDONED, clear session
 * - In Review: verification_status = PENDING_REVIEW (blocks new attempts)
 * 
 * Security: Validates x-signature header using HMAC-SHA256
 */

/**
 * Verify webhook signature using HMAC-SHA256
 */
async function verifySignature(payload: string, signature: string): Promise<boolean> {
    try {
        // The signature is base64 encoded HMAC-SHA256
        const encoder = new TextEncoder();
        const keyData = encoder.encode(WEBHOOK_SECRET_KEY);
        
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign', 'verify']
        );

        const payloadData = encoder.encode(payload);
        const signatureBytes = base64Decode(signature);

        const isValid = await crypto.subtle.verify(
            'HMAC',
            cryptoKey,
            signatureBytes,
            payloadData
        );

        return isValid;
    } catch (error) {
        console.error('Signature verification error:', error);
        return false;
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Get raw body for signature verification
        const rawBody = await req.text();
        const signature = req.headers.get('x-signature') || '';
        
        // Verify signature (skip in development if no signature provided)
        if (signature) {
            const isValid = await verifySignature(rawBody, signature);
            if (!isValid) {
                console.error('Invalid webhook signature');
                return new Response(JSON.stringify({ error: 'Invalid signature' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 401,
                });
            }
            console.log('Webhook signature verified successfully');
        } else {
            console.warn('No signature provided - proceeding without verification');
        }

        const payload = JSON.parse(rawBody);
        console.log('Received Didit Webhook:', JSON.stringify(payload, null, 2));

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        // Extract session info from Didit payload
        const sessionId = payload.session_id;
        const status = payload.status; // 'Not Started', 'In Progress', 'Completed', etc.
        const webhookType = payload.webhook_type;
        const decision = payload.decision;
        // The reference should be the user's UUID (passed during verification initiation)
        const userReference = payload.reference || payload.vendor_data;

        console.log('Webhook details:', { 
            webhookType, 
            status, 
            sessionId, 
            userReference,
            hasDecision: !!decision 
        });

        // Handle different webhook types and statuses
        
        // 1. Session Started - Update status to PENDING
        if (status === 'Not Started' || status === 'In Progress') {
            if (userReference) {
                await supabaseAdmin
                    .from('profiles')
                    .update({
                        verification_status: 'PENDING',
                        didit_session_id: sessionId,
                    })
                    .eq('id', userReference);
                
                console.log(`Verification started for user ${userReference}, session ${sessionId}`);
            }
            
            return new Response(JSON.stringify({ received: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // 2. Decision Made - Process the result
        if (decision) {
            const idVerification = decision.id_verifications?.[0];
            const faceMatch = decision.face_matches?.[0];
            const faceMatchStatus = faceMatch?.status; // 'Approved', 'Declined', 'Abandoned', 'In Review'

            console.log('Decision details:', { 
                faceMatchStatus, 
                idVerificationStatus: idVerification?.status 
            });

            if (!userReference) {
                console.error('No user reference in decision webhook');
                return new Response(JSON.stringify({ error: 'No user reference' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            // Get the user's auth info
            const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userReference);
            if (authError) {
                console.log('Failed to get auth user:', authError.message);
            }
            const userEmail = authUser?.user?.email;

            // Extract warnings for duplicate detection
            // Warnings can be at multiple levels in the decision object:
            // - decision.warnings (top-level)
            // - decision.id_verifications[0].warnings (ID document warnings)
            // - decision.face_searches[0].warnings (face search warnings)
            // - decision.face_matches[0].warnings (face match warnings)
            
            const topLevelWarnings = decision.warnings || [];
            const idVerificationWarnings = idVerification?.warnings || [];
            const faceSearchWarnings = decision.face_searches?.[0]?.warnings || [];
            const faceMatchWarnings = faceMatch?.warnings || [];
            
            // Combine all warnings
            const allWarnings = [
                ...topLevelWarnings,
                ...idVerificationWarnings,
                ...faceSearchWarnings,
                ...faceMatchWarnings
            ];
            
            // Check for duplicate-related warnings - these only trigger when
            // the face/document was used in a PREVIOUSLY APPROVED session
            // Confirmed from Didit docs: ID_DOCUMENT_IN_BLOCKLIST, FACE_IN_BLOCKLIST
            const duplicateWarningCodes = [
                'FACE_IN_BLOCKLIST',
                'ID_DOCUMENT_IN_BLOCKLIST', 
                'PHONE_NUMBER_IN_BLOCKLIST',
                'EMAIL_IN_BLOCKLIST'
            ];
            
            const isDuplicateOfApprovedAccount = allWarnings.some((w: any) => {
                const warningCode = typeof w === 'string' ? w : w.code || w.type || w.warning;
                return duplicateWarningCodes.some(dw => warningCode?.toUpperCase?.().includes(dw));
            });
            
            console.log('Duplicate detection:', { 
                topLevelWarnings,
                idVerificationWarnings,
                faceSearchWarnings,
                faceMatchWarnings,
                allWarnings,
                isDuplicateOfApprovedAccount
            });

            // Handle different decision statuses
            switch (faceMatchStatus) {
                case 'Approved':
                    await handleApproved(supabaseAdmin, userReference, userEmail, idVerification, authUser);
                    break;
                
                case 'Declined':
                    // Only delete account if this is a duplicate of an ALREADY APPROVED account
                    // (someone trying to create a new account with same ID/face)
                    // Regular declines (expired ID, different ID type retry, etc.) just allow retry
                    if (isDuplicateOfApprovedAccount) {
                        await handleDuplicateDetected(supabaseAdmin, userReference, userEmail, allWarnings);
                    } else {
                        // Normal decline - user can retry with same account (different ID, better photo, etc.)
                        await handleDeclined(supabaseAdmin, userReference);
                    }
                    break;
                
                case 'Abandoned':
                    await handleAbandoned(supabaseAdmin, userReference);
                    break;
                
                case 'In Review':
                    await handleInReview(supabaseAdmin, userReference);
                    break;
                
                default:
                    console.log('Unknown face match status:', faceMatchStatus);
                    // Check if there's an overall approval despite unknown face status
                    if (idVerification?.status === 'Approved') {
                        await handleApproved(supabaseAdmin, userReference, userEmail, idVerification, authUser);
                    }
            }
        }

        return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error('Webhook Error:', error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})

/**
 * Send verification confirmation email
 * Supports: 1) Resend API (recommended), 2) Custom SMTP
 */
async function sendVerificationEmail(
    userEmail: string, 
    firstName: string,
    fullName: string
): Promise<boolean> {
    const displayName = firstName || fullName || 'there';
    
    // Email content
    const subject = '✅ Your Identity Has Been Verified - MusikaLokal';
    const textContent = `Hi ${displayName},\n\nGreat news! Your identity has been successfully verified. You now have full access to all MusikaLokal features.\n\nOpen the MusikaLokal app to get started!\n\nBest regards,\nThe MusikaLokal Team`;
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Identity Verified - MusikaLokal</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #6366f1; margin: 0;">🎵 MusikaLokal</h1>
    </div>
    
    <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 30px; border-radius: 16px; text-align: center; margin-bottom: 30px;">
        <div style="font-size: 48px; margin-bottom: 10px;">✅</div>
        <h2 style="margin: 0 0 10px 0;">Identity Verified!</h2>
        <p style="margin: 0; opacity: 0.9;">Your account is now fully verified</p>
    </div>
    
    <p>Hi ${displayName},</p>
    
    <p>Great news! Your identity has been successfully verified. You now have full access to all MusikaLokal features:</p>
    
    <ul style="background: #f8fafc; padding: 20px 20px 20px 40px; border-radius: 8px; border-left: 4px solid #6366f1;">
        <li>Book musicians and studios</li>
        <li>List your services and earn</li>
        <li>Manage gigs and bookings</li>
        <li>Connect with the music community</li>
    </ul>
    
    <div style="text-align: center; margin: 30px 0;">
        <a href="musikalokal://login?verified=true" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600;">Open MusikaLokal App</a>
    </div>
    
    <p style="color: #64748b; font-size: 14px;">If the button doesn't work, open the MusikaLokal app on your device and sign in with your credentials.</p>
    
    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
    
    <p style="color: #64748b; font-size: 12px; text-align: center;">
        This email was sent by MusikaLokal. If you didn't create an account, please ignore this email.<br>
        © ${new Date().getFullYear()} MusikaLokal. All rights reserved.
    </p>
</body>
</html>`;

    // Try Resend API first (recommended by Supabase)
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (resendApiKey) {
        try {
            const resendFrom = Deno.env.get('RESEND_FROM') || 'MusikaLokal <noreply@musikalokal.com>';
            
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${resendApiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: resendFrom,
                    to: [userEmail],
                    subject: subject,
                    html: htmlContent,
                    text: textContent,
                }),
            });

            if (response.ok) {
                const result = await response.json();
                console.log(`Verification email sent via Resend to ${userEmail}`, result);
                return true;
            } else {
                const error = await response.text();
                console.error('Resend API error:', error);
            }
        } catch (error) {
            console.error('Failed to send email via Resend:', error);
        }
    }

    // Fallback to SMTP (Gmail uses port 465 with TLS or port 587 with STARTTLS)
    const smtpHost = Deno.env.get('SMTP_HOST');
    const smtpUser = Deno.env.get('SMTP_USER');
    const smtpPass = Deno.env.get('SMTP_PASS');
    
    if (smtpHost && smtpUser && smtpPass) {
        try {
            const smtpPort = parseInt(Deno.env.get('SMTP_PORT') || '465');
            const smtpFrom = Deno.env.get('SMTP_FROM') || 'noreply@musikalokal.com';
            const smtpFromName = Deno.env.get('SMTP_FROM_NAME') || 'MusikaLokal';

            const client = new SmtpClient();

            // Gmail uses port 465 with implicit TLS
            if (smtpPort === 465) {
                await client.connectTLS({
                    hostname: smtpHost,
                    port: smtpPort,
                    username: smtpUser,
                    password: smtpPass,
                });
            } else {
                // Port 587 uses STARTTLS
                await client.connect({
                    hostname: smtpHost,
                    port: smtpPort,
                    username: smtpUser,
                    password: smtpPass,
                });
            }

            await client.send({
                from: `${smtpFromName} <${smtpFrom}>`,
                to: userEmail,
                subject: subject,
                content: textContent,
                html: htmlContent,
            });

            await client.close();

            console.log(`Verification email sent via SMTP to ${userEmail}`);
            return true;
        } catch (error) {
            console.error('Failed to send email via SMTP:', error);
        }
    }

    console.log('No email provider configured (RESEND_API_KEY or SMTP credentials), skipping email send');
    return false;
}

/**
 * Handle APPROVED verification
 * Only now do we store the full profile details from the ID document
 * and confirm the email (since ID verification is a stronger confirmation)
 */
async function handleApproved(
    supabaseAdmin: any, 
    userReference: string, 
    userEmail: string | undefined,
    idVerification: any,
    authUser: any
) {
    // Extract ID document data - ONLY store these details after verification approved
    const firstName = idVerification?.first_name || '';
    const lastName = idVerification?.last_name || idVerification?.extra_fields?.first_surname || '';
    const fullName = firstName && lastName ? `${firstName} ${lastName}` : (firstName || lastName || '');
    const documentExpiry = idVerification?.expiration_date || null;
    const dateOfBirth = idVerification?.date_of_birth || null;
    const nationality = idVerification?.nationality || null;
    const documentNumber = idVerification?.document_number || null;

    console.log('Approving user:', { userReference, fullName, documentExpiry, dateOfBirth, nationality });

    // Confirm the email in auth system since ID verification is a stronger form of verification
    if (userEmail) {
        try {
            const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(userReference, {
                email_confirm: true
            });
            
            if (confirmError) {
                console.log('Failed to confirm email:', confirmError.message);
            } else {
                console.log(`Email confirmed for verified user ${userReference} (${userEmail})`);
            }
            
            // Send verification confirmation email via SMTP
            await sendVerificationEmail(userEmail, firstName, fullName);
            
        } catch (emailError) {
            console.log('Email confirmation error:', emailError);
        }
    }

    // NOW store the full profile with verified ID details
    // This is the only place where profile details are saved
    const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
            full_name: fullName || undefined,
            first_name: firstName || undefined,
            last_name: lastName || undefined,
            date_of_birth: dateOfBirth || undefined,
            nationality: nationality || undefined,
            id_document_number: documentNumber || undefined,
            is_verified: true,
            verification_status: 'APPROVED',
            id_document_expiry: documentExpiry,
            id_verified_at: new Date().toISOString(),
            // Clear session ID as verification is complete
            didit_session_id: null,
        })
        .eq('id', userReference);

    if (updateError) {
        console.log('Failed to update profile:', updateError.message);
        // Try upsert if update fails (profile might not exist)
        await supabaseAdmin
            .from('profiles')
            .upsert({
                id: userReference,
                email: userEmail,
                full_name: fullName || null,
                first_name: firstName || null,
                last_name: lastName || null,
                date_of_birth: dateOfBirth || null,
                nationality: nationality || null,
                id_document_number: documentNumber || null,
                is_verified: true,
                verification_status: 'APPROVED',
                id_document_expiry: documentExpiry,
                id_verified_at: new Date().toISOString(),
                didit_session_id: null,
                created_at: new Date().toISOString(),
            });
    }

    // Send success notification
    await supabaseAdmin
        .from('notifications')
        .insert({
            user_id: userReference,
            type: 'success',
            title: 'Identity Verified',
            message: 'Your identity has been successfully verified. You now have full access to all features.',
        });

    console.log(`Profile verified for user ${userReference}`);
}

/**
 * Handle DECLINED verification - allow retry
 * Don't store any profile details, just mark as declined
 */
async function handleDeclined(supabaseAdmin: any, userReference: string) {
    console.log('Verification declined for user:', userReference);

    // Update status to allow retry - don't store any profile details
    await supabaseAdmin
        .from('profiles')
        .update({
            is_verified: false,
            verification_status: 'DECLINED',
            // Clear any partial data
            full_name: null,
            first_name: null,
            last_name: null,
            // Clear session to allow new verification attempt
            didit_session_id: null,
        })
        .eq('id', userReference);

    // Don't insert notification - user will see status when they return to the app
    console.log('Declined - no notification inserted, user will retry from app');
}

/**
 * Handle ABANDONED verification - user didn't complete, allow retry
 * Don't store any profile details, just mark as abandoned
 */
async function handleAbandoned(supabaseAdmin: any, userReference: string) {
    console.log('Verification abandoned for user:', userReference);

    // Update status to allow retry - don't store any profile details
    await supabaseAdmin
        .from('profiles')
        .update({
            is_verified: false,
            verification_status: 'ABANDONED',
            // Clear any partial data
            full_name: null,
            first_name: null,
            last_name: null,
            // Clear session to allow new verification attempt
            didit_session_id: null,
        })
        .eq('id', userReference);

    // Don't insert notification - user will see status when they return to the app
    console.log('Abandoned - no notification inserted, user will retry from app');
}

/**
 * Handle IN REVIEW - manual review needed, block new attempts
 * Don't store profile details yet - wait for manual review result
 */
async function handleInReview(supabaseAdmin: any, userReference: string) {
    console.log('Verification in review for user:', userReference);

    // Don't store profile details yet - wait for manual review result
    await supabaseAdmin
        .from('profiles')
        .update({
            is_verified: false,
            verification_status: 'PENDING_REVIEW',
            // Keep session ID - user cannot start new session until review complete
            // Don't clear profile data - review might approve it
        })
        .eq('id', userReference);

    // Send notification - user should wait, not retry
    await supabaseAdmin
        .from('notifications')
        .insert({
            user_id: userReference,
            type: 'info',
            title: 'Manual Review in Progress',
            message: 'Your verification requires manual review. Please wait - this usually takes 1-2 business days. We\'ll notify you once complete. Do not attempt to register again.',
        });
}

/**
 * Handle DUPLICATE DETECTED - delete the orphan account completely
 * This happens when someone tries to register with a different email but same ID/face
 * that was already used by another verified account
 */
async function handleDuplicateDetected(
    supabaseAdmin: any, 
    userReference: string, 
    userEmail: string | undefined,
    warnings: any[]
) {
    console.log('DUPLICATE DETECTED for user:', userReference);
    console.log('Warnings received:', warnings);

    try {
        // First, delete the profile record to avoid foreign key issues
        const { error: profileDeleteError } = await supabaseAdmin
            .from('profiles')
            .delete()
            .eq('id', userReference);

        if (profileDeleteError) {
            console.log('Failed to delete profile:', profileDeleteError.message);
        } else {
            console.log(`Profile deleted for orphan user ${userReference}`);
        }

        // Delete any notifications that might have been created
        const { error: notificationDeleteError } = await supabaseAdmin
            .from('notifications')
            .delete()
            .eq('user_id', userReference);

        if (notificationDeleteError) {
            console.log('Failed to delete notifications:', notificationDeleteError.message);
        }

        // Finally, delete the auth.users record
        const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userReference);

        if (authDeleteError) {
            console.log('Failed to delete auth user:', authDeleteError.message);
            // If we can't delete, at least mark the account as disabled
            await supabaseAdmin.auth.admin.updateUserById(userReference, {
                ban_duration: 'none', // Permanently ban if we can't delete
            });
        } else {
            console.log(`Auth user deleted for orphan account ${userReference}`);
        }

        console.log(`Orphan account ${userReference} (${userEmail}) cleaned up due to duplicate detection`);
        console.log('The person should use their original verified account instead');

    } catch (error: any) {
        console.error('Error cleaning up duplicate account:', error.message);
        // Fallback: at least mark the profile so it's clear this is a duplicate
        await supabaseAdmin
            .from('profiles')
            .update({
                is_verified: false,
                verification_status: 'DECLINED',
                didit_session_id: null,
            })
            .eq('id', userReference);
    }
}

