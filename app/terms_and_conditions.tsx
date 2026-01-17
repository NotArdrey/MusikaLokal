import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function TermsAndConditionsScreen() {
  const { colors } = useTheme();

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Header title="Terms and Conditions" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150, paddingHorizontal: 24 }}>
        <View className="pt-6">
          <Text className="text-lg font-semibold mb-3" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
            Welcome to Musika Lokal!
          </Text>

          <Text className="text-sm leading-6 mb-3" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
            These terms and conditions outline the rules and regulations for using the Musika Lokal platform.
          </Text>

          <Text className="text-sm leading-6 mb-5" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
            By accessing and using our app or website, you agree to these terms. Do not continue to use Musika Lokal if you do not agree with any part of these conditions.
          </Text>

          <Text className="text-base font-semibold mt-4 mb-2" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
            Booking & Payments
          </Text>

          <Text className="text-sm leading-6 mb-4" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
            • All bookings are processed through the Musika Lokal Wallet system.{'\n'}
            • Payments are held in escrow until the event/session is completed or released after 48–72 hours if no dispute is raised.{'\n'}
            • Refunds and penalties follow the cancellation policy below.
          </Text>

          <Text className="text-base font-semibold mt-4 mb-2" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
            Cancellation Policy
          </Text>

          <Text className="text-sm font-semibold mt-2 mb-1" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
            Venues & Musicians
          </Text>

          <Text className="text-sm leading-6 mb-3" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
            • 7 days before event: 80% refund to client, 20% to performer.{'\n'}
            • 3–7 days before event: 70% refund to client, 30% to performer.{'\n'}
            • {'<'}3 days or same day: 100% to performer.
          </Text>

          <Text className="text-sm font-semibold mt-2 mb-1" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
            Studios & Musicians
          </Text>

          <Text className="text-sm leading-6 mb-1" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
            Studio cancels:{'\n'}
            • 100% refund to musician (120% if cancelled same day).
          </Text>

          <Text className="text-sm leading-6 mb-4" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
            Musician cancels:{'\n'}
            • 3 days: 100% refund.{'\n'}
            • 1–3 days: 70% refund, 30% to studio.{'\n'}
            • {'<'}24 hours: No refund.
          </Text>

          <Text className="text-base font-semibold mt-4 mb-2" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
            Wallet & Withdrawals
          </Text>

          <Text className="text-sm leading-6 mb-4" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
            • Funds remain in Pending Balance until released.{'\n'}
            • Available Balance can be withdrawn to GCash, Maya, or Bank Transfer.{'\n'}
            • Transaction fees may apply depending on payment method.
          </Text>

          <Text className="text-base font-semibold mt-4 mb-2" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
            Disputes
          </Text>

          <Text className="text-sm leading-6 mb-4" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
            • Proof may be requested (attendance check-in, real-time evidence).{'\n'}
            • Musika Lokal reserves the right to decide outcomes fairly.
          </Text>

          <Text className="text-base font-semibold mt-4 mb-2" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
            Completion Rate
          </Text>

          <Text className="text-sm leading-6 mb-6" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
            • Cancellations affect your completion rate.{'\n'}
            • Repeated cancellations may reduce bookings or lead to account suspension.
          </Text>
        </View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0">
        <Navbar />
      </View>
    </View>
  );
}
