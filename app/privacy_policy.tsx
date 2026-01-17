import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function PrivacyPolicyScreen() {
  const { colors } = useTheme();

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Header title="Privacy Policy" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150, paddingHorizontal: 24 }}>
        <View className="pt-6">
          <Text className="text-sm leading-6 mb-4" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
            Musika Lokal respects your privacy and is committed to protecting your personal data. When you sign up, we may collect your name, email, phone number, password, and verification details such as uploaded ID, face scan, or profile photo. We also collect information related to wallet transactions, booking history, and device usage such as IP address and location if enabled.
          </Text>

          <Text className="text-sm leading-6 mb-4" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
            This data is used to create and manage your account, process bookings and payments, handle cancellations and disputes, verify your identity, prevent fraud, and improve our services. We do not sell your information to third parties, and it is only shared when necessary with payment processors, ID verification services, other users (limited profile visibility), or legal authorities when required.
          </Text>

          <Text className="text-sm leading-6 mb-4" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
            All sensitive data is encrypted and stored securely, and we rely on safe servers to protect your information, but you are also responsible for keeping your login credentials private. You have the right to update or delete your account, request removal of your personal data, and opt out of promotional emails.
          </Text>

          <Text className="text-sm leading-6 mb-4" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
            Your data is retained while your account is active or as long as necessary for dispute resolution, legal compliance, or fraud prevention, and once your account is deleted, your data is securely removed or anonymized.
          </Text>

          <Text className="text-sm leading-6" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
            Musika Lokal may update this Privacy Policy from time to time, and any major changes will be communicated to you through our app or website. By using Musika Lokal, you consent to the collection and use of your data as described here.
          </Text>
        </View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0">
        <Navbar />
      </View>
    </View>
  );
}
