import { Ionicons } from '@expo/vector-icons';
import * as ExpoLinking from 'expo-linking';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

// Subscription Plan Type
interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  features: string[];
  duration_days: number;
}

// User Subscription Type
interface Subscription {
  id: string;
  plan_id: string;
  status: 'active' | 'cancelled' | 'expired' | 'pending' | 'past_due';
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  plan?: SubscriptionPlan;
}

export default function WalletScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);
  const [subscriptionModalVisible, setSubscriptionModalVisible] = useState(false);
  const [cancelSubscriptionModalVisible, setCancelSubscriptionModalVisible] = useState(false);

  const [balance, setBalance] = useState(0.00);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [unpaidBookings, setUnpaidBookings] = useState<any[]>([]);
  const [payingBookingId, setPayingBookingId] = useState<string | null>(null);

  // Subscription state
  const [userRole, setUserRole] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  const fetchWallet = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 0. Get User Profile (role)
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      
      if (profile) {
        setUserRole(profile.role);
      }

      // 1. Get Wallet
      let { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (walletError && walletError.code === 'PGRST116') {
        // Create wallet if doesn't exist
        const { data: newWallet, error: createError } = await supabase
          .from('wallets')
          .insert([{ user_id: user.id, balance: 0 }])
          .select()
          .single();

        if (createError) throw createError;
        wallet = newWallet;
      } else if (walletError) {
        throw walletError;
      }

      setBalance(wallet?.balance || 0);

      // 2. Get Transactions
      if (wallet?.id) {
        const { data: txs, error: txError } = await supabase
          .from('wallet_transactions')
          .select('*')
          .eq('wallet_id', wallet.id)
          .order('created_at', { ascending: false });

        if (txError) throw txError;
        setTransactions(txs || []);
      }

      // 3. Get Unpaid Bookings (remaining balance > 0)
      const { data: bookings, error: bookingsError } = await supabase
        .from('studio_bookings')
        .select('*, studio:studios(name, images)')
        .eq('user_id', user.id)
        .gt('remaining_balance', 0)
        .in('status', ['pending', 'confirmed'])
        .order('booking_date', { ascending: true });

      if (!bookingsError && bookings) {
        setUnpaidBookings(bookings);
      }

      // 4. Get Subscription Plans (for studio/venue owners)
      if (profile?.role === 'studio-owner' || profile?.role === 'venue-owner') {
        const { data: plans } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('is_active', true)
          .order('price', { ascending: true });
        
        if (plans) {
          setSubscriptionPlans(plans);
        }

        // 5. Get User's Active Subscription
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('*, plan:subscription_plans(*)')
          .eq('user_id', user.id)
          .single();
        
        if (sub) {
          setSubscription(sub);
        }
      }

    } catch (e) {
      console.log('Error fetching wallet:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Pay remaining balance
  const handlePayBalance = async (booking: any) => {
    try {
      setPayingBookingId(booking.id);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Generate environment-aware redirect URLs (works with Expo Go and production)
      const redirectUrl = ExpoLinking.createURL('payment-result', { 
        queryParams: { status: 'success', booking_id: booking.id } 
      });
      const cancelRedirectUrl = ExpoLinking.createURL('payment-result', { 
        queryParams: { status: 'cancelled', booking_id: booking.id } 
      });

      const { data: paymentData, error: paymentError } = await supabase.functions.invoke('paymongo', {
        body: {
          action: 'create_checkout',
          booking_id: booking.id,
          user_id: user.id,
          amount: booking.remaining_balance,
          total_amount: booking.final_price,
          payment_type: 'balance',
          remaining_balance: 0,
          studio_name: booking.studio?.name,
          booking_date: booking.booking_date,
          description: `Remaining balance for booking at ${booking.studio?.name}`,
          redirect_url: redirectUrl,
          cancel_redirect_url: cancelRedirectUrl
        }
      });

      if (paymentError) {
        Alert.alert('Error', 'Failed to create payment session. Please try again.');
        return;
      }

      if (paymentData?.checkout_url) {
        const canOpen = await Linking.canOpenURL(paymentData.checkout_url);
        if (canOpen) {
          await Linking.openURL(paymentData.checkout_url);
        } else {
          Alert.alert('Error', 'Unable to open payment page.');
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to initiate payment.');
    } finally {
      setPayingBookingId(null);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchWallet();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchWallet();
  };

  const handleWithdraw = () => {
    setModalVisible(false);
    console.log('Withdraw confirmed');
  };

  // Subscribe to a plan
  const handleSubscribe = async (plan: SubscriptionPlan) => {
    try {
      setSubscribing(true);
      setSelectedPlan(plan);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Generate redirect URLs
      const redirectUrl = ExpoLinking.createURL('payment-result', {
        queryParams: { status: 'success', type: 'subscription', plan_id: plan.id }
      });
      const cancelRedirectUrl = ExpoLinking.createURL('payment-result', {
        queryParams: { status: 'cancelled', type: 'subscription' }
      });

      const { data: paymentData, error: paymentError } = await supabase.functions.invoke('paymongo', {
        body: {
          action: 'create_subscription_checkout',
          user_id: user.id,
          plan_id: plan.id,
          amount: plan.price,
          plan_name: plan.name,
          description: `${plan.name} Plan - Monthly Subscription`,
          redirect_url: redirectUrl,
          cancel_redirect_url: cancelRedirectUrl
        }
      });

      if (paymentError) {
        Alert.alert('Error', 'Failed to create subscription. Please try again.');
        return;
      }

      if (paymentData?.checkout_url) {
        const canOpen = await Linking.canOpenURL(paymentData.checkout_url);
        if (canOpen) {
          await Linking.openURL(paymentData.checkout_url);
        } else {
          Alert.alert('Error', 'Unable to open payment page.');
        }
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to initiate subscription.');
    } finally {
      setSubscribing(false);
      setSubscriptionModalVisible(false);
    }
  };

  // Cancel subscription
  const handleCancelSubscription = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !subscription) return;

      const { error } = await supabase
        .from('subscriptions')
        .update({ 
          cancel_at_period_end: true,
          cancelled_at: new Date().toISOString()
        })
        .eq('id', subscription.id);

      if (error) throw error;

      Alert.alert(
        'Subscription Cancelled',
        `Your subscription will remain active until ${new Date(subscription.current_period_end).toLocaleDateString()}.`
      );
      
      setCancelSubscriptionModalVisible(false);
      fetchWallet(); // Refresh data
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to cancel subscription.');
    }
  };

  // Get subscription status badge color
  const getSubscriptionStatusColor = (status: string) => {
    switch (status) {
      case 'active': return { bg: '#DCFCE7', text: '#15803D' };
      case 'cancelled': return { bg: '#FEE2E2', text: '#DC2626' };
      case 'expired': return { bg: '#FEF3C7', text: '#D97706' };
      case 'past_due': return { bg: '#FEE2E2', text: '#DC2626' };
      default: return { bg: '#E5E7EB', text: '#6B7280' };
    }
  };

  // Check if user is studio/venue owner
  const isOwner = userRole === 'studio-owner' || userRole === 'venue-owner';

  return (
    <>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Wallet & Subscription" />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >

          {/* Balance Card */}
          <View style={styles.cardWrapper}>
            <View
              style={[
                styles.balanceCard,
                { backgroundColor: colors.primary }
              ]}
            >
              {/* Background decoration */}
              <View style={styles.decoTopRight} />
              <View style={styles.decoBottomLeft} />

              <Text style={styles.balanceLabel}>Current Balance</Text>
              <Text style={styles.balanceValue}>₱ {balance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>

              <View style={styles.balanceRow}>
                <View>
                  <Text style={styles.balanceSubLabel}>Pending</Text>
                  <Text style={styles.balanceSubValue}>₱ 500.00</Text>
                </View>
                <View style={[styles.balanceDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
                <View>
                  <Text style={styles.balanceSubLabel}>Available</Text>
                  <Text style={styles.balanceSubValue}>₱ {balance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                onPress={() => setModalVisible(true)}
                style={[
                  styles.actionButton,
                  { backgroundColor: colors.surface, borderColor: colors.border }
                ]}
              >
                <Ionicons name="arrow-down-circle-outline" size={20} color={colors.primary} />
                <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>Withdraw</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { backgroundColor: colors.surface, borderColor: colors.border }
                ]}
              >
                <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>Top Up</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Unpaid Balances Section */}
          {unpaidBookings.length > 0 && (
            <View style={styles.cardWrapper}>
              <View style={[styles.unpaidSection, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                <View style={styles.unpaidHeader}>
                  <View style={styles.unpaidHeaderLeft}>
                    <Ionicons name="warning" size={24} color="#DC2626" />
                    <View>
                      <Text style={styles.unpaidTitle}>Outstanding Balance</Text>
                      <Text style={styles.unpaidSubtitle}>
                        {unpaidBookings.length} booking{unpaidBookings.length > 1 ? 's' : ''} with pending payment
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.unpaidTotal}>
                    ₱{unpaidBookings.reduce((sum, b) => sum + (b.remaining_balance || 0), 0).toLocaleString()}
                  </Text>
                </View>

                {/* Unpaid Booking Items */}
                {unpaidBookings.map((booking, index) => (
                  <View 
                    key={booking.id} 
                    style={[
                      styles.unpaidItem,
                      { borderTopWidth: index === 0 ? 1 : 0, borderTopColor: '#FECACA' }
                    ]}
                  >
                    <Image 
                      source={{ uri: booking.studio?.images?.[0] || 'https://picsum.photos/100' }}
                      style={styles.unpaidImage}
                    />
                    <View style={styles.unpaidInfo}>
                      <Text style={styles.unpaidName} numberOfLines={1}>{booking.studio?.name}</Text>
                      <Text style={styles.unpaidDate}>
                        {new Date(booking.booking_date).toLocaleDateString()} • {booking.start_time?.slice(0, 5)}
                      </Text>
                      <Text style={styles.unpaidAmount}>
                        Balance: ₱{booking.remaining_balance?.toLocaleString()}
                      </Text>
                    </View>
                    <TouchableOpacity 
                      onPress={() => handlePayBalance(booking)}
                      disabled={payingBookingId === booking.id}
                      style={styles.payNowBtn}
                    >
                      {payingBookingId === booking.id ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <>
                          <Ionicons name="card" size={16} color="white" />
                          <Text style={styles.payNowText}>Pay Now</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                ))}

                <Text style={styles.unpaidWarning}>
                  ⚠️ Please settle your outstanding balance to continue using the app
                </Text>
              </View>
            </View>
          )}

          {/* Subscription Card */}
          {isOwner && (
            <View style={styles.cardWrapper}>
              {subscription ? (
                // Active Subscription Display
                <View style={[styles.subscriptionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.subscriptionHeader}>
                    <View>
                      <Text style={[styles.subscriptionTitle, { color: colors.text }]}>{subscription.plan?.name || 'Subscription'} Plan</Text>
                      <Text style={[styles.subscriptionDate, { color: colors.textSecondary }]}>
                        {subscription.cancel_at_period_end 
                          ? `Expires on ${new Date(subscription.current_period_end).toLocaleDateString()}`
                          : `Renews on ${new Date(subscription.current_period_end).toLocaleDateString()}`
                        }
                      </Text>
                    </View>
                    <View style={[styles.activeBadge, { backgroundColor: getSubscriptionStatusColor(subscription.status).bg }]}>
                      <Text style={[styles.activeBadgeText, { color: getSubscriptionStatusColor(subscription.status).text }]}>
                        {subscription.cancel_at_period_end ? 'Cancelling' : subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                      </Text>
                    </View>
                  </View>
                  
                  {/* Plan Features */}
                  <View style={styles.featuresContainer}>
                    {(subscription.plan?.features || []).slice(0, 3).map((feature: string, idx: number) => (
                      <View key={idx} style={styles.featureRow}>
                        <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                        <Text style={[styles.featureText, { color: colors.textSecondary }]}>{feature}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.subscriptionActions}>
                    {!subscription.cancel_at_period_end && (
                      <TouchableOpacity 
                        onPress={() => setCancelSubscriptionModalVisible(true)}
                        style={styles.cancelSubBtn}
                      >
                        <Text style={styles.cancelSubText}>Cancel Subscription</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity 
                      onPress={() => setSubscriptionModalVisible(true)}
                      style={styles.manageSubBtn}
                    >
                      <Text style={[styles.manageSubText, { color: colors.primary }]}>Upgrade Plan</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                // No Subscription - Show Subscribe CTA
                <View style={[styles.subscriptionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.noSubContainer}>
                    <View style={[styles.noSubIcon, { backgroundColor: isDark ? colors.primaryLight : '#EEF2FF' }]}>
                      <Ionicons name="diamond-outline" size={32} color={colors.primary} />
                    </View>
                    <Text style={[styles.noSubTitle, { color: colors.text }]}>Unlock Premium Features</Text>
                    <Text style={[styles.noSubDesc, { color: colors.textSecondary }]}>
                      Subscribe to list your {userRole === 'studio-owner' ? 'studios' : 'venues'} and access powerful tools
                    </Text>
                    <TouchableOpacity 
                      onPress={() => setSubscriptionModalVisible(true)}
                      style={[styles.subscribeBtn, { backgroundColor: colors.primary }]}
                    >
                      <Ionicons name="star" size={18} color="white" />
                      <Text style={styles.subscribeBtnText}>View Plans</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Transaction History */}
          <View style={styles.historySection}>
            <Text style={[styles.historyTitle, { color: colors.text }]}>Transaction History</Text>

            <View style={[styles.historyContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {loading ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : transactions.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>No transaction history</Text>
                </View>
              ) : (
                transactions.map((tx, index) => (
                  <View
                    key={tx.id}
                    style={[
                      styles.transactionItem,
                      { borderBottomWidth: index === transactions.length - 1 ? 0 : 1, borderBottomColor: colors.border }
                    ]}
                  >
                    <View style={styles.transactionLeft}>
                      <View
                        style={[
                          styles.transactionIcon,
                          { backgroundColor: tx.is_credit ? '#DCFCE7' : '#FEE2E2' } // green-100 / red-100
                        ]}
                      >
                        <Ionicons
                          name={tx.is_credit ? 'arrow-down' : 'arrow-up'}
                          size={18}
                          color={tx.is_credit ? '#10B981' : '#EF4444'}
                        />
                      </View>
                      <View>
                        <Text style={[styles.transactionType, { color: colors.text }]}>{tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}</Text>
                        <Text style={[styles.transactionDate, { color: colors.textSecondary }]}>
                          {new Date(tx.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.transactionAmount, { color: tx.is_credit ? '#10B981' : '#EF4444' }]}>
                      {tx.is_credit ? '+' : '-'}₱ {tx.amount.toFixed(2)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>

        </ScrollView>
        <View style={styles.navbarContainer}>
          <Navbar />
        </View>
      </View>

      {/* Withdraw Modal */}
      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Withdraw Funds"
        message="Are you sure you want to withdraw your available balance?"
        buttonText="Confirm Withdrawal"
        onConfirm={handleWithdraw}
      />

      {/* Cancel Subscription Modal */}
      <Modal
        visible={cancelSubscriptionModalVisible}
        onClose={() => setCancelSubscriptionModalVisible(false)}
        title="Cancel Subscription"
        message={`Your subscription will remain active until ${subscription ? new Date(subscription.current_period_end).toLocaleDateString() : ''}. After that, you won't be charged again.`}
        buttonText="Cancel Subscription"
        onConfirm={handleCancelSubscription}
      />

      {/* Subscription Plans Modal */}
      {subscriptionModalVisible && (
        <View style={styles.modalOverlay}>
          <View style={[styles.plansModal, { backgroundColor: colors.background }]}>
            <View style={styles.plansModalHeader}>
              <Text style={[styles.plansModalTitle, { color: colors.text }]}>Choose a Plan</Text>
              <TouchableOpacity onPress={() => setSubscriptionModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.plansScrollView} showsVerticalScrollIndicator={false}>
              {subscriptionPlans.map((plan, index) => {
                const isCurrentPlan = subscription?.plan_id === plan.id;
                const isPopular = plan.name === 'Pro';
                
                return (
                  <View 
                    key={plan.id}
                    style={[
                      styles.planCard,
                      { 
                        backgroundColor: colors.card, 
                        borderColor: isPopular ? colors.primary : colors.border,
                        borderWidth: isPopular ? 2 : 1
                      }
                    ]}
                  >
                    {isPopular && (
                      <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
                        <Text style={styles.popularBadgeText}>Most Popular</Text>
                      </View>
                    )}
                    
                    <Text style={[styles.planName, { color: colors.text }]}>{plan.name}</Text>
                    <Text style={[styles.planDescription, { color: colors.textSecondary }]}>{plan.description}</Text>
                    
                    <View style={styles.planPriceRow}>
                      <Text style={[styles.planPrice, { color: colors.text }]}>₱{plan.price}</Text>
                      <Text style={[styles.planPeriod, { color: colors.textSecondary }]}>/month</Text>
                    </View>

                    <View style={styles.planFeatures}>
                      {(plan.features || []).map((feature: string, idx: number) => (
                        <View key={idx} style={styles.planFeatureRow}>
                          <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                          <Text style={[styles.planFeatureText, { color: colors.textSecondary }]}>{feature}</Text>
                        </View>
                      ))}
                    </View>

                    <TouchableOpacity
                      onPress={() => handleSubscribe(plan)}
                      disabled={subscribing || isCurrentPlan}
                      style={[
                        styles.selectPlanBtn,
                        { 
                          backgroundColor: isCurrentPlan ? colors.border : colors.primary,
                          opacity: subscribing ? 0.7 : 1
                        }
                      ]}
                    >
                      {subscribing && selectedPlan?.id === plan.id ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <Text style={styles.selectPlanBtnText}>
                          {isCurrentPlan ? 'Current Plan' : 'Select Plan'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  cardWrapper: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  balanceCard: {
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    overflow: 'hidden',
    position: 'relative',
  },
  decoTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 128,
    height: 128,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    marginTop: -40,
    marginRight: -40,
  },
  decoBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 96,
    height: 96,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    marginLeft: -32,
    marginBottom: -32,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginBottom: 4,
    fontFamily: 'Poppins_500Medium',
  },
  balanceValue: {
    color: 'white',
    fontSize: 36, // text-4xl
    marginBottom: 24,
    fontFamily: 'Poppins_700Bold',
  },
  balanceRow: {
    flexDirection: 'row',
    gap: 16,
  },
  balanceDivider: {
    width: 1,
    height: '100%',
  },
  balanceSubLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12, // text-xs
    fontFamily: 'Poppins_400Regular',
  },
  balanceSubValue: {
    color: 'white',
    fontSize: 18, // text-lg
    fontFamily: 'Poppins_600SemiBold',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
  },
  subscriptionCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  subscriptionTitle: {
    fontSize: 16, // text-base
    fontFamily: 'Poppins_600SemiBold',
  },
  subscriptionDate: {
    fontSize: 12, // text-xs
    fontFamily: 'Poppins_400Regular',
  },
  activeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#DCFCE7', // green-100
  },
  activeBadgeText: {
    fontSize: 12, // text-xs
    color: '#15803D', // green-700
    fontFamily: 'Poppins_600SemiBold',
  },
  manageSubBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  manageSubText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 13,
  },
  historySection: {
    paddingHorizontal: 24,
    marginTop: 32,
  },
  historyTitle: {
    marginBottom: 16,
    fontSize: 16, // text-base
    fontFamily: 'Poppins_600SemiBold',
  },
  historyContainer: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionType: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 14,
  },
  transactionDate: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 12,
  },
  transactionAmount: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
  },
  navbarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  // Unpaid Section Styles
  unpaidSection: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  unpaidHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  unpaidHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  unpaidTitle: {
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    color: '#DC2626',
  },
  unpaidSubtitle: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    color: '#B91C1C',
  },
  unpaidTotal: {
    fontSize: 20,
    fontFamily: 'Poppins_700Bold',
    color: '#DC2626',
  },
  unpaidItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  unpaidImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  unpaidInfo: {
    flex: 1,
  },
  unpaidName: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    color: '#1F2937',
  },
  unpaidDate: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    color: '#6B7280',
  },
  unpaidAmount: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    color: '#DC2626',
  },
  payNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DC2626',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  payNowText: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    color: 'white',
  },
  unpaidWarning: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    color: '#B91C1C',
    textAlign: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#FECACA',
  },
  // Subscription Styles
  featuresContainer: {
    marginTop: 12,
    marginBottom: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  featureText: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
  },
  subscriptionActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  cancelSubBtn: {
    paddingVertical: 8,
  },
  cancelSubText: {
    fontSize: 13,
    fontFamily: 'Poppins_500Medium',
    color: '#DC2626',
  },
  noSubContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  noSubIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  noSubTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 8,
  },
  noSubDesc: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  subscribeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  subscribeBtnText: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
    color: 'white',
  },
  // Plans Modal Styles
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  plansModal: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  plansModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  plansModalTitle: {
    fontSize: 20,
    fontFamily: 'Poppins_600SemiBold',
  },
  plansScrollView: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  planCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomLeftRadius: 12,
  },
  popularBadgeText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    color: 'white',
  },
  planName: {
    fontSize: 20,
    fontFamily: 'Poppins_700Bold',
    marginBottom: 4,
  },
  planDescription: {
    fontSize: 13,
    fontFamily: 'Poppins_400Regular',
    marginBottom: 12,
  },
  planPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  planPrice: {
    fontSize: 32,
    fontFamily: 'Poppins_700Bold',
  },
  planPeriod: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    marginLeft: 4,
  },
  planFeatures: {
    marginBottom: 16,
  },
  planFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  planFeatureText: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    flex: 1,
  },
  selectPlanBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  selectPlanBtnText: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
    color: 'white',
  },
});
