import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useAuth } from '../src/context/AuthContext';
import { showTopToast } from '../src/context/TopToastContext';
import { useTheme } from '../src/context/ThemeContext';

const DEFAULT_PREFERENCES = {
  booking_confirmed: true,
  awaiting_confirmation: true,
  upload_required: false,
  event_reminder: true,
  leave_review: false,
};

type PreferenceKey = keyof typeof DEFAULT_PREFERENCES;

type PreferenceOption = {
  key: PreferenceKey;
  label: string;
  description: string;
};

const PREFERENCE_OPTIONS: PreferenceOption[] = [
  {
    key: 'booking_confirmed',
    label: 'Booking Confirmed',
    description: 'Receive updates when your booking at a venue or studio is confirmed.',
  },
  {
    key: 'awaiting_confirmation',
    label: 'Awaiting Confirmation',
    description: 'Get notified when your booking is pending approval from the host.',
  },
  {
    key: 'upload_required',
    label: 'Upload Required',
    description: 'Reminders to upload necessary documents or proof for your events.',
  },
  {
    key: 'event_reminder',
    label: 'Event Reminder',
    description: 'Receive reminders before your scheduled events or sessions start.',
  },
  {
    key: 'leave_review',
    label: 'Leave a Review',
    description: 'Get prompts to rate and review your experience after a booking.',
  },
];

export default function NotificationSettingsScreen() {
  const { colors, isDark } = useTheme();
  const { isGuest } = useAuth();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<PreferenceKey | null>(null);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);

  const loadPreferences = useCallback(async () => {
    if (isGuest) {
      setLoading(false);
      setUserId(null);
      setPreferences(DEFAULT_PREFERENCES);
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setUserId(null);
        setPreferences(DEFAULT_PREFERENCES);
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('booking_confirmed, awaiting_confirmation, upload_required, event_reminder, leave_review')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        const { error: insertError } = await supabase
          .from('notification_preferences')
          .insert({
            user_id: user.id,
            ...DEFAULT_PREFERENCES,
          });

        if (insertError) {
          throw insertError;
        }

        setPreferences(DEFAULT_PREFERENCES);
        return;
      }

      setPreferences({
        booking_confirmed: data.booking_confirmed ?? DEFAULT_PREFERENCES.booking_confirmed,
        awaiting_confirmation: data.awaiting_confirmation ?? DEFAULT_PREFERENCES.awaiting_confirmation,
        upload_required: data.upload_required ?? DEFAULT_PREFERENCES.upload_required,
        event_reminder: data.event_reminder ?? DEFAULT_PREFERENCES.event_reminder,
        leave_review: data.leave_review ?? DEFAULT_PREFERENCES.leave_review,
      });
    } catch (e: any) {
      console.error('Error initializing notification settings:', e);
      showTopToast({
        type: 'error',
        title: 'Unable to Load Preferences',
        message: e?.message || 'Please try again later.',
      });
    } finally {
      setLoading(false);
    }
  }, [isGuest]);

  useFocusEffect(
    useCallback(() => {
      loadPreferences();
    }, [loadPreferences])
  );

  const savePreference = async (field: PreferenceKey, value: boolean) => {
    if (!userId) return false;

    setSavingField(field);

    try {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({ user_id: userId, [field]: value }, { onConflict: 'user_id' });

      if (error) {
        throw error;
      }

      showTopToast({
        type: 'success',
        title: 'Preference Updated',
        message: 'Your notification preference has been saved.',
        duration: 1600,
      });
      return true;
    } catch (e: any) {
      console.error(`Error saving ${field}:`, e);
      showTopToast({
        type: 'error',
        title: 'Save Failed',
        message: e?.message || 'Could not save notification preference.',
      });
      return false;
    } finally {
      setSavingField(null);
    }
  };

  const handleToggle = (field: PreferenceKey) => async (value: boolean) => {
    if (!userId || savingField) return;

    const previousValue = preferences[field];
    setPreferences((prev) => ({ ...prev, [field]: value }));

    const saved = await savePreference(field, value);
    if (!saved) {
      setPreferences((prev) => ({ ...prev, [field]: previousValue }));
    }
  };

  const renderToggle = (
    option: PreferenceOption,
    value: boolean,
    onValueChange: (val: boolean) => void
  ) => (
    <View
      style={[
        styles.row,
        { borderColor: isDark ? colors.border : '#F3F4F6' }
      ]}
      key={option.key}
    >
      <View style={styles.textContainer}>
        <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15, color: colors.text }}>
          {option.label}
        </Text>
        <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary, marginTop: 4, lineHeight: 20 }}>
          {option.description}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={loading || !userId || !!savingField}
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
            <View style={styles.centeredState}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 12 }}>
                Loading notification settings...
              </Text>
            </View>
          ) : isGuest || !userId ? (
            <View style={[styles.guestCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="notifications-off-outline" size={26} color={colors.textSecondary} />
              <Text style={[styles.guestTitle, { color: colors.text }]}>Sign in required</Text>
              <Text style={[styles.guestMessage, { color: colors.textSecondary }]}>Sign in to manage your notification preferences.</Text>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => router.replace('/')}
                style={[styles.signInButton, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.signInButtonText}>Go to Sign In</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {PREFERENCE_OPTIONS.map((option) =>
                renderToggle(option, preferences[option.key], handleToggle(option.key))
              )}

              {savingField ? (
                <View style={styles.savingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.savingText, { color: colors.textSecondary }]}>Saving changes...</Text>
                </View>
              ) : null}
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
  centeredState: {
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestCard: {
    marginTop: 20,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 20,
    alignItems: 'center',
  },
  guestTitle: {
    marginTop: 10,
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  guestMessage: {
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
  },
  signInButton: {
    marginTop: 14,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  signInButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
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
  savingRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingText: {
    marginLeft: 8,
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  navbarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});
