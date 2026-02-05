// @ts-nocheck
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    // Parse request body
    const { userId, email, callback, redirect_url, action, session_id } = await req.json();

    // HANDLE GET SESSION ACTION
    if (action === 'get_session' && session_id) {
      console.log(`Fetching Didit session: ${session_id}`);

      let sessionData = {};

      // Try /decision/ first (contains verification results)
      try {
        console.log(`Attempting /decision/ endpoint...`);
        const decisionResponse = await fetch(`https://verification.didit.me/v3/session/${session_id}/decision/`, {
          method: "GET",
          headers: { "Content-Type": "application/json", "X-Api-Key": DIDIT_API_KEY }
        });
        if (decisionResponse.ok) {
          const decision = await decisionResponse.json();
          console.log('Decision fetched successfully');
          sessionData = { ...sessionData, ...decision };
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
          headers: { "Content-Type": "application/json", "X-Api-Key": DIDIT_API_KEY }
        });
        if (baseResponse.ok) {
          const base = await baseResponse.json();
          console.log('Base session fetched successfully');
          // Merge, but don't overwrite decision data if it exists
          sessionData = { ...base, ...sessionData };
        } else {
          console.warn(`Base session endpoint failed: ${baseResponse.status}`);
        }
      } catch (err) {
        console.error('Error fetching base session:', err);
      }

      // FALLBACK: Check local 'verification_sessions' table
      // This is crucial if we are using a TEMP_ ref that the Webhook has processed
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

          // 1. Try lookup by Session Reference (UUID)
          let { data: localData, error } = await supabaseAdmin
            .from('verification_sessions')
            .select('status, verification_data')
            .eq('session_ref', session_id)
            .maybeSingle();

          // 2. If not found, and session_id looks like a TEMP ref, try lookup by user_ref inside JSON
          if (!localData && session_id && session_id.startsWith('TEMP_')) {
            console.log('Session lookup failed, trying lookup by user_ref in JSON data...');
            const { data: userRefData } = await supabaseAdmin
              .from('verification_sessions')
              .select('status, verification_data')
              // Use JSON arrow operator to filter by field inside verification_data
              // Note: This requires the column to be JSONB
              .eq('verification_data->>user_ref', session_id)
              .maybeSingle();

            if (userRefData) {
              localData = userRefData;
              console.log('Found session via user_ref lookup!');
            }
          }

          if (localData) {
            console.log('Found data in verification_sessions table!', localData);
            // Read the ACTUAL status from the database - DO NOT hardcode 'Approved'
            // The webhook now stores all statuses: APPROVED, DECLINED, ABANDONED, PENDING_REVIEW
            const storedStatus = localData.status || 'Approved';
            console.log('Stored status from verification_sessions:', storedStatus);

            // Merge local data (extracted by webhook) into sessionData
            sessionData = {
              ...sessionData,
              status: storedStatus, // Use the ACTUAL status from database
              verification_data: {
                status: storedStatus, // Also include in verification_data for frontend compatibility
              },
              extracted_data: {
                ...sessionData.extracted_data,
                ...(localData.verification_data || {}),
                firstName: localData.verification_data?.first_name,
                lastName: localData.verification_data?.last_name,
                fullName: localData.verification_data?.full_name
              }
            };
          }
        } catch (dbErr) {
          console.error('Database fallback error:', dbErr);
        }
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

    // Fallback anon key if not in env
    const anonKey = SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZmxkeGVnc3Z6ZWNzaGxheXphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2NTgyOTUsImV4cCI6MjA4NDIzNDI5NX0._BKyxjyqHKHaheMWkBk8mMalzSPy_gm1ImsT_RQaOB0';

    // Build the redirect URL that Didit will use after verification
    // This is where the user's browser goes after completing verification
    // Include the client's redirect_url (e.g., exp://... or musikalokal://...)
    // so verification-redirect can send them back to the right place
    let finalRedirectUrl = `${SUPABASE_URL}/functions/v1/verification-redirect?vendor_data=${userId}&apikey=${anonKey}`;

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
        "X-Api-Key": DIDIT_API_KEY,
      },
      body: JSON.stringify({
        workflow_id: DIDIT_WORKFLOW_ID,
        vendor_data: userId, // This is passed to webhook and included in session
        callback: finalRedirectUrl, // Browser redirect URL after verification completes
        features: email ? { email } : undefined, // v3 uses 'features' instead of 'contact_details'
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

    // Update user profile with the session ID
    // SKIP if it's a temp ID (user not created yet)
    if (userId && !userId.startsWith('TEMP_') && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          didit_session_id: diditData.session_id,
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
        sessionId: diditData.session_id,
        verificationUrl: diditData.url, // This is the URL to redirect the user to
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
