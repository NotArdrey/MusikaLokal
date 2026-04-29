// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, paymongo-signature",
};

// PayMongo API configuration
const PAYMONGO_SECRET_KEY = Deno.env.get("PAYMONGO_SECRET_KEY") || "";
const PAYMONGO_WEBHOOK_SECRET = Deno.env.get("PAYMONGO_WEBHOOK_SECRET") || "";
const PAYMONGO_API_URL = "https://api.paymongo.com/v1";

// Verify PayMongo webhook signature
async function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
): Promise<boolean> {
  if (!PAYMONGO_WEBHOOK_SECRET || !signatureHeader) {
    console.warn(
      "⚠️ Webhook signature verification skipped - no secret or signature",
    );
    return true; // Skip verification if no secret configured
  }

  try {
    // PayMongo signature format: t=timestamp,te=test_signature,li=live_signature
    const parts = signatureHeader.split(",");
    const timestampPart = parts.find((p) => p.startsWith("t="));
    const signaturePart =
      parts.find((p) => p.startsWith("li=")) ||
      parts.find((p) => p.startsWith("te="));

    if (!timestampPart || !signaturePart) {
      console.error("❌ Invalid signature header format");
      return false;
    }

    const timestamp = timestampPart.split("=")[1];
    const signature = signaturePart.split("=")[1];

    // Create the signed payload: timestamp + '.' + raw_body
    const signedPayload = `${timestamp}.${payload}`;

    // Compute HMAC-SHA256
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(PAYMONGO_WEBHOOK_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedPayload),
    );

    // Convert to hex
    const computedSignature = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const isValid = computedSignature === signature;

    if (!isValid) {
      console.error("❌ Webhook signature mismatch");
      console.log("Expected:", signature);
      console.log("Computed:", computedSignature);
    } else {
      console.log("✅ Webhook signature verified");
    }

    return isValid;
  } catch (e) {
    console.error("❌ Error verifying webhook signature:", e);
    return false;
  }
}

// Helper to make PayMongo API calls
async function paymongoRequest(
  endpoint: string,
  method: string = "GET",
  body?: any,
) {
  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(PAYMONGO_SECRET_KEY + ":")}`,
    "Content-Type": "application/json",
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${PAYMONGO_API_URL}${endpoint}`, options);
  const data = await response.json();

  if (!response.ok) {
    console.error("PayMongo API Error:", JSON.stringify(data, null, 2));
    throw new Error(data.errors?.[0]?.detail || "PayMongo API error");
  }

  return data;
}

function normalizeBookingIds(...values: any[]): string[] {
  const ids: string[] = [];

  const add = (value: any) => {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return;

      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          add(JSON.parse(trimmed));
          return;
        } catch {
          // Fall through to comma-separated parsing.
        }
      }

      trimmed
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => ids.push(part));
      return;
    }

    ids.push(String(value));
  };

  values.forEach(add);
  return [...new Set(ids)];
}

function getMetadataBookingIds(metadata: any, fallbackBookingId?: string | null): string[] {
  return normalizeBookingIds(
    fallbackBookingId,
    metadata?.booking_ids,
    metadata?.bookingIds,
  );
}

function getNumericAmount(value: any): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function allocateInitialPaymentRows(
  bookings: any[],
  amount: number,
  paymentType: string,
): Map<string, { paymentAmount: number; remainingBalance: number }> {
  const allocation = new Map<string, { paymentAmount: number; remainingBalance: number }>();
  const finalPrices = bookings.map((booking) =>
    Math.max(0, getNumericAmount(booking.final_price)),
  );
  const totalFinalPrice = finalPrices.reduce((sum, price) => sum + price, 0);

  if (paymentType === "downpayment") {
    let amountLeft =
      amount > 0 ? Math.round(amount) : Math.round(totalFinalPrice / 2);

    bookings.forEach((booking, index) => {
      const finalPrice = finalPrices[index] || 0;
      const isLast = index === bookings.length - 1;
      const proportionalAmount =
        totalFinalPrice > 0
          ? Math.round((amount > 0 ? amount : totalFinalPrice / 2) * (finalPrice / totalFinalPrice))
          : 0;
      const rawPaymentAmount = isLast ? amountLeft : proportionalAmount;
      const paymentAmount = Math.max(0, Math.min(finalPrice, rawPaymentAmount));
      amountLeft = Math.max(0, amountLeft - paymentAmount);

      allocation.set(booking.id, {
        paymentAmount,
        remainingBalance: Math.max(0, finalPrice - paymentAmount),
      });
    });

    return allocation;
  }

  bookings.forEach((booking, index) => {
    const finalPrice = finalPrices[index] || 0;
    allocation.set(booking.id, {
      paymentAmount: finalPrice,
      remainingBalance: 0,
    });
  });

  return allocation;
}

// Helper to credit owner's wallet when a booking payment is received
// Idempotent: safe to call multiple times for the same booking (e.g. both
// the client-side forfeit path and the webhook path may trigger this).
async function creditOwnerWallet(
  supabaseAdmin: any,
  bookingId: string,
  paymentAmount: number,
) {
  try {
    console.log(
      "💰 Crediting owner wallet for booking:",
      bookingId,
      "Amount:",
      paymentAmount,
    );

    // IDEMPOTENCY: Skip if a wallet earning for this booking already exists.
    const { data: existingTx } = await supabaseAdmin
      .from("wallet_transactions")
      .select("id")
      .eq("reference_id", bookingId)
      .eq("type", "earning")
      .maybeSingle();

    if (existingTx) {
      console.log("⏭️ Owner wallet already credited for booking:", bookingId);
      return;
    }

    // Get booking details with studio owner
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("studio_bookings")
      .select(
        "id, final_price, payment_amount, studio:studios(id, name, owner_id)",
      )
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      console.error(
        "❌ Error fetching booking for wallet credit:",
        bookingError,
      );
      return;
    }

    const ownerId = booking.studio?.owner_id;
    if (!ownerId) {
      console.error("❌ No owner_id found for studio");
      return;
    }

    // Prefer the booking's stored amount so batch checkouts credit each row correctly.
    // In test mode PayMongo may charge a placeholder amount that should not drive earnings.
    const creditAmount =
      booking.payment_amount || booking.final_price || paymentAmount;
    if (!creditAmount || creditAmount <= 0) {
      console.error("❌ Invalid credit amount:", creditAmount);
      return;
    }

    // Find or create owner's wallet
    let { data: wallet, error: walletError } = await supabaseAdmin
      .from("wallets")
      .select("id, balance")
      .eq("user_id", ownerId)
      .single();

    if (walletError || !wallet) {
      // Create wallet if it doesn't exist
      const { data: newWallet, error: createError } = await supabaseAdmin
        .from("wallets")
        .insert([{ user_id: ownerId, balance: 0 }])
        .select()
        .single();

      if (createError) {
        console.error("❌ Error creating wallet:", createError);
        return;
      }
      wallet = newWallet;
    }

    // Update wallet balance
    const newBalance = (wallet.balance || 0) + creditAmount;
    const { error: updateError } = await supabaseAdmin
      .from("wallets")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("id", wallet.id);

    if (updateError) {
      console.error("❌ Error updating wallet balance:", updateError);
      return;
    }

    // Create wallet transaction record
    const { error: txError } = await supabaseAdmin
      .from("wallet_transactions")
      .insert({
        wallet_id: wallet.id,
        amount: creditAmount,
        type: "earning",
        description: `Payment received for booking at ${booking.studio?.name}`,
        reference_id: bookingId,
        is_credit: true,
        status: "completed",
      });

    if (txError) {
      console.error("❌ Error creating wallet transaction:", txError);
      return;
    }

    console.log(
      "✅ Successfully credited ₱" +
      creditAmount +
      " to owner wallet. New balance: ₱" +
      newBalance,
    );
  } catch (e) {
    console.error("❌ Error in creditOwnerWallet:", e);
  }
}

