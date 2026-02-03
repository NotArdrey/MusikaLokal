import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

export default function PaymentResultScreen() {
  const { colors } = useTheme();
  const { checkSubscription } = useAuth();
  const params = useLocalSearchParams<{ status?: string; booking_id?: string; type?: string; plan_id?: string }>();
  const [loading, setLoading] = useState(true);
  const [bookingDetails, setBookingDetails] = useState<any>(null);
  const [subscriptionDetails, setSubscriptionDetails] = useState<any>(null);

  const isSuccess = params.status === 'success';
  const isSubscription = params.type === 'subscription';

  useEffect(() => {
    const fetchDetails = async () => {
      if (isSubscription && params.plan_id) {
        // Fetch subscription plan details
        try {
          const { data, error } = await supabase
            .from('subscription_plans')
            .select('*')
            .eq('id', params.plan_id)
            .single();

          if (data && !error) {
            setSubscriptionDetails(data);
          }

          // If subscription payment was successful, refresh subscription status
          if (isSuccess && checkSubscription) {
            await checkSubscription();
          }
        } catch (e) {
          console.error('Error fetching subscription plan:', e);
        }
      } else if (params.booking_id) {
        try {
          const { data, error } = await supabase
            .from('studio_bookings')
            .select(`
              id,
              booking_date,
              payment_status,
              status,
              final_price,
              studio:studios(name)
            `)
            .eq('id', params.booking_id)
            .single();

          if (data && !error) {
            setBookingDetails(data);
          }
        } catch (e) {
          console.error('Error fetching booking:', e);
        }
      }
      setLoading(false);
    };

    fetchDetails();
  }, [params.booking_id, params.plan_id, isSubscription]);

  const handleGoToBookings = () => {
    router.replace({
      pathname: '/bookings',
      params: {
        tab: isSuccess ? 'Upcoming' : 'Pending',
        payment_result: params.status,
        booking_id: params.booking_id
      }
    });
  };

  const handleGoToWallet = () => {
    router.replace('/wallet');
  };

  const handleRetryPayment = async () => {
    if (params.booking_id) {
      router.replace({
        pathname: '/bookings',
        params: {
          tab: 'Pending',
          retry_payment: params.booking_id
        }
      });
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Processing payment result...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        {/* Status Icon */}
        <View style={[
          styles.iconContainer,
          { backgroundColor: isSuccess ? '#10B981' : '#EF4444' }
        ]}>
          <Ionicons
            name={isSuccess ? 'checkmark-circle' : 'close-circle'}
            size={64}
            color="white"
          />
        </View>

        {/* Status Title */}
        <Text style={[styles.title, { color: colors.text }]}>
          {isSuccess 
            ? (isSubscription ? 'Subscription Activated!' : 'Payment Successful!') 
            : (isSubscription ? 'Subscription Cancelled' : 'Payment Cancelled')}
        </Text>

        {/* Status Description */}
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {isSuccess
            ? (isSubscription 
                ? `Your ${subscriptionDetails?.name || 'subscription'} is now active! Enjoy all the premium features.`
                : 'Your studio booking has been confirmed and moved to Upcoming bookings.')
            : (isSubscription
                ? 'Your subscription was cancelled. You can subscribe anytime from your Wallet & Subscription page.'
                : 'Your payment was cancelled. The booking is still in Pending - you can try again anytime.')}
        </Text>

        {/* Subscription Details */}
        {isSubscription && subscriptionDetails && (
          <View style={[styles.detailsContainer, { backgroundColor: colors.background }]}>
            <Text style={[styles.detailsTitle, { color: colors.text }]}>
              Subscription Details
            </Text>
            
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Plan</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                {subscriptionDetails.name}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Price</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                ₱{subscriptionDetails.price?.toLocaleString() || '0'}/month
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Duration</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                {subscriptionDetails.duration_days} days
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Status</Text>
              <View style={[
                styles.statusBadge,
                { backgroundColor: isSuccess ? '#10B98120' : '#EF444420' }
              ]}>
                <Text style={[
                  styles.statusText,
                  { color: isSuccess ? '#10B981' : '#EF4444' }
                ]}>
                  {isSuccess ? 'Active' : 'Cancelled'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Booking Details */}
        {!isSubscription && bookingDetails && (
          <View style={[styles.detailsContainer, { backgroundColor: colors.background }]}>
            <Text style={[styles.detailsTitle, { color: colors.text }]}>
              Booking Details
            </Text>
            
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Studio</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                {bookingDetails.studio?.name || 'Studio'}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Date</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                {bookingDetails.booking_date}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Amount</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>
                ₱{bookingDetails.final_price?.toLocaleString() || '0'}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Status</Text>
              <View style={[
                styles.statusBadge,
                { backgroundColor: isSuccess ? '#10B98120' : '#F59E0B20' }
              ]}>
                <Text style={[
                  styles.statusText,
                  { color: isSuccess ? '#10B981' : '#F59E0B' }
                ]}>
                  {isSuccess ? 'Confirmed' : 'Pending Payment'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonsContainer}>
          {isSubscription ? (
            <>
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                onPress={handleGoToWallet}
              >
                <Ionicons name="wallet" size={20} color="white" />
                <Text style={styles.primaryButtonText}>
                  View Wallet & Subscription
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: colors.primary }]}
                onPress={() => router.replace('/home')}
              >
                <Ionicons name="home" size={20} color={colors.primary} />
                <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
                  Go to Home
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                onPress={handleGoToBookings}
              >
                <Ionicons name="calendar" size={20} color="white" />
                <Text style={styles.primaryButtonText}>
                  {isSuccess ? 'View Upcoming Bookings' : 'View Pending Bookings'}
                </Text>
              </TouchableOpacity>

              {!isSuccess && (
                <TouchableOpacity
                  style={[styles.secondaryButton, { borderColor: colors.primary }]}
                  onPress={handleRetryPayment}
                >
                  <Ionicons name="refresh" size={20} color={colors.primary} />
                  <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
                    Retry Payment
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  detailsContainer: {
    width: '100%',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  buttonsContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
