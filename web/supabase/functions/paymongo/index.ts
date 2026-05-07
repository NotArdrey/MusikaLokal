// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import { withNotificationRouteMeta } from "../_shared/notificationRoutes.ts";

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
    } else {
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

async function resolvePaymentTargetBookingIds(
  supabaseAdmin: any,
  {
    metadata,
    fallbackBookingId,
    checkoutSessionId,
    paymentIntentId,
  }: {
    metadata?: any;
    fallbackBookingId?: string | null;
    checkoutSessionId?: string | null;
    paymentIntentId?: string | null;
  },
): Promise<string[]> {
  const ids = new Set<string>(
    getMetadataBookingIds(metadata, fallbackBookingId),
  );
  let resolvedCheckoutSessionId = checkoutSessionId || null;
  let resolvedPaymentIntentId = paymentIntentId || null;

  if (fallbackBookingId && (!resolvedCheckoutSessionId || !resolvedPaymentIntentId)) {
    const { data: booking } = await supabaseAdmin
      .from("studio_bookings")
      .select("checkout_session_id, payment_intent_id")
      .eq("id", fallbackBookingId)
      .maybeSingle();

    resolvedCheckoutSessionId =
      resolvedCheckoutSessionId || booking?.checkout_session_id || null;
    resolvedPaymentIntentId =
      resolvedPaymentIntentId || booking?.payment_intent_id || null;
  }

  if (resolvedCheckoutSessionId) {
    const { data: sessionBookings, error } = await supabaseAdmin
      .from("studio_bookings")
      .select("id")
      .eq("checkout_session_id", resolvedCheckoutSessionId);

    if (error) {
      console.error("Error resolving bookings by checkout session:", error);
    }

    (sessionBookings || []).forEach((booking: any) => {
      if (booking?.id) ids.add(String(booking.id));
    });
  }

  if (resolvedPaymentIntentId) {
    const { data: intentBookings, error } = await supabaseAdmin
      .from("studio_bookings")
      .select("id")
      .eq("payment_intent_id", resolvedPaymentIntentId);

    if (error) {
      console.error("Error resolving bookings by payment intent:", error);
    }

    (intentBookings || []).forEach((booking: any) => {
      if (booking?.id) ids.add(String(booking.id));
    });
  }

  return [...ids];
}

function getNumericAmount(value: any): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function uniqueStrings(values: unknown[]) {
  return Array.from(
    new Set(
      values.filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    ),
  );
}

async function hydrateStudioBookingLegacy(supabaseAdmin: any, rows: any[]) {
  const studioIds = uniqueStrings(rows.map((row: any) => row?.studio?.id || row?.studio_id));
  const legacyById = new Map<string, any>();

  if (studioIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("studios_with_stats")
      .select("id, images, location, hourly_rate, rate")
      .in("id", studioIds);

    if (error) throw error;
    (data || []).forEach((row: any) => legacyById.set(row.id, row));
  }

  return rows.map((row: any) => {
    const studioId = row?.studio?.id || row?.studio_id || null;
    const legacy = studioId ? legacyById.get(studioId) : null;

    return {
      ...row,
      studio: row?.studio
        ? {
            ...row.studio,
            id: studioId,
            images: Array.isArray(legacy?.images) ? legacy.images : [],
            location: legacy?.location || row.studio.location || row.studio.address || null,
            rate_per_hour:
              row.studio.rate_per_hour ??
              legacy?.hourly_rate ??
              row.studio.hourly_rate ??
              legacy?.rate ??
              row.studio.rate ??
              null,
          }
        : row?.studio,
    };
  });
}

function inferBookingPaymentType(metadata: any, booking?: any): string {
  if (metadata?.payment_type) return metadata.payment_type;

  const bookingPaymentType = booking?.payment_type;
  if (
    bookingPaymentType === "downpayment" &&
    booking?.paid_at &&
    getNumericAmount(booking?.remaining_balance) > 0
  ) {
    return "balance";
  }

  return bookingPaymentType || "full";
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

async function insertNotification(
  supabaseAdmin: any,
  payload: {
    user_id: string;
    type: string;
    title: string;
    message: string;
    image?: string | null;
    meta?: Record<string, unknown> | null;
    read?: boolean;
  },
) {
  await supabaseAdmin.from("notifications").insert({
    ...payload,
    meta: withNotificationRouteMeta(payload.meta),
    read: payload.read ?? false,
  });
}

// Helper to credit owner's wallet when a booking payment is received
// Idempotent: safe to call multiple times for the same booking (e.g. both
// the client-side forfeit path and the webhook path may trigger this).
async function creditOwnerWallet(
  supabaseAdmin: any,
  bookingId: string,
  paymentAmount: number,
  options: {
    paymentStage?: "full" | "downpayment" | "balance";
    balanceAmount?: number;
  } = {},
) {
  try {

    const paymentStage = options.paymentStage || "full";
    const referenceType =
      paymentStage === "balance"
        ? "booking_balance"
        : paymentStage === "downpayment"
          ? "booking_downpayment"
          : "booking_payment";

    // IDEMPOTENCY: skip the same payment stage only. Legacy transactions have
    // null reference_type, so they still protect old full/downpayment credits.
    const { data: existingTxs } = await supabaseAdmin
      .from("wallet_transactions")
      .select("id, reference_type")
      .eq("reference_id", bookingId)
      .eq("type", "earning");

    const alreadyCredited = (existingTxs || []).some((tx: any) =>
      tx?.reference_type === referenceType ||
      (!tx?.reference_type && paymentStage !== "balance")
    );

    if (alreadyCredited) {
      return;
    }

    // Get booking details with studio owner
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("studio_bookings")
      .select(
        "id, final_price, payment_amount, remaining_balance, studio:studios(id, name, owner_id)",
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

    // Prefer the booking's actual payment_amount from DB over the PayMongo-charged amount.
    // In TEST MODE PayMongo always charges ₱1 (100 centavos), but the booking records the
    // real agreed price — that is what the studio owner should receive in their wallet.
    const finalPrice = getNumericAmount(booking.final_price);
    const storedPaymentAmount = getNumericAmount(booking.payment_amount);
    const storedRemainingBalance = getNumericAmount(booking.remaining_balance);
    const creditAmount =
      paymentStage === "balance"
        ? (
          getNumericAmount(options.balanceAmount) ||
          storedRemainingBalance ||
          Math.max(0, finalPrice - storedPaymentAmount) ||
          paymentAmount
        )
        : paymentStage === "downpayment"
          ? (storedPaymentAmount || paymentAmount)
          : (finalPrice || paymentAmount);
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
        reference_type: referenceType,
        is_credit: true,
        status: "completed",
      });

    if (txError) {
      console.error("❌ Error creating wallet transaction:", txError);
      return;
    }

  } catch (e) {
    console.error("❌ Error in creditOwnerWallet:", e);
  }
}

async function creditWalletDeposit(
  supabaseAdmin: any,
  {
    checkoutSessionId,
    paymentId,
    userId,
    amount,
  }: {
    checkoutSessionId?: string | null;
    paymentId?: string | null;
    userId?: string | null;
    amount?: string | number | null;
  },
) {
  const referenceId = checkoutSessionId || paymentId || null;
  const depositAmount = getNumericAmount(amount);

  if (!referenceId || !userId || depositAmount <= 0) {
    return {
      success: false,
      error: "Missing wallet deposit reference, user, or amount",
    };
  }

  const { data: existingTx } = await supabaseAdmin
    .from("wallet_transactions")
    .select("id")
    .eq("reference_id", referenceId)
    .eq("type", "deposit")
    .maybeSingle();

  if (existingTx) {
    if (checkoutSessionId) {
      await supabaseAdmin
        .from("wallet_deposits")
        .update({ status: "completed" })
        .eq("checkout_session_id", checkoutSessionId);
    }

    return { success: true, alreadyCredited: true };
  }

  let { data: wallet } = await supabaseAdmin
    .from("wallets")
    .select("id, balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (!wallet) {
    const { data: newWallet, error: walletCreateError } = await supabaseAdmin
      .from("wallets")
      .insert([{ user_id: userId, balance: 0 }])
      .select("id, balance")
      .single();

    if (walletCreateError || !newWallet) {
      console.error("Wallet deposit wallet create error:", walletCreateError);
      return { success: false, error: "Unable to create wallet" };
    }

    wallet = newWallet;
  }

  const newBalance = getNumericAmount(wallet.balance) + depositAmount;
  const { error: walletUpdateError } = await supabaseAdmin
    .from("wallets")
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq("id", wallet.id);

  if (walletUpdateError) {
    console.error("Wallet deposit balance update error:", walletUpdateError);
    return { success: false, error: "Unable to update wallet balance" };
  }

  const { error: txError } = await supabaseAdmin
    .from("wallet_transactions")
    .insert({
      wallet_id: wallet.id,
      amount: depositAmount,
      type: "deposit",
      description: "Wallet top-up via PayMongo",
      reference_id: referenceId,
      reference_type: "wallet_deposit",
      is_credit: true,
      status: "completed",
    });

  if (txError) {
    console.error("Wallet deposit transaction insert error:", txError);
    return { success: false, error: "Unable to record wallet transaction" };
  }

  if (checkoutSessionId) {
    await supabaseAdmin
      .from("wallet_deposits")
      .update({ status: "completed" })
      .eq("checkout_session_id", checkoutSessionId);
  }

  await insertNotification(supabaseAdmin, {
    user_id: userId,
    type: "success",
    title: "Wallet Topped Up!",
    message: `PHP ${depositAmount.toLocaleString()} has been added to your wallet.`,
    meta: { type: "wallet_deposit", amount: depositAmount },
  }).catch(() => {});

  return { success: true, creditedAmount: depositAmount, newBalance };
}

serve(async (req: Request) => {

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

      const bookingsById = new Map<string, any>(
        (fetchedBookings || []).map((booking: any) => [booking.id, booking]),
      );
      const bookingRows: any[] = targetBookingIds
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

      const checkoutAmount = getNumericAmount(amount);
      if (checkoutAmount <= 0) {
        return new Response(JSON.stringify({ error: "Invalid checkout amount" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      // Amount is charged in centavos (PHP * 100).
      const amountInCentavos = Math.round(checkoutAmount * 100);
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

        if (booking?.payment_status === "paid" && !booking?.checkout_session_id) {
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


      // If payment is successful, update booking
      if (paymentStatus === "succeeded" || payments.length > 0) {
        const payment = payments[0];
        const paymentMethod = payment?.attributes?.source?.type || "unknown";
        const paymentIntentId = sessionData.data.attributes.payment_intent?.id;
        const paymentAmount = payment?.attributes?.amount
          ? payment.attributes.amount / 100
          : 0; // Convert from centavos
        const metadata = sessionData.data.attributes.metadata || {};

        // ========================================
        // DEDUPLICATION: Check current status before updating to prevent race conditions
        // The webhook might have already processed this payment
        // ========================================
        const { data: currentBookings } = await supabaseAdmin
          .from("studio_bookings")
          .select("id, payment_status, payment_type, remaining_balance, paid_at")
          .eq("checkout_session_id", sessionId);

        const firstCurrentBooking = (currentBookings || [])[0] || null;
        const paymentType = inferBookingPaymentType(metadata, firstCurrentBooking);
        const remainingBalance = Number(
          metadata?.remaining_balance ?? firstCurrentBooking?.remaining_balance ?? 0,
        );
        const isDownpayment = paymentType === "downpayment" && remainingBalance > 0;

        const targetBookingIds = await resolvePaymentTargetBookingIds(
          supabaseAdmin,
          {
            metadata,
            fallbackBookingId: resolvedBookingId,
            checkoutSessionId: sessionId,
            paymentIntentId,
          },
        );
        const currentBooking = firstCurrentBooking;

        resolvedBookingId = resolvedBookingId || targetBookingIds[0] || currentBooking?.id || null;

        const { data: targetCurrentBookings } = await supabaseAdmin
          .from("studio_bookings")
          .select("id, payment_status, remaining_balance")
          .in("id", targetBookingIds);

        const currentStatusById = new Map<string, string>(
          (targetCurrentBookings || []).map((booking: any) => [
            String(booking.id),
            String(booking.payment_status || ""),
          ]),
        );
        const unsettledBookingIds = targetBookingIds.filter((id) => {
          const paymentStatus = currentStatusById.get(String(id));
          return !(
            paymentStatus === "paid" ||
            (isDownpayment && paymentStatus === "partial")
          );
        });
        const remainingBalanceById = new Map<string, number>(
          (targetCurrentBookings || []).map((booking: any) => [
            String(booking.id),
            getNumericAmount(booking.remaining_balance),
          ]),
        );
        const alreadySettled =
          targetBookingIds.length > 0 &&
          unsettledBookingIds.length === 0 &&
          targetBookingIds.every((id) => {
            const paymentStatus = currentStatusById.get(String(id));
            return (
              paymentStatus === "paid" ||
              (isDownpayment && paymentStatus === "partial")
            );
          });

        if (alreadySettled) {
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

        const bookingIdsToSettle =
          unsettledBookingIds.length > 0 ? unsettledBookingIds : targetBookingIds;

        if (bookingIdsToSettle.length === 0) {
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
          .in("id", bookingIdsToSettle);

        if (updateError) {
          console.error("Error updating booking:", updateError);
        }

        for (const targetBookingId of bookingIdsToSettle) {
          await creditOwnerWallet(supabaseAdmin, targetBookingId, paymentAmount, {
            paymentStage: isDownpayment
              ? "downpayment"
              : paymentType === "balance"
                ? "balance"
                : "full",
            balanceAmount: remainingBalanceById.get(String(targetBookingId)) || remainingBalance,
          });
        }

        // Get full booking details for notifications
        const { data: fullBookings } = await supabaseAdmin
          .from("studio_bookings")
          .select(
            "id, user_id, studio_id, booking_date, studio:studios(id, name, owner_id, address, hourly_rate, rate), profile:user_id(avatar_url)",
          )
          .in("id", bookingIdsToSettle);

        const hydratedFullBookings = await hydrateStudioBookingLegacy(supabaseAdmin, fullBookings || []);

        for (const fullBooking of hydratedFullBookings) {
          const studioImage = fullBooking.studio?.images?.[0];
          const userAvatar = fullBooking.profile?.avatar_url;

          // Notify musician — downpayment lands in Pending (balance due), full payment lands in Upcoming
          await insertNotification(supabaseAdmin, {
            user_id: fullBooking.user_id,
            type: "success",
            title: "Payment Successful!",
            message: isDownpayment
              ? `Downpayment received for ${fullBooking.studio?.name}. Pay the remaining balance in your Pending bookings.`
              : `Your booking at ${fullBooking.studio?.name} has been confirmed and moved to Upcoming.`,
            image: studioImage,
            meta: { booking_id: fullBooking.id },
          });

          // Notify studio owner
          if (fullBooking.studio?.owner_id) {
            await insertNotification(supabaseAdmin, {
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


      if (bookingId) {
        // Get booking details
        const { data: booking } = await supabaseAdmin
          .from("studio_bookings")
          .select("checkout_session_id, payment_status, payment_type, remaining_balance, paid_at")
          .eq("id", bookingId)
          .single();

        // ========================================
        // DEDUPLICATION: Skip if already paid (webhook may have processed it)
        // ========================================
        if (booking?.payment_status === "paid" && !booking?.checkout_session_id) {
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

              // Get payment type from checkout session metadata
              const metadata = sessionData.data.attributes.metadata || {};
              const paymentType = inferBookingPaymentType(metadata, booking);
              const remainingBalance = parseFloat(
                String(metadata?.remaining_balance ?? booking?.remaining_balance ?? 0),
              );
              const isDownpayment = paymentType === "downpayment";
              const targetBookingIds = await resolvePaymentTargetBookingIds(
                supabaseAdmin,
                {
                  metadata,
                  fallbackBookingId: bookingId,
                  checkoutSessionId: booking.checkout_session_id,
                  paymentIntentId,
                },
              );

              // ========================================
              // DEDUPLICATION: Double-check status before updating (race condition protection)
              // ========================================
              const { data: recheckBookings } = await supabaseAdmin
                .from("studio_bookings")
                .select("id, payment_status, remaining_balance")
                .in("id", targetBookingIds);

              const alreadySettled =
                targetBookingIds.length > 0 &&
                targetBookingIds.every((targetBookingId) => {
                  const booking = (recheckBookings || []).find(
                    (item: any) => item.id === targetBookingId,
                  );
                  return (
                    booking?.payment_status === "paid" ||
                    (isDownpayment && booking?.payment_status === "partial")
                  );
                });
              const unsettledBookingIds = targetBookingIds.filter((targetBookingId) => {
                const booking = (recheckBookings || []).find(
                  (item: any) => item.id === targetBookingId,
                );
                return !(
                  booking?.payment_status === "paid" ||
                  (isDownpayment && booking?.payment_status === "partial")
                );
              });

              if (alreadySettled) {
              } else {
                const bookingIdsToSettle =
                  unsettledBookingIds.length > 0 ? unsettledBookingIds : targetBookingIds;
                const remainingBalanceById = new Map<string, number>(
                  (recheckBookings || []).map((booking: any) => [
                    String(booking.id),
                    getNumericAmount(booking.remaining_balance),
                  ]),
                );


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
                  .in("id", bookingIdsToSettle);

                // Credit the owner's wallet
                for (const targetBookingId of bookingIdsToSettle) {
                  await creditOwnerWallet(supabaseAdmin, targetBookingId, paymentAmount, {
                    paymentStage: isDownpayment
                      ? "downpayment"
                      : paymentType === "balance"
                        ? "balance"
                        : "full",
                    balanceAmount: remainingBalanceById.get(String(targetBookingId)) || remainingBalance,
                  });
                }

                // Get full booking details for notifications
                const { data: fullBookings } = await supabaseAdmin
                  .from("studio_bookings")
                  .select(
                    "id, user_id, studio_id, booking_date, remaining_balance, studio:studios(id, name, owner_id, address, hourly_rate, rate), profile:user_id(avatar_url)",
                  )
                  .in("id", bookingIdsToSettle);

                const hydratedFullBookings = await hydrateStudioBookingLegacy(supabaseAdmin, fullBookings || []);

                for (const fullBooking of hydratedFullBookings) {
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

                  await insertNotification(supabaseAdmin, {
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

                    await insertNotification(supabaseAdmin, {
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


      // Reset payment status back to unpaid so user can try again
      // (Do NOT set to 'failed' as that hides the Pay Now button)
      if (bookingId) {
        const targetBookingIds = await resolvePaymentTargetBookingIds(
          supabaseAdmin,
          { fallbackBookingId: bookingId },
        );

        await supabaseAdmin
          .from("studio_bookings")
          .update({
            payment_status: "unpaid",
            checkout_session_id: null, // Clear the old session so a new one can be created
          })
          .in("id", targetBookingIds);
      }

      // Use client-provided redirect URL if available, otherwise fallback to hardcoded scheme
      const appDeepLink =
        clientRedirectUrl ||
        `musikalokal://payment-result?status=cancelled&booking_id=${bookingId}`;


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
    // 5. WEBHOOK HANDLER (For PayMongo webhooks)
    // ====================================================================
    if (action === "webhook") {
      // PayMongo sends webhook data in params or as root object with 'data' key
      const event = params.data ? params.data.attributes : params;


      // Helper function to process successful payment
      async function processSuccessfulPayment(
        bookingId?: string | null,
        paymentMethod?: string,
        paymentAmount?: number,
        metadata?: any,
        checkoutSessionId?: string | null,
        paymentIntentId?: string | null,
      ) {
        const targetBookingIds = await resolvePaymentTargetBookingIds(
          supabaseAdmin,
          {
            metadata,
            fallbackBookingId: bookingId,
            checkoutSessionId,
            paymentIntentId,
          },
        );
        if (targetBookingIds.length === 0) return;

        // ========================================
        // DEDUPLICATION CHECK: Prevent duplicate notifications
        // Check if booking is already paid before processing
        // ========================================
        const { data: existingBookings } = await supabaseAdmin
          .from("studio_bookings")
          .select("id, payment_status, payment_type, remaining_balance, paid_at, status")
          .in("id", targetBookingIds);

        const existingById = new Map<string, any>(
          (existingBookings || []).map((booking: any) => [booking.id, booking]),
        );

        // Determine the payment type from metadata or existing booking
        const firstExistingBooking = (existingBookings || [])[0];
        const paymentType = inferBookingPaymentType(metadata, firstExistingBooking);
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

          const rowRemainingBalance = getNumericAmount(
            targetExistingBooking.remaining_balance,
          );

          if (isDownpayment && (remainingBalance > 0 || rowRemainingBalance > 0)) {
            updateData.payment_status = "partial";
          } else {
            updateData.payment_status = "paid";
            updateData.remaining_balance = 0;
          }

          if (paymentMethod) {
            updateData.payment_method = paymentMethod;
          }

          if (paymentIntentId) {
            updateData.payment_intent_id = paymentIntentId;
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
          await creditOwnerWallet(supabaseAdmin, targetBookingId, paymentAmount || 0, {
            paymentStage: isDownpayment
              ? "downpayment"
              : paymentType === "balance"
                ? "balance"
                : "full",
            balanceAmount: rowRemainingBalance || remainingBalance,
          });
        }

        if (processedBookingIds.length > 0) {
          const { data: paidBookings } = await supabaseAdmin
            .from("studio_bookings")
            .select(
              "id, user_id, studio_id, booking_date, remaining_balance, studio:studios(id, name, owner_id, address, hourly_rate, rate)",
            )
            .in("id", processedBookingIds);

          const hydratedPaidBookings = await hydrateStudioBookingLegacy(supabaseAdmin, paidBookings || []);

          for (const booking of hydratedPaidBookings) {
            const studioImage = booking.studio?.images?.[0] || null;
            const bookingRemainingBalance = getNumericAmount(
              booking.remaining_balance ?? remainingBalance,
            );
            const notificationTitle = isDownpayment ? "Downpayment Received!" : "Payment Confirmed!";
            const notificationMessage = isDownpayment
              ? `Your downpayment for ${booking.studio?.name} has been received. Remaining balance: PHP ${bookingRemainingBalance.toLocaleString()}`
              : `Your booking at ${booking.studio?.name} is now confirmed.`;

            await insertNotification(supabaseAdmin, {
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
              await insertNotification(supabaseAdmin, {
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
        const paymentAmountCentavos =
          event.data?.attributes?.payments?.[0]?.attributes?.amount;
        const paymentAmount = paymentAmountCentavos
          ? paymentAmountCentavos / 100
          : 0;
        const paymentIntentId =
          event.data?.attributes?.payment_intent?.id || null;
        await processSuccessfulPayment(
          bookingId,
          paymentMethod,
          paymentAmount,
          metadata,
          sessionId,
          paymentIntentId,
        );
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

        await processSuccessfulPayment(bookingId, paymentMethod, paymentAmount, metadata);
      }

      // Handle: payment.paid
      if (event.type === "payment.paid") {
        const paymentId = event.data?.id;
        const metadata = event.data?.attributes?.metadata || {};
        const bookingId = metadata?.booking_id;
        const paymentMethod = event.data?.attributes?.source?.type;
        const paymentIntentId =
          event.data?.attributes?.payment_intent_id ||
          event.data?.attributes?.payment_intent?.id ||
          null;
        const checkoutSessionId =
          event.data?.attributes?.checkout_session_id ||
          event.data?.attributes?.checkout_session?.id ||
          null;


        // For payment.paid, we might need to look up by payment_intent_id
        if (bookingId || checkoutSessionId || paymentIntentId) {
          await processSuccessfulPayment(
            bookingId,
            paymentMethod,
            undefined,
            metadata,
            checkoutSessionId,
            paymentIntentId,
          );
        } else {
          // Try to find booking by checkout_session payment_intent
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
        const metadata = event.data?.attributes?.metadata || {};
        const bookingId = metadata?.booking_id;
        const checkoutSessionId =
          event.data?.attributes?.checkout_session_id ||
          event.data?.attributes?.checkout_session?.id ||
          null;
        const paymentIntentId =
          event.data?.attributes?.payment_intent_id ||
          event.data?.attributes?.payment_intent?.id ||
          null;
        const failureMessage =
          event.data?.attributes?.failed_message || "Payment failed";


        const targetBookingIds = await resolvePaymentTargetBookingIds(
          supabaseAdmin,
          {
            metadata,
            fallbackBookingId: bookingId,
            checkoutSessionId,
            paymentIntentId,
          },
        );

        if (targetBookingIds.length > 0) {
          await supabaseAdmin
            .from("studio_bookings")
            .update({ payment_status: "failed" })
            .in("id", targetBookingIds);

          // Notify user about failed payment
          const { data: bookings } = await supabaseAdmin
            .from("studio_bookings")
            .select("id, user_id, studio_id, studio:studios(id, name, address, hourly_rate, rate)")
            .in("id", targetBookingIds);

          const hydratedBookings = await hydrateStudioBookingLegacy(supabaseAdmin, bookings || []);

          for (const booking of hydratedBookings) {
            await insertNotification(supabaseAdmin, {
              user_id: booking.user_id,
              type: "warning",
              title: "Payment Failed",
              message: `Your payment for ${booking.studio?.name} failed. Please try again.`,
              image: booking.studio?.images?.[0] || null,
              meta: { booking_id: booking.id },
            });
          }
        }
      }

      // Handle: payment.refunded
      if (event.type === "payment.refunded") {
        const refundData = event.data?.attributes;
        const bookingId = refundData?.metadata?.booking_id;
        const refundAmount = refundData?.amount ? refundData.amount / 100 : 0; // Convert from centavos


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
            .select("user_id, studio_id, studio:studios(id, name, address, hourly_rate, rate)")
            .eq("id", bookingId)
            .single();

          const [bookingWithLegacy] = booking
            ? await hydrateStudioBookingLegacy(supabaseAdmin, [booking])
            : [];

          if (bookingWithLegacy) {
            await insertNotification(supabaseAdmin, {
              user_id: bookingWithLegacy.user_id,
              type: "success",
              title: "Refund Completed",
              message: `Your refund of ₱${refundAmount.toLocaleString()} for ${bookingWithLegacy.studio?.name} has been processed.`,
              image: bookingWithLegacy.studio?.images?.[0] || null,
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


        if (bookingId && refundStatus === "failed") {
          // Notify user that refund failed
          const { data: booking } = await supabaseAdmin
            .from("studio_bookings")
            .select("user_id, studio_id, studio:studios(id, name, address, hourly_rate, rate)")
            .eq("id", bookingId)
            .single();

          const [bookingWithLegacy] = booking
            ? await hydrateStudioBookingLegacy(supabaseAdmin, [booking])
            : [];

          if (bookingWithLegacy) {
            await insertNotification(supabaseAdmin, {
              user_id: bookingWithLegacy.user_id,
              type: "warning",
              title: "Refund Failed",
              message: `Your refund request for ${bookingWithLegacy.studio?.name} could not be processed. Please contact support.`,
              image: bookingWithLegacy.studio?.images?.[0] || null,
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
          await insertNotification(supabaseAdmin, {
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
        await insertNotification(supabaseAdmin, {
          user_id: booking.user_id,
          type: "success",
          title: "Refund Processed",
          message: `Your refund of ₱${refundAmount.toLocaleString()} (${refundPercentage}%) for ${booking.studio?.name} has been processed.`,
          meta: { booking_id: booking.id, refund_amount: refundAmount },
        });

        // Notify studio owner
        if (booking.studio?.owner_id) {
          await insertNotification(supabaseAdmin, {
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

    // ====================================================================
    // WALLET TOP-UP: create_deposit — creates a PayMongo checkout to add funds to wallet
    // ====================================================================
    if (action === "create_deposit") {
      const { user_id, amount, redirect_url, cancel_redirect_url } = params;

      if (!user_id || !amount || amount <= 0) {
        return new Response(JSON.stringify({ error: "user_id and amount are required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      const depositAmount = getNumericAmount(amount);
      if (depositAmount <= 0) {
        return new Response(JSON.stringify({ error: "Invalid deposit amount" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      const amountCentavos = Math.round(depositAmount * 100);

      const checkoutPayload = {
        data: {
          attributes: {
            amount: amountCentavos,
            currency: "PHP",
            description: `Wallet top-up: PHP ${depositAmount.toLocaleString()}`,
            payment_method_types: ["gcash", "card", "paymaya"],
            success_url: redirect_url || "https://musikalokal.com/payment-result?status=success&type=deposit",
            cancel_url: cancel_redirect_url || "https://musikalokal.com/payment-result?status=cancelled&type=deposit",
            metadata: {
              type: "wallet_deposit",
              user_id: String(user_id),
              amount: String(depositAmount), // actual peso amount
            },
          },
        },
      };

      const PAYMONGO_SECRET = Deno.env.get("PAYMONGO_SECRET_KEY") || "";
      const encoded = btoa(`${PAYMONGO_SECRET}:`);

      const pmRes = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${encoded}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(checkoutPayload),
      });

      const pmData = await pmRes.json();
      if (!pmRes.ok) {
        console.error("PayMongo create_deposit error:", pmData);
        return new Response(JSON.stringify({ error: "Failed to create deposit checkout", details: pmData }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        });
      }

      const checkoutId = pmData.data?.id;
      const checkoutUrl = pmData.data?.attributes?.checkout_url;

      // Store the pending deposit record
      const { error: depositError } = await supabaseAdmin.from("wallet_deposits").insert({
        user_id,
        checkout_session_id: checkoutId,
        amount: depositAmount,
        status: "pending",
      });

      if (depositError) {
        // wallet_deposits table may not exist yet — still return checkout URL so user can pay
        console.warn("wallet_deposits insert error (table may not exist):", depositError.message);
      }

      return new Response(JSON.stringify({ checkout_url: checkoutUrl, checkout_id: checkoutId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ====================================================================
    // WALLET TOP-UP: check_deposit — verifies payment and credits the user's wallet
    // ====================================================================
    if (action === "check_deposit") {
      const { checkout_id, user_id } = params;

      if (!checkout_id || !user_id) {
        return new Response(JSON.stringify({ error: "checkout_id and user_id are required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      const PAYMONGO_SECRET = Deno.env.get("PAYMONGO_SECRET_KEY") || "";
      const encoded = btoa(`${PAYMONGO_SECRET}:`);

      const pmRes = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${checkout_id}`, {
        headers: { "Authorization": `Basic ${encoded}` },
      });

      const pmData = await pmRes.json();
      const sessionAttr = pmData.data?.attributes;
      const paymentStatus = sessionAttr?.payment_intent?.attributes?.status;
      const payments = sessionAttr?.payments || [];
      const succeeded = paymentStatus === "succeeded" || payments.some((p: any) => p.attributes?.status === "paid");

      if (!succeeded) {
        return new Response(JSON.stringify({ success: false, status: paymentStatus || "pending" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Idempotency: check if already credited
      const { data: existingDeposit } = await supabaseAdmin
        .from("wallet_deposits")
        .select("id, status")
        .eq("checkout_session_id", checkout_id)
        .maybeSingle();

      if (existingDeposit?.status === "completed") {
        return new Response(JSON.stringify({ success: true, status: "already_credited" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // Get actual amount from metadata
      const metadata = sessionAttr?.metadata || {};
      const depositAmount = Number(metadata.amount || payments[0]?.attributes?.amount / 100 || 0);

      if (depositAmount <= 0) {
        return new Response(JSON.stringify({ error: "Invalid deposit amount" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      // Credit the user's wallet
      let { data: wallet } = await supabaseAdmin.from("wallets").select("id, balance").eq("user_id", user_id).single();
      if (!wallet) {
        const { data: newWallet } = await supabaseAdmin.from("wallets").insert([{ user_id, balance: 0 }]).select().single();
        wallet = newWallet;
      }

      const newBalance = (wallet?.balance || 0) + depositAmount;
      await supabaseAdmin.from("wallets").update({ balance: newBalance, updated_at: new Date().toISOString() }).eq("id", wallet.id);

      await supabaseAdmin.from("wallet_transactions").insert({
        wallet_id: wallet.id,
        amount: depositAmount,
        type: "deposit",
        description: `Wallet top-up via PayMongo`,
        reference_id: checkout_id,
        is_credit: true,
        status: "completed",
      });

      // Mark deposit record as completed
      if (existingDeposit) {
        await supabaseAdmin.from("wallet_deposits").update({ status: "completed" }).eq("checkout_session_id", checkout_id);
      }

      // Notify user
      await insertNotification(supabaseAdmin, {
        user_id,
        type: "success",
        title: "Wallet Topped Up!",
        message: `₱${depositAmount.toLocaleString()} has been added to your wallet.`,
        meta: { type: "wallet_deposit", amount: depositAmount },
      }).catch(() => {});

      return new Response(JSON.stringify({ success: true, credited_amount: depositAmount, new_balance: newBalance }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
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
