import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';




export default function TermsAndConditionsScreen() {
    const { colors } = useTheme();

    return (
    <View className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
      <Header title="Terms and Conditions"></Header>

      <ScrollView showsVerticalScrollIndicator={false} className="pb-24">
        <View className="pt-6">
          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 18, color: colors.text, marginBottom: 12 }}>
            Welcome to Musika Lokal!
          </Text>
          
          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary, lineHeight: 22, textAlign: 'justify' }}>
            These terms and conditions outline the rules and regulations for using the Musika Lokal platform.
          </Text>

          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary, lineHeight: 22, textAlign: 'justify', marginTop: 12 }}>
            By accessing and using our app or website, you agree to these terms. Do not continue to use Musika Lokal if you do not agree with any part of these conditions.
          </Text>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text, marginTop: 20, marginBottom: 8 }}>
            Booking & Payments
          </Text>

          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary, lineHeight: 22, textAlign: 'justify' }}>
            • All bookings are processed through the Musika Lokal Wallet system.{'\n'}
            • Payments are held in escrow until the event/session is completed or released after 48–72 hours if no dispute is raised.{'\n'}
            • Refunds and penalties follow the cancellation policy below.
          </Text>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text, marginTop: 20, marginBottom: 8 }}>
            Cancellation Policy
          </Text>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginTop: 12, marginBottom: 4 }}>
            Venues & Musicians
          </Text>

          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary, lineHeight: 22, textAlign: 'justify' }}>
            • 7 days before event: 80% refund to client, 20% to performer.{'\n'}
            • 3–7 days before event: 70% refund to client, 30% to performer.{'\n'}
            • {'<'}3 days or same day: 100% to performer.
          </Text>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginTop: 12, marginBottom: 4 }}>
            Studios & Musicians
          </Text>

          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary, lineHeight: 22, textAlign: 'justify' }}>
            Studio cancels:{'\n'}
            • 100% refund to musician (120% if cancelled same day).
          </Text>

          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary, lineHeight: 22, textAlign: 'justify', marginTop: 8 }}>
            Musician cancels:{'\n'}
            • 3 days: 100% refund.{'\n'}
            • 1–3 days: 70% refund, 30% to studio.{'\n'}
            • {'<'}24 hours: No refund.
          </Text>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text, marginTop: 20, marginBottom: 8 }}>
            Wallet & Withdrawals
          </Text>

          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary, lineHeight: 22, textAlign: 'justify' }}>
            • Funds remain in Pending Balance until released.{'\n'}
            • Available Balance can be withdrawn to GCash, Maya, or Bank Transfer.{'\n'}
            • Transaction fees may apply depending on payment method.
          </Text>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text, marginTop: 20, marginBottom: 8 }}>
            Disputes
          </Text>

          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary, lineHeight: 22, textAlign: 'justify' }}>
            • Proof may be requested (attendance check-in, real-time evidence).{'\n'}
            • Musika Lokal reserves the right to decide outcomes fairly.
          </Text>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text, marginTop: 20, marginBottom: 8 }}>
            Completion Rate
          </Text>

          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary, lineHeight: 22, textAlign: 'justify', marginBottom: 20 }}>
            • Cancellations affect your completion rate.{'\n'}
            • Repeated cancellations may reduce bookings or lead to account suspension.
          </Text>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar/>
      </View>
    </View>
    
    );
}
