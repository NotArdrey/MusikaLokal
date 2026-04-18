// PayMongo Service - Local implementation for presentation
// ⚠️ WARNING: This exposes the API key in the client app. For production, use edge functions.

import { supabase } from '../../lib/supabase';

// PayMongo API configuration
// For presentation only - move to secure backend for production
const PAYMONGO_SECRET_KEY = 'sk_test_ihutsUhVb1nANdZqh9A2HPSC';
const PAYMONGO_API_URL = 'https://api.paymongo.com/v1';

interface CreateSubscriptionCheckoutParams {
    userId: string;
    planId: string;
    amount: number;
    planName: string;
    redirectUrl: string;
    cancelRedirectUrl: string;
}

interface CheckoutResponse {
    success: boolean;
    checkout_url?: string;
    checkout_session_id?: string;
    error?: string;
}

// Helper to make PayMongo API calls
async function paymongoRequest(
    endpoint: string,
    method: string = 'GET',
    body?: any
): Promise<any> {
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

export async function createSubscriptionCheckout(
    params: CreateSubscriptionCheckoutParams
): Promise<CheckoutResponse> {
    const {
        userId,
        planId,
        amount,
        planName,
        redirectUrl,
        cancelRedirectUrl,
    } = params;

    console.log('📤 Creating subscription checkout locally:', {
        userId,
        planId,
        amount,
        planName,
    });

    try {
        // Get user profile for billing
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('email, full_name, role')
            .eq('id', userId)
            .single();

        if (profileError) {
            console.error('❌ Error fetching profile:', profileError);
            return { success: false, error: `Failed to fetch user profile: ${profileError.message}` };
        }

        // Only studio-owner and venue-owner can subscribe
        if (!profile || (profile.role !== 'studio-owner' && profile.role !== 'venue-owner')) {
            return {
                success: false,
                error: `Only studio owners and venue owners can subscribe. Your role: ${profile?.role || 'none'}`,
            };
        }

        // Get plan details
        const { data: plan, error: planError } = await supabase
            .from('subscription_plans')
            .select('*')
            .eq('id', planId)
            .single();

        if (planError || !plan) {
            console.error('❌ Error fetching plan:', planError);
            return { success: false, error: 'Subscription plan not found' };
        }

        // Amount in centavos - TEST MODE: Using 1 peso for testing
        const amountInCentavos = 100; // Math.round(plan.price * 100) for production
        const subscriptionDescription = `${plan.name} Plan - Monthly Subscription`;

        // Create PayMongo Checkout Session
        const checkoutData = await paymongoRequest('/checkout_sessions', 'POST', {
            data: {
                attributes: {
                    billing: profile
                        ? {
                            name: profile.full_name || 'Customer',
                            email: profile.email,
                        }
                        : undefined,
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
                        },
                    ],
                    payment_method_types: ['qrph'],
                    success_url: redirectUrl,
                    cancel_url: cancelRedirectUrl,
                    reference_number: `sub_${userId}_${Date.now()}`,
                    metadata: {
                        type: 'subscription',
                        user_id: userId,
                        plan_id: planId,
                        plan_name: plan.name,
                    },
                },
            },
        });

        console.log('✅ Subscription checkout created:', checkoutData.data.id);

        return {
            success: true,
            checkout_url: checkoutData.data.attributes.checkout_url,
            checkout_session_id: checkoutData.data.id,
        };
    } catch (error: any) {
        console.error('❌ Error creating subscription checkout:', error);
        return {
            success: false,
            error: error.message || 'Failed to create checkout session',
        };
    }
}

// ====================================================================
// BOOKING CHECKOUT - For studio booking payments
// ====================================================================

interface CreateBookingCheckoutParams {
    bookingId: string;
    userId: string;
    amount: number;
    totalAmount: number;
    paymentType: 'full' | 'downpayment' | 'balance';
    remainingBalance: number;
    studioName: string;
    bookingDate: string;
    description?: string;
    redirectUrl: string;
    cancelRedirectUrl: string;
}

