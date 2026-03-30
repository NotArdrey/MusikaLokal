import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function NotificationSettingsScreen() {
  const { colors, isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [bookingConfirmed, setBookingConfirmed] = useState(true);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(true);
  const [uploadRequired, setUploadRequired] = useState(false);
  const [eventReminder, setEventReminder] = useState(true);
  const [leaveReview, setLeaveReview] = useState(false);

  React.useEffect(() => {
    const loadPreferences = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setLoading(false);
          return;
        }

        setUserId(user.id);

        const { data, error } = await supabase
          .from('notification_preferences')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error loading notification preferences:', error);
          setLoading(false);
          return;
        }

        if (!data) {
          const { error: insertError } = await supabase
            .from('notification_preferences')
            .insert({ user_id: user.id });

          if (insertError) {
            console.error('Error creating default notification preferences:', insertError);
          }
        } else {
          setBookingConfirmed(data.booking_confirmed ?? true);
          setAwaitingConfirmation(data.awaiting_confirmation ?? true);
          setUploadRequired(data.upload_required ?? false);
          setEventReminder(data.event_reminder ?? true);
          setLeaveReview(data.leave_review ?? false);
        }
      } catch (e) {
        console.error('Error initializing notification settings:', e);
      } finally {
        setLoading(false);
      }
    };

    loadPreferences();
  }, []);

  const savePreference = async (field: string, value: boolean) => {
    if (!userId) return;

    const { error } = await supabase
      .from('notification_preferences')
      .upsert({ user_id: userId, [field]: value }, { onConflict: 'user_id' });

    if (error) {
      console.error(`Error saving ${field}:`, error);
    }
  };

  const handleToggle = (
    setter: (value: boolean) => void,
    field: string,
  ) => (value: boolean) => {
    setter(value);
    void savePreference(field, value);
  };

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
          {loading ? (
            <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 24 }}>
              Loading notification settings...
            </Text>
          ) : (
            <>
          {renderToggle(
            "Booking Confirmed",
            "Receive updates when your booking at a venue or studio is confirmed.",
            bookingConfirmed,
            handleToggle(setBookingConfirmed, 'booking_confirmed')
          )}
          {renderToggle(
            "Awaiting Confirmation",
            "Get notified when your booking is pending approval from the host.",
            awaitingConfirmation,
            handleToggle(setAwaitingConfirmation, 'awaiting_confirmation')
          )}
          {renderToggle(
            "Upload Required",
            "Reminders to upload necessary documents or proof for your events.",
            uploadRequired,
            handleToggle(setUploadRequired, 'upload_required')
          )}
          {renderToggle(
            "Event Reminder",
            "Receive reminders before your scheduled events or sessions start.",
            eventReminder,
            handleToggle(setEventReminder, 'event_reminder')
          )}
          {renderToggle(
            "Leave a Review",
            "Get prompts to rate and review your experience after a booking.",
            leaveReview,
            handleToggle(setLeaveReview, 'leave_review')
          )}
            </>
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
