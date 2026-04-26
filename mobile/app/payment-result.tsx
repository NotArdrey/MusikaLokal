import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../src/context/ThemeContext";

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
  const title = isPending
    ? "Processing Payment"
    : isSuccess
      ? isDeposit
        ? "Wallet Topped Up!"
        : "Payment Successful!"
      : isDeposit
        ? "Top-Up Cancelled"
        : "Payment Cancelled";
  const message = isPending
    ? "We are checking your payment status. Please wait a moment."
    : isSuccess
      ? isDeposit
        ? `₱${params.amount || "0"} has been added to your wallet.`
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
            { backgroundColor: isPending ? "#F59E0B" : isSuccess ? "#10B981" : "#EF4444" },
          ]}
        >
          {isPending ? (
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
          {params.booking_id ? (
            <TouchableOpacity
              activeOpacity={1}
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
              onPress={() => router.replace("/bookings")}
            >
              <Text style={styles.primaryButtonText}>View Bookings</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.secondaryButton, { borderColor: colors.border }]}
            onPress={() => router.replace(isDeposit ? "/wallet" : "/home")}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              {isDeposit ? "View Wallet" : "Go Home"}
            </Text>
          </TouchableOpacity>
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
