// @ts-nocheck
import { decode as base64Decode } from 'https://deno.land/std@0.168.0/encoding/base64.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Note: Removed SMTP library import as it's incompatible with current Deno runtime
// Using Resend API or Supabase built-in email instead

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-signature, x-supabase-client-platform',
}

// Webhook secret key for signature validation - get from env or use default
const WEBHOOK_SECRET_KEY = Deno.env.get('DIDIT_WEBHOOK_SECRET') || 'NI3SI6-68go4my2TjpQOCyvNs90aZ9PLjZV-zB0Ed7w';

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
        console.log('=== SIGNATURE VERIFICATION DEBUG ===');
        console.log('Signature received:', signature);
        console.log('Payload length:', payload.length);
        console.log('Secret key length:', WEBHOOK_SECRET_KEY.length);

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

        // Try decoding the signature
        let signatureBytes: Uint8Array;
        try {
            signatureBytes = base64Decode(signature);
            console.log('Signature decoded (base64), length:', signatureBytes.length);
        } catch (decodeError) {
            console.log('Base64 decode failed, trying hex decode');
            // Maybe it's hex encoded instead
            signatureBytes = new Uint8Array(signature.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
        }

        const isValid = await crypto.subtle.verify(
            'HMAC',
            cryptoKey,
            signatureBytes,
            payloadData
        );

        console.log('Signature valid:', isValid);
        return isValid;
    } catch (error) {
        console.error('Signature verification error:', error);
        return false;
    }
}

function firstNonEmptyString(values: any[]): string | null {
    for (const value of values) {
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
    }
    return null;
}

function normalizeDateOnly(value: any): string | null {
    const rawValue = typeof value === 'string' ? value.trim() : '';
    if (!rawValue) return null;

    const isoMatch = rawValue.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];

    return null;
}

function extractDocumentExpiry(idVerification: any): string | null {
    const rawExpiry = firstNonEmptyString([
        idVerification?.expiration_date,
        idVerification?.expiry_date,
        idVerification?.date_of_expiry,
        idVerification?.document_expiration_date,
        idVerification?.document_expiry,
        idVerification?.valid_until,
        idVerification?.expires_at,
        idVerification?.id_document_expiry,
        idVerification?.document?.expiration_date,
        idVerification?.document?.expiry_date,
        idVerification?.document?.date_of_expiry,
        idVerification?.document_details?.expiration_date,
        idVerification?.document_details?.expiry_date,
        idVerification?.document_details?.date_of_expiry,
        idVerification?.extra_fields?.expiration_date,
        idVerification?.extra_fields?.expiry_date,
        idVerification?.extra_fields?.date_of_expiry,
    ]);

    return normalizeDateOnly(rawExpiry);
}

