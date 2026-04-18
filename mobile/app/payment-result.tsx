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
  const params = useLocalSearchParams<{ status?: string; booking_id?: string; type?: string; plan_id?: string; amount?: string; checkout_id?: string }>();
  const [loading, setLoading] = useState(true);
  const [bookingDetails, setBookingDetails] = useState<any>(null);
  const [subscriptionDetails, setSubscriptionDetails] = useState<any>(null);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [depositAmount, setDepositAmount] = useState<number | null>(null);

  const paymentStatus = params.status || 'pending';
  const isSuccess = paymentStatus === 'success';
  const isCancelled = paymentStatus === 'cancelled';
  const isSubscription = params.type === 'subscription';
  const isDeposit = params.type === 'deposit';

  useEffect(() => {
    const fetchDetails = async () => {
      if (isSubscription && params.plan_id) {
        // Fetch subscription plan details
        // NOTE: Subscription creation/update is handled by the Edge Function (subscription_success)
        // using supabaseAdmin to bypass RLS. Client only fetches display data.
        try {
          const { data, error } = await supabase
            .from('subscription_plans')
            .select('*')
            .eq('id', params.plan_id)
            .single();

          if (data && !error) {
            setSubscriptionDetails(data);
          }

          // If payment callback is not cancelled, poll until subscription activation is visible.
          // The Edge Function already handled activating the subscription with admin privileges.
          // However, there might be a slight delay. We'll poll a few times to ensure we get the latest status.
          if (!isCancelled) {
            console.log('✅ Subscription callback received - polling for active status...');

            // Polling loop
            const maxRetries = 5;
            let retries = 0;
            let isActive = false;

            while (retries < maxRetries && !isActive) {
              console.log(`🔄 Polling subscription status (Attempt ${retries + 1}/${maxRetries})...`);

              if (checkSubscription) {
                await checkSubscription();
              }

              // Check if it's updated in the database directly to be sure
              const { data: profile } = await supabase
                .from('profiles')
                .select('subscription_status')
                .eq('id', (await supabase.auth.getUser()).data.user?.id)
                .single();

              if (profile?.subscription_status === 'active') {
                console.log('✅ Polling confirmed active subscription!');
                isActive = true;
                setSubscriptionActive(true);
                // Force one last update to context
                if (checkSubscription) await checkSubscription();
                break;
              }

              // Wait 1.5 seconds before next retry
              await new Promise(resolve => setTimeout(resolve, 1500));
              retries++;
            }

            if (!isActive) {
              setSubscriptionActive(false);
              console.log('⚠️ Polling finished but status might still be pending. User can refresh manually.');
            }
          }
        } catch (e) {
          console.error('Error fetching subscription plan:', e);
        }
      } else if (isDeposit) {
        // Wallet top-up
        if (isSuccess && params.checkout_id) {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              await supabase.functions.invoke('paymongo', {
                body: { action: 'check_deposit', checkout_id: params.checkout_id, user_id: user.id }
              });
            }
          } catch (e) {
            console.error('Error confirming deposit:', e);
          }
        }
        const amt = parseFloat(params.amount || '0');
        if (amt > 0) setDepositAmount(amt);
      } else if (params.booking_id) {
        try {
          if (isSuccess) {
            const maxRetries = 4;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
              const { data: checkData, error: checkError } = await supabase.functions.invoke('paymongo', {
                body: {
                  action: 'check_payment',
                  booking_id: params.booking_id
                }
              });

              if (checkError) {
                console.error('Error checking payment status:', checkError);
              }

              if (checkData?.payment_status === 'paid' || checkData?.payment_status === 'partial') {
                break;
              }

              await new Promise(resolve => setTimeout(resolve, 1200 * attempt));
            }
          }

          const { data, error } = await supabase
            .from('studio_bookings')
            .select(`
              id,
              booking_date,
              payment_status,
              status,
              final_price,
              remaining_balance,
              payment_type,
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
  }, [params.booking_id, params.plan_id, params.checkout_id, isSubscription, isDeposit, isSuccess, isCancelled]);

  const handleGoToBookings = () => {
    // After a downpayment, the booking stays in Pending (balance still due); full payment → Upcoming
    const isPartialPayment = bookingDetails?.payment_type === 'downpayment' && (bookingDetails?.remaining_balance || 0) > 0;
    const tab = isSuccess ? (isPartialPayment ? 'Pending' : 'Upcoming') : 'Pending';
    router.replace({
      pathname: '/bookings',
      params: {
        tab,
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

  const subscriptionState = isSubscription
    ? (isCancelled ? 'cancelled' : (subscriptionActive ? 'active' : 'processing'))
    : isDeposit
      ? (isSuccess ? 'success' : 'cancelled')
      : (isSuccess ? 'success' : 'cancelled');

  const statusColor = subscriptionState === 'cancelled'
    ? '#EF4444'
    : subscriptionState === 'processing'
      ? '#F59E0B'
      : '#10B981';

  const statusIcon = subscriptionState === 'cancelled'
    ? 'close-circle'
    : subscriptionState === 'processing'
      ? 'time'
      : 'checkmark-circle';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        {/* Status Icon */}
        <View style={[
          styles.iconContainer,
          { backgroundColor: statusColor }
        ]}>
          <Ionicons
            name={statusIcon as any}
            size={64}
            color="white"
          />
        </View>

        {/* Status Title */}
        <Text style={[styles.title, { color: colors.text }]}>
          {isSubscription
            ? (subscriptionState === 'active'
              ? 'Subscription Activated!'
              : subscriptionState === 'processing'
                ? 'Subscription Processing'
                : 'Subscription Cancelled')
            : isDeposit
              ? (isSuccess ? 'Wallet Topped Up!' : 'Top-Up Cancelled')
              : (isSuccess ? 'Payment Successful!' : 'Payment Cancelled')}
        </Text>

        {/* Status Description */}
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {isSubscription
            ? (subscriptionState === 'active'
              ? `Your ${subscriptionDetails?.name || 'subscription'} is now active! Enjoy all the premium features.`
              : subscriptionState === 'processing'
                ? 'Your payment was received. We are finalizing activation in the background. Please wait a moment, then check your wallet.'
                : 'Your subscription was cancelled. You can subscribe anytime from your Wallet & Subscription page.')
            : isDeposit
              ? (isSuccess
                ? `₱${depositAmount?.toLocaleString() || params.amount || '0'} has been added to your wallet.`
                : 'Top-up was cancelled. Your wallet balance was not changed.')
              : (isSuccess
                ? (bookingDetails?.payment_status === 'partial' || (bookingDetails?.payment_type === 'downpayment' && bookingDetails?.remaining_balance > 0)
                  ? `Downpayment received! Your booking is confirmed. Remaining balance: ₱${bookingDetails?.remaining_balance?.toLocaleString() || 0}`
                  : 'Your studio booking has been confirmed and moved to Upcoming bookings.')
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
                {
                  backgroundColor:
                    subscriptionState === 'active'
                      ? '#10B98120'
                      : subscriptionState === 'processing'
                        ? '#F59E0B20'
                        : '#EF444420'
                }
              ]}>
                <Text style={[
                  styles.statusText,
                  {
                    color:
                      subscriptionState === 'active'
                        ? '#10B981'
                        : subscriptionState === 'processing'
                          ? '#F59E0B'
                          : '#EF4444'
                  }
                ]}>
                  {subscriptionState === 'active'
                    ? 'Active'
                    : subscriptionState === 'processing'
                      ? 'Processing'
                      : 'Cancelled'}
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
          {isDeposit ? (
            <>
              <TouchableOpacity activeOpacity={1}
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                onPress={handleGoToWallet}
              >
                <Ionicons name="wallet" size={20} color="white" />
                <Text style={styles.primaryButtonText}>View Wallet</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={1}
                style={[styles.secondaryButton, { borderColor: colors.primary }]}
                onPress={() => router.replace('/home')}
              >
                <Ionicons name="home" size={20} color={colors.primary} />
                <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>Go to Home</Text>
              </TouchableOpacity>
            </>
          ) : isSubscription ? (
            <>
              <TouchableOpacity activeOpacity={1}
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                onPress={handleGoToWallet}
              >
                <Ionicons name="wallet" size={20} color="white" />
                <Text style={styles.primaryButtonText}>
                  View Wallet & Subscription
                </Text>
              </TouchableOpacity>

              <TouchableOpacity activeOpacity={1}
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
              <TouchableOpacity activeOpacity={1}
                style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                onPress={handleGoToBookings}
              >
                <Ionicons name="calendar" size={20} color="white" />
                <Text style={styles.primaryButtonText}>
                  {isSuccess
                    ? (bookingDetails?.payment_type === 'downpayment' && (bookingDetails?.remaining_balance || 0) > 0
                        ? 'View Pending Bookings'
                        : 'View Upcoming Bookings')
                    : 'View Pending Bookings'}
                </Text>
              </TouchableOpacity>

              {!isSuccess && (
                <TouchableOpacity activeOpacity={1}
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
