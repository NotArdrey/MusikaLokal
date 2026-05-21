import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../lib/supabase";
import { useTheme } from "../src/context/ThemeContext";

type VerificationState = "idle" | "checking" | "verified" | "delayed" | "failed";

export default function PaymentResultScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    status?: string;
    booking_id?: string;
    type?: string;
    amount?: string;
  }>();

  const normalizedStatus = String(params.status || "pending").toLowerCase();
  const isSuccess =
    normalizedStatus === "success" ||
    normalizedStatus === "paid" ||
    normalizedStatus === "completed";
  const isPending = normalizedStatus === "pending";
  const isDeposit = params.type === "deposit";
  const bookingId = typeof params.booking_id === "string" ? params.booking_id : "";
  const [verificationState, setVerificationState] = useState<VerificationState>("idle");
  const [verifiedPaymentStatus, setVerifiedPaymentStatus] = useState<string | null>(null);
  const shouldVerifyBookingPayment = isSuccess && !isDeposit && Boolean(bookingId);
  const isCheckingBookingPayment = verificationState === "checking";

  useEffect(() => {
    if (!shouldVerifyBookingPayment) return;

    let cancelled = false;
    const verifyPayment = async () => {
      setVerificationState("checking");

      for (let attempt = 1; attempt <= 4; attempt += 1) {
        if (attempt > 1) {
          await new Promise((resolve) => setTimeout(resolve, 1200 * attempt));
        }

        const { data, error } = await supabase.functions.invoke("paymongo", {
          body: {
            action: "check_payment",
            booking_id: bookingId,
          },
        });

        if (cancelled) return;
        if (error) throw error;

        const paymentStatus = String(data?.payment_status || "").toLowerCase();
        setVerifiedPaymentStatus(paymentStatus || null);

        if (paymentStatus === "paid" || paymentStatus === "partial") {
          setVerificationState("verified");
          return;
        }
      }

      setVerificationState("delayed");
    };

    verifyPayment().catch((error) => {
      if (cancelled) return;
      console.error("Payment verification error:", error);
      setVerificationState("failed");
    });

    return () => {
      cancelled = true;
    };
  }, [bookingId, shouldVerifyBookingPayment]);

  const bookingsTab = useMemo(
    () => (verifiedPaymentStatus === "partial" ? "Pending" : "Upcoming"),
    [verifiedPaymentStatus],
  );

  const title = isPending || isCheckingBookingPayment
    ? "Processing Payment"
    : isSuccess
      ? isDeposit
        ? "Wallet Topped Up!"
        : "Payment Successful!"
      : isDeposit
        ? "Top-Up Cancelled"
        : "Payment Cancelled";
  const message = isPending || isCheckingBookingPayment
    ? "We are checking your payment status. Please wait a moment."
    : isSuccess
      ? isDeposit
        ? `₱${params.amount || "0"} has been added to your wallet.`
        : verificationState === "delayed"
          ? "Your payment was received. The booking may take a few more seconds to update."
          : verificationState === "failed"
            ? "Your payment was received, but the booking check did not finish. Refresh Bookings in a moment."
            : "Your payment was processed successfully."
      : isDeposit
        ? "Your wallet balance was not changed."
        : "Your payment was not completed. You can try again anytime.";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: isPending || isCheckingBookingPayment ? "#F59E0B" : isSuccess ? "#10B981" : "#EF4444" },
          ]}
        >
          {isPending || isCheckingBookingPayment ? (
            <ActivityIndicator color="white" size="large" />
          ) : (
            <Ionicons
              name={isSuccess ? "checkmark-circle" : "close-circle"}
              size={64}
              color="white"
            />
          )}
        </View>

        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>{message}</Text>

        <View style={styles.buttonContainer}>
          {bookingId ? (
            <TouchableOpacity
              activeOpacity={1}
              disabled={isCheckingBookingPayment}
              style={[
                styles.primaryButton,
                {
                  backgroundColor: colors.primary,
                  opacity: isCheckingBookingPayment ? 0.65 : 1,
                },
              ]}
              onPress={() =>
                router.replace({
                  pathname: "/bookings",
                  params: { tab: isSuccess ? bookingsTab : "Pending" },
                } as any)
              }
            >
              <Text style={styles.primaryButtonText}>View Activity</Text>
            </TouchableOpacity>
          ) : null}
          {isDeposit ? (
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.secondaryButton, { borderColor: colors.border }]}
              onPress={() => router.replace("/wallet")}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
                View Wallet
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    alignItems: "center",
    borderRadius: 24,
    maxWidth: 420,
    padding: 32,
    width: "100%",
  },
  iconContainer: {
    alignItems: "center",
    borderRadius: 50,
    height: 100,
    justifyContent: "center",
    marginBottom: 24,
    width: 100,
  },
  title: {
    fontFamily: "Poppins_700Bold",
    fontSize: 24,
    marginBottom: 12,
    textAlign: "center",
  },
  description: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 28,
    textAlign: "center",
  },
  buttonContainer: {
    gap: 12,
    width: "100%",
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 14,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "white",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    fontFamily: "Poppins_600SemiBold",
    fontSize: 16,
  },
});
