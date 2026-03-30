// @ts-nocheck
import { encode as base64Encode } from "https://deno.land/std@0.177.0/encoding/base64.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-smile-signature",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

/**
 * Smile Identity Webhook Handler
 * 
 * Receives webhook events from Smile API:
 * - ARCHIVE_STARTED: User uploaded a document
 * - ARCHIVE_ANALYZED: Document has been processed and data extracted
 * - ARCHIVE_REVOKED: User revoked access to document
 * - ARCHIVE_FAILED: Document processing failed
 * 
 * Also handles redirect callback from Wink Widget completion
 */

// Smile API Base URL
const SMILE_API_BASE = "https://open.smileapi.io/v1";

/**
 * Get Smile API access token using client credentials
 */
async function getSmileAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const credentials = base64Encode(`${clientId}:${clientSecret}`);
  
  const response = await fetch(`${SMILE_API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to get Smile access token:", errorText);
    throw new Error(`Failed to authenticate with Smile API: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Get a specific archive by ID
 */
async function getSmileArchive(accessToken: string, archiveId: string): Promise<any> {
  const response = await fetch(`${SMILE_API_BASE}/archives/${archiveId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to get Smile archive:", errorText);
    throw new Error(`Failed to get archive: ${response.status}`);
  }

  return await response.json();
}

serve(async (req) => {
  const url = new URL(req.url);
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get environment variables
    const SMILE_CLIENT_ID = Deno.env.get("SMILE_CLIENT_ID");
    const SMILE_CLIENT_SECRET = Deno.env.get("SMILE_CLIENT_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // ============================================
    // Handle GET request - Redirect callback from Wink Widget
    // ============================================
    if (req.method === "GET") {
      const sessionId = url.searchParams.get("session_id");
      const entityType = url.searchParams.get("entity_type");
      const entityId = url.searchParams.get("entity_id");
      const userId = url.searchParams.get("user_id");
      const redirectTo = url.searchParams.get("redirect_to");

      console.log("Smile redirect callback:", { sessionId, entityType, entityId, userId });

      // Update session status to indicate user completed the flow
      if (sessionId) {
        await supabaseAdmin
          .from('address_verification_sessions')
          .update({
            status: 'SUBMITTED',
            updated_at: new Date().toISOString()
          })
          .eq('session_id', sessionId);
      }

      // Redirect to app or provided URL
      if (redirectTo) {
        return new Response(null, {
          status: 302,
          headers: {
            ...corsHeaders,
            "Location": decodeURIComponent(redirectTo),
          },
        });
      }

      // Default: return success HTML page
      return new Response(
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Address Verification Submitted</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: rgba(255,255,255,0.1);
      border-radius: 20px;
      backdrop-filter: blur(10px);
    }
    .icon { font-size: 64px; margin-bottom: 20px; }
    h1 { margin: 0 0 10px 0; font-size: 24px; }
    p { margin: 0; opacity: 0.9; }
    .close-btn {
      margin-top: 20px;
      padding: 12px 24px;
      background: white;
      color: #667eea;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✅</div>
    <h1>Document Submitted!</h1>
    <p>Your address verification is being processed.</p>
    <p style="margin-top: 10px; font-size: 14px;">You can close this window and return to the app.</p>
    <button class="close-btn" onclick="window.close()">Close Window</button>
  </div>
</body>
</html>`,
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "text/html",
          },
        }
      );
    }

    // ============================================
    // Handle POST request - Webhook from Smile API
    // ============================================
    const body = await req.json();
    console.log("Smile webhook received:", JSON.stringify(body, null, 2));

    const { type, data } = body;

    if (!type || !data) {
      console.log("Invalid webhook payload - missing type or data");
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { userId: smileUserId, archiveId } = data;

    // Find the session by Smile user ID
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('address_verification_sessions')
      .select('*')
      .eq('smile_user_id', smileUserId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionError) {
      console.error("Error finding session:", sessionError);
    }

    switch (type) {
      case "ARCHIVE_STARTED":
        console.log(`Archive started for user ${smileUserId}, archive ${archiveId}`);
        
        if (session) {
          await supabaseAdmin
            .from('address_verification_sessions')
            .update({
              archive_id: archiveId,
              status: 'PROCESSING',
              updated_at: new Date().toISOString()
            })
            .eq('session_id', session.session_id);
        }
        break;

      case "ARCHIVE_ANALYZED":
        console.log(`Archive analyzed for user ${smileUserId}, archive ${archiveId}`);
        
        // Get the archive details to extract address
        if (SMILE_CLIENT_ID && SMILE_CLIENT_SECRET && archiveId) {
          try {
            const accessToken = await getSmileAccessToken(SMILE_CLIENT_ID, SMILE_CLIENT_SECRET);
            const archive = await getSmileArchive(accessToken, archiveId);
            
            console.log("Archive details:", JSON.stringify(archive, null, 2));

            // Extract address from analysis
            let extractedAddress = null;
            let extractedName = null;

            if (archive.analysis) {
              extractedAddress = archive.analysis.address || archive.analysis.fullAddress;
              extractedName = archive.analysis.employeeName || archive.analysis.name;
            }

            // Update session with extracted data
            if (session) {
              await supabaseAdmin
                .from('address_verification_sessions')
                .update({
                  archive_id: archiveId,
                  extracted_address: extractedAddress,
                  extracted_name: extractedName,
                  status: extractedAddress ? 'VERIFIED' : 'ANALYZED',
                  verification_result: archive,
                  updated_at: new Date().toISOString()
                })
                .eq('session_id', session.session_id);

              // Update the entity (studio/gig) if we have entity_id
              if (session.entity_id && session.entity_type) {
                const entityTable = session.entity_type === 'studio' ? 'studios' : 'gigs';
                await supabaseAdmin
                  .from(entityTable)
                  .update({
                    address_verification_status: extractedAddress ? 'VERIFIED' : 'PENDING_REVIEW',
                    verified_address: extractedAddress,
                    address_verification_completed_at: new Date().toISOString()
                  })
                  .eq('id', session.entity_id);
              }
            }
          } catch (err) {
            console.error("Error processing analyzed archive:", err);
          }
        }
        break;

      case "ARCHIVE_FAILED":
        console.log(`Archive failed for user ${smileUserId}, archive ${archiveId}`);
        
        if (session) {
          await supabaseAdmin
            .from('address_verification_sessions')
            .update({
              archive_id: archiveId,
              status: 'FAILED',
              error_code: data.errorCode,
              error_message: data.errorMessage,
              updated_at: new Date().toISOString()
            })
            .eq('session_id', session.session_id);

          // Update entity status
          if (session.entity_id && session.entity_type) {
            const entityTable = session.entity_type === 'studio' ? 'studios' : 'gigs';
            await supabaseAdmin
              .from(entityTable)
              .update({
                address_verification_status: 'FAILED'
              })
              .eq('id', session.entity_id);
          }
        }
        break;

      case "ARCHIVE_REVOKED":
        console.log(`Archive revoked for user ${smileUserId}, archive ${archiveId}`);
        
        if (session) {
          await supabaseAdmin
            .from('address_verification_sessions')
            .update({
              status: 'REVOKED',
              updated_at: new Date().toISOString()
            })
            .eq('session_id', session.session_id);
        }
        break;

      default:
        console.log(`Unhandled webhook type: ${type}`);
    }

    // Always return 200 to acknowledge receipt
    return new Response(JSON.stringify({ received: true, type }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error processing Smile webhook:", error);
    // Still return 200 to prevent retries for processing errors
    return new Response(JSON.stringify({ received: true, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
