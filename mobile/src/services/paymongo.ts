import { supabase } from "../../lib/supabase";

const PAYMONGO_SECRET_KEY = "sk_test_ihutsUhVb1nANdZqh9A2HPSC";
const PAYMONGO_API_URL = "https://api.paymongo.com/v1";

interface CheckoutResponse {
  success: boolean;
  checkout_url?: string;
  checkout_session_id?: string;
  error?: string;
}

async function paymongoRequest(
  endpoint: string,
  method: string = "GET",
  body?: any,
): Promise<any> {
  const response = await fetch(`${PAYMONGO_API_URL}${endpoint}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(PAYMONGO_SECRET_KEY + ":")}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.errors?.[0]?.detail || "PayMongo API error");
  }

  return data;
}

interface CreateBookingCheckoutParams {
  bookingId: string;
  userId: string;
  amount: number;
  totalAmount: number;
  paymentType: "full" | "downpayment" | "balance";
  remainingBalance: number;
  studioName: string;
  bookingDate: string;
  description?: string;
  redirectUrl: string;
  cancelRedirectUrl: string;
}

export async function createBookingCheckout(
  params: CreateBookingCheckoutParams,
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

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", userId)
      .single();

    const { data: booking, error: bookingError } = await supabase
      .from("studio_bookings")
      .select("id, user_id, payment_status")
      .eq("id", bookingId)
      .single();

    if (bookingError || !booking) {
      return { success: false, error: "Booking not found" };
    }

    if (booking.user_id !== userId) {
      return { success: false, error: "Unauthorized" };
    }

    if (booking.payment_status === "paid") {
      return { success: false, error: "This booking has already been paid" };
    }

    const amountInCentavos = 100;
    const bookingDescription =
      description ||
      (paymentType === "downpayment"
        ? `Downpayment (50%) for booking at ${studioName} on ${bookingDate}`
        : paymentType === "balance"
          ? `Remaining balance payment for booking at ${studioName}`
          : `Studio booking at ${studioName} on ${bookingDate}`);

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
              name: paymentType === "downpayment" ? `${studioName} (Downpayment)` : studioName,
              description: bookingDescription,
              quantity: 1,
            },
          ],
          payment_method_types: ["qrph"],
          success_url: redirectUrl,
          cancel_url: cancelRedirectUrl,
          reference_number: bookingId,
          metadata: {
            booking_id: bookingId,
            user_id: userId,
            studio_name: studioName || "",
            payment_type: paymentType,
            total_amount: String(totalAmount || 0),
            remaining_balance: String(remainingBalance || 0),
          },
        },
      },
    });

    const updateData: any = {
      checkout_session_id: checkoutData.data.id,
      payment_status: "pending",
    };

    if (paymentType !== "balance") {
      updateData.payment_amount = amount;
      updateData.payment_type = paymentType;
      updateData.remaining_balance = remainingBalance;
      updateData.status = "pending";
    }

    await supabase.from("studio_bookings").update(updateData).eq("id", bookingId);

    return {
      success: true,
      checkout_url: checkoutData.data.attributes.checkout_url,
      checkout_session_id: checkoutData.data.id,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to create checkout session",
    };
  }
}