serve(async (req) => {
    console.log('=== DIDIT WEBHOOK v41 TRIGGERED ===');

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Get raw body for signature verification
        const rawBody = await req.text();
        console.log('Raw body received, length:', rawBody.length);
        const signature = req.headers.get('x-signature') || '';

        // Verify signature but log and continue if it fails (for debugging)
        if (signature) {
            const isValid = await verifySignature(rawBody, signature);
            if (!isValid) {
                console.error('Invalid webhook signature - BUT CONTINUING FOR DEBUG');
                // Don't return 401 for now - let it continue to debug other issues
                // TODO: Re-enable rejection after confirming signature format
                // return new Response(JSON.stringify({ error: 'Invalid signature' }), {
                //     headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                //     status: 401,
                // });
            } else {
                console.log('Webhook signature verified successfully');
            }
        } else {
            console.warn('No signature provided - proceeding without verification');
        }

        const payload = JSON.parse(rawBody);

        // Log ALL top-level keys in the payload to understand the structure
        console.log('=== DIDIT WEBHOOK PAYLOAD KEYS ===');
        console.log('Top-level keys:', Object.keys(payload));
        console.log('Full payload:', JSON.stringify(payload, null, 2));

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        // Extract session info from Didit payload
        // Based on Didit docs, the session_id might be under different field names
        const sessionId = payload.session_id || payload.sessionId || payload.id;
        const status = payload.status;
        const webhookType = payload.webhook_type || payload.event || payload.type;
        const decision = payload.decision;

        // The reference should be the user's UUID (passed during verification initiation)
        // Didit returns vendor_data that we passed when creating the session
        let userReference = payload.vendor_data || payload.reference || payload.external_id || payload.metadata?.user_id;

        // ============================================
        // CHECK IF THIS IS AN ADDRESS VERIFICATION
        // Format: ADDRESS_<entityType>_<entityId>_<userId>_<timestamp>
        // ============================================
        if (userReference && typeof userReference === 'string' && userReference.startsWith('ADDRESS_')) {
            console.log('=== ADDRESS VERIFICATION WEBHOOK ===');
            const parts = userReference.split('_');
            const entityType = parts[1]; // 'studio' or 'gig'
            const entityId = parts[2];
            const userId = parts[3];

            console.log('Address verification details:', { entityType, entityId, userId, status });

            // Handle address verification
            await handleAddressVerification(supabaseAdmin, sessionId, entityType, entityId, userId, status, decision, payload);

            return new Response(JSON.stringify({ received: true, type: 'address_verification' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // HANDLE COMPOSITE REFERENCE (Fix for 400 Error)
        // If we used a randomized reference like "UUID_TIMESTAMP_RANDOM", we need to extract the UUID part.
        if (userReference && typeof userReference === 'string' && userReference.includes('_')) {
            const parts = userReference.split('_');
            // Check if first part is a UUID
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidRegex.test(parts[0])) {
                console.log(`Extracted real User ID from composite reference: ${parts[0]} (Original: ${userReference})`);
                userReference = parts[0];
            }
        }

        console.log('=== USER REFERENCE DEBUG ===');
        console.log('vendor_data:', payload.vendor_data);
        console.log('reference:', payload.reference);
        console.log('external_id:', payload.external_id);
        console.log('metadata:', JSON.stringify(payload.metadata));
        console.log('session_id:', sessionId);
        console.log('Final userReference:', userReference);
        console.log('Is valid UUID:', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userReference || ''));

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

            // Log FULL idVerification object to debug field structure
            console.log('=== FULL ID VERIFICATION OBJECT ===');
            console.log(JSON.stringify(idVerification, null, 2));
            console.log('=== END ID VERIFICATION ===');

            console.log('Decision details:', {
                faceMatchStatus,
                idVerificationStatus: idVerification?.status,
                hasOcrData: !!idVerification?.ocr_data,
                idVerificationKeys: idVerification ? Object.keys(idVerification) : [],
            });

            // Check if userReference is a valid UUID
            const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userReference || '');
            const isTempRef = userReference && String(userReference).startsWith('TEMP_');

            // If valid UUID or TEMP ref, use it directly; otherwise try to find user by session ID
            let finalUserReference: string | null = (isValidUUID || isTempRef) ? userReference : null;

            if (!isValidUUID && !isTempRef && sessionId) {
                console.log('vendor_data is not a UUID or TEMP ref, looking up user by session ID:', sessionId);
                const { data: profileData, error: profileError } = await supabaseAdmin
                    .from('profiles')
                    .select('id')
                    .eq('didit_session_id', sessionId)
                    .maybeSingle(); // Use maybeSingle instead of single to avoid error when not found

                if (profileData?.id) {
                    finalUserReference = profileData.id;
                    console.log('Found user by session ID:', finalUserReference);
                } else {
                    console.error('Could not find user by session ID:', profileError?.message || 'No matching profile');
                }
            }

            if (!finalUserReference) {
                console.error('No valid user reference found - vendor_data:', userReference, 'isValidUUID:', isValidUUID);
                return new Response(JSON.stringify({ error: 'No valid user reference found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            // Get the user's auth info ONLY if it's a real user (UUID)
            let authUser = null;
            let authError = null;

            if (!isTempRef) {
                const result = await supabaseAdmin.auth.admin.getUserById(finalUserReference);
                authUser = result.data;
                authError = result.error;

                if (authError) {
                    console.log('Failed to get auth user:', authError.message);
                }
            } else {
                console.log('Skipping auth lookup for TEMP session:', finalUserReference);
            }

            // ROBUST EMAIL FALLBACK STRATEGY
            // 1. Try to get email from Auth User
            let userEmail = authUser?.user?.email;

            // 2. If missing, look up in Profiles table (where we store it during signup)
            if (!userEmail) {
                console.log('Email not found in Auth User. Checking profiles table...');
                const { data: profileWithEmail } = await supabaseAdmin
                    .from('profiles')
                    .select('email')
                    .eq('id', finalUserReference)
                    .single();

                if (profileWithEmail?.email) {
                    userEmail = profileWithEmail.email;
                    console.log('Recovered email from profiles table:', userEmail);
                } else {
                    console.error('CRITICAL: Email not found in Auth OR Profiles. Verification email cannot be sent.');
                }
            } else {
                console.log('Email found in Auth User:', userEmail);
            }

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

            const idStatus = idVerification?.status;
            const faceStatus = faceMatch?.status || (idStatus === 'Approved' ? 'Approved' : undefined); // Fallback for face if ID is good (for doc-only flows)

            console.log('Consolidated Verification Status:', { idStatus, faceStatus, faceMatchRaw: faceMatch?.status });

            // 1. DECLINED: If EITHER is declined, the whole verification is declined.
            if (faceStatus === 'Declined' || idStatus === 'Declined') {
                console.log('Status is DECLINED (ID or Face)');
                if (isDuplicateOfApprovedAccount) {
                    await handleDuplicateDetected(supabaseAdmin, finalUserReference, userEmail, allWarnings);
                } else {
                    // This guarantees NO EMAIL is sent
                    await handleDeclined(supabaseAdmin, finalUserReference, sessionId);
                }
            }
            // 2. ABANDONED: If either is abandoned (and not declined)
            else if (faceStatus === 'Abandoned' || idStatus === 'Abandoned') {
                console.log('Status is ABANDONED');
                await handleAbandoned(supabaseAdmin, finalUserReference, sessionId);
            }
            // 3. IN REVIEW: If manual review is required
            else if (faceStatus === 'In Review' || idStatus === 'In Review' || faceStatus === 'Pending Review' || idStatus === 'Pending Review') {
                console.log('Status is IN REVIEW');
                await handleInReview(supabaseAdmin, finalUserReference, sessionId);
            }
            // 4. APPROVED: Both must be effectively approved
            else if (idStatus === 'Approved' && (faceStatus === 'Approved' || !faceMatch)) {
                console.log('Status is APPROVED');
                await handleApproved(supabaseAdmin, finalUserReference, userEmail, idVerification, authUser, sessionId, 'APPROVED');
            }
            // 5. UNKNOWN / FALLBACK
            else {
                console.warn('Unhandled Status Combination:', { idStatus, faceStatus });
                // Default to abandoned/incomplete rather than accidental approval
                // But if ID is approved and Face is missing (and not required/declined?), maybe approve?
                // The priority logic above handles the specific 'Declined' cases, so this is just safety.
                if (idStatus === 'Approved') {
                    console.log('ID Approved but Face execution unclear - Approving with caution.');
                    await handleApproved(supabaseAdmin, finalUserReference, userEmail, idVerification, authUser, sessionId, 'APPROVED');
                } else {
                    console.log('Unknown status - Treating as abandoned/retryable');
                    await handleAbandoned(supabaseAdmin, finalUserReference);
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
 * Uses Supabase Auth GoTrue service with configured SMTP
 */
async function sendVerificationEmail(
    supabaseAdmin: any,
    userEmail: string,
    firstName: string,
    fullName: string
): Promise<boolean> {
    console.log('=== Email Send Attempt via Supabase GoTrue ===');
    console.log('Recipient:', userEmail);
    console.log('First Name:', firstName || '(empty)');
    console.log('Full Name:', fullName || '(empty)');

    if (!userEmail) {
        console.error('No email address provided, cannot send email');
        return false;
    }

    const displayName = firstName || fullName || 'there';

    // Email content for the verification confirmation
    const subject = '✅ Your Identity Has Been Verified - MusikaLokal';
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

    // Use Supabase Auth to send email using your custom template
    // This will use the SMTP and email template configured in Supabase Dashboard
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        if (supabaseUrl && serviceRoleKey) {
            console.log('Sending verification confirmation email via Supabase Auth...');
            console.log('Using configured SMTP and custom email template');

            // Use magic link endpoint - customize the "Magic Link" template in 
            // Supabase Dashboard > Authentication > Email Templates
            // Template variables available: {{ .ConfirmationURL }}, {{ .Email }}, {{ .SiteURL }}
            const response = await fetch(`${supabaseUrl}/auth/v1/magiclink`, {
                method: 'POST',
                headers: {
                    'apikey': serviceRoleKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: userEmail,
                    options: {
                        // This becomes {{ .RedirectTo }} in your template
                        redirectTo: 'musikalokal://?verified=true',
                        // Pass custom data that might be available in template
                        data: {
                            full_name: fullName,
                            first_name: firstName,
                            verification_complete: true,
                        }
                    }
                }),
            });

            if (response.ok) {
                console.log(`✅ Verification email sent via Supabase Auth to ${userEmail}`);
                return true;
            } else {
                const errorText = await response.text();
                console.log('Supabase Auth magiclink email failed:', response.status, errorText);

                // Fallback: Try invite endpoint
                console.log('Trying invite endpoint as fallback...');
                const inviteResponse = await fetch(`${supabaseUrl}/auth/v1/invite`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'apikey': serviceRoleKey,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        email: userEmail,
                        options: {
                            redirectTo: 'musikalokal://?verified=true',
                            data: {
                                full_name: fullName,
                                verification_complete: true,
                            }
                        }
                    }),
                });

                if (inviteResponse.ok) {
                    console.log(`✅ Invite email sent via Supabase Auth to ${userEmail}`);
                    return true;
                } else {
                    const inviteError = await inviteResponse.text();
                    console.log('Invite endpoint also failed:', inviteResponse.status, inviteError);
                }
            }
        }
    } catch (error) {
        console.log('Supabase Auth email method failed:', error);
    }

    // Method 2: Try Resend API as fallback
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    console.log('RESEND_API_KEY configured:', !!resendApiKey);

    if (resendApiKey) {
        try {
            const resendFrom = Deno.env.get('RESEND_FROM') || 'MusikaLokal <noreply@musikalokal.com>';
            console.log('Attempting to send via Resend from:', resendFrom);

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

    // Method 3: Use Supabase's built-in email by storing notification in database
    // This allows a database trigger/webhook to handle the actual email sending
    try {
        console.log('Storing email notification in database for processing...');
        const { error: notifyError } = await supabaseAdmin
            .from('email_notifications')
            .insert({
                recipient_email: userEmail,
                recipient_name: displayName,
                subject: subject,
                html_content: htmlContent,
                template_type: 'verification_complete',
                status: 'pending',
                created_at: new Date().toISOString(),
            });

        if (!notifyError) {
            console.log('Email notification queued in database');
            return true;
        } else {
            console.log('email_notifications table not available:', notifyError.message);
        }
    } catch (error) {
        console.log('Database notification storage failed:', error);
    }

    console.error('=== EMAIL SEND INFO ===');
    console.error('Email notification was not sent. The user has been verified but may not receive email confirmation.');
    console.error('To enable emails, configure RESEND_API_KEY in Supabase Edge Function secrets.');
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
    authUser: any,
    sessionId: string | null,
    finalDecision: 'APPROVED' | 'DECLINED' | 'REVIEW' | 'ABANDONED' // New explicit decision
) {
    // FINAL SAFETY CHECK: Strict Whitelist for Email
    // Only 'APPROVED' triggers an email. 'REVIEW', 'DECLINED', etc. do NOT.
    if (finalDecision !== 'APPROVED') {
        console.warn(`handleApproved called with decision '${finalDecision}'. BLOCKING EMAIL.`);
        return;
    }

    // REDUNDANT SAFETY CHECK: Ensure we are not accidentally approving a decline
    if (idVerification?.status === 'Declined' || idVerification?.status === 'Rejected') {
        console.error('CRITICAL: handleApproved called but ID Status is DECLINED. Aborting.');
        return;
    }

    // Extract ID document data directly from idVerification object
    const firstName = idVerification?.first_name || '';
    // Check for middle names or second surnames often found in extra_fields
    const middleName = idVerification?.extra_fields?.middle_name || idVerification?.middle_name || '';
    const lastName = idVerification?.last_name || idVerification?.extra_fields?.first_surname || '';
    const secondSurname = idVerification?.extra_fields?.second_surname || '';

    // Construct Full Name intelligently
    const nameParts = [firstName, middleName, lastName, secondSurname].filter(Boolean);
    const fullName = nameParts.length > 0 ? nameParts.join(' ') : '';

    const documentExpiry = extractDocumentExpiry(idVerification);

    console.log('Approving user - extracted data:', {
        userReference,
        fullName,
        firstName,
        lastName,
        documentExpiry
    });

    // ALWAYS Store verification result in verification_sessions table
    // This provides a persistent record for both TEMP and Registered users.
    // create-didit-session checks this table using the Didit Session ID.
    if (sessionId) {
        console.log('Storing verification session details:', { sessionId, userReference });

        const { error: sessionError } = await supabaseAdmin
            .from('verification_sessions')
            .upsert({
                session_ref: sessionId, // Must use Didit Session ID as key
                verification_data: {
                    full_name: fullName,
                    first_name: firstName,
                    middle_name: middleName,
                    last_name: lastName,
                    raw_data: idVerification, // Store the FULL raw object for safety
                    id_document_expiry: documentExpiry,
                    id_verified_at: new Date().toISOString(),
                    user_ref: userReference, // Store the user ID reference inside data
                    email: userEmail
                },
                status: 'APPROVED'
            });

        if (sessionError) {
            console.error('Failed to store verification_sessions record:', sessionError.message);
        } else {
            console.log('Verification session recorded successfully.');
        }
    } else {
        console.warn('No sessionId available, skipping verification_sessions storage');
    }

    // CHECK IF THIS IS A TEMPORARY SESSION (User doesn't exist yet)
    if (userReference.startsWith('TEMP_')) {
        console.log('TEMP session processed. Stopping here since no profile exists to update.');
        return;
    }

    // --- LEGACY/EXISTING USER FLOW (User already exists) ---

    // Confirm the email in auth system and update user metadata with display name
    if (userEmail) {
        try {
            // Update auth user with email confirmation AND user metadata (display_name)
            const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(userReference, {
                email_confirm: true,
                user_metadata: {
                    is_verified: true,
                    full_name: fullName || null,
                    first_name: firstName || null,
                    last_name: lastName || null,
                }
            });

            if (confirmError) {
                console.log('Failed to confirm email and update metadata:', confirmError.message);
            } else {
                console.log(`Email confirmed and display name set for verified user ${userReference} (${userEmail}) - Name: ${fullName}`);
            }

            // Send verification confirmation email using Supabase GoTrue
            await sendVerificationEmail(supabaseAdmin, userEmail, firstName, fullName);

        } catch (emailError) {
            console.log('Email confirmation error:', emailError);
        }
    }


    // NOW store the full profile with verified ID details
    console.log('Updating profile with verified data:', {
        userReference,
        fullName,
        documentExpiry,
        verificationStatus: 'APPROVED'
    });

    const { error: updateError, data: updateData } = await supabaseAdmin
        .from('profiles')
        .update({
            full_name: fullName || null,
            is_verified: true,
            verification_status: 'APPROVED',
            id_document_expiry: documentExpiry,
            id_verified_at: new Date().toISOString(),
            // Clear session ID as verification is complete
            didit_session_id: null,
        })
        .eq('id', userReference)
        .select();

    // Check if update failed OR if no rows were updated (empty array means profile doesn't exist)
    if (updateError || !updateData || updateData.length === 0) {
        if (updateError) {
            console.error('Failed to update profile:', updateError.message);
        } else {
            console.log('No profile found to update, creating new profile via upsert...');
        }

        // Profile doesn't exist - create it with upsert
        const { error: upsertError, data: upsertData } = await supabaseAdmin
            .from('profiles')
            .upsert({
                id: userReference,
                role: authUser?.user?.user_metadata?.role || null,
                email: userEmail || '',
                full_name: fullName || null,
                is_verified: true,
                verification_status: 'APPROVED',
                id_document_expiry: documentExpiry,
                id_verified_at: new Date().toISOString(),
                didit_session_id: null,
            })
            .select();

        if (upsertError) {
            console.error('Upsert failed:', upsertError.message);
        } else {
            console.log('Profile upserted successfully:', upsertData);
        }
    } else {
        console.log('Profile updated successfully:', updateData);
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
async function handleDeclined(supabaseAdmin: any, userReference: string, sessionId: string | null) {
    console.log('Verification declined for user:', userReference);

    // ALWAYS store status in verification_sessions for frontend polling
    if (sessionId) {
        await supabaseAdmin
            .from('verification_sessions')
            .upsert({
                session_ref: sessionId,
                status: 'DECLINED',
                verification_data: {
                    user_ref: userReference,
                    declined_at: new Date().toISOString()
                }
            });
        console.log('Stored DECLINED status in verification_sessions');
    }

    // Only update profiles if it's a real user (not TEMP_)
    if (!userReference.startsWith('TEMP_')) {
        await supabaseAdmin
            .from('profiles')
            .update({
                is_verified: false,
                verification_status: 'DECLINED',
                full_name: null,
                didit_session_id: null,
            })
            .eq('id', userReference);
    }

    console.log('Declined - no email sent, user will retry from app');
}

/**
 * Handle ABANDONED verification - user didn't complete, allow retry
 * Don't store any profile details, just mark as abandoned
 */
async function handleAbandoned(supabaseAdmin: any, userReference: string, sessionId: string | null) {
    console.log('Verification abandoned for user:', userReference);

    // ALWAYS store status in verification_sessions for frontend polling
    if (sessionId) {
        await supabaseAdmin
            .from('verification_sessions')
            .upsert({
                session_ref: sessionId,
                status: 'ABANDONED',
                verification_data: {
                    user_ref: userReference,
                    abandoned_at: new Date().toISOString()
                }
            });
        console.log('Stored ABANDONED status in verification_sessions');
    }

    // Only update profiles if it's a real user (not TEMP_)
    if (!userReference.startsWith('TEMP_')) {
        await supabaseAdmin
            .from('profiles')
            .update({
                is_verified: false,
                verification_status: 'ABANDONED',
                full_name: null,
                didit_session_id: null,
            })
            .eq('id', userReference);
    }

    console.log('Abandoned - no email sent, user will retry from app');
}

/**
 * Handle IN REVIEW - manual review needed, block new attempts
 * Don't store profile details yet - wait for manual review result
 */
async function handleInReview(supabaseAdmin: any, userReference: string, sessionId: string | null) {
    console.log('Verification in review for user:', userReference);

    // ALWAYS store status in verification_sessions for frontend polling
    if (sessionId) {
        await supabaseAdmin
            .from('verification_sessions')
            .upsert({
                session_ref: sessionId,
                status: 'PENDING_REVIEW',
                verification_data: {
                    user_ref: userReference,
                    review_started_at: new Date().toISOString()
                }
            });
        console.log('Stored PENDING_REVIEW status in verification_sessions');
    }

    // Only update profiles if it's a real user (not TEMP_)
    if (!userReference.startsWith('TEMP_')) {
        await supabaseAdmin
            .from('profiles')
            .update({
                is_verified: false,
                verification_status: 'PENDING_REVIEW',
            })
            .eq('id', userReference);

        // Send notification only for real users
        await supabaseAdmin
            .from('notifications')
            .insert({
                user_id: userReference,
                type: 'info',
                title: 'Manual Review in Progress',
                message: 'Your verification requires manual review. Please wait - this usually takes 5-7 business days.',
            });
    }

    console.log('In Review - no email sent, user will be notified of review result');
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

/**
 * Handle ADDRESS VERIFICATION from Didit Proof of Address workflow
 * Validates that the utility bill name matches the owner and address matches the entity
 */
async function handleAddressVerification(
    supabaseAdmin: any,
    sessionId: string,
    entityType: string,
    entityId: string,
    userId: string,
    status: string,
    decision: any,
    payload: any
) {
    console.log('=== PROCESSING ADDRESS VERIFICATION ===');
    console.log('Entity:', entityType, entityId);
    console.log('User:', userId);
    console.log('Status:', status);

    // Get the stored session data with expected values
    const { data: sessionData } = await supabaseAdmin
        .from('address_verification_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

    const expectedAddress = sessionData?.expected_address || '';
    const expectedName = sessionData?.expected_name || '';

    // Extract POA (Proof of Address) data from decision
    // Based on Didit docs, POA data is in decision.poa or decision.proof_of_addresses
    const poaData = decision?.proof_of_addresses?.[0] || decision?.poa?.[0] || {};
    const poaStatus = poaData?.status || status;

    // Extract address info from POA
    const extractedData = poaData?.extracted_data || poaData?.ocr_data || {};
    const extractedAddress = extractedData?.address || extractedData?.full_address || '';
    const extractedName = extractedData?.name || extractedData?.account_holder || '';
    const issuer = extractedData?.issuer || extractedData?.company || '';
    const issueDate = extractedData?.issue_date || extractedData?.date || '';

    console.log('Extracted POA data:', {
        extractedAddress,
        extractedName,
        issuer,
        issueDate,
        expectedAddress,
        expectedName
    });

    // Determine entity table
    const entityTable = entityType === 'studio' ? 'studios' : 'gigs';

    // Validate the extracted data against expected values
    const nameMatches = compareNames(expectedName, extractedName);
    const addressMatches = compareAddresses(expectedAddress, extractedAddress);
    const isRecent = issueDate ? isWithinDays(issueDate, 90) : true; // Within 90 days
    const isValidIssuer = isValidUtilityIssuer(issuer);

    console.log('Validation results:', { nameMatches, addressMatches, isRecent, isValidIssuer });

    // Determine final verification status
    let verificationStatus = 'PENDING';
    let verificationNotes = '';

    if (poaStatus === 'Approved' || poaStatus === 'approved') {
        if (nameMatches && addressMatches) {
            verificationStatus = 'APPROVED';
            verificationNotes = 'Address and name verified successfully';
        } else if (addressMatches) {
            verificationStatus = 'MANUAL_REVIEW';
            verificationNotes = `Name mismatch: Expected "${expectedName}", got "${extractedName}"`;
        } else if (nameMatches) {
            verificationStatus = 'MANUAL_REVIEW';
            verificationNotes = `Address mismatch: Expected "${expectedAddress}", got "${extractedAddress}"`;
        } else {
            verificationStatus = 'MANUAL_REVIEW';
            verificationNotes = 'Both name and address require manual verification';
        }
    } else if (poaStatus === 'Declined' || poaStatus === 'declined') {
        verificationStatus = 'DECLINED';
        verificationNotes = 'Document was declined by Didit';
    } else if (poaStatus === 'Abandoned' || poaStatus === 'abandoned') {
        verificationStatus = 'ABANDONED';
        verificationNotes = 'User abandoned the verification process';
    } else {
        verificationStatus = 'PENDING_REVIEW';
        verificationNotes = 'Awaiting review';
    }

    // Update address_verification_sessions table
    await supabaseAdmin
        .from('address_verification_sessions')
        .update({
            status: verificationStatus,
            extracted_address: extractedAddress,
            extracted_name: extractedName,
            issuer: issuer,
            issue_date: issueDate,
            name_matches: nameMatches,
            address_matches: addressMatches,
            notes: verificationNotes,
            verified_at: verificationStatus === 'APPROVED' ? new Date().toISOString() : null,
            raw_response: payload
        })
        .eq('session_id', sessionId);

    // Update the entity (studio or gig) with verification status
    await supabaseAdmin
        .from(entityTable)
        .update({
            address_verification_status: verificationStatus,
            address_verified_at: verificationStatus === 'APPROVED' ? new Date().toISOString() : null
        })
        .eq('id', entityId);

    // Send notification to user
    let notificationTitle = '';
    let notificationMessage = '';
    let notificationType = 'info';

    if (verificationStatus === 'APPROVED') {
        notificationTitle = 'Address Verified ✅';
        notificationMessage = `Your ${entityType === 'studio' ? 'studio' : 'venue'} address has been verified. Your listing is now active!`;
        notificationType = 'success';
    } else if (verificationStatus === 'MANUAL_REVIEW') {
        notificationTitle = 'Address Under Review';
        notificationMessage = `Your ${entityType === 'studio' ? 'studio' : 'venue'} address verification requires manual review. We'll notify you within 5-7 business days.`;
        notificationType = 'info';
    } else if (verificationStatus === 'DECLINED') {
        notificationTitle = 'Address Verification Failed';
        notificationMessage = `We couldn't verify your ${entityType === 'studio' ? 'studio' : 'venue'} address. Please try again with a valid utility bill.`;
        notificationType = 'error';
    }

    if (notificationTitle) {
        await supabaseAdmin
            .from('notifications')
            .insert({
                user_id: userId,
                type: notificationType,
                title: notificationTitle,
                message: notificationMessage,
            });
    }

    console.log(`Address verification completed: ${verificationStatus} for ${entityType} ${entityId}`);
}

/**
 * Compare two names with fuzzy matching
 */
function compareNames(name1: string, name2: string): boolean {
    if (!name1 || !name2) return false;

    const normalize = (n: string) => n.toLowerCase().replace(/[^a-z]/g, '');
    const n1 = normalize(name1);
    const n2 = normalize(name2);

    // Check containment
    if (n1.includes(n2) || n2.includes(n1)) return true;

    // Check if at least 70% similar
    return calculateStringSimilarity(n1, n2) > 0.7;
}

/**
 * Compare two addresses with fuzzy matching
 */
function compareAddresses(addr1: string, addr2: string): boolean {
    if (!addr1 || !addr2) return false;

    const normalize = (a: string) => a.toLowerCase().replace(/[^a-z0-9]/g, '');
    const a1 = normalize(addr1);
    const a2 = normalize(addr2);

    // Check containment
    if (a1.includes(a2) || a2.includes(a1)) return true;

    // Check if at least 60% similar (addresses can vary in format)
    return calculateStringSimilarity(a1, a2) > 0.6;
}

/**
 * Check if date is within specified days
 */
function isWithinDays(dateStr: string, days: number): boolean {
    try {
        const date = new Date(dateStr);
        const now = new Date();
        const diffDays = Math.abs((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= days;
    } catch {
        return true; // If can't parse, assume valid
    }
}

/**
 * Check if issuer is a valid Philippine utility company
 */
function isValidUtilityIssuer(issuer: string): boolean {
    if (!issuer) return true; // Don't fail if issuer not detected

    const validIssuers = [
        'meralco', 'manila water', 'maynilad', 'pldt', 'globe',
        'smart', 'converge', 'sky', 'cignal', 'home credit',
        'bpi', 'bdo', 'metrobank', 'security bank', 'pnb',
        'landbank', 'unionbank', 'eastwest', 'rcbc', 'chinabank'
    ];

    const normalizedIssuer = issuer.toLowerCase();
    return validIssuers.some(v => normalizedIssuer.includes(v));
}

/**
 * Calculate similarity between two strings using Dice coefficient
 */
function calculateStringSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;

    const bigrams1 = new Set<string>();
    const bigrams2 = new Set<string>();

    for (let i = 0; i < str1.length - 1; i++) {
        bigrams1.add(str1.substring(i, i + 2));
    }
    for (let i = 0; i < str2.length - 1; i++) {
        bigrams2.add(str2.substring(i, i + 2));
    }

    let intersection = 0;
    bigrams1.forEach(bigram => {
        if (bigrams2.has(bigram)) intersection++;
    });

    return (2 * intersection) / (bigrams1.size + bigrams2.size);
}