export async function createBookingCheckout(
    params: CreateBookingCheckoutParams
): Promise<CheckoutResponse> {
    const {
        bookingId,
        userId,
        amount,
        totalAmount,
        paymentType,
        remainingBalance,
        studioName,
        bookingDate,
        description,
        redirectUrl,
        cancelRedirectUrl,
    } = params;

    console.log('📤 Creating booking checkout locally:', {
        bookingId,
        userId,
        amount,
        paymentType,
    });

    try {
        // Get user profile for billing
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', userId)
            .single();

        if (profileError) {
            console.error('❌ Error fetching profile:', profileError);
        }

        // Verify the booking exists
        const { data: booking, error: bookingError } = await supabase
            .from('studio_bookings')
            .select('id, user_id, final_price, status, payment_status')
            .eq('id', bookingId)
            .single();

        if (bookingError || !booking) {
            return { success: false, error: 'Booking not found' };
        }

        if (booking.user_id !== userId) {
            return { success: false, error: 'Unauthorized' };
        }

        if (booking.payment_status === 'paid') {
            return { success: false, error: 'This booking has already been paid' };
        }

        // Amount in centavos - TEST MODE: Using 1 peso for testing
        const amountInCentavos = 100; // Math.round(amount * 100) for production
        const bookingDescription = description ||
            (paymentType === 'downpayment'
                ? `Downpayment (50%) for booking at ${studioName} on ${bookingDate}`
                : paymentType === 'balance'
                    ? `Remaining balance payment for booking at ${studioName}`
                    : `Studio booking at ${studioName} on ${bookingDate}`);

        // Create PayMongo Checkout Session
        const checkoutData = await paymongoRequest('/checkout_sessions', 'POST', {
            data: {
                attributes: {
                    billing: profile
                        ? {
                            name: profile.full_name || 'Customer',
                            email: profile.email,
                        }
                        : undefined,
                    send_email_receipt: true,
                    show_description: true,
                    show_line_items: true,
                    description: bookingDescription,
                    line_items: [
                        {
                            currency: 'PHP',
                            amount: amountInCentavos,
                            name: paymentType === 'downpayment'
                                ? `${studioName} (Downpayment)`
                                : studioName,
                            description: bookingDescription,
                            quantity: 1,
                        },
                    ],
                    payment_method_types: ['qrph'],
                    success_url: redirectUrl,
                    cancel_url: cancelRedirectUrl,
                    reference_number: bookingId,
                    metadata: {
                        booking_id: bookingId,
                        user_id: userId,
                        studio_name: studioName || '',
                        payment_type: paymentType,
                        total_amount: String(totalAmount || 0),
                        remaining_balance: String(remainingBalance || 0),
                    },
                },
            },
        });

        console.log('✅ Booking checkout created:', checkoutData.data.id);

        // Update booking with checkout session ID
        const updateData: any = {
            checkout_session_id: checkoutData.data.id,
            payment_status: 'pending',
        };

        if (paymentType === 'balance') {
            // Balance payment - don't mark as paid yet, wait for PayMongo confirmation
            // remaining_balance will be cleared by the payment_success/webhook handler
        } else {
            updateData.payment_amount = amount;
            updateData.payment_type = paymentType;
            updateData.remaining_balance = remainingBalance;
            updateData.status = 'pending';
        }

        await supabase
            .from('studio_bookings')
            .update(updateData)
            .eq('id', bookingId);

        return {
            success: true,
            checkout_url: checkoutData.data.attributes.checkout_url,
            checkout_session_id: checkoutData.data.id,
        };
    } catch (error: any) {
        console.error('❌ Error creating booking checkout:', error);
        return {
            success: false,
            error: error.message || 'Failed to create checkout session',
        };
    }
}

