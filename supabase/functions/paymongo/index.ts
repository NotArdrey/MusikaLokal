// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, paymongo-signature',
}

// PayMongo API configuration
const PAYMONGO_SECRET_KEY = Deno.env.get('PAYMONGO_SECRET_KEY') || '';
const PAYMONGO_WEBHOOK_SECRET = Deno.env.get('PAYMONGO_WEBHOOK_SECRET') || '';
const PAYMONGO_API_URL = 'https://api.paymongo.com/v1';

// Verify PayMongo webhook signature
async function verifyWebhookSignature(payload: string, signatureHeader: string): Promise<boolean> {
    if (!PAYMONGO_WEBHOOK_SECRET || !signatureHeader) {
        console.warn('⚠️ Webhook signature verification skipped - no secret or signature');
        return true; // Skip verification if no secret configured
    }

    try {
        // PayMongo signature format: t=timestamp,te=test_signature,li=live_signature
        const parts = signatureHeader.split(',');
        const timestampPart = parts.find(p => p.startsWith('t='));
        const signaturePart = parts.find(p => p.startsWith('li=')) || parts.find(p => p.startsWith('te='));

        if (!timestampPart || !signaturePart) {
            console.error('❌ Invalid signature header format');
            return false;
        }

        const timestamp = timestampPart.split('=')[1];
        const signature = signaturePart.split('=')[1];

        // Create the signed payload: timestamp + '.' + raw_body
        const signedPayload = `${timestamp}.${payload}`;

        // Compute HMAC-SHA256
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(PAYMONGO_WEBHOOK_SECRET),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const signatureBytes = await crypto.subtle.sign(
            'HMAC',
            key,
            encoder.encode(signedPayload)
        );

        // Convert to hex
        const computedSignature = Array.from(new Uint8Array(signatureBytes))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        const isValid = computedSignature === signature;
        
        if (!isValid) {
            console.error('❌ Webhook signature mismatch');
            console.log('Expected:', signature);
            console.log('Computed:', computedSignature);
        } else {
            console.log('✅ Webhook signature verified');
        }

        return isValid;
    } catch (e) {
        console.error('❌ Error verifying webhook signature:', e);
        return false;
    }
}

