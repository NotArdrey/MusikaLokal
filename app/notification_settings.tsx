import React, { useState } from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';




export default function NotificationSettingsScreen() {
    const { colors } = useTheme();
    const [bookingConfirmed, setBookingConfirmed] = useState(true);
    const [awaitingConfirmation, setAwaitingConfirmation] = useState(true);
    const [uploadRequired, setUploadRequired] = useState(false);
    const [eventReminder, setEventReminder] = useState(true);
    const [leaveReview, setLeaveReview] = useState(false);

    return (
    <View className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
      <Header title="Notification Settings"></Header>

      <ScrollView showsVerticalScrollIndicator={false} className="pb-24">
        <View className="pt-6">
          <View className="flex-row items-center justify-between py-4 border-b border-gray-200">
            <View className="flex-1 pr-4">
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>
                Booking Confirmed
              </Text>
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                Your booking at The Jazz Club is confirmed.
              </Text>
            </View>
            <Switch
              value={bookingConfirmed}
              onValueChange={setBookingConfirmed}
              trackColor={{ false: '#D1D5DB', true: '#86EFAC' }}
              thumbColor={bookingConfirmed ? '#22C55E' : '#F3F4F6'}
            />
          </View>

          <View className="flex-row items-center justify-between py-4 border-b border-gray-200">
            <View className="flex-1 pr-4">
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>
                Awaiting Confirmation
              </Text>
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                Your booking at The Blue Note is pending approval.
              </Text>
            </View>
            <Switch
              value={awaitingConfirmation}
              onValueChange={setAwaitingConfirmation}
              trackColor={{ false: '#D1D5DB', true: '#86EFAC' }}
              thumbColor={awaitingConfirmation ? '#22C55E' : '#F3F4F6'}
            />
          </View>

          <View className="flex-row items-center justify-between py-4 border-b border-gray-200">
            <View className="flex-1 pr-4">
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>
                Upload Required
              </Text>
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                Please upload your proof picture for Summer Music Fest.
              </Text>
            </View>
            <Switch
              value={uploadRequired}
              onValueChange={setUploadRequired}
              trackColor={{ false: '#D1D5DB', true: '#86EFAC' }}
              thumbColor={uploadRequired ? '#22C55E' : '#F3F4F6'}
            />
          </View>

          <View className="flex-row items-center justify-between py-4 border-b border-gray-200">
            <View className="flex-1 pr-4">
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>
                Event Reminder
              </Text>
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                Indie Rock Night starts at 8:00 PM.
              </Text>
            </View>
            <Switch
              value={eventReminder}
              onValueChange={setEventReminder}
              trackColor={{ false: '#D1D5DB', true: '#86EFAC' }}
              thumbColor={eventReminder ? '#22C55E' : '#F3F4F6'}
            />
          </View>

          <View className="flex-row items-center justify-between py-4 border-b border-gray-200">
            <View className="flex-1 pr-4">
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>
                Leave a Review
              </Text>
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                Share feedback for The Acoustic Lounge.
              </Text>
            </View>
            <Switch
              value={leaveReview}
              onValueChange={setLeaveReview}
              trackColor={{ false: '#D1D5DB', true: '#86EFAC' }}
              thumbColor={leaveReview ? '#22C55E' : '#F3F4F6'}
            />
          </View>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar/>
      </View>
    </View>
    
    );
}
