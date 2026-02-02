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

export default function WalletScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);

  const [balance, setBalance] = useState(0.00);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [unpaidBookings, setUnpaidBookings] = useState<any[]>([]);
  const [payingBookingId, setPayingBookingId] = useState<string | null>(null);

  const fetchWallet = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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

  return (
    <>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Wallet" />

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
          <View style={styles.cardWrapper}>
            <View style={[styles.subscriptionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.subscriptionHeader}>
                <View>
                  <Text style={[styles.subscriptionTitle, { color: colors.text }]}>Premium Plan</Text>
                  <Text style={[styles.subscriptionDate, { color: colors.textSecondary }]}>Renews on July 15, 2024</Text>
                </View>
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>Active</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.manageSubBtn}>
                <Text style={[styles.manageSubText, { color: colors.primary }]}>Manage Subscription</Text>
              </TouchableOpacity>
            </View>
          </View>

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

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Withdraw Funds"
        message="Are you sure you want to withdraw your available balance?"
        buttonText="Confirm Withdrawal"
        onConfirm={handleWithdraw}
      />
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
});