serve(async (req: Request) => {
  console.log("🔵 PayMongo function called:", req.method, req.url);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Check for required environment variables upfront
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY");
      return new Response(
        JSON.stringify({
          error: "Server configuration error: Missing Supabase credentials",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    if (!supabaseServiceKey) {
      console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({
          error: "Server configuration error: Missing service role key",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        },
      );
    }

    const authHeader = req.headers.get("Authorization");
    console.log("🔵 Auth header present:", !!authHeader);

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Handle GET requests (redirects from PayMongo) vs POST requests
    let action: string | null = null;
    let params: Record<string, any> = {};
    let rawBody = "";

    if (req.method === "GET") {
      // GET request - parse action and params from URL query string
      const url = new URL(req.url);
      action = url.searchParams.get("action");
      // Convert URLSearchParams to object
      url.searchParams.forEach((value, key) => {
        if (key !== "action") {
          params[key] = value;
        }
      });
    } else {
      // POST request - parse from body
      rawBody = await req.text();
      if (rawBody) {
        const body = JSON.parse(rawBody);
        action = body.action;
        const { action: _, ...restParams } = body;
        params = restParams;
      }
    }

    // For webhooks, verify signature first
    if (action === "webhook") {
      const signatureHeader = req.headers.get("paymongo-signature") || "";
      const isValid = await verifyWebhookSignature(rawBody, signatureHeader);

      if (!isValid) {
        console.error("❌ Invalid webhook signature - rejecting request");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        });
      }
    }

    const publicActions = new Set([
      "webhook",
      "payment_success",
      "payment_cancelled",
      "subscription_success",
      "subscription_cancelled",
    ]);

    let authenticatedUserId: string | null = null;

    if (action && !publicActions.has(action)) {
      const token = (authHeader || "").replace(/^Bearer\s+/i, "");
      const {
        data: { user },
        error: authError,
      } = await supabaseClient.auth.getUser(token);

      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        });
      }

      authenticatedUserId = user.id;
    }

    // ====================================================================
    // 1. CREATE CHECKOUT SESSION
    // ====================================================================
    if (action === "create_checkout") {
      const {
        booking_id,
        booking_ids,
        user_id,
        amount,
        description,
        studio_name,
        booking_date,
        success_url,
        cancel_url,
        payment_type,
        total_amount,
        remaining_balance,
        redirect_url,
        cancel_redirect_url,
      } = params;

      if (!authenticatedUserId || user_id !== authenticatedUserId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      console.log("📤 Creating PayMongo checkout session:", {
        booking_id,
        amount,
        description,
        payment_type,
        redirect_url,
      });

      const targetBookingIds = normalizeBookingIds(booking_id, booking_ids);
      const primaryBookingId = targetBookingIds[0] || booking_id;

      if (targetBookingIds.length === 0 || !amount) {
        return new Response(
          JSON.stringify({
            error: "Missing required fields: booking_id or booking_ids, amount",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      // Verify every booking in the checkout exists and belongs to the user.
      const { data: fetchedBookings, error: bookingError } = await supabaseClient
        .from("studio_bookings")
        .select(
          "id, user_id, final_price, status, payment_status, studio:studios(name)",
        )
        .in("id", targetBookingIds);

      const bookingsById = new Map(
        (fetchedBookings || []).map((booking: any) => [booking.id, booking]),
      );
      const bookingRows = targetBookingIds
        .map((id) => bookingsById.get(id))
        .filter(Boolean);

      if (bookingError || bookingRows.length !== targetBookingIds.length) {
        return new Response(JSON.stringify({ error: "Booking not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      if (bookingRows.some((booking: any) => booking.user_id !== user_id)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      if (bookingRows.some((booking: any) => booking.payment_status === "paid")) {
        return new Response(
          JSON.stringify({ error: "One or more bookings have already been paid" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      // Get user email for checkout
      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("email, full_name")
        .eq("id", user_id)
        .single();

      // Amount should be in centavos (PHP * 100)
      // TEST MODE: Using 1 peso for testing - REMOVE FOR PRODUCTION
      const amountInCentavos = 100; // Math.round(amount * 100);
      const booking = bookingRows[0];
      const studioName =
        booking.studio?.name || studio_name || "Studio Booking";
      const isDownpayment = payment_type === "downpayment";
      const isMultiBooking = targetBookingIds.length > 1;
      const bookingDescription =
        description ||
        (isDownpayment
          ? `Downpayment (50%) for ${isMultiBooking ? `${targetBookingIds.length} bookings` : `booking at ${studioName} on ${booking_date}`}`
          : `${isMultiBooking ? `${targetBookingIds.length} bookings` : `Booking at ${studioName} on ${booking_date}`}`);

      // Base URL for redirects
      const baseUrl =
        Deno.env.get("APP_URL") || "https://aefldxegsvzecshlayza.supabase.co";

      // Create PayMongo Checkout Session
      const checkoutData = await paymongoRequest("/checkout_sessions", "POST", {
        data: {
          attributes: {
            billing: profile
              ? {
                name: profile.full_name || "Customer",
                email: profile.email,
              }
              : undefined,
            send_email_receipt: true,
            show_description: true,
            show_line_items: true,
            description: bookingDescription,
            line_items: [
              {
                currency: "PHP",
                amount: amountInCentavos,
                name: isDownpayment
                  ? `${studioName} (Downpayment)`
                  : studioName,
                description: bookingDescription,
                quantity: 1,
              },
            ],
            // QR Ph payment
            // For production, use live keys and add: gcash, paymaya, grab_pay
            payment_method_types: ["qrph"],
            success_url:
              success_url ||
              `${baseUrl}/functions/v1/paymongo?action=payment_success&booking_id=${primaryBookingId}${redirect_url ? "&redirect_url=" + encodeURIComponent(redirect_url) : ""}`,
            cancel_url:
              cancel_url ||
              `${baseUrl}/functions/v1/paymongo?action=payment_cancelled&booking_id=${primaryBookingId}${cancel_redirect_url ? "&redirect_url=" + encodeURIComponent(cancel_redirect_url) : ""}`,
            reference_number: primaryBookingId,
            metadata: {
              booking_id: primaryBookingId,
              booking_ids: JSON.stringify(targetBookingIds),
              booking_count: String(targetBookingIds.length),
              user_id: user_id,
              studio_name: studioName,
              payment_type: payment_type || "full",
              total_amount: total_amount || amount,
              remaining_balance: remaining_balance || 0,
            },
          },
        },
      });

      console.log("✅ Checkout session created:", checkoutData.data.id);

      // Update booking with checkout session ID
      // For balance payments, don't change the payment_type, just update the remaining_balance
      const isBalancePayment = payment_type === "balance";
      const updateData: any = {
        checkout_session_id: checkoutData.data.id,
        payment_status: "pending",
      };

      if (isBalancePayment) {
        // Balance payment - don't change payment_type or remaining_balance yet
        // These will be updated by payment_success/webhook after PayMongo confirms payment
        const { error: updateError } = await supabaseAdmin
          .from("studio_bookings")
          .update(updateData)
          .in("id", targetBookingIds);

        if (updateError) {
          console.error("Error updating booking:", updateError);
        }
      } else {
        // Initial payment (full or downpayment)
        const paymentAllocations = allocateInitialPaymentRows(
          bookingRows,
          getNumericAmount(amount),
          payment_type || "full",
        );

        for (const bookingRow of bookingRows) {
          const rowAllocation = paymentAllocations.get(bookingRow.id) || {
            paymentAmount: getNumericAmount(amount),
            remainingBalance: getNumericAmount(remaining_balance),
          };
          const { error: updateError } = await supabaseAdmin
            .from("studio_bookings")
            .update({
              ...updateData,
              payment_amount: rowAllocation.paymentAmount,
              payment_type: payment_type || "full",
              remaining_balance: rowAllocation.remainingBalance,
              status: "pending", // Keep as pending until payment completes
            })
            .eq("id", bookingRow.id);

          if (updateError) {
            console.error("Error updating booking:", updateError);
          }
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          checkout_url: checkoutData.data.attributes.checkout_url,
          checkout_session_id: checkoutData.data.id,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // ====================================================================
    // 1B. CREATE SUBSCRIPTION CHECKOUT SESSION
    // ====================================================================
    if (action === "create_subscription_checkout") {
      const {
        user_id,
        plan_id,
        amount,
        plan_name,
        description,
        redirect_url,
        cancel_redirect_url,
      } = params;

      if (!authenticatedUserId || user_id !== authenticatedUserId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      console.log("📤 Creating subscription checkout:", {
        user_id,
        plan_id,
        amount,
        plan_name,
      });

      // Check for PayMongo API key
      if (!PAYMONGO_SECRET_KEY) {
        console.error("❌ PAYMONGO_SECRET_KEY not configured");
        return new Response(
          JSON.stringify({
            error: "Payment service not configured. Please contact support.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      if (!user_id || !plan_id || !amount) {
        return new Response(
          JSON.stringify({
            error: "Missing required fields: user_id, plan_id, amount",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      // Get user profile for billing
      console.log("🔵 Fetching profile for user:", user_id);
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name, role")
        .eq("id", user_id)
        .single();

      if (profileError) {
        console.error("❌ Error fetching profile:", profileError);
        return new Response(
          JSON.stringify({
            error: `Failed to fetch user profile: ${profileError.message}`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      console.log("🔵 Profile found:", {
        role: profile?.role,
        email: profile?.email,
      });

      // Only studio-owner and venue-owner can subscribe
      if (
        !profile ||
        (profile.role !== "studio-owner" && profile.role !== "venue-owner")
      ) {
        console.error("❌ Invalid role:", profile?.role);
        return new Response(
          JSON.stringify({
            error: `Only studio owners and venue owners can subscribe. Your role: ${profile?.role || "none"}`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          },
        );
      }

      // Get plan details
      console.log("🔵 Fetching plan:", plan_id);
      const { data: plan, error: planError } = await supabaseAdmin
        .from("subscription_plans")
        .select("*")
        .eq("id", plan_id)
        .single();

      if (planError) {
        console.error("❌ Error fetching plan:", planError);
        return new Response(
          JSON.stringify({
            error: `Failed to fetch subscription plan: ${planError.message}`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          },
        );
      }

      if (!plan) {
        console.error("❌ Plan not found:", plan_id);
        return new Response(
          JSON.stringify({ error: "Subscription plan not found" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          },
        );
      }

      console.log("🔵 Plan found:", { name: plan.name, price: plan.price });

      // Amount in centavos
      // TEST MODE: Using 1 peso for testing - REMOVE FOR PRODUCTION
      const amountInCentavos = 100; // Math.round(plan.price * 100);
      const subscriptionDescription =
        description || `${plan.name} Plan - Monthly Subscription`;

      // Base URL for redirects
      const baseUrl =
        Deno.env.get("APP_URL") || "https://aefldxegsvzecshlayza.supabase.co";

      // Create PayMongo Checkout Session for subscription
      let checkoutData;
      try {
        checkoutData = await paymongoRequest("/checkout_sessions", "POST", {
          data: {
            attributes: {
              billing: profile
                ? {
                  name: profile.full_name || "Customer",
                  email: profile.email,
                }
                : undefined,
              send_email_receipt: true,
              show_description: true,
              show_line_items: true,
              description: subscriptionDescription,
              line_items: [
                {
                  currency: "PHP",
                  amount: amountInCentavos,
                  name: `${plan.name} Plan`,
                  description: subscriptionDescription,
                  quantity: 1,
                },
              ],
              // QR Ph payment
              // For production, use live keys and add: gcash, paymaya, grab_pay
              payment_method_types: ["qrph"],
              success_url: `${baseUrl}/functions/v1/paymongo?action=subscription_success&user_id=${user_id}&plan_id=${plan_id}${redirect_url ? "&redirect_url=" + encodeURIComponent(redirect_url) : ""}`,
              cancel_url: `${baseUrl}/functions/v1/paymongo?action=subscription_cancelled&user_id=${user_id}${cancel_redirect_url ? "&redirect_url=" + encodeURIComponent(cancel_redirect_url) : ""}`,
              reference_number: `sub_${user_id}_${Date.now()}`,
              metadata: {
                type: "subscription",
                user_id: user_id,
                plan_id: plan_id,
                plan_name: plan.name,
              },
            },
          },
        });
      } catch (paymongoError: any) {
        console.error("❌ PayMongo API error:", paymongoError.message);
        return new Response(
          JSON.stringify({
            error: `Payment service error: ${paymongoError.message}`,
            hint: "Please verify your PayMongo API key is valid and has the correct permissions.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 502,
          },
        );
      }

      console.log(
        "✅ Subscription checkout session created:",
        checkoutData.data.id,
      );

      return new Response(
        JSON.stringify({
          success: true,
          checkout_url: checkoutData.data.attributes.checkout_url,
          checkout_session_id: checkoutData.data.id,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // ====================================================================
    // 2. CHECK PAYMENT STATUS
    // ====================================================================
    if (action === "check_payment") {
      const { checkout_session_id, booking_id } = params;

      if (!checkout_session_id && !booking_id) {
        return new Response(
          JSON.stringify({
            error: "Missing checkout_session_id or booking_id",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      let sessionId = checkout_session_id;
      let resolvedBookingId: string | null = booking_id || null;

      // If only booking_id provided, get checkout_session_id from booking
      if (!sessionId && booking_id) {
        const { data: booking } = await supabaseClient
          .from("studio_bookings")
          .select("id, checkout_session_id, payment_status")
          .eq("id", booking_id)
          .single();

        if (booking?.payment_status === "paid") {
          return new Response(
            JSON.stringify({
              success: true,
              payment_status: "paid",
              message: "Payment already completed",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            },
          );
        }

        sessionId = booking?.checkout_session_id;
        resolvedBookingId = booking?.id || resolvedBookingId;
      }

      if (!sessionId) {
        return new Response(
          JSON.stringify({
            error: "No checkout session found for this booking",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          },
        );
      }

      if (resolvedBookingId && authenticatedUserId) {
        const { data: ownershipBooking } = await supabaseAdmin
          .from("studio_bookings")
          .select("id")
          .eq("id", resolvedBookingId)
          .eq("user_id", authenticatedUserId)
          .single();

        if (!ownershipBooking) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          });
        }
      }

      // Get checkout session status from PayMongo
      const sessionData = await paymongoRequest(
        `/checkout_sessions/${sessionId}`,
      );
      const paymentStatus =
        sessionData.data.attributes.payment_intent?.attributes?.status;
      const payments = sessionData.data.attributes.payments || [];

      console.log("📊 Payment status check:", {
        sessionId,
        paymentStatus,
        paymentsCount: payments.length,
      });

      // If payment is successful, update booking
      if (paymentStatus === "succeeded" || payments.length > 0) {
        const payment = payments[0];
        const paymentMethod = payment?.attributes?.source?.type || "unknown";
        const paymentIntentId = sessionData.data.attributes.payment_intent?.id;
        const paymentAmount = payment?.attributes?.amount
          ? payment.attributes.amount / 100
          : 0; // Convert from centavos
        const metadata = sessionData.data.attributes.metadata || {};
        const paymentType = metadata?.payment_type || "full";
        const remainingBalance = Number(metadata?.remaining_balance || 0);
        const isDownpayment = paymentType === "downpayment" && remainingBalance > 0;
        const metadataBookingIds = getMetadataBookingIds(metadata, resolvedBookingId);

        // ========================================
        // DEDUPLICATION: Check current status before updating to prevent race conditions
        // The webhook might have already processed this payment
        // ========================================
        const { data: currentBookings } = await supabaseAdmin
          .from("studio_bookings")
          .select("id, payment_status")
          .eq("checkout_session_id", sessionId);

        const targetBookingIds =
          metadataBookingIds.length > 0
            ? metadataBookingIds
            : (currentBookings || []).map((booking: any) => booking.id).filter(Boolean);
        const currentBooking = (currentBookings || [])[0] || null;

        resolvedBookingId = resolvedBookingId || targetBookingIds[0] || currentBooking?.id || null;

        const alreadySettled =
          currentBookings?.length &&
          currentBookings.every((booking: any) =>
            booking.payment_status === "paid" ||
            (isDownpayment && booking.payment_status === "partial")
          );

        if (alreadySettled) {
          console.log("⏭️ check_status: Booking already paid by webhook, skipping duplicate notification");
          return new Response(
            JSON.stringify({
              success: true,
              payment_status: isDownpayment ? "partial" : "paid",
              payment_method: paymentMethod,
              message: "Payment already completed",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            },
          );
        }

        // Update booking to confirmed and paid
        const updateData: any = {
          payment_status: isDownpayment ? "partial" : "paid",
          payment_intent_id: paymentIntentId,
          payment_method: paymentMethod,
          paid_at: new Date().toISOString(),
          status: "confirmed",
        };

        if (!isDownpayment) {
          updateData.remaining_balance = 0;
        }

        const { error: updateError } = await supabaseAdmin
          .from("studio_bookings")
          .update(updateData)
          .in("id", targetBookingIds);

        if (updateError) {
          console.error("Error updating booking:", updateError);
        }

        for (const targetBookingId of targetBookingIds) {
          await creditOwnerWallet(supabaseAdmin, targetBookingId, paymentAmount);
        }

        // Get full booking details for notifications
        const { data: fullBookings } = await supabaseAdmin
          .from("studio_bookings")
          .select(
            "id, user_id, studio_id, booking_date, studio:studios(name, owner_id, images), profile:user_id(avatar_url)",
          )
          .in("id", targetBookingIds);

        for (const fullBooking of fullBookings || []) {
          const studioImage = fullBooking.studio?.images?.[0];
          const userAvatar = fullBooking.profile?.avatar_url;

          // Notify musician
          await supabaseAdmin.from("notifications").insert({
            user_id: fullBooking.user_id,
            type: "success",
            title: "Payment Successful!",
            message: `Your booking at ${fullBooking.studio?.name} has been confirmed and moved to Upcoming.`,
            image: studioImage,
            meta: { booking_id: fullBooking.id },
          });

          // Notify studio owner
          if (fullBooking.studio?.owner_id) {
            await supabaseAdmin.from("notifications").insert({
              user_id: fullBooking.studio.owner_id,
              type: "info",
              title: "Booking Payment Received",
              message: `Payment received for booking at ${fullBooking.studio?.name} on ${fullBooking.booking_date}.`,
              image: userAvatar,
              meta: {
                booking_id: fullBooking.id,
                studio_id: fullBooking.studio_id,
              },
            });
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            payment_status: isDownpayment ? "partial" : "paid",
            payment_method: paymentMethod,
            message: "Payment completed successfully",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          payment_status: paymentStatus || "pending",
          checkout_status: sessionData.data.attributes.status,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // ====================================================================
    // 3. PAYMENT SUCCESS REDIRECT (Called by PayMongo on success)
    // ====================================================================
    if (action === "payment_success") {
      const url = new URL(req.url);
      const bookingId = url.searchParams.get("booking_id") || params.booking_id;
      // Get client-provided redirect URL (supports Expo Go exp:// and production musikalokal://)
      const clientRedirectUrl = url.searchParams.get("redirect_url");

      console.log(
        "✅ Payment success callback for booking:",
        bookingId,
        "redirect_url:",
        clientRedirectUrl,
      );

      if (bookingId) {
        // Get booking details
        const { data: booking } = await supabaseAdmin
          .from("studio_bookings")
          .select("checkout_session_id, payment_status")
          .eq("id", bookingId)
          .single();

        // ========================================
        // DEDUPLICATION: Skip if already paid (webhook may have processed it)
        // ========================================
        if (booking?.payment_status === "paid") {
          console.log("⏭️ payment_success: Booking already paid, redirecting without duplicate notification");
        } else if (booking?.checkout_session_id) {
          // Verify payment with PayMongo
          try {
            const sessionData = await paymongoRequest(
              `/checkout_sessions/${booking.checkout_session_id}`,
            );
            const payments = sessionData.data.attributes.payments || [];

            if (payments.length > 0) {
              const payment = payments[0];
              const paymentMethod =
                payment?.attributes?.source?.type || "unknown";
              const paymentIntentId =
                sessionData.data.attributes.payment_intent?.id;
              const paymentAmount = payment?.attributes?.amount
                ? payment.attributes.amount / 100
                : 0; // Convert from centavos
              const metadata = sessionData.data.attributes.metadata || {};
              const paymentType = metadata?.payment_type || "full";
              const remainingBalance = parseFloat(String(metadata?.remaining_balance || 0));
              const isDownpayment = paymentType === "downpayment";
              const targetBookingIds = getMetadataBookingIds(metadata, bookingId);

              // ========================================
              // DEDUPLICATION: Double-check status before updating (race condition protection)
              // ========================================
              const { data: recheckBookings } = await supabaseAdmin
                .from("studio_bookings")
                .select("id, payment_status")
                .in("id", targetBookingIds);

              const alreadySettled =
                recheckBookings?.length &&
                recheckBookings.every((booking: any) =>
                  booking.payment_status === "paid" ||
                  (isDownpayment && booking.payment_status === "partial")
                );

              if (alreadySettled) {
                console.log("⏭️ payment_success: Booking already processed by webhook, skipping");
              } else {
                // Get payment type from checkout session metadata
                console.log("💰 payment_success: Processing payment", { paymentType, remainingBalance, isDownpayment });

                // Update booking - handle downpayment vs full payment
                const updateData: any = {
                  payment_intent_id: paymentIntentId,
                  payment_method: paymentMethod,
                  paid_at: new Date().toISOString(),
                  status: "confirmed",
                };

                if (isDownpayment && remainingBalance > 0) {
                  // Downpayment - set to partial, keep remaining balance
                  updateData.payment_status = "partial";
                } else {
                  // Full payment or balance payment
                  updateData.payment_status = "paid";
                  updateData.remaining_balance = 0;
                }

                await supabaseAdmin
                  .from("studio_bookings")
                  .update(updateData)
                  .in("id", targetBookingIds);

                // Credit the owner's wallet
                for (const targetBookingId of targetBookingIds) {
                  await creditOwnerWallet(supabaseAdmin, targetBookingId, paymentAmount);
                }

                // Get full booking details for notifications
                const { data: fullBookings } = await supabaseAdmin
                  .from("studio_bookings")
                  .select(
                    "id, user_id, studio_id, booking_date, remaining_balance, studio:studios(name, owner_id, images), profile:user_id(avatar_url)",
                  )
                  .in("id", targetBookingIds);

                for (const fullBooking of fullBookings || []) {
                  const studioImage = fullBooking.studio?.images?.[0];
                  const userAvatar = fullBooking.profile?.avatar_url;
                  const bookingRemainingBalance = getNumericAmount(
                    fullBooking.remaining_balance ?? remainingBalance,
                  );

                  // Notify musician with appropriate message
                  const musicianTitle = isDownpayment ? "Downpayment Received!" : "Payment Successful!";
                  const musicianMessage = isDownpayment
                    ? `Your downpayment for ${fullBooking.studio?.name} has been received. Remaining balance: ₱${bookingRemainingBalance.toLocaleString()}`
                    : `Your booking at ${fullBooking.studio?.name} has been confirmed and moved to Upcoming.`;

                  await supabaseAdmin.from("notifications").insert({
                    user_id: fullBooking.user_id,
                    type: "success",
                    title: musicianTitle,
                    message: musicianMessage,
                    image: studioImage,
                    meta: { booking_id: fullBooking.id },
                  });

                  // Notify studio owner
                  if (fullBooking.studio?.owner_id) {
                    const ownerTitle = isDownpayment ? "Downpayment Received" : "Booking Payment Received";
                    const ownerMessage = isDownpayment
                      ? `Downpayment received for booking at ${fullBooking.studio?.name} on ${fullBooking.booking_date}. Remaining balance: ₱${bookingRemainingBalance.toLocaleString()}`
                      : `Payment received for booking at ${fullBooking.studio?.name} on ${fullBooking.booking_date}.`;

                    await supabaseAdmin.from("notifications").insert({
                      user_id: fullBooking.studio.owner_id,
                      type: "info",
                      title: ownerTitle,
                      message: ownerMessage,
                      image: userAvatar,
                      meta: { booking_id: fullBooking.id },
                    });
                  }
                }
              }
            }
          } catch (e) {
            console.error("Error verifying payment:", e);
          }
        }
      }

      // Use client-provided redirect URL if available, otherwise fallback to hardcoded scheme
      // This allows the redirect to work with Expo Go (exp://) during development
      const appDeepLink =
        clientRedirectUrl ||
        `musikalokal://payment-result?status=success&booking_id=${bookingId}`;

      console.log("🔀 Redirecting directly to:", appDeepLink);

      // Use HTTP 302 redirect directly to the app deep link
      return new Response(null, {
        status: 302,
        headers: {
          Location: appDeepLink,
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    // ====================================================================
    // 4. PAYMENT CANCELLED REDIRECT
    // ====================================================================
    if (action === "payment_cancelled") {
      const url = new URL(req.url);
      const bookingId = url.searchParams.get("booking_id") || params.booking_id;
      // Get client-provided redirect URL (supports Expo Go exp:// and production musikalokal://)
      const clientRedirectUrl = url.searchParams.get("redirect_url");

      console.log(
        "❌ Payment cancelled for booking:",
        bookingId,
        "redirect_url:",
        clientRedirectUrl,
      );

      // Reset payment status back to unpaid so user can try again
      // (Do NOT set to 'failed' as that hides the Pay Now button)
      if (bookingId) {
        await supabaseAdmin
          .from("studio_bookings")
          .update({
            payment_status: "unpaid",
            checkout_session_id: null, // Clear the old session so a new one can be created
          })
          .eq("id", bookingId);
      }

      // Use client-provided redirect URL if available, otherwise fallback to hardcoded scheme
      const appDeepLink =
        clientRedirectUrl ||
        `musikalokal://payment-result?status=cancelled&booking_id=${bookingId}`;

      console.log("🔀 Redirecting directly to:", appDeepLink);

      // Use HTTP 302 redirect directly to the app deep link
      return new Response(null, {
        status: 302,
        headers: {
          Location: appDeepLink,
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    // ====================================================================
    // 4B. SUBSCRIPTION SUCCESS REDIRECT
    // ====================================================================
    if (action === "subscription_success") {
      const url = new URL(req.url);
      const userId = url.searchParams.get("user_id") || params.user_id;
      const planId = url.searchParams.get("plan_id") || params.plan_id;
      const clientRedirectUrl = url.searchParams.get("redirect_url");

      console.log("✅ Subscription payment success:", { userId, planId });

      if (userId && planId) {
        try {
          // Get plan details
          const { data: plan } = await supabaseAdmin
            .from("subscription_plans")
            .select("*")
            .eq("id", planId)
            .single();

          if (plan) {
            const now = new Date();
            const periodEnd = new Date(now);
            periodEnd.setDate(periodEnd.getDate() + (plan.duration_days || 30));

            // Check if user already has a subscription
            const { data: existingSub } = await supabaseAdmin
              .from("subscriptions")
              .select("id")
              .eq("user_id", userId)
              .single();

            if (existingSub) {
              // Update existing subscription
              await supabaseAdmin
                .from("subscriptions")
                .update({
                  plan_id: planId,
                  status: "active",
                  current_period_start: now.toISOString(),
                  current_period_end: periodEnd.toISOString(),
                  cancelled_at: null,
                  cancel_at_period_end: false,
                  last_payment_date: now.toISOString(),
                  last_payment_amount: plan.price,
                  updated_at: now.toISOString(),
                })
                .eq("id", existingSub.id);
            } else {
              // Create new subscription
              await supabaseAdmin.from("subscriptions").insert({
                user_id: userId,
                plan_id: planId,
                status: "active",
                current_period_start: now.toISOString(),
                current_period_end: periodEnd.toISOString(),
                last_payment_date: now.toISOString(),
                last_payment_amount: plan.price,
              });
            }

            // Update profile subscription status
            await supabaseAdmin
              .from("profiles")
              .update({
                subscription_status: "active",
                subscription_expires_at: periodEnd.toISOString(),
                subscription_plan_id: planId,
              })
              .eq("id", userId);

            // Record payment in subscription_payments
            const { data: sub } = await supabaseAdmin
              .from("subscriptions")
              .select("id")
              .eq("user_id", userId)
              .single();

            if (sub) {
              await supabaseAdmin.from("subscription_payments").insert({
                subscription_id: sub.id,
                user_id: userId,
                amount: plan.price,
                status: "paid",
                billing_period_start: now.toISOString(),
                billing_period_end: periodEnd.toISOString(),
                paid_at: now.toISOString(),
              });
            }

            // Send notification
            await supabaseAdmin.from("notifications").insert({
              user_id: userId,
              type: "success",
              title: "Subscription Activated! 🎉",
              message: `Welcome to the ${plan.name} plan! Your subscription is now active.`,
              meta: { plan_id: planId, plan_name: plan.name },
            });
          }
        } catch (e) {
          console.error("Error creating subscription:", e);
        }
      }

      const appDeepLink =
        clientRedirectUrl ||
        `musikalokal://payment-result?status=success&type=subscription&plan_id=${planId}`;

      return new Response(null, {
        status: 302,
        headers: {
          Location: appDeepLink,
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    // ====================================================================
    // 4C. SUBSCRIPTION CANCELLED REDIRECT
    // ====================================================================
    if (action === "subscription_cancelled") {
      const url = new URL(req.url);
      const clientRedirectUrl = url.searchParams.get("redirect_url");

      console.log("❌ Subscription checkout cancelled");

      const appDeepLink =
        clientRedirectUrl ||
        `musikalokal://payment-result?status=cancelled&type=subscription`;

      return new Response(null, {
        status: 302,
        headers: {
          Location: appDeepLink,
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    // ====================================================================
    // 5. WEBHOOK HANDLER (For PayMongo webhooks)
    // ====================================================================
    if (action === "webhook") {
      // PayMongo sends webhook data in params or as root object with 'data' key
      const event = params.data ? params.data.attributes : params;

      console.log("🔔 PayMongo webhook received:", event.type);
      console.log("📦 Webhook payload:", JSON.stringify(event, null, 2));

      // Helper function to process successful payment
      async function processSuccessfulPayment(
        bookingId: string,
        paymentMethod?: string,
        paymentAmount?: number,
        metadata?: { payment_type?: string; remaining_balance?: string | number; total_amount?: string | number },
      ) {
        const targetBookingIds = getMetadataBookingIds(metadata, bookingId);
        if (targetBookingIds.length === 0) return;

        // ========================================
        // DEDUPLICATION CHECK: Prevent duplicate notifications
        // Check if booking is already paid before processing
        // ========================================
        const { data: existingBookings } = await supabaseAdmin
          .from("studio_bookings")
          .select("id, payment_status, payment_type, status")
          .in("id", targetBookingIds);

        const existingById = new Map(
          (existingBookings || []).map((booking: any) => [booking.id, booking]),
        );
        const firstExistingBooking = (existingBookings || [])[0];

        // Determine the payment type from metadata or existing booking
        const paymentType = metadata?.payment_type || firstExistingBooking?.payment_type || "full";
        const remainingBalance = parseFloat(String(metadata?.remaining_balance || 0));
        const isDownpayment = paymentType === "downpayment";
        const processedBookingIds: string[] = [];

        for (const targetBookingId of targetBookingIds) {
          const targetExistingBooking = existingById.get(targetBookingId);
          if (!targetExistingBooking) continue;

          if (
            targetExistingBooking?.payment_status === "paid" ||
            (isDownpayment && targetExistingBooking?.payment_status === "partial")
          ) {
            continue;
          }

          const updateData: any = {
            paid_at: new Date().toISOString(),
          };

          const wasCancelled = targetExistingBooking.status === "cancelled";
          if (!wasCancelled) {
            updateData.status = "confirmed";
          }

          if (isDownpayment && remainingBalance > 0) {
            updateData.payment_status = "partial";
          } else {
            updateData.payment_status = "paid";
            updateData.remaining_balance = 0;
          }

          if (paymentMethod) {
            updateData.payment_method = paymentMethod;
          }

          const { error } = await supabaseAdmin
            .from("studio_bookings")
            .update(updateData)
            .eq("id", targetBookingId);

          if (error) {
            console.error("Webhook: Error updating booking:", error);
            continue;
          }

          if (!wasCancelled) {
            processedBookingIds.push(targetBookingId);
          }
          await creditOwnerWallet(supabaseAdmin, targetBookingId, paymentAmount || 0);
        }

        if (processedBookingIds.length > 0) {
          const { data: paidBookings } = await supabaseAdmin
            .from("studio_bookings")
            .select(
              "id, user_id, studio_id, booking_date, remaining_balance, studio:studios(name, owner_id, images)",
            )
            .in("id", processedBookingIds);

          for (const booking of paidBookings || []) {
            const studioImage = booking.studio?.images?.[0] || null;
            const bookingRemainingBalance = getNumericAmount(
              booking.remaining_balance ?? remainingBalance,
            );
            const notificationTitle = isDownpayment ? "Downpayment Received!" : "Payment Confirmed!";
            const notificationMessage = isDownpayment
              ? `Your downpayment for ${booking.studio?.name} has been received. Remaining balance: PHP ${bookingRemainingBalance.toLocaleString()}`
              : `Your booking at ${booking.studio?.name} is now confirmed.`;

            await supabaseAdmin.from("notifications").insert({
              user_id: booking.user_id,
              type: "success",
              title: notificationTitle,
              message: notificationMessage,
              image: studioImage,
              meta: { booking_id: booking.id },
            });

            if (booking.studio?.owner_id) {
              const ownerMessage = isDownpayment
                ? `Downpayment received for ${booking.studio?.name} on ${booking.booking_date}. Remaining balance: PHP ${bookingRemainingBalance.toLocaleString()}`
                : `Payment received for ${booking.studio?.name} on ${booking.booking_date}.`;
              await supabaseAdmin.from("notifications").insert({
                user_id: booking.studio.owner_id,
                type: "info",
                title: isDownpayment ? "Downpayment Received" : "New Paid Booking",
                message: ownerMessage,
                image: studioImage,
                meta: { booking_id: booking.id },
              });
            }
          }
        }

      }

      // Handle: checkout_session.payment.paid
      if (event.type === "checkout_session.payment.paid") {
        const sessionId = event.data?.id;
        const metadata = event.data?.attributes?.metadata || {};
        const bookingId = metadata?.booking_id;
        const paymentMethod =
          event.data?.attributes?.payments?.[0]?.attributes?.source?.type;

        // Check if this is a subscription payment
        if (metadata?.type === "subscription") {
          const userId = metadata?.user_id;
          const planId = metadata?.plan_id;
          console.log("💰 Subscription payment via webhook:", {
            userId,
            planId,
            paymentMethod,
          });

          // Process subscription (similar to subscription_success handler)
          if (userId && planId) {
            const { data: plan } = await supabaseAdmin
              .from("subscription_plans")
              .select("*")
              .eq("id", planId)
              .single();

            if (plan) {
              const now = new Date();
              const periodEnd = new Date(now);
              periodEnd.setDate(
                periodEnd.getDate() + (plan.duration_days || 30),
              );

              const { data: existingSub } = await supabaseAdmin
                .from("subscriptions")
                .select("id")
                .eq("user_id", userId)
                .single();

              if (existingSub) {
                await supabaseAdmin
                  .from("subscriptions")
                  .update({
                    plan_id: planId,
                    status: "active",
                    current_period_start: now.toISOString(),
                    current_period_end: periodEnd.toISOString(),
                    cancelled_at: null,
                    cancel_at_period_end: false,
                    last_payment_date: now.toISOString(),
                    last_payment_amount: plan.price,
                    payment_method: paymentMethod,
                    updated_at: now.toISOString(),
                  })
                  .eq("id", existingSub.id);
              } else {
                await supabaseAdmin.from("subscriptions").insert({
                  user_id: userId,
                  plan_id: planId,
                  status: "active",
                  current_period_start: now.toISOString(),
                  current_period_end: periodEnd.toISOString(),
                  last_payment_date: now.toISOString(),
                  last_payment_amount: plan.price,
                  payment_method: paymentMethod,
                });
              }

              await supabaseAdmin
                .from("profiles")
                .update({
                  subscription_status: "active",
                  subscription_expires_at: periodEnd.toISOString(),
                })
                .eq("id", userId);

              await supabaseAdmin.from("notifications").insert({
                user_id: userId,
                type: "success",
                title: "Subscription Activated! 🎉",
                message: `Your ${plan.name} plan subscription is now active.`,
                meta: { plan_id: planId, plan_name: plan.name },
              });
            }
          }
        } else {
          // Regular booking payment
          console.log("💰 Checkout session payment paid:", {
            sessionId,
            bookingId,
            paymentMethod,
            metadata,
          });
          // Get payment amount from the payment
          const paymentAmountCentavos = event.data?.attributes?.payments?.[0]?.attributes?.amount;
          const paymentAmount = paymentAmountCentavos ? paymentAmountCentavos / 100 : 0;
          await processSuccessfulPayment(bookingId, paymentMethod, paymentAmount, metadata);
        }
      }

      // Handle: link.payment.paid
      if (event.type === "link.payment.paid") {
        const linkId = event.data?.id;
        const metadata = event.data?.attributes?.metadata || {};
        const bookingId =
          metadata?.booking_id ||
          event.data?.attributes?.reference_number;
        const paymentMethod =
          event.data?.attributes?.payments?.[0]?.attributes?.source?.type;
        const paymentAmountCentavos = event.data?.attributes?.payments?.[0]?.attributes?.amount;
        const paymentAmount = paymentAmountCentavos ? paymentAmountCentavos / 100 : 0;

        console.log("💰 Link payment paid:", {
          linkId,
          bookingId,
          paymentMethod,
          metadata,
        });
        await processSuccessfulPayment(bookingId, paymentMethod, paymentAmount, metadata);
      }

      // Handle: payment.paid
      if (event.type === "payment.paid") {
        const paymentId = event.data?.id;
        const metadata = event.data?.attributes?.metadata || {};
        const bookingId = metadata?.booking_id;
        const paymentMethod = event.data?.attributes?.source?.type;

        console.log("💰 Payment paid:", {
          paymentId,
          bookingId,
          paymentMethod,
        });

        // For payment.paid, we might need to look up by payment_intent_id
        if (bookingId) {
          await processSuccessfulPayment(bookingId, paymentMethod, undefined, metadata);
        } else {
          // Try to find booking by checkout_session payment_intent
          const paymentIntentId = event.data?.attributes?.payment_intent_id;
          if (paymentIntentId) {
            const { data: booking } = await supabaseAdmin
              .from("studio_bookings")
              .select("id")
              .eq("payment_intent_id", paymentIntentId)
              .single();

            if (booking) {
              await processSuccessfulPayment(booking.id, paymentMethod);
            }
          }
        }
      }

      // Handle: payment.failed
      if (event.type === "payment.failed") {
        const paymentId = event.data?.id;
        const bookingId = event.data?.attributes?.metadata?.booking_id;
        const failureMessage =
          event.data?.attributes?.failed_message || "Payment failed";

        console.log("❌ Payment failed:", {
          paymentId,
          bookingId,
          failureMessage,
        });

        if (bookingId) {
          await supabaseAdmin
            .from("studio_bookings")
            .update({ payment_status: "failed" })
            .eq("id", bookingId);

          // Notify user about failed payment
          const { data: booking } = await supabaseAdmin
            .from("studio_bookings")
            .select("user_id, studio:studios(name, images)")
            .eq("id", bookingId)
            .single();

          if (booking) {
            await supabaseAdmin.from("notifications").insert({
              user_id: booking.user_id,
              type: "warning",
              title: "Payment Failed",
              message: `Your payment for ${booking.studio?.name} failed. Please try again.`,
              image: booking.studio?.images?.[0] || null,
              meta: { booking_id: bookingId },
            });
          }
        }
      }

      // Handle: payment.refunded
      if (event.type === "payment.refunded") {
        const refundData = event.data?.attributes;
        const bookingId = refundData?.metadata?.booking_id;
        const refundAmount = refundData?.amount ? refundData.amount / 100 : 0; // Convert from centavos

        console.log("💸 Payment refunded webhook:", {
          bookingId,
          refundAmount,
        });

        if (bookingId) {
          // Update booking status to refunded
          await supabaseAdmin
            .from("studio_bookings")
            .update({
              payment_status: "refunded",
              refund_amount: refundAmount,
              refunded_at: new Date().toISOString(),
              status: "cancelled",
            })
            .eq("id", bookingId);

          // Notify user
          const { data: booking } = await supabaseAdmin
            .from("studio_bookings")
            .select("user_id, studio:studios(name, images)")
            .eq("id", bookingId)
            .single();

          if (booking) {
            await supabaseAdmin.from("notifications").insert({
              user_id: booking.user_id,
              type: "success",
              title: "Refund Completed",
              message: `Your refund of ₱${refundAmount.toLocaleString()} for ${booking.studio?.name} has been processed.`,
              image: booking.studio?.images?.[0] || null,
              meta: { booking_id: bookingId },
            });
          }
        }
      }

      // Handle: payment.refund.updated
      if (event.type === "payment.refund.updated") {
        const refundData = event.data?.attributes;
        const refundStatus = refundData?.status;
        const bookingId = refundData?.metadata?.booking_id;

        console.log("🔄 Refund status updated:", { bookingId, refundStatus });

        if (bookingId && refundStatus === "failed") {
          // Notify user that refund failed
          const { data: booking } = await supabaseAdmin
            .from("studio_bookings")
            .select("user_id, studio:studios(name, images)")
            .eq("id", bookingId)
            .single();

          if (booking) {
            await supabaseAdmin.from("notifications").insert({
              user_id: booking.user_id,
              type: "warning",
              title: "Refund Failed",
              message: `Your refund request for ${booking.studio?.name} could not be processed. Please contact support.`,
              image: booking.studio?.images?.[0] || null,
              meta: { booking_id: bookingId },
            });
          }
        }
      }

      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ====================================================================
    // 6. EXPIRE UNPAID BOOKINGS (Can be called by a cron job)
    // ====================================================================
    if (action === "expire_unpaid") {
      const { hours_threshold = 24 } = params;

      // Find bookings that are unpaid for more than threshold hours
      const thresholdDate = new Date();
      thresholdDate.setHours(thresholdDate.getHours() - hours_threshold);

      const { data: expiredBookings, error } = await supabaseAdmin
        .from("studio_bookings")
        .update({
          status: "cancelled",
          cancellation_reason: "Payment not received within time limit",
        })
        .eq("payment_status", "unpaid")
        .eq("status", "pending")
        .lt("created_at", thresholdDate.toISOString())
        .select("id");

      if (error) {
        console.error("Error expiring bookings:", error);
      }

      console.log(`⏰ Expired ${expiredBookings?.length || 0} unpaid bookings`);

      return new Response(
        JSON.stringify({
          success: true,
          expired_count: expiredBookings?.length || 0,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // ====================================================================
    // 7. REQUEST REFUND
    // ====================================================================
    if (action === "request_refund") {
      const { booking_id, user_id, reason } = params;

      if (!authenticatedUserId || user_id !== authenticatedUserId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      console.log("💸 Refund requested for booking:", booking_id);

      if (!booking_id || !user_id) {
        return new Response(
          JSON.stringify({
            error: "Missing required fields: booking_id, user_id",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      // Get booking details
      const { data: booking, error: bookingError } = await supabaseAdmin
        .from("studio_bookings")
        .select(
          `
                    id, user_id, status, payment_status, payment_amount, checkout_session_id,
                    booking_date, checked_in, created_at,
                    studio:studios(name, owner_id)
                `,
        )
        .eq("id", booking_id)
        .single();

      if (bookingError || !booking) {
        return new Response(JSON.stringify({ error: "Booking not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      // Verify user owns the booking
      if (booking.user_id !== user_id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      // Check if booking was paid
      if (booking.payment_status !== "paid") {
        return new Response(
          JSON.stringify({ error: "This booking has not been paid yet" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      // Check if already refunded
      if (booking.payment_status === "refunded") {
        return new Response(
          JSON.stringify({ error: "This booking has already been refunded" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      // Check if booking was checked in (no refund if already used)
      if (booking.checked_in) {
        return new Response(
          JSON.stringify({
            error: "Cannot refund a booking that was already checked in",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      // Calculate refund amount based on cancellation policy
      const bookingDate = new Date(booking.booking_date);
      const now = new Date();
      const diffTime = bookingDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let refundPercentage = 0;
      let refundReason = "";

      if (diffDays > 7) {
        refundPercentage = 80;
        refundReason = "Cancelled more than 7 days before booking";
      } else if (diffDays >= 3) {
        refundPercentage = 70;
        refundReason = "Cancelled 3-7 days before booking";
      } else if (diffDays >= 0) {
        refundPercentage = 0;
        refundReason =
          "Cancelled less than 3 days before booking (non-refundable)";
      } else {
        // Booking date has passed without check-in
        refundPercentage = 100;
        refundReason = "Booking not used (no check-in recorded)";
      }

      const refundAmount = Math.round(
        (booking.payment_amount * refundPercentage) / 100,
      );
      const refundAmountCentavos = refundAmount * 100;

      console.log("💰 Refund calculation:", {
        diffDays,
        refundPercentage,
        originalAmount: booking.payment_amount,
        refundAmount,
      });

      // If no refund due
      if (refundPercentage === 0) {
        // Update booking status
        await supabaseAdmin
          .from("studio_bookings")
          .update({
            status: "cancelled",
            cancellation_reason: reason || refundReason,
          })
          .eq("id", booking_id);

        return new Response(
          JSON.stringify({
            success: true,
            refund_percentage: 0,
            refund_amount: 0,
            message:
              "Booking cancelled. No refund due based on cancellation policy.",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      // Get payment ID from checkout session to process refund
      let paymentId = null;
      if (booking.checkout_session_id) {
        try {
          const sessionData = await paymongoRequest(
            `/checkout_sessions/${booking.checkout_session_id}`,
          );
          const payments = sessionData.data?.attributes?.payments || [];
          if (payments.length > 0) {
            paymentId = payments[0].id;
          }
        } catch (e) {
          console.error("Error fetching checkout session:", e);
        }
      }

      if (!paymentId) {
        // Can't process automatic refund, mark as pending manual refund
        await supabaseAdmin
          .from("studio_bookings")
          .update({
            status: "cancelled",
            payment_status: "refund_pending",
            cancellation_reason: reason || refundReason,
            refund_amount: refundAmount,
          })
          .eq("id", booking_id);

        // Notify studio owner about manual refund needed
        if (booking.studio?.owner_id) {
          await supabaseAdmin.from("notifications").insert({
            user_id: booking.studio.owner_id,
            type: "warning",
            title: "Manual Refund Required",
            message: `A booking at ${booking.studio?.name} requires a manual refund of ₱${refundAmount.toLocaleString()}.`,
            meta: { booking_id: booking.id, refund_amount: refundAmount },
          });
        }

        return new Response(
          JSON.stringify({
            success: true,
            refund_percentage: refundPercentage,
            refund_amount: refundAmount,
            status: "pending",
            message: `Refund of ₱${refundAmount.toLocaleString()} (${refundPercentage}%) is being processed manually.`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      // Process refund via PayMongo
      try {
        const refundData = await paymongoRequest("/refunds", "POST", {
          data: {
            attributes: {
              amount: refundAmountCentavos,
              payment_id: paymentId,
              reason: "requested_by_customer",
              notes: reason || refundReason,
              metadata: {
                booking_id: booking_id,
                user_id: user_id,
              },
            },
          },
        });

        console.log("✅ Refund created:", refundData.data.id);

        // Update booking
        await supabaseAdmin
          .from("studio_bookings")
          .update({
            status: "cancelled",
            payment_status: "refunded",
            cancellation_reason: reason || refundReason,
            refund_amount: refundAmount,
            refund_id: refundData.data.id,
            refunded_at: new Date().toISOString(),
          })
          .eq("id", booking_id);

        // Notify user
        await supabaseAdmin.from("notifications").insert({
          user_id: booking.user_id,
          type: "success",
          title: "Refund Processed",
          message: `Your refund of ₱${refundAmount.toLocaleString()} (${refundPercentage}%) for ${booking.studio?.name} has been processed.`,
          meta: { booking_id: booking.id, refund_amount: refundAmount },
        });

        // Notify studio owner
        if (booking.studio?.owner_id) {
          await supabaseAdmin.from("notifications").insert({
            user_id: booking.studio.owner_id,
            type: "info",
            title: "Booking Cancelled & Refunded",
            message: `A booking at ${booking.studio?.name} was cancelled. Refund of ₱${refundAmount.toLocaleString()} processed.`,
            meta: { booking_id: booking.id, refund_amount: refundAmount },
          });
        }

        return new Response(
          JSON.stringify({
            success: true,
            refund_id: refundData.data.id,
            refund_percentage: refundPercentage,
            refund_amount: refundAmount,
            message: `Refund of ₱${refundAmount.toLocaleString()} (${refundPercentage}%) processed successfully!`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      } catch (refundError: any) {
        console.error("PayMongo refund error:", refundError);

        // Mark as pending manual refund
        await supabaseAdmin
          .from("studio_bookings")
          .update({
            status: "cancelled",
            payment_status: "refund_pending",
            cancellation_reason: reason || refundReason,
            refund_amount: refundAmount,
          })
          .eq("id", booking_id);

        return new Response(
          JSON.stringify({
            success: true,
            refund_percentage: refundPercentage,
            refund_amount: refundAmount,
            status: "pending",
            message: `Booking cancelled. Refund of ₱${refundAmount.toLocaleString()} is being processed.`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }
    }

    // ====================================================================
    // 8. CHECK REFUND STATUS
    // ====================================================================
    if (action === "check_refund") {
      const { booking_id } = params;

      const { data: ownedBooking } = await supabaseAdmin
        .from("studio_bookings")
        .select("id")
        .eq("id", booking_id)
        .eq("user_id", authenticatedUserId)
        .single();

      if (!ownedBooking) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }

      const { data: booking } = await supabaseAdmin
        .from("studio_bookings")
        .select("payment_status, refund_amount, refund_id, refunded_at")
        .eq("id", booking_id)
        .single();

      if (!booking) {
        return new Response(JSON.stringify({ error: "Booking not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          payment_status: booking.payment_status,
          refund_amount: booking.refund_amount,
          refund_id: booking.refund_id,
          refunded_at: booking.refunded_at,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  } catch (error: any) {
    console.error("PayMongo function error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
