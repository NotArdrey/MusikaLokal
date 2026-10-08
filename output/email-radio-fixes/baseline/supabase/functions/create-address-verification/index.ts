// @ts-nocheck
import { encode as base64Encode } from "https://deno.land/std@0.177.0/encoding/base64.ts";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Address Verification Edge Function
 * 
 * Uses Smile API (open.smileapi.io) for Proof of Address verification
 * Uses OAuth2 client credentials authentication (same as smile-webhook)
 * 
 * Actions:
 * - create: Create Wink Widget token for address document verification
 * - get_session: Retrieve verification status and results
 * - validate: Compare extracted address with provided address
 */

// Smile API uses Basic Auth directly on each request (no separate token endpoint)
// Sandbox: https://sandbox.smileapi.io/v1
// Production: https://open.smileapi.io/v1
const SMILE_API_BASE = "https://sandbox.smileapi.io/v1";

// Wink Widget base URL (for Sandbox)
const WINK_WIDGET_BASE = "https://link.sandbox.smileapi.io";

/**
 * Create Basic Auth header for Smile API
 * Smile API uses HTTP Basic Auth: Authorization: Basic base64(apiKey:apiSecret)
 */
function getSmileAuthHeader(clientId: string, clientSecret: string): string {
  const credentials = base64Encode(`${clientId}:${clientSecret}`);
  return `Basic ${credentials}`;
}

/**
 * Create a Wink Widget token for document verification
 * This generates a link that users can use to upload their documents
 */
