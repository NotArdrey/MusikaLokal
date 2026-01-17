import React, { useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function NotificationSettingsScreen() {
  const { colors, isDark } = useTheme();
  const [bookingConfirmed, setBookingConfirmed] = useState(true);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(true);
  const [uploadRequired, setUploadRequired] = useState(false);
  const [eventReminder, setEventReminder] = useState(true);
  const [leaveReview, setLeaveReview] = useState(false);

  const renderToggle = (label: string, description: string, value: boolean, onValueChange: (val: boolean) => void) => (
    <View
      className="flex-row items-center justify-between py-5 border-b"
      style={{ borderColor: isDark ? colors.border : '#F3F4F6' }}
      key={label}
    >
      <View className="flex-1 pr-4">
        <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>
          {label}
        </Text>
        <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 20 }}>
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: isDark ? '#374151' : '#E5E7EB', true: colors.primary + '80' }} // Adding opacity to track for iOS/Android consistency
        thumbColor={value ? colors.primary : '#F4F4F5'}
        ios_backgroundColor={isDark ? '#374151' : '#E5E7EB'}
      />
    </View>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Header title="Notification Settings" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="px-6 pt-2">
          {renderToggle(
            "Booking Confirmed",
            "Receive updates when your booking at a venue or studio is confirmed.",
            bookingConfirmed,
            setBookingConfirmed
          )}
          {renderToggle(
            "Awaiting Confirmation",
            "Get notified when your booking is pending approval from the host.",
            awaitingConfirmation,
            setAwaitingConfirmation
          )}
          {renderToggle(
            "Upload Required",
            "Reminders to upload necessary documents or proof for your events.",
            uploadRequired,
            setUploadRequired
          )}
          {renderToggle(
            "Event Reminder",
            "Receive reminders before your scheduled events or sessions start.",
            eventReminder,
            setEventReminder
          )}
          {renderToggle(
            "Leave a Review",
            "Get prompts to rate and review your experience after a booking.",
            leaveReview,
            setLeaveReview
          )}
        </View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0">
        <Navbar />
      </View>
    </View>
  );
}