// Helper to make PayMongo API calls
async function paymongoRequest(endpoint: string, method: string = 'GET', body?: any) {
    const headers: Record<string, string> = {
        'Authorization': `Basic ${btoa(PAYMONGO_SECRET_KEY + ':')}`,
        'Content-Type': 'application/json',
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
        console.error('PayMongo API Error:', JSON.stringify(data, null, 2));
        throw new Error(data.errors?.[0]?.detail || 'PayMongo API error');
    }

    return data;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        );

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Handle GET requests (redirects from PayMongo) vs POST requests
        let action: string | null = null;
        let params: Record<string, any> = {};
        let rawBody = '';

        if (req.method === 'GET') {
            // GET request - parse action and params from URL query string
            const url = new URL(req.url);
            action = url.searchParams.get('action');
            // Convert URLSearchParams to object
            url.searchParams.forEach((value, key) => {
                if (key !== 'action') {
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
        if (action === 'webhook') {
            const signatureHeader = req.headers.get('paymongo-signature') || '';
            const isValid = await verifyWebhookSignature(rawBody, signatureHeader);
            
            if (!isValid) {
                console.error('❌ Invalid webhook signature - rejecting request');
                return new Response(JSON.stringify({ error: 'Invalid signature' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 401,
                });
            }
        }

        // ====================================================================
        // 1. CREATE CHECKOUT SESSION
        // ====================================================================
        if (action === 'create_checkout') {
            const { booking_id, user_id, amount, description, studio_name, booking_date, success_url, cancel_url, payment_type, total_amount, remaining_balance, redirect_url, cancel_redirect_url } = params;

            console.log('📤 Creating PayMongo checkout session:', { booking_id, amount, description, payment_type, redirect_url });

            if (!booking_id || !amount) {
                return new Response(JSON.stringify({ error: 'Missing required fields: booking_id, amount' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            // Verify the booking exists and belongs to the user
            const { data: booking, error: bookingError } = await supabaseClient
                .from('studio_bookings')
                .select('id, user_id, final_price, status, payment_status, studio:studios(name)')
                .eq('id', booking_id)
                .single();

            if (bookingError || !booking) {
                return new Response(JSON.stringify({ error: 'Booking not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                });
            }

            if (booking.user_id !== user_id) {
                return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                });
            }

            if (booking.payment_status === 'paid') {
                return new Response(JSON.stringify({ error: 'This booking has already been paid' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            // Get user email for checkout
            const { data: profile } = await supabaseClient
                .from('profiles')
                .select('email, full_name')
                .eq('id', user_id)
                .single();

            // Amount should be in centavos (PHP * 100)
            const amountInCentavos = Math.round(amount * 100);
            const studioName = booking.studio?.name || studio_name || 'Studio Booking';
            const isDownpayment = payment_type === 'downpayment';
            const bookingDescription = description || (isDownpayment 
                ? `Downpayment (50%) for booking at ${studioName} on ${booking_date}`
                : `Booking at ${studioName} on ${booking_date}`);

            // Base URL for redirects
            const baseUrl = Deno.env.get('APP_URL') || 'https://aefldxegsvzecshlayza.supabase.co';

            // Create PayMongo Checkout Session
            const checkoutData = await paymongoRequest('/checkout_sessions', 'POST', {
                data: {
                    attributes: {
                        billing: profile ? {
                            name: profile.full_name || 'Customer',
                            email: profile.email,
                        } : undefined,
                        send_email_receipt: true,
                        show_description: true,
                        show_line_items: true,
                        description: bookingDescription,
                        line_items: [
                            {
                                currency: 'PHP',
                                amount: amountInCentavos,
                                name: isDownpayment ? `${studioName} (Downpayment)` : studioName,
                                description: bookingDescription,
                                quantity: 1,
                            }
                        ],
                        payment_method_types: ['gcash', 'card', 'paymaya', 'grab_pay'],
                        success_url: success_url || `${baseUrl}/functions/v1/paymongo?action=payment_success&booking_id=${booking_id}${redirect_url ? '&redirect_url=' + encodeURIComponent(redirect_url) : ''}`,
                        cancel_url: cancel_url || `${baseUrl}/functions/v1/paymongo?action=payment_cancelled&booking_id=${booking_id}${cancel_redirect_url ? '&redirect_url=' + encodeURIComponent(cancel_redirect_url) : ''}`,
                        reference_number: booking_id,
                        metadata: {
                            booking_id: booking_id,
                            user_id: user_id,
                            studio_name: studioName,
                            payment_type: payment_type || 'full',
                            total_amount: total_amount || amount,
                            remaining_balance: remaining_balance || 0,
                        }
                    }
                }
            });

            console.log('✅ Checkout session created:', checkoutData.data.id);

            // Update booking with checkout session ID
            // For balance payments, don't change the payment_type, just update the remaining_balance
            const isBalancePayment = payment_type === 'balance';
            const updateData: any = {
                checkout_session_id: checkoutData.data.id,
                payment_status: 'pending',
            };

            if (isBalancePayment) {
                // Balance payment - don't change payment_type, just track we're paying remaining
                updateData.remaining_balance = 0; // Will be 0 after this payment
            } else {
                // Initial payment (full or downpayment)
                updateData.payment_amount = amount;
                updateData.payment_type = payment_type || 'full';
                updateData.remaining_balance = remaining_balance || 0;
                updateData.status = 'pending'; // Keep as pending until payment completes
            }

            const { error: updateError } = await supabaseAdmin
                .from('studio_bookings')
                .update(updateData)
                .eq('id', booking_id);

            if (updateError) {
                console.error('Error updating booking:', updateError);
            }

            return new Response(JSON.stringify({
                success: true,
                checkout_url: checkoutData.data.attributes.checkout_url,
                checkout_session_id: checkoutData.data.id,
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // ====================================================================
        // 1B. CREATE SUBSCRIPTION CHECKOUT SESSION
        // ====================================================================
        if (action === 'create_subscription_checkout') {
            const { user_id, plan_id, amount, plan_name, description, redirect_url, cancel_redirect_url } = params;

            console.log('📤 Creating subscription checkout:', { user_id, plan_id, amount, plan_name });

            if (!user_id || !plan_id || !amount) {
                return new Response(JSON.stringify({ error: 'Missing required fields: user_id, plan_id, amount' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            // Get user profile for billing
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('email, full_name, role')
                .eq('id', user_id)
                .single();

            // Only studio-owner and venue-owner can subscribe
            if (!profile || (profile.role !== 'studio-owner' && profile.role !== 'venue-owner')) {
                return new Response(JSON.stringify({ error: 'Only studio owners and venue owners can subscribe' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                });
            }

            // Get plan details
            const { data: plan } = await supabaseAdmin
                .from('subscription_plans')
                .select('*')
                .eq('id', plan_id)
                .single();

            if (!plan) {
                return new Response(JSON.stringify({ error: 'Subscription plan not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                });
            }

            // Amount in centavos
            const amountInCentavos = Math.round(plan.price * 100);
            const subscriptionDescription = description || `${plan.name} Plan - Monthly Subscription`;

            // Base URL for redirects
            const baseUrl = Deno.env.get('APP_URL') || 'https://aefldxegsvzecshlayza.supabase.co';

            // Create PayMongo Checkout Session for subscription
            const checkoutData = await paymongoRequest('/checkout_sessions', 'POST', {
                data: {
                    attributes: {
                        billing: profile ? {
                            name: profile.full_name || 'Customer',
                            email: profile.email,
                        } : undefined,
                        send_email_receipt: true,
                        show_description: true,
                        show_line_items: true,
                        description: subscriptionDescription,
                        line_items: [
                            {
                                currency: 'PHP',
                                amount: amountInCentavos,
                                name: `${plan.name} Plan`,
                                description: subscriptionDescription,
                                quantity: 1,
                            }
                        ],
                        payment_method_types: ['gcash', 'card', 'paymaya', 'grab_pay'],
                        success_url: `${baseUrl}/functions/v1/paymongo?action=subscription_success&user_id=${user_id}&plan_id=${plan_id}${redirect_url ? '&redirect_url=' + encodeURIComponent(redirect_url) : ''}`,
                        cancel_url: `${baseUrl}/functions/v1/paymongo?action=subscription_cancelled&user_id=${user_id}${cancel_redirect_url ? '&redirect_url=' + encodeURIComponent(cancel_redirect_url) : ''}`,
                        reference_number: `sub_${user_id}_${Date.now()}`,
                        metadata: {
                            type: 'subscription',
                            user_id: user_id,
                            plan_id: plan_id,
                            plan_name: plan.name,
                        }
                    }
                }
            });

            console.log('✅ Subscription checkout session created:', checkoutData.data.id);

            return new Response(JSON.stringify({
                success: true,
                checkout_url: checkoutData.data.attributes.checkout_url,
                checkout_session_id: checkoutData.data.id,
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // ====================================================================
        // 2. CHECK PAYMENT STATUS
        // ====================================================================
        if (action === 'check_payment') {
            const { checkout_session_id, booking_id } = params;

            if (!checkout_session_id && !booking_id) {
                return new Response(JSON.stringify({ error: 'Missing checkout_session_id or booking_id' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            let sessionId = checkout_session_id;

            // If only booking_id provided, get checkout_session_id from booking
            if (!sessionId && booking_id) {
                const { data: booking } = await supabaseClient
                    .from('studio_bookings')
                    .select('checkout_session_id, payment_status')
                    .eq('id', booking_id)
                    .single();

                if (booking?.payment_status === 'paid') {
                    return new Response(JSON.stringify({
                        success: true,
                        payment_status: 'paid',
                        message: 'Payment already completed',
                    }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        status: 200,
                    });
                }

                sessionId = booking?.checkout_session_id;
            }

            if (!sessionId) {
                return new Response(JSON.stringify({ error: 'No checkout session found for this booking' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                });
            }

            // Get checkout session status from PayMongo
            const sessionData = await paymongoRequest(`/checkout_sessions/${sessionId}`);
            const paymentStatus = sessionData.data.attributes.payment_intent?.attributes?.status;
            const payments = sessionData.data.attributes.payments || [];

            console.log('📊 Payment status check:', { sessionId, paymentStatus, paymentsCount: payments.length });

            // If payment is successful, update booking
            if (paymentStatus === 'succeeded' || payments.length > 0) {
                const payment = payments[0];
                const paymentMethod = payment?.attributes?.source?.type || 'unknown';
                const paymentIntentId = sessionData.data.attributes.payment_intent?.id;

                // Update booking to confirmed and paid
                const { error: updateError } = await supabaseAdmin
                    .from('studio_bookings')
                    .update({
                        payment_status: 'paid',
                        payment_intent_id: paymentIntentId,
                        payment_method: paymentMethod,
                        paid_at: new Date().toISOString(),
                        status: 'confirmed', // Move to confirmed/upcoming when payment succeeds
                    })
                    .eq('checkout_session_id', sessionId);

                if (updateError) {
                    console.error('Error updating booking:', updateError);
                }

                // Get booking details for notification
                const { data: booking } = await supabaseAdmin
                    .from('studio_bookings')
                    .select('id, user_id, studio_id, booking_date, studio:studios(name, owner_id)')
                    .eq('checkout_session_id', sessionId)
                    .single();

                if (booking) {
                    // Notify the musician (booker)
                    await supabaseAdmin.from('notifications').insert({
                        user_id: booking.user_id,
                        type: 'success',
                        title: 'Payment Successful!',
                        message: `Your booking at ${booking.studio?.name} on ${booking.booking_date} has been confirmed.`,
                        meta: { booking_id: booking.id, studio_id: booking.studio_id },
                    });

                    // Notify the studio owner
                    if (booking.studio?.owner_id) {
                        await supabaseAdmin.from('notifications').insert({
                            user_id: booking.studio.owner_id,
                            type: 'info',
                            title: 'New Confirmed Booking',
                            message: `A booking at ${booking.studio?.name} on ${booking.booking_date} has been paid and confirmed.`,
                            meta: { booking_id: booking.id, studio_id: booking.studio_id },
                        });
                    }
                }

                return new Response(JSON.stringify({
                    success: true,
                    payment_status: 'paid',
                    payment_method: paymentMethod,
                    message: 'Payment completed successfully',
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                });
            }

            return new Response(JSON.stringify({
                success: true,
                payment_status: paymentStatus || 'pending',
                checkout_status: sessionData.data.attributes.status,
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // ====================================================================
        // 3. PAYMENT SUCCESS REDIRECT (Called by PayMongo on success)
        // ====================================================================
        if (action === 'payment_success') {
            const url = new URL(req.url);
            const bookingId = url.searchParams.get('booking_id') || params.booking_id;
            // Get client-provided redirect URL (supports Expo Go exp:// and production musikalokal://)
            const clientRedirectUrl = url.searchParams.get('redirect_url');

            console.log('✅ Payment success callback for booking:', bookingId, 'redirect_url:', clientRedirectUrl);

            if (bookingId) {
                // Get booking details
                const { data: booking } = await supabaseAdmin
                    .from('studio_bookings')
                    .select('checkout_session_id')
                    .eq('id', bookingId)
                    .single();

                if (booking?.checkout_session_id) {
                    // Verify payment with PayMongo
                    try {
                        const sessionData = await paymongoRequest(`/checkout_sessions/${booking.checkout_session_id}`);
                        const payments = sessionData.data.attributes.payments || [];

                        if (payments.length > 0) {
                            const payment = payments[0];
                            const paymentMethod = payment?.attributes?.source?.type || 'unknown';
                            const paymentIntentId = sessionData.data.attributes.payment_intent?.id;

                            // Update booking
                            await supabaseAdmin
                                .from('studio_bookings')
                                .update({
                                    payment_status: 'paid',
                                    payment_intent_id: paymentIntentId,
                                    payment_method: paymentMethod,
                                    paid_at: new Date().toISOString(),
                                    status: 'confirmed',
                                })
                                .eq('id', bookingId);

                            // Get full booking details for notifications
                            const { data: fullBooking } = await supabaseAdmin
                                .from('studio_bookings')
                                .select('id, user_id, studio_id, booking_date, studio:studios(name, owner_id)')
                                .eq('id', bookingId)
                                .single();

                            if (fullBooking) {
                                // Notify musician
                                await supabaseAdmin.from('notifications').insert({
                                    user_id: fullBooking.user_id,
                                    type: 'success',
                                    title: 'Payment Successful!',
                                    message: `Your booking at ${fullBooking.studio?.name} has been confirmed and moved to Upcoming.`,
                                    meta: { booking_id: fullBooking.id },
                                });

                                // Notify studio owner
                                if (fullBooking.studio?.owner_id) {
                                    await supabaseAdmin.from('notifications').insert({
                                        user_id: fullBooking.studio.owner_id,
                                        type: 'info',
                                        title: 'Booking Payment Received',
                                        message: `Payment received for booking at ${fullBooking.studio?.name} on ${fullBooking.booking_date}.`,
                                        meta: { booking_id: fullBooking.id },
                                    });
                                }
                            }
                        }
                    } catch (e) {
                        console.error('Error verifying payment:', e);
                    }
                }
            }

            // Use client-provided redirect URL if available, otherwise fallback to hardcoded scheme
            // This allows the redirect to work with Expo Go (exp://) during development
            const appDeepLink = clientRedirectUrl || `musikalokal://payment-result?status=success&booking_id=${bookingId}`;
            
            console.log('🔀 Redirecting directly to:', appDeepLink);
            
            // Use HTTP 302 redirect directly to the app deep link
            return new Response(null, {
                status: 302,
                headers: {
                    'Location': appDeepLink,
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                },
            });
        }

        // ====================================================================
        // 4. PAYMENT CANCELLED REDIRECT
        // ====================================================================
        if (action === 'payment_cancelled') {
            const url = new URL(req.url);
            const bookingId = url.searchParams.get('booking_id') || params.booking_id;
            // Get client-provided redirect URL (supports Expo Go exp:// and production musikalokal://)
            const clientRedirectUrl = url.searchParams.get('redirect_url');

            console.log('❌ Payment cancelled for booking:', bookingId, 'redirect_url:', clientRedirectUrl);

            // Reset payment status back to unpaid so user can try again
            // (Do NOT set to 'failed' as that hides the Pay Now button)
            if (bookingId) {
                await supabaseAdmin
                    .from('studio_bookings')
                    .update({ 
                        payment_status: 'unpaid',
                        checkout_session_id: null // Clear the old session so a new one can be created
                    })
                    .eq('id', bookingId);
            }

            // Use client-provided redirect URL if available, otherwise fallback to hardcoded scheme
            const appDeepLink = clientRedirectUrl || `musikalokal://payment-result?status=cancelled&booking_id=${bookingId}`;
            
            console.log('🔀 Redirecting directly to:', appDeepLink);
            
            // Use HTTP 302 redirect directly to the app deep link
            return new Response(null, {
                status: 302,
                headers: {
                    'Location': appDeepLink,
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                },
            });
        }

        // ====================================================================
        // 4B. SUBSCRIPTION SUCCESS REDIRECT
        // ====================================================================
        if (action === 'subscription_success') {
            const url = new URL(req.url);
            const userId = url.searchParams.get('user_id') || params.user_id;
            const planId = url.searchParams.get('plan_id') || params.plan_id;
            const clientRedirectUrl = url.searchParams.get('redirect_url');

            console.log('✅ Subscription payment success:', { userId, planId });

            if (userId && planId) {
                try {
                    // Get plan details
                    const { data: plan } = await supabaseAdmin
                        .from('subscription_plans')
                        .select('*')
                        .eq('id', planId)
                        .single();

                    if (plan) {
                        const now = new Date();
                        const periodEnd = new Date(now);
                        periodEnd.setDate(periodEnd.getDate() + (plan.duration_days || 30));

                        // Check if user already has a subscription
                        const { data: existingSub } = await supabaseAdmin
                            .from('subscriptions')
                            .select('id')
                            .eq('user_id', userId)
                            .single();

                        if (existingSub) {
                            // Update existing subscription
                            await supabaseAdmin
                                .from('subscriptions')
                                .update({
                                    plan_id: planId,
                                    status: 'active',
                                    current_period_start: now.toISOString(),
                                    current_period_end: periodEnd.toISOString(),
                                    cancelled_at: null,
                                    cancel_at_period_end: false,
                                    last_payment_date: now.toISOString(),
                                    last_payment_amount: plan.price,
                                    updated_at: now.toISOString(),
                                })
                                .eq('id', existingSub.id);
                        } else {
                            // Create new subscription
                            await supabaseAdmin
                                .from('subscriptions')
                                .insert({
                                    user_id: userId,
                                    plan_id: planId,
                                    status: 'active',
                                    current_period_start: now.toISOString(),
                                    current_period_end: periodEnd.toISOString(),
                                    last_payment_date: now.toISOString(),
                                    last_payment_amount: plan.price,
                                });
                        }

                        // Update profile subscription status
                        await supabaseAdmin
                            .from('profiles')
                            .update({
                                subscription_status: 'active',
                                subscription_expires_at: periodEnd.toISOString(),
                            })
                            .eq('id', userId);

                        // Record payment in subscription_payments
                        const { data: sub } = await supabaseAdmin
                            .from('subscriptions')
                            .select('id')
                            .eq('user_id', userId)
                            .single();

                        if (sub) {
                            await supabaseAdmin
                                .from('subscription_payments')
                                .insert({
                                    subscription_id: sub.id,
                                    user_id: userId,
                                    amount: plan.price,
                                    status: 'paid',
                                    billing_period_start: now.toISOString(),
                                    billing_period_end: periodEnd.toISOString(),
                                    paid_at: now.toISOString(),
                                });
                        }

                        // Send notification
                        await supabaseAdmin.from('notifications').insert({
                            user_id: userId,
                            type: 'success',
                            title: 'Subscription Activated! 🎉',
                            message: `Welcome to the ${plan.name} plan! Your subscription is now active.`,
                            meta: { plan_id: planId, plan_name: plan.name },
                        });
                    }
                } catch (e) {
                    console.error('Error creating subscription:', e);
                }
            }

            const appDeepLink = clientRedirectUrl || `musikalokal://payment-result?status=success&type=subscription&plan_id=${planId}`;
            
            return new Response(null, {
                status: 302,
                headers: {
                    'Location': appDeepLink,
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                },
            });
        }

        // ====================================================================
        // 4C. SUBSCRIPTION CANCELLED REDIRECT
        // ====================================================================
        if (action === 'subscription_cancelled') {
            const url = new URL(req.url);
            const clientRedirectUrl = url.searchParams.get('redirect_url');

            console.log('❌ Subscription checkout cancelled');

            const appDeepLink = clientRedirectUrl || `musikalokal://payment-result?status=cancelled&type=subscription`;
            
            return new Response(null, {
                status: 302,
                headers: {
                    'Location': appDeepLink,
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                },
            });
        }

        // ====================================================================
        // 5. WEBHOOK HANDLER (For PayMongo webhooks)
        // ====================================================================
        if (action === 'webhook') {
            // PayMongo sends webhook data in params or as root object with 'data' key
            const event = params.data ? params.data.attributes : params;

            console.log('🔔 PayMongo webhook received:', event.type);
            console.log('📦 Webhook payload:', JSON.stringify(event, null, 2));

            // Helper function to process successful payment
            async function processSuccessfulPayment(bookingId: string, paymentMethod?: string) {
                if (!bookingId) return;

                // Update booking
                const updateData: any = {
                    payment_status: 'paid',
                    paid_at: new Date().toISOString(),
                    status: 'confirmed',
                };
                if (paymentMethod) {
                    updateData.payment_method = paymentMethod;
                }

                const { error } = await supabaseAdmin
                    .from('studio_bookings')
                    .update(updateData)
                    .eq('id', bookingId);

                if (error) {
                    console.error('Webhook: Error updating booking:', error);
                    return;
                }

                console.log('✅ Webhook: Booking updated successfully');

                // Send notifications
                const { data: booking } = await supabaseAdmin
                    .from('studio_bookings')
                    .select('id, user_id, studio_id, booking_date, studio:studios(name, owner_id)')
                    .eq('id', bookingId)
                    .single();

                if (booking) {
                    await supabaseAdmin.from('notifications').insert({
                        user_id: booking.user_id,
                        type: 'success',
                        title: 'Payment Confirmed!',
                        message: `Your booking at ${booking.studio?.name} is now confirmed.`,
                        meta: { booking_id: booking.id },
                    });

                    if (booking.studio?.owner_id) {
                        await supabaseAdmin.from('notifications').insert({
                            user_id: booking.studio.owner_id,
                            type: 'info',
                            title: 'New Paid Booking',
                            message: `Payment received for ${booking.studio?.name} on ${booking.booking_date}.`,
                            meta: { booking_id: booking.id },
                        });
                    }
                }
            }

            // Handle: checkout_session.payment.paid
            if (event.type === 'checkout_session.payment.paid') {
                const sessionId = event.data?.id;
                const metadata = event.data?.attributes?.metadata || {};
                const bookingId = metadata?.booking_id;
                const paymentMethod = event.data?.attributes?.payments?.[0]?.attributes?.source?.type;

                // Check if this is a subscription payment
                if (metadata?.type === 'subscription') {
                    const userId = metadata?.user_id;
                    const planId = metadata?.plan_id;
                    console.log('💰 Subscription payment via webhook:', { userId, planId, paymentMethod });
                    
                    // Process subscription (similar to subscription_success handler)
                    if (userId && planId) {
                        const { data: plan } = await supabaseAdmin
                            .from('subscription_plans')
                            .select('*')
                            .eq('id', planId)
                            .single();

                        if (plan) {
                            const now = new Date();
                            const periodEnd = new Date(now);
                            periodEnd.setDate(periodEnd.getDate() + (plan.duration_days || 30));

                            const { data: existingSub } = await supabaseAdmin
                                .from('subscriptions')
                                .select('id')
                                .eq('user_id', userId)
                                .single();

                            if (existingSub) {
                                await supabaseAdmin
                                    .from('subscriptions')
                                    .update({
                                        plan_id: planId,
                                        status: 'active',
                                        current_period_start: now.toISOString(),
                                        current_period_end: periodEnd.toISOString(),
                                        cancelled_at: null,
                                        cancel_at_period_end: false,
                                        last_payment_date: now.toISOString(),
                                        last_payment_amount: plan.price,
                                        payment_method: paymentMethod,
                                        updated_at: now.toISOString(),
                                    })
                                    .eq('id', existingSub.id);
                            } else {
                                await supabaseAdmin
                                    .from('subscriptions')
                                    .insert({
                                        user_id: userId,
                                        plan_id: planId,
                                        status: 'active',
                                        current_period_start: now.toISOString(),
                                        current_period_end: periodEnd.toISOString(),
                                        last_payment_date: now.toISOString(),
                                        last_payment_amount: plan.price,
                                        payment_method: paymentMethod,
                                    });
                            }

                            await supabaseAdmin
                                .from('profiles')
                                .update({
                                    subscription_status: 'active',
                                    subscription_expires_at: periodEnd.toISOString(),
                                })
                                .eq('id', userId);

                            await supabaseAdmin.from('notifications').insert({
                                user_id: userId,
                                type: 'success',
                                title: 'Subscription Activated! 🎉',
                                message: `Your ${plan.name} plan subscription is now active.`,
                                meta: { plan_id: planId, plan_name: plan.name },
                            });
                        }
                    }
                } else {
                    // Regular booking payment
                    console.log('💰 Checkout session payment paid:', { sessionId, bookingId, paymentMethod });
                    await processSuccessfulPayment(bookingId, paymentMethod);
                }
            }

            // Handle: link.payment.paid
            if (event.type === 'link.payment.paid') {
                const linkId = event.data?.id;
                const bookingId = event.data?.attributes?.metadata?.booking_id || 
                                  event.data?.attributes?.reference_number;
                const paymentMethod = event.data?.attributes?.payments?.[0]?.attributes?.source?.type;

                console.log('💰 Link payment paid:', { linkId, bookingId, paymentMethod });
                await processSuccessfulPayment(bookingId, paymentMethod);
            }

            // Handle: payment.paid
            if (event.type === 'payment.paid') {
                const paymentId = event.data?.id;
                const bookingId = event.data?.attributes?.metadata?.booking_id;
                const paymentMethod = event.data?.attributes?.source?.type;

                console.log('💰 Payment paid:', { paymentId, bookingId, paymentMethod });

                // For payment.paid, we might need to look up by payment_intent_id
                if (bookingId) {
                    await processSuccessfulPayment(bookingId, paymentMethod);
                } else {
                    // Try to find booking by checkout_session payment_intent
                    const paymentIntentId = event.data?.attributes?.payment_intent_id;
                    if (paymentIntentId) {
                        const { data: booking } = await supabaseAdmin
                            .from('studio_bookings')
                            .select('id')
                            .eq('payment_intent_id', paymentIntentId)
                            .single();

                        if (booking) {
                            await processSuccessfulPayment(booking.id, paymentMethod);
                        }
                    }
                }
            }

            // Handle: payment.failed
            if (event.type === 'payment.failed') {
                const paymentId = event.data?.id;
                const bookingId = event.data?.attributes?.metadata?.booking_id;
                const failureMessage = event.data?.attributes?.failed_message || 'Payment failed';

                console.log('❌ Payment failed:', { paymentId, bookingId, failureMessage });

                if (bookingId) {
                    await supabaseAdmin
                        .from('studio_bookings')
                        .update({ payment_status: 'failed' })
                        .eq('id', bookingId);

                    // Notify user about failed payment
                    const { data: booking } = await supabaseAdmin
                        .from('studio_bookings')
                        .select('user_id, studio:studios(name)')
                        .eq('id', bookingId)
                        .single();

                    if (booking) {
                        await supabaseAdmin.from('notifications').insert({
                            user_id: booking.user_id,
                            type: 'warning',
                            title: 'Payment Failed',
                            message: `Your payment for ${booking.studio?.name} failed. Please try again.`,
                            meta: { booking_id: bookingId },
                        });
                    }
                }
            }

            // Handle: payment.refunded
            if (event.type === 'payment.refunded') {
                const refundData = event.data?.attributes;
                const bookingId = refundData?.metadata?.booking_id;
                const refundAmount = refundData?.amount ? refundData.amount / 100 : 0; // Convert from centavos

                console.log('💸 Payment refunded webhook:', { bookingId, refundAmount });

                if (bookingId) {
                    // Update booking status to refunded
                    await supabaseAdmin
                        .from('studio_bookings')
                        .update({
                            payment_status: 'refunded',
                            refund_amount: refundAmount,
                            refunded_at: new Date().toISOString(),
                            status: 'cancelled',
                        })
                        .eq('id', bookingId);

                    // Notify user
                    const { data: booking } = await supabaseAdmin
                        .from('studio_bookings')
                        .select('user_id, studio:studios(name)')
                        .eq('id', bookingId)
                        .single();

                    if (booking) {
                        await supabaseAdmin.from('notifications').insert({
                            user_id: booking.user_id,
                            type: 'success',
                            title: 'Refund Completed',
                            message: `Your refund of ₱${refundAmount.toLocaleString()} for ${booking.studio?.name} has been processed.`,
                            meta: { booking_id: bookingId },
                        });
                    }
                }
            }

            // Handle: payment.refund.updated
            if (event.type === 'payment.refund.updated') {
                const refundData = event.data?.attributes;
                const refundStatus = refundData?.status;
                const bookingId = refundData?.metadata?.booking_id;

                console.log('🔄 Refund status updated:', { bookingId, refundStatus });

                if (bookingId && refundStatus === 'failed') {
                    // Notify user that refund failed
                    const { data: booking } = await supabaseAdmin
                        .from('studio_bookings')
                        .select('user_id, studio:studios(name)')
                        .eq('id', bookingId)
                        .single();

                    if (booking) {
                        await supabaseAdmin.from('notifications').insert({
                            user_id: booking.user_id,
                            type: 'warning',
                            title: 'Refund Failed',
                            message: `Your refund request for ${booking.studio?.name} could not be processed. Please contact support.`,
                            meta: { booking_id: bookingId },
                        });
                    }
                }
            }

            return new Response(JSON.stringify({ received: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // ====================================================================
        // 6. EXPIRE UNPAID BOOKINGS (Can be called by a cron job)
        // ====================================================================
        if (action === 'expire_unpaid') {
            const { hours_threshold = 24 } = params;

            // Find bookings that are unpaid for more than threshold hours
            const thresholdDate = new Date();
            thresholdDate.setHours(thresholdDate.getHours() - hours_threshold);

            const { data: expiredBookings, error } = await supabaseAdmin
                .from('studio_bookings')
                .update({ status: 'cancelled', cancellation_reason: 'Payment not received within time limit' })
                .eq('payment_status', 'unpaid')
                .eq('status', 'pending')
                .lt('created_at', thresholdDate.toISOString())
                .select('id');

            if (error) {
                console.error('Error expiring bookings:', error);
            }

            console.log(`⏰ Expired ${expiredBookings?.length || 0} unpaid bookings`);

            return new Response(JSON.stringify({
                success: true,
                expired_count: expiredBookings?.length || 0,
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // ====================================================================
        // 7. REQUEST REFUND
        // ====================================================================
        if (action === 'request_refund') {
            const { booking_id, user_id, reason } = params;

            console.log('💸 Refund requested for booking:', booking_id);

            if (!booking_id || !user_id) {
                return new Response(JSON.stringify({ error: 'Missing required fields: booking_id, user_id' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            // Get booking details
            const { data: booking, error: bookingError } = await supabaseAdmin
                .from('studio_bookings')
                .select(`
                    id, user_id, status, payment_status, payment_amount, checkout_session_id,
                    booking_date, checked_in, created_at,
                    studio:studios(name, owner_id)
                `)
                .eq('id', booking_id)
                .single();

            if (bookingError || !booking) {
                return new Response(JSON.stringify({ error: 'Booking not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                });
            }

            // Verify user owns the booking
            if (booking.user_id !== user_id) {
                return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                });
            }

            // Check if booking was paid
            if (booking.payment_status !== 'paid') {
                return new Response(JSON.stringify({ error: 'This booking has not been paid yet' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            // Check if already refunded
            if (booking.payment_status === 'refunded') {
                return new Response(JSON.stringify({ error: 'This booking has already been refunded' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            // Check if booking was checked in (no refund if already used)
            if (booking.checked_in) {
                return new Response(JSON.stringify({ error: 'Cannot refund a booking that was already checked in' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 400,
                });
            }

            // Calculate refund amount based on cancellation policy
            const bookingDate = new Date(booking.booking_date);
            const now = new Date();
            const diffTime = bookingDate.getTime() - now.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let refundPercentage = 0;
            let refundReason = '';

            if (diffDays > 7) {
                refundPercentage = 80;
                refundReason = 'Cancelled more than 7 days before booking';
            } else if (diffDays >= 3) {
                refundPercentage = 70;
                refundReason = 'Cancelled 3-7 days before booking';
            } else if (diffDays >= 0) {
                refundPercentage = 0;
                refundReason = 'Cancelled less than 3 days before booking (non-refundable)';
            } else {
                // Booking date has passed without check-in
                refundPercentage = 100;
                refundReason = 'Booking not used (no check-in recorded)';
            }

            const refundAmount = Math.round((booking.payment_amount * refundPercentage) / 100);
            const refundAmountCentavos = refundAmount * 100;

            console.log('💰 Refund calculation:', { 
                diffDays, 
                refundPercentage, 
                originalAmount: booking.payment_amount,
                refundAmount 
            });

            // If no refund due
            if (refundPercentage === 0) {
                // Update booking status
                await supabaseAdmin
                    .from('studio_bookings')
                    .update({
                        status: 'cancelled',
                        cancellation_reason: reason || refundReason,
                    })
                    .eq('id', booking_id);

                return new Response(JSON.stringify({
                    success: true,
                    refund_percentage: 0,
                    refund_amount: 0,
                    message: 'Booking cancelled. No refund due based on cancellation policy.',
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                });
            }

            // Get payment ID from checkout session to process refund
            let paymentId = null;
            if (booking.checkout_session_id) {
                try {
                    const sessionData = await paymongoRequest(`/checkout_sessions/${booking.checkout_session_id}`);
                    const payments = sessionData.data?.attributes?.payments || [];
                    if (payments.length > 0) {
                        paymentId = payments[0].id;
                    }
                } catch (e) {
                    console.error('Error fetching checkout session:', e);
                }
            }

            if (!paymentId) {
                // Can't process automatic refund, mark as pending manual refund
                await supabaseAdmin
                    .from('studio_bookings')
                    .update({
                        status: 'cancelled',
                        payment_status: 'refund_pending',
                        cancellation_reason: reason || refundReason,
                        refund_amount: refundAmount,
                    })
                    .eq('id', booking_id);

                // Notify studio owner about manual refund needed
                if (booking.studio?.owner_id) {
                    await supabaseAdmin.from('notifications').insert({
                        user_id: booking.studio.owner_id,
                        type: 'warning',
                        title: 'Manual Refund Required',
                        message: `A booking at ${booking.studio?.name} requires a manual refund of ₱${refundAmount.toLocaleString()}.`,
                        meta: { booking_id: booking.id, refund_amount: refundAmount },
                    });
                }

                return new Response(JSON.stringify({
                    success: true,
                    refund_percentage: refundPercentage,
                    refund_amount: refundAmount,
                    status: 'pending',
                    message: `Refund of ₱${refundAmount.toLocaleString()} (${refundPercentage}%) is being processed manually.`,
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                });
            }

            // Process refund via PayMongo
            try {
                const refundData = await paymongoRequest('/refunds', 'POST', {
                    data: {
                        attributes: {
                            amount: refundAmountCentavos,
                            payment_id: paymentId,
                            reason: 'requested_by_customer',
                            notes: reason || refundReason,
                            metadata: {
                                booking_id: booking_id,
                                user_id: user_id,
                            }
                        }
                    }
                });

                console.log('✅ Refund created:', refundData.data.id);

                // Update booking
                await supabaseAdmin
                    .from('studio_bookings')
                    .update({
                        status: 'cancelled',
                        payment_status: 'refunded',
                        cancellation_reason: reason || refundReason,
                        refund_amount: refundAmount,
                        refund_id: refundData.data.id,
                        refunded_at: new Date().toISOString(),
                    })
                    .eq('id', booking_id);

                // Notify user
                await supabaseAdmin.from('notifications').insert({
                    user_id: booking.user_id,
                    type: 'success',
                    title: 'Refund Processed',
                    message: `Your refund of ₱${refundAmount.toLocaleString()} (${refundPercentage}%) for ${booking.studio?.name} has been processed.`,
                    meta: { booking_id: booking.id, refund_amount: refundAmount },
                });

                // Notify studio owner
                if (booking.studio?.owner_id) {
                    await supabaseAdmin.from('notifications').insert({
                        user_id: booking.studio.owner_id,
                        type: 'info',
                        title: 'Booking Cancelled & Refunded',
                        message: `A booking at ${booking.studio?.name} was cancelled. Refund of ₱${refundAmount.toLocaleString()} processed.`,
                        meta: { booking_id: booking.id, refund_amount: refundAmount },
                    });
                }

                return new Response(JSON.stringify({
                    success: true,
                    refund_id: refundData.data.id,
                    refund_percentage: refundPercentage,
                    refund_amount: refundAmount,
                    message: `Refund of ₱${refundAmount.toLocaleString()} (${refundPercentage}%) processed successfully!`,
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                });

            } catch (refundError: any) {
                console.error('PayMongo refund error:', refundError);

                // Mark as pending manual refund
                await supabaseAdmin
                    .from('studio_bookings')
                    .update({
                        status: 'cancelled',
                        payment_status: 'refund_pending',
                        cancellation_reason: reason || refundReason,
                        refund_amount: refundAmount,
                    })
                    .eq('id', booking_id);

                return new Response(JSON.stringify({
                    success: true,
                    refund_percentage: refundPercentage,
                    refund_amount: refundAmount,
                    status: 'pending',
                    message: `Booking cancelled. Refund of ₱${refundAmount.toLocaleString()} is being processed.`,
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200,
                });
            }
        }

        // ====================================================================
        // 8. CHECK REFUND STATUS
        // ====================================================================
        if (action === 'check_refund') {
            const { booking_id } = params;

            const { data: booking } = await supabaseAdmin
                .from('studio_bookings')
                .select('payment_status, refund_amount, refund_id, refunded_at')
                .eq('id', booking_id)
                .single();

            if (!booking) {
                return new Response(JSON.stringify({ error: 'Booking not found' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 404,
                });
            }

            return new Response(JSON.stringify({
                success: true,
                payment_status: booking.payment_status,
                refund_amount: booking.refund_amount,
                refund_id: booking.refund_id,
                refunded_at: booking.refunded_at,
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        return new Response(JSON.stringify({ error: 'Invalid action' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });

    } catch (error: any) {
        console.error('PayMongo function error:', error);
        return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