async function createWinkToken(
  authHeader: string,
  params: {
    userId: string;
    callbackUrl: string;
  }
): Promise<{ winkToken: string; userId: string }> {
  console.log("Creating Wink token for user:", params.userId);
  
  const response = await fetch(`${SMILE_API_BASE}/tokens`, {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: params.userId,
      callbackUrl: params.callbackUrl,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to create Wink token:", errorText);
    throw new Error(`Failed to create Wink token: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log("Wink token response:", { hasToken: !!data.data?.winkToken, userId: data.data?.userId });
  return data.data; // Response is wrapped in { code, message, data }
}

/**
 * Get user's archives (documents) from Smile API
 */
async function getUserArchives(authHeader: string, userId: string): Promise<any[]> {
  const response = await fetch(`${SMILE_API_BASE}/users/${userId}/archives`, {
    method: "GET",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to get user archives:", errorText);
    throw new Error(`Failed to get user archives: ${response.status}`);
  }

  const result = await response.json();
  return result.data?.items || [];
}

/**
 * Get a specific archive by ID
 */
async function getArchive(authHeader: string, archiveId: string): Promise<any> {
  const response = await fetch(`${SMILE_API_BASE}/archives/${archiveId}`, {
    method: "GET",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to get archive:", errorText);
    throw new Error(`Failed to get archive: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

serve(async (req) => {
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

    if (!SMILE_CLIENT_ID || !SMILE_CLIENT_SECRET) {
      console.error("Missing SMILE_CLIENT_ID or SMILE_CLIENT_SECRET");
      return new Response(
        JSON.stringify({ error: "Server configuration error: Missing Smile API credentials" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Using Smile API Base:", SMILE_API_BASE);

    // Parse request body
    const body = await req.json();
    const { 
      action, 
      userId, 
      entityId,      // studio_id or gig_id
      entityType,    // 'studio' or 'gig'
      entityAddress, // The address entered by user for the studio/gig
      redirect_url, 
      session_id,
      archive_id
    } = body;

    console.log('Address Verification Request:', { action, userId, entityId, entityType });

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // ============================================
    // ACTION: GET SESSION - Retrieve verification results from local DB
    // ============================================
    if (action === 'get_session' && session_id) {
      console.log(`Fetching address verification session: ${session_id}`);

      // Check local address_verification_sessions table
      const { data: localData } = await supabaseAdmin
        .from('address_verification_sessions')
        .select('*')
        .eq('session_id', session_id)
        .maybeSingle();

      if (!localData) {
        return new Response(JSON.stringify({ 
          error: "Session not found",
          session_id 
        }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      let sessionData: any = {
        ...localData,
        extracted_address: localData.extracted_address,
        extracted_name: localData.extracted_name,
        verification_status: localData.status,
      };

      // If we have archive info, try to get updated status from Smile
      if (localData.smile_user_id && localData.archive_id) {
        try {
          const authHeader = getSmileAuthHeader(SMILE_CLIENT_ID, SMILE_CLIENT_SECRET);
          const archive = await getArchive(authHeader, localData.archive_id);
          
          sessionData.archive = archive;
          
          // Update status based on archive analysis
          if (archive.status === 'ANALYZED') {
            const extractedAddress = archive.analysis?.address || archive.analysis?.fullAddress;
            const newStatus = extractedAddress ? 'VERIFIED' : 'ANALYZED';
            
            if (localData.status !== newStatus) {
              await supabaseAdmin
                .from('address_verification_sessions')
                .update({
                  status: newStatus,
                  extracted_address: extractedAddress,
                  extracted_name: archive.analysis?.employeeName || archive.analysis?.name,
                  updated_at: new Date().toISOString()
                })
                .eq('session_id', session_id);
              sessionData.status = newStatus;
              sessionData.extracted_address = extractedAddress;
            }
          }
        } catch (err) {
          console.error('Error fetching archive status:', err);
        }
      }

      return new Response(JSON.stringify(sessionData), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ============================================
    // ACTION: VALIDATE - Compare addresses
    // ============================================
    if (action === 'validate') {
      const { extractedAddress, providedAddress, extractedName, ownerName } = body;

      // Normalize addresses for comparison
      const normalizeAddress = (addr: string) => {
        return addr
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .replace(/\s+/g, '');
      };

      const normalizedExtracted = normalizeAddress(extractedAddress || '');
      const normalizedProvided = normalizeAddress(providedAddress || '');

      // Calculate similarity
      const addressMatches = 
        normalizedExtracted.includes(normalizedProvided) ||
        normalizedProvided.includes(normalizedExtracted) ||
        calculateSimilarity(normalizedExtracted, normalizedProvided) > 0.7;

      // Normalize names for comparison
      const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');
      const nameMatches = 
        normalizeName(extractedName || '').includes(normalizeName(ownerName || '')) ||
        normalizeName(ownerName || '').includes(normalizeName(extractedName || ''));

      return new Response(JSON.stringify({
        addressMatches,
        nameMatches,
        similarity: calculateSimilarity(normalizedExtracted, normalizedProvided),
        recommendation: addressMatches && nameMatches ? 'APPROVE' : 'MANUAL_REVIEW'
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ============================================
    // ACTION: CREATE - Create new verification session
    // ============================================
    if (!userId) {
      return new Response(JSON.stringify({ error: "userId is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    if (!entityType) {
      return new Response(JSON.stringify({ error: "entityType is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // For pre_creation mode, entityId is optional
    const mode = body.mode || 'post_creation';
    const isPreCreation = mode === 'pre_creation';

    console.log(`Creating address verification session for ${entityType} (mode: ${mode})`);

    // Get user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email, is_verified, verification_status')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error('Error fetching profile:', profileError);
      return new Response(JSON.stringify({ 
        error: "Could not fetch user profile",
        details: profileError?.message
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    console.log('User profile:', { 
      full_name: profile.full_name, 
      is_verified: profile.is_verified 
    });

    if (!profile.is_verified) {
      return new Response(JSON.stringify({ 
        error: "User identity must be verified first before address verification",
        message: "Please complete identity verification before verifying your address",
        verification_status: profile.verification_status || 'not_started'
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Generate unique Smile user ID for this verification
    const smileUserId = `addr_${userId.replace(/-/g, '').substring(0, 16)}_${Date.now()}`;
    
    // Generate session ID for tracking
    const sessionId = `smile_${entityType}_${userId}_${Date.now()}`;

    // Build callback URL for webhook
    const callbackUrl = `${SUPABASE_URL}/functions/v1/smile-webhook?session_id=${sessionId}&entity_type=${entityType}${entityId ? `&entity_id=${entityId}` : ''}&user_id=${userId}`;

    console.log('Callback URL:', callbackUrl);

    // Create Basic Auth header and get Wink token
    const authHeader = getSmileAuthHeader(SMILE_CLIENT_ID, SMILE_CLIENT_SECRET);
    const winkResponse = await createWinkToken(authHeader, {
      userId: smileUserId,
      callbackUrl: callbackUrl,
    });

    if (!winkResponse.winkToken) {
      throw new Error("Failed to get Smile Wink token");
    }

    console.log('Got Wink token successfully');

    // Build the Wink Widget URL
    // For sandbox: https://link.sandbox.smileapi.io/v1/verify?tk=<token>
    const winkWidgetUrl = `${WINK_WIDGET_BASE}/v1/verify?tk=${winkResponse.winkToken}`;

    console.log('Wink Widget URL generated');

    // Store session info in database
    await supabaseAdmin
      .from('address_verification_sessions')
      .upsert({
        session_id: sessionId,
        user_id: userId,
        smile_user_id: smileUserId,
        job_id: null, // Not used for Smile API
        entity_type: entityType,
        entity_id: isPreCreation ? null : entityId,
        expected_address: entityAddress || null,
        expected_name: profile.full_name,
        status: 'PENDING',
        provider: 'smile',
        created_at: new Date().toISOString()
      }, { onConflict: 'session_id' });

    // Update entity with pending verification status (only for post-creation mode)
    if (!isPreCreation && entityId) {
      const entityTable = entityType === 'studio' ? 'studios' : 'gigs';
      await supabaseAdmin
        .from(entityTable)
        .update({
          address_verification_status: 'PENDING',
          address_verification_session_id: sessionId
        })
        .eq('id', entityId);
    }

    // Return the verification URL to the client
    return new Response(
      JSON.stringify({
        success: true,
        sessionId: sessionId,
        smileUserId: smileUserId,
        verificationUrl: winkWidgetUrl,
        token: winkResponse.winkToken,
        mode: mode,
        provider: 'smile',
        message: "Please verify your address by uploading a utility bill or bank statement"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in address verification:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Calculate similarity between two strings (Dice coefficient)
 */
function calculateSimilarity(str1: string, str2: string): number {
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
