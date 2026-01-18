import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
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
      style={[
        styles.row,
        { borderColor: isDark ? colors.border : '#F3F4F6' }
      ]}
      key={label}
    >
      <View style={styles.textContainer}>
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
        trackColor={{ false: isDark ? '#374151' : '#E5E7EB', true: colors.primary + '80' }}
        thumbColor={value ? colors.primary : '#F4F4F5'}
        ios_backgroundColor={isDark ? '#374151' : '#E5E7EB'}
      />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title="Notification Settings" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.contentContainer}>
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
    paddingBottom: 120,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    borderBottomWidth: 1,
  },
  textContainer: {
    flex: 1,
    paddingRight: 16,
  },
  navbarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
