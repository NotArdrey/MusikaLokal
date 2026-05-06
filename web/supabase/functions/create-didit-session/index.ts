// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createSessionNonce,
  hashSessionNonce,
  normalizeIdentityEmail,
  sanitizeIdentityVerificationData,
  stripPrivateSessionFields,
  verifySessionNonce,
} from "../_shared/identityDuplicate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function assertSessionNonce(
  supabaseAdmin: any,
  sessionRef: string,
  sessionNonce: unknown,
) {
  const { data: localData, error } = await supabaseAdmin
    .from("verification_sessions")
    .select("status, verification_data")
    .eq("session_ref", sessionRef)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to validate verification session: ${error.message}`);
  }

  const expectedHash = localData?.verification_data?.session_nonce_hash;
  const valid = await verifySessionNonce(sessionRef, sessionNonce, expectedHash);
  if (!localData || !valid) {
    throw new Error("Verification session could not be validated. Please start verification again.");
  }

  return localData;
}

async function enforceDiditSessionRateLimit(supabaseAdmin: any, normalizedEmail: string) {
  if (!normalizedEmail) return;

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ count: hourlyCount, error: hourlyError }, { count: dailyCount, error: dailyError }] = await Promise.all([
    supabaseAdmin
      .from("verification_sessions")
      .select("session_ref", { count: "exact", head: true })
      .eq("verification_data->>email", normalizedEmail)
      .gte("created_at", oneHourAgo),
    supabaseAdmin
      .from("verification_sessions")
      .select("session_ref", { count: "exact", head: true })
      .eq("verification_data->>email", normalizedEmail)
      .gte("created_at", oneDayAgo),
  ]);

  if (hourlyError || dailyError) {
    console.error("didit_rate_limit_lookup_failed", hourlyError || dailyError);
    return;
  }

  if ((hourlyCount || 0) >= 3 || (dailyCount || 0) >= 8) {
    throw new Error("Too many verification attempts. Please wait before trying again.");
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get environment variables
    const DIDIT_API_KEY = Deno.env.get("DIDIT_API_KEY");
    const DIDIT_WORKFLOW_ID = Deno.env.get("DIDIT_WORKFLOW_ID");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!DIDIT_API_KEY) {
      console.error("Missing DIDIT_API_KEY");
      return new Response(
        JSON.stringify({ error: "Server configuration error: Missing API key", success: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!DIDIT_WORKFLOW_ID) {
      console.error("Missing DIDIT_WORKFLOW_ID");
      return new Response(
        JSON.stringify({ error: "Server configuration error: Missing workflow ID", success: false }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
      console.error("Missing Supabase configuration for Didit session flow");
      return jsonResponse({ error: "Server configuration error", success: false }, 500);
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request body
    const { userId, email, role, callback, redirect_url, action, session_id, sessionNonce: providedSessionNonce } = await req.json();
    const normalizedEmail = normalizeIdentityEmail(email);
    const normalizedRole = typeof role === 'string' ? role.trim().toLowerCase() : '';

    // HANDLE GET SESSION ACTION
    if (action === 'get_session' && session_id) {
      console.log(`Fetching Didit session: ${session_id}`);

      const localSessionData = await assertSessionNonce(supabaseAdmin, String(session_id), providedSessionNonce);
      let sessionData = {};

      // Try /decision/ first (contains verification results)
      try {
        console.log(`Attempting /decision/ endpoint...`);
        const decisionResponse = await fetch(`https://verification.didit.me/v3/session/${session_id}/decision/`, {
          method: "GET",
          headers: { "Content-Type": "application/json", "x-api-key": DIDIT_API_KEY }
        });
        if (decisionResponse.ok) {
          const decision = await decisionResponse.json();
          console.log('Decision fetched successfully');
          sessionData = { ...sessionData, ...sanitizeIdentityVerificationData(decision) };
        } else {
          console.warn(`Decision endpoint failed: ${decisionResponse.status}`);
        }
      } catch (err) {
        console.error('Error fetching decision:', err);
      }

      // Try base /session/ endpoint (contains metadata)
      try {
        console.log(`Attempting /session/ endpoint...`);
        const baseResponse = await fetch(`https://verification.didit.me/v3/session/${session_id}`, {
          method: "GET",
          headers: { "Content-Type": "application/json", "x-api-key": DIDIT_API_KEY }
        });
        if (baseResponse.ok) {
          const base = await baseResponse.json();
          console.log('Base session fetched successfully');
          // Merge, but don't overwrite decision data if it exists
          sessionData = { ...sanitizeIdentityVerificationData(base), ...sessionData };
        } else {
          console.warn(`Base session endpoint failed: ${baseResponse.status}`);
        }
      } catch (err) {
        console.error('Error fetching base session:', err);
      }

      // FALLBACK: Check local 'verification_sessions' table
      // This is crucial if we are using a TEMP_ ref that the Webhook has processed
      if (localSessionData) {
        console.log('Found data in verification_sessions table');
        const storedStatus = localSessionData.status || 'PENDING';
        const publicVerificationData = stripPrivateSessionFields(
          sanitizeIdentityVerificationData(localSessionData.verification_data || {}),
        );

        sessionData = {
          ...sessionData,
          status: storedStatus,
          verification_data: {
            status: storedStatus,
          },
          extracted_data: {
            ...sessionData.extracted_data,
            ...publicVerificationData,
            firstName: publicVerificationData?.first_name,
            lastName: publicVerificationData?.last_name,
            fullName: publicVerificationData?.full_name
          }
        };
      }

      // --- NORMALIZATION STEP ---
      // Dig through the messy Didit response to find the Name and Status reliably
      const findIn = (obj: any, keys: string[]) => {
        if (!obj) return undefined;
        for (const k of keys) {
          if (obj[k]) return obj[k];
        }
        return undefined;
      };

      const candidates = [
        sessionData,
        sessionData?.features?.extracted_data,
        sessionData?.extracted_data,
        sessionData?.verification_data,
        sessionData?.details?.extracted_data,
        sessionData?.decision?.details?.extracted_data,
        sessionData?.ocr,
        sessionData?.mrz
      ];

      let foundFull = '';
      let foundFirst = '';
      let foundMiddle = '';
      let foundLast = '';

      for (const src of candidates) {
        if (!src) continue;
        if (!foundFull) foundFull = findIn(src, ['fullName', 'full_name', 'name']);
        if (!foundFirst) foundFirst = findIn(src, ['firstName', 'first_name']);
        if (!foundMiddle) foundMiddle = findIn(src, ['middleName', 'middle_name']);
        if (!foundLast) foundLast = findIn(src, ['lastName', 'last_name']);
      }

      let derivedName = foundFull;
      if (!derivedName && (foundFirst && foundLast)) {
        derivedName = [foundFirst, foundMiddle, foundLast].filter(Boolean).join(' ');
      }

      console.log(`Derived Name: ${derivedName}`);

      // Return normalized data along with raw
      return new Response(JSON.stringify({
        ...sessionData,
        derived: {
          fullName: derivedName,
          firstName: foundFirst,
          lastName: foundLast
        }
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "userId is required", success: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    console.log(`Creating Didit session for user: ${userId}`);
    await enforceDiditSessionRateLimit(supabaseAdmin, normalizedEmail);

    // Build the redirect URL that Didit will use after verification
    // This is where the user's browser goes after completing verification
    // Include the client's redirect_url (e.g., exp://... or musikalokal://...)
    // so verification-redirect can send them back to the right place
    let finalRedirectUrl = `${SUPABASE_URL}/functions/v1/verification-redirect?vendor_data=${userId}&apikey=${SUPABASE_ANON_KEY}`;

    if (redirect_url) {
      finalRedirectUrl += `&redirect_to=${encodeURIComponent(redirect_url)}`;
    } else if (callback) {
      // Fallback to callback if provided, though we prefer distinct redirect_url
      finalRedirectUrl += `&redirect_to=${encodeURIComponent(callback)}`;
    }
    // Else, verification-redirect will fallback to static default

    console.log('Callback/Redirect URL:', finalRedirectUrl);

    // Create session with Didit API v3
    const diditResponse = await fetch("https://verification.didit.me/v3/session/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": DIDIT_API_KEY,
      },
      body: JSON.stringify({
        workflow_id: DIDIT_WORKFLOW_ID,
        vendor_data: userId, // This is passed to webhook and included in session
        callback: finalRedirectUrl, // Browser redirect URL after verification completes
        metadata: {
          signup_role: normalizedRole || undefined,
        },
        contact_details: normalizedEmail
          ? {
            email: normalizedEmail,
            send_notification_emails: false,
          }
          : undefined,
      }),
    });

    if (!diditResponse.ok) {
      const errorText = await diditResponse.text();
      console.error(`Didit API error: ${diditResponse.status} - ${errorText}`);
      return new Response(
        JSON.stringify({
          error: "Failed to create verification session",
          details: errorText,
          success: false
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const diditData = await diditResponse.json();
    console.log("Didit session created:", JSON.stringify(diditData));
    const verificationUrl = diditData.url || diditData.verification_url || diditData.verificationUrl;
    const createdSessionId = diditData.session_id || diditData.id;
    if (!createdSessionId) {
      throw new Error("Didit did not return a session ID");
    }
    const sessionNonce = createSessionNonce();
    const sessionNonceHash = await hashSessionNonce(createdSessionId, sessionNonce);

    /*
    Expected response:
    {
      "session_id": "11111111-2222-3333-4444-555555555555",
      "session_number": 1234,
      "session_token": "abcdef123456",
      "vendor_data": "user-123",
      "status": "Not Started",
      "workflow_id": "...",
      "callback": "...",
      "url": "https://verify.didit.me/session/abcdef123456"
    }
    */

      if (normalizedEmail) {
        const { error: supersedeError } = await supabaseAdmin
          .from('verification_sessions')
          .update({ status: 'SUPERSEDED' })
          .eq('verification_data->>email', normalizedEmail)
          .in('status', ['PENDING', 'Not Started', 'In Progress'])
          .neq('session_ref', createdSessionId);

        if (supersedeError) {
          console.error('Failed to supersede older Didit sessions:', supersedeError);
        }
      }

      const { error: sessionStoreError } = await supabaseAdmin
        .from('verification_sessions')
        .upsert({
          session_ref: createdSessionId,
          status: 'PENDING',
          verification_data: {
            user_ref: userId,
            email: normalizedEmail || null,
            signup_role: normalizedRole || null,
            session_url: verificationUrl || null,
            session_nonce_hash: sessionNonceHash,
            started_at: new Date().toISOString(),
          },
        });

      if (sessionStoreError) {
        console.error('Failed to store pending Didit session:', sessionStoreError);
      }

      // Update user profile with the session ID.
      // SKIP if it's a temp ID (user not created yet).
      if (userId && !userId.startsWith('TEMP_')) {
        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({
            didit_session_id: createdSessionId,
            verification_status: "PENDING",
          })
          .eq("id", userId);

        if (updateError) {
          console.error("Failed to update profile:", updateError);
          // Don't fail the request, just log the error
        } else {
          console.log("Profile updated with session ID");
        }
      }

    // Return the verification URL to the client
    return new Response(
      JSON.stringify({
        success: true,
        sessionId: createdSessionId,
        sessionNonce,
        verificationUrl, // This is the URL to redirect the user to
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error creating Didit session:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message, success: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
