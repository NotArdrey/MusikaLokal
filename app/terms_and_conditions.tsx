import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function TermsAndConditionsScreen() {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Terms and Conditions" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.contentContainer}>
          <Text style={[styles.headerText, { color: colors.text }]}>
            Welcome to Musika Lokal!
          </Text>

          <Text style={[styles.text, { color: colors.textSecondary }]}>
            These terms and conditions outline the rules and regulations for using the Musika Lokal platform.
          </Text>

          <Text style={[styles.textLargeMargin, { color: colors.textSecondary }]}>
            By accessing and using our app or website, you agree to these terms. Do not continue to use Musika Lokal if you do not agree with any part of these conditions.
          </Text>

          <Text style={[styles.subHeader, { color: colors.text }]}>
            Booking & Payments
          </Text>

          <Text style={[styles.text, { color: colors.textSecondary }]}>
            • All bookings are processed through the Musika Lokal Wallet system.{'\n'}
            • Payments are held in escrow until the event/session is completed or released after 48–72 hours if no dispute is raised.{'\n'}
            • Refunds and penalties follow the cancellation policy below.
          </Text>

          <Text style={[styles.subHeader, { color: colors.text }]}>
            Cancellation Policy
          </Text>

          <Text style={[styles.smallHeader, { color: colors.text }]}>
            Venues & Musicians
          </Text>

          <Text style={[styles.text, { color: colors.textSecondary }]}>
            • 7 days before event: 80% refund to client, 20% to performer.{'\n'}
            • 3–7 days before event: 70% refund to client, 30% to performer.{'\n'}
            • {'<'}3 days or same day: 100% to performer.
          </Text>

          <Text style={[styles.smallHeader, { color: colors.text }]}>
            Studios & Musicians
          </Text>

          <Text style={[styles.textSmallMargin, { color: colors.textSecondary }]}>
            Studio cancels:{'\n'}
            • 100% refund to musician (120% if cancelled same day).
          </Text>

          <Text style={[styles.text, { color: colors.textSecondary }]}>
            Musician cancels:{'\n'}
            • 3 days: 100% refund.{'\n'}
            • 1–3 days: 70% refund, 30% to studio.{'\n'}
            • {'<'}24 hours: No refund.
          </Text>

          <Text style={[styles.subHeader, { color: colors.text }]}>
            Wallet & Withdrawals
          </Text>

          <Text style={[styles.text, { color: colors.textSecondary }]}>
            • Funds remain in Pending Balance until released.{'\n'}
            • Available Balance can be withdrawn to GCash, Maya, or Bank Transfer.{'\n'}
            • Transaction fees may apply depending on payment method.
          </Text>

          <Text style={[styles.subHeader, { color: colors.text }]}>
            Disputes
          </Text>

          <Text style={[styles.text, { color: colors.textSecondary }]}>
            • Proof may be requested (attendance check-in, real-time evidence).{'\n'}
            • Musika Lokal reserves the right to decide outcomes fairly.
          </Text>

          <Text style={[styles.subHeader, { color: colors.text }]}>
            Completion Rate
          </Text>

          <Text style={[styles.textLargeMarginBottom, { color: colors.textSecondary }]}>
            • Cancellations affect your completion rate.{'\n'}
            • Repeated cancellations may reduce bookings or lead to account suspension.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.navbarContainer}>
        <Navbar />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 150,
    paddingHorizontal: 24,
  },
  contentContainer: {
    paddingTop: 24,
  },
  headerText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    fontFamily: 'Poppins_600SemiBold',
  },
  text: {
    fontSize: 14,
    lineHeight: 24,
    marginBottom: 12, // mb-3 based on original code, though some were mb-4. Adjusting to average or explicit if needed.
    fontFamily: 'Poppins_400Regular',
  },
  textLargeMargin: {
    fontSize: 14,
    lineHeight: 24,
    marginBottom: 20, // mb-5
    fontFamily: 'Poppins_400Regular',
  },
  textSmallMargin: {
    fontSize: 14,
    lineHeight: 24,
    marginBottom: 4, // mb-1
    fontFamily: 'Poppins_400Regular',
  },
  textLargeMarginBottom: {
    fontSize: 14,
    lineHeight: 24,
    marginBottom: 24, // mb-6
    fontFamily: 'Poppins_400Regular',
  },
  subHeader: {
    fontSize: 16, // text-base
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    fontFamily: 'Poppins_600SemiBold',
  },
  smallHeader: {
    fontSize: 14, // text-sm
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 4,
    fontFamily: 'Poppins_600SemiBold',
  },
  navbarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
