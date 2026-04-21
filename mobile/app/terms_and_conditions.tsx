import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useBottomBarClearance } from '../src/hooks/useBottomBarClearance';
import { useTheme } from '../src/context/ThemeContext';

export default function TermsAndConditionsScreen() {
  const { colors } = useTheme();
  const { contentBottomPadding } = useBottomBarClearance(24);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Terms and Conditions" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: contentBottomPadding },
        ]}
      >
        <View style={styles.contentContainer}>
          <Text style={[styles.headerText, { color: colors.text }]}>
            Welcome to Musika Lokal!
          </Text>

          <Text style={[styles.text, { color: colors.textSecondary }]}>
            This document is a legally binding agreement between you and Musika Lokal. By using our platform, you confirm you are at least 18 years of age.
          </Text>

          {/* 1. BOOKING & PAYMENTS */}
          <Text style={[styles.subHeader, { color: colors.text }]}>
            1. Booking & Payments (Escrow)
          </Text>
          <Text style={[styles.text, { color: colors.textSecondary }]}>
            • All transactions are processed via the Musika Lokal Wallet.{"\n"}
            • Funds are held in escrow and released 48–72 hours after event completion if no dispute is raised.{"\n"}
            • Musika Lokal acts only as a facilitator and is not a party to the actual performance contract.
          </Text>

          {/* 2. CANCELLATION & FORCE MAJEURE */}
          <Text style={[styles.subHeader, { color: colors.text }]}>
            2. Cancellation & Force Majeure
          </Text>
          <Text style={[styles.smallHeader, { color: colors.text }]}>
            Booking Cancellation Policy
          </Text>
          <Text style={[styles.text, { color: colors.textSecondary }]}>
            • All booking cancellations are non-refundable.{"\n"}
            • Any amount already paid (including downpayments and full payments) is forfeited upon cancellation.{"\n"}
            • Forfeited amounts may be credited to the studio/provider wallet based on platform rules.
          </Text>
          <Text style={[styles.smallHeader, { color: colors.text }]}>
            Force Majeure
          </Text>
          <Text style={[styles.text, { color: colors.textSecondary }]}>
            In cases of extreme weather (typhoons), government-mandated lockdowns, or national emergencies, users may request rescheduling. Refunds are still not guaranteed and remain subject to this non-refundable cancellation policy.
          </Text>

          {/* 3. LIMITATION OF LIABILITY */}
          <Text style={[styles.subHeader, { color: colors.text }]}>
            3. Limitation of Liability
          </Text>
          <Text style={[styles.text, { color: colors.textSecondary }]}>
            Musika Lokal is provided "as-is." We are NOT liable for:{"\n"}
            • Personal injury or property damage during a session/event.{"\n"}
            • Technical failures of the GCash, Maya, or banking systems.{"\n"}
            • Loss of income due to app downtime.
          </Text>

          {/* 4. INTELLECTUAL PROPERTY */}
          <Text style={[styles.subHeader, { color: colors.text }]}>
            4. User Content & Intellectual Property
          </Text>
          <Text style={[styles.text, { color: colors.textSecondary }]}>
            You retain ownership of any music or media you upload. However, you grant Musika Lokal a non-exclusive license to display this content on the platform for promotional and operational purposes.
          </Text>

          {/* 5. PROHIBITED CONDUCT */}
          <Text style={[styles.subHeader, { color: colors.text }]}>
            5. Prohibited Conduct
          </Text>
          <Text style={[styles.text, { color: colors.textSecondary }]}>
            Users are strictly prohibited from:{"\n"}
            • Circumventing the platform to pay "under the table."{"\n"}
            • Harassing other users or posting defamatory content.{"\n"}
            • Creating multiple accounts for fraudulent reviews.
          </Text>

          {/* 6. GOVERNING LAW */}
          <Text style={[styles.subHeader, { color: colors.text }]}>
            6. Governing Law
          </Text>
          <Text style={[styles.textLargeMarginBottom, { color: colors.textSecondary }]}>
            These terms are governed by the laws of the Republic of the Philippines. Any legal disputes shall be settled exclusively in the courts of Metro Manila.
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
  container: { flex: 1 },
  scrollContent: { paddingBottom: 24, paddingHorizontal: 24 },
  contentContainer: { paddingTop: 24 },
  headerText: { fontSize: 20, fontWeight: '700', marginBottom: 12, fontFamily: 'Poppins_700Bold' },
  subHeader: { fontSize: 16, fontWeight: '600', marginTop: 20, marginBottom: 8, color: '#333' },
  smallHeader: { fontSize: 14, fontWeight: '600', marginTop: 10, marginBottom: 4 },
  text: { fontSize: 14, lineHeight: 22, marginBottom: 12, fontFamily: 'Poppins_400Regular' },
  textLargeMarginBottom: { fontSize: 14, lineHeight: 22, marginBottom: 40 },
  navbarContainer: { position: 'absolute', bottom: 0, left: 0, right: 0 },
});