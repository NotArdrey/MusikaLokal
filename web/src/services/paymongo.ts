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
  bookingIds?: string[];
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
    bookingIds,
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
    const targetBookingIds = Array.from(
      new Set([bookingId, ...(bookingIds || [])].filter(Boolean)),
    );
    const primaryBookingId = targetBookingIds[0] || bookingId;

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", userId)
      .single();

    const { data: bookingRows, error: bookingError } = await supabase
      .from("studio_bookings")
      .select("id, user_id, payment_status, final_price")
      .in("id", targetBookingIds);

    const bookingsById = new Map(
      (bookingRows || []).map((booking: any) => [booking.id, booking]),
    );
    const orderedBookings = targetBookingIds
      .map((id) => bookingsById.get(id))
      .filter(Boolean);

    if (bookingError || orderedBookings.length !== targetBookingIds.length) {
      return { success: false, error: "Booking not found" };
    }

    if (orderedBookings.some((booking: any) => booking.user_id !== userId)) {
      return { success: false, error: "Unauthorized" };
    }

    if (orderedBookings.some((booking: any) => booking.payment_status === "paid")) {
      return { success: false, error: "One or more bookings have already been paid" };
    }

    const checkoutAmount = Number(amount);
    if (!Number.isFinite(checkoutAmount) || checkoutAmount <= 0) {
      return { success: false, error: "Invalid checkout amount" };
    }

    const amountInCentavos = Math.round(checkoutAmount * 100);
    const isMultiBooking = targetBookingIds.length > 1;
    const bookingDescription =
      description ||
      (paymentType === "downpayment"
        ? `Downpayment (50%) for ${isMultiBooking ? `${targetBookingIds.length} bookings` : `booking at ${studioName} on ${bookingDate}`}`
        : paymentType === "balance"
          ? `Remaining balance payment for ${isMultiBooking ? `${targetBookingIds.length} bookings` : `booking at ${studioName}`}`
          : `${isMultiBooking ? `${targetBookingIds.length} studio bookings` : `Studio booking at ${studioName} on ${bookingDate}`}`);

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
          reference_number: primaryBookingId,
          metadata: {
            booking_id: primaryBookingId,
            booking_ids: JSON.stringify(targetBookingIds),
            booking_count: String(targetBookingIds.length),
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
      const finalPrices = orderedBookings.map((booking: any) => Number(booking.final_price || 0));
      const totalFinalPrice = finalPrices.reduce((sum, price) => sum + price, 0);
      let amountLeft = paymentType === "downpayment"
        ? Math.round(amount)
        : totalFinalPrice;

      for (let index = 0; index < orderedBookings.length; index += 1) {
        const booking = orderedBookings[index];
        const finalPrice = finalPrices[index] || 0;
        const isLast = index === orderedBookings.length - 1;
        const proportionalAmount = paymentType === "downpayment" && totalFinalPrice > 0
          ? Math.round(amount * (finalPrice / totalFinalPrice))
          : finalPrice;
        const paymentAmount = paymentType === "downpayment"
          ? Math.max(0, Math.min(finalPrice, isLast ? amountLeft : proportionalAmount))
          : finalPrice;
        amountLeft = Math.max(0, amountLeft - paymentAmount);

        await supabase
          .from("studio_bookings")
          .update({
            ...updateData,
            payment_amount: paymentAmount,
            payment_type: paymentType,
            remaining_balance: paymentType === "downpayment"
              ? Math.max(0, finalPrice - paymentAmount)
              : 0,
            status: "pending",
          })
          .eq("id", booking.id);
      }
    } else {
      await supabase
        .from("studio_bookings")
        .update(updateData)
        .in("id", targetBookingIds);
    }

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
