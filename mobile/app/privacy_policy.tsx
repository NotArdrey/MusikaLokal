import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useBottomBarClearance } from '../src/hooks/useBottomBarClearance';
import { useTheme } from '../src/context/ThemeContext';

export default function PrivacyPolicyScreen() {
  const { colors } = useTheme();
  const { contentBottomPadding } = useBottomBarClearance(24);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Privacy Policy" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: contentBottomPadding },
        ]}
      >
        <View style={styles.contentContainer}>
          <Text style={[styles.text, { color: colors.textSecondary }]}>
            Musika Lokal respects your privacy and is committed to protecting your personal data. When you sign up, we may collect your name, email, phone number, password, and verification details such as uploaded ID, face scan, or profile photo. We also collect information related to wallet transactions, booking history, and derived performance metrics such as your booking completion rate and average response time. We also collect device usage data such as IP address and location if enabled.
          </Text>

          <Text style={[styles.text, { color: colors.textSecondary }]}>
            This data is used to create and manage your account, process bookings and payments, handle cancellations and disputes, verify your identity, prevent fraud, display public reliability scores (such as completion rates) to other users, and improve our services. We do not sell your information to third parties, and it is only shared when necessary with payment processors, ID verification services, other users (limited profile visibility), or legal authorities when required.
          </Text>

          <Text style={[styles.text, { color: colors.textSecondary }]}>
            For booking cancellations, Musika Lokal records the cancellation actor, reason, payment status, and related wallet activity where applicable. Cancelled booking payments are treated as non-refundable according to our Terms and Conditions.
          </Text>

          <Text style={[styles.text, { color: colors.textSecondary }]}>
            All sensitive data is encrypted and stored securely, and we rely on safe servers to protect your information, but you are also responsible for keeping your login credentials private. You have the right to update or delete your account, request removal of your personal data, and opt out of promotional emails.
          </Text>

          <Text style={[styles.text, { color: colors.textSecondary }]}>
            Your data is retained while your account is active or as long as necessary for dispute resolution, legal compliance, or fraud prevention, and once your account is deleted, your data is securely removed or anonymized.
          </Text>

          <Text style={[styles.textLast, { color: colors.textSecondary }]}>
            Musika Lokal may update this Privacy Policy from time to time, and any major changes will be communicated to you through our app or website. By using Musika Lokal, you consent to the collection and use of your data as described here.
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
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  contentContainer: {
    paddingTop: 24,
  },
  text: {
    fontSize: 14,
    lineHeight: 24,
    marginBottom: 16,
    fontFamily: 'Poppins_400Regular',
  },
  textLast: {
    fontSize: 14,
    lineHeight: 24,
    fontFamily: 'Poppins_400Regular',
  },
  navbarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
