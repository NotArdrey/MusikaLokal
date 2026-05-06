import { Ionicons } from '@expo/vector-icons';
import * as ExpoLinking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import BottomModal from '../src/components/BottomModal';
import GuestSignInGate from '../src/components/GuestSignInGate';
import Header from '../src/components/header';
import CustomModal from '../src/components/modal';
import AppNavbar from '../src/components/navbar';
import { useBottomBarClearance } from '../src/hooks/useBottomBarClearance';
import { emitToast } from '../src/events/toastBus';
import { useTheme } from '../src/context/ThemeContext';
import { useAuth } from '../src/context/AuthContext';
import { useWalletSummaryQuery } from '../src/data/hooks';
import { formatFriendlyDateTime } from '../src/utils/friendlyDateTime';
import { usePageLoadLogger } from '../src/utils/loadTimeLogger';

// Payout Method Type
interface PayoutMethod {
  id: string;
  type: 'bank' | 'gcash' | 'maya' | 'paypal';
  account_name: string;
  account_number: string;
  bank_name?: string;
  is_default: boolean;
}

// Withdrawal Request Type
interface WithdrawalRequest {
  id: string;
  amount: number;
  fee: number;
  net_amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  payout_type: string;
  payout_account_name: string;
  payout_account_number: string;
  payout_bank_name?: string;
  created_at: string;
}

interface WithdrawalErrorPayload {
  error?: string;
  error_code?: string;
  next_steps?: string[];
  suggestion?: string;
}

export default function WalletScreen() {
  const { colors, isDark } = useTheme();
  const { userId, isGuest } = useAuth();
  const { contentBottomPadding } = useBottomBarClearance(24);
  const params = useLocalSearchParams<{ refresh?: string }>();
  const walletRefreshKey = Array.isArray(params.refresh) ? params.refresh[0] : params.refresh;

  // Withdrawal modal states
  const [withdrawModalVisible, setWithdrawModalVisible] = useState(false);
  const [addPayoutModalVisible, setAddPayoutModalVisible] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [selectedPayoutMethod, setSelectedPayoutMethod] = useState<PayoutMethod | null>(null);
  const [payoutMethods, setPayoutMethods] = useState<PayoutMethod[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [withdrawing, setWithdrawing] = useState(false);
  const [loadingPayoutMethods, setLoadingPayoutMethods] = useState(false);

  // Add payout method states
  const [newPayoutType, setNewPayoutType] = useState<'bank' | 'gcash' | 'maya'>('gcash');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [newBankName, setNewBankName] = useState('');
  const [addingPayoutMethod, setAddingPayoutMethod] = useState(false);

  const [balance, setBalance] = useState(0.00);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [txFilter, setTxFilter] = useState<string>("all");
  const [unpaidBookings, setUnpaidBookings] = useState<any[]>([]);
  const [payingBookingId, setPayingBookingId] = useState<string | null>(null);

  // Top-up state
  const [topUpModalVisible, setTopUpModalVisible] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [isTopping, setIsTopping] = useState(false);

  const [userRole, setUserRole] = useState<string | null>(null);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    type: AlertType;
    title: string;
    message: string;
    buttons?: any[];
  }>({
    type: 'info',
    title: '',
    message: '',
  });
  const walletSummaryQuery = useWalletSummaryQuery(userId);
  const walletSummary = walletSummaryQuery.data as any;
  const refetchWalletSummary = walletSummaryQuery.refetch;

  usePageLoadLogger({
    counts: {
      payoutMethods: payoutMethods.length,
      transactions: transactions.length,
      unpaidBookings: unpaidBookings.length,
      withdrawals: withdrawals.length,
    },
    details: {
      balance,
      role: userRole || 'unknown',
      user: userId ? 'signed-in' : 'guest',
    },
    loading: loading || walletSummaryQuery.isLoading,
    page: 'Wallet',
    queries: { walletSummary: walletSummaryQuery },
    ready: !loading && !walletSummaryQuery.isLoading,
    refreshing,
  });

  useEffect(() => {
    if (!walletSummary) {
      if (!walletSummaryQuery.isLoading) {
        setLoading(false);
      }
      return;
    }

    const nextPayoutMethods = Array.isArray(walletSummary.payoutMethods)
      ? walletSummary.payoutMethods
      : [];

    setUserRole(walletSummary.role || null);
    setBalance(Number(walletSummary.balance || walletSummary.wallet?.balance || 0));
    setTransactions(Array.isArray(walletSummary.transactions) ? walletSummary.transactions : []);
    setUnpaidBookings(Array.isArray(walletSummary.unpaidBookings) ? walletSummary.unpaidBookings : []);
    setPayoutMethods(nextPayoutMethods);
    setSelectedPayoutMethod((current) => {
      if (current && nextPayoutMethods.some((method: PayoutMethod) => method.id === current.id)) {
        return current;
      }

      return nextPayoutMethods.find((method: PayoutMethod) => method.is_default) || nextPayoutMethods[0] || null;
    });
    setWithdrawals(Array.isArray(walletSummary.withdrawals) ? walletSummary.withdrawals : []);
    setLoading(false);
    setRefreshing(false);
  }, [walletSummary, walletSummaryQuery.isLoading]);

  const parsedTopUpAmount = Number(topUpAmount);
  const isTopUpReady = Number.isFinite(parsedTopUpAmount) && parsedTopUpAmount >= 50;
  const parsedWithdrawAmount = Number(withdrawAmount);
  const isWithdrawReady =
    Number.isFinite(parsedWithdrawAmount) &&
    parsedWithdrawAmount >= 100 &&
    parsedWithdrawAmount <= balance &&
    Boolean(selectedPayoutMethod);
  const isPayoutMethodReady =
    newAccountName.trim().length > 0 &&
    newAccountNumber.trim().length > 0 &&
    (newPayoutType !== 'bank' || newBankName.trim().length > 0);
  const isTopUpSubmitDisabled = isTopping || !isTopUpReady;
  const isWithdrawSubmitDisabled = withdrawing || !isWithdrawReady;
  const isPayoutMethodSubmitDisabled = addingPayoutMethod || !isPayoutMethodReady;

  const showAlert = (type: AlertType, title: string, message: string, buttons?: any[]) => {
    setAlertConfig({ type, title, message, buttons });
    setAlertVisible(true);
  };

  const isSimpleTopToastButtons = (buttons?: any[]) => {
    if (!buttons || buttons.length === 0) return true;
    if (buttons.length !== 1) return false;

    const onlyButton = buttons[0];
    const normalizedText = String(onlyButton?.text ?? 'OK').trim().toLowerCase();
    const hasNoCallback = !onlyButton?.onPress;
    const isNeutralStyle =
      !onlyButton?.style || onlyButton.style === 'default' || onlyButton.style === 'cancel';

    return (
      hasNoCallback &&
      isNeutralStyle &&
      (normalizedText === 'ok' || normalizedText === 'close' || normalizedText === 'got it')
    );
  };

  const resolveAlertType = (title: string): AlertType => {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('error') || lowerTitle.includes('failed') || lowerTitle.includes('invalid') || lowerTitle.includes('missing') || lowerTitle.includes('insufficient')) {
      return 'error';
    }
    if (lowerTitle.includes('success')) {
      return 'success';
    }
    if (lowerTitle.includes('warning')) {
      return 'warning';
    }
    return 'info';
  };

  const showAlertNative = (title: string, message?: string, buttons?: any[]) => {
    const normalizedTitle = title || 'Notice';
    const normalizedMessage = message || '';
    const type = resolveAlertType(normalizedTitle);

    if ((type === 'success' || type === 'info') && isSimpleTopToastButtons(buttons)) {
      emitToast({
        type,
        title: normalizedTitle,
        message: normalizedMessage.trim() ? normalizedMessage : normalizedTitle,
      });
      return;
    }

    showAlert(type, normalizedTitle, normalizedMessage, buttons);
  };

  const Alert = { alert: showAlertNative };

  const parseFunctionErrorPayload = async (error: any): Promise<WithdrawalErrorPayload | null> => {
    const context = error?.context;
    if (!context) return null;

    if (typeof context?.json === 'function') {
      try {
        const payload = await context.json();
        if (payload && typeof payload === 'object') {
          return payload as WithdrawalErrorPayload;
        }
      } catch {
        // Ignore JSON parsing errors and continue with fallback handling.
      }
    }

    if (typeof context === 'object') {
      return context as WithdrawalErrorPayload;
    }

    return null;
  };

  const isMerchantNotReadyError = (message?: string, errorCode?: string) => {
    const normalizedMessage = String(message || '').toLowerCase();
    const normalizedCode = String(errorCode || '').toLowerCase();

    return (
      normalizedCode === 'merchant_not_ready' ||
      normalizedMessage.includes("don't have permission to perform this operation") ||
      normalizedMessage.includes('do not have permission to perform this operation') ||
      (
        normalizedMessage.includes('permission') &&
        (
          normalizedMessage.includes('disbursement') ||
          normalizedMessage.includes('payout') ||
          normalizedMessage.includes('cashout')
        )
      )
    );
  };

  const formatMerchantOnboardingMessage = (nextSteps?: string[]) => {
    const steps = Array.isArray(nextSteps) && nextSteps.length > 0
      ? nextSteps
      : [
        'Complete your PayMongo merchant onboarding (KYC and business verification).',
        'Request and enable disbursements or payouts on that merchant account.',
        'Use the matching secret key for the same mode and account.',
        'Retry with a small withdrawal amount.',
      ];

    return [
      'Real cashout is currently unavailable for this account.',
      'You can still test the flow in test mode.',
      '',
      'What to do next:',
      ...steps.map((step, index) => `${index + 1}. ${step}`),
    ].join('\n');
  };

  const showMerchantNotReadyAlert = (nextSteps?: string[]) => {
    Alert.alert(
      'Cashout Unavailable',
      formatMerchantOnboardingMessage(nextSteps),
      [{ text: 'OK' }],
    );
  };

  const handleWithdrawalError = async (
    fallbackTitle: string,
    rawError: any,
    payload?: WithdrawalErrorPayload | null,
  ) => {
    const parsedPayload = payload || await parseFunctionErrorPayload(rawError);
    const errorMessage = parsedPayload?.error || rawError?.message || 'Failed to process withdrawal';

    if (isMerchantNotReadyError(errorMessage, parsedPayload?.error_code)) {
      showMerchantNotReadyAlert(parsedPayload?.next_steps);
      return;
    }

    Alert.alert(fallbackTitle, errorMessage);
  };

  const fetchWallet = useCallback(async () => {
    try {
      setLoading(true);
      await refetchWalletSummary();
    } catch {
      // Query state carries the error; keep the wallet screen usable.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refetchWalletSummary]);

  // Fetch payout methods
  const fetchPayoutMethods = async () => {
    try {
      setLoadingPayoutMethods(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke('withdrawals', {
        body: { action: 'get_payout_methods' }
      });

      if (error) throw error;
      if (data?.payout_methods) {
        setPayoutMethods(data.payout_methods);
        // Set default as selected
        const defaultMethod = data.payout_methods.find((m: PayoutMethod) => m.is_default);
        if (defaultMethod) setSelectedPayoutMethod(defaultMethod);
      }
    } catch {
    } finally {
      setLoadingPayoutMethods(false);
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

  // Wallet top-up via PayMongo
  const handleTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (!amount || amount < 50) {
      Alert.alert('Invalid Amount', 'Minimum top-up amount is PHP 50.');
      return;
    }
    try {
      setIsTopping(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const redirectUrl = ExpoLinking.createURL('payment-result', {
        queryParams: { status: 'success', type: 'deposit', amount: String(amount) }
      });
      const cancelRedirectUrl = ExpoLinking.createURL('payment-result', {
        queryParams: { status: 'cancelled', type: 'deposit' }
      });

      const { data: depositData, error: depositError } = await supabase.functions.invoke('paymongo', {
        body: {
          action: 'create_deposit',
          user_id: user.id,
          amount,
          redirect_url: redirectUrl,
          cancel_redirect_url: cancelRedirectUrl,
        }
      });

      if (depositError || !depositData?.checkout_url) {
        Alert.alert('Error', 'Failed to create top-up session. Please try again.');
        return;
      }

      setTopUpModalVisible(false);
      setTopUpAmount('');

      const canOpen = await Linking.canOpenURL(depositData.checkout_url);
      if (canOpen) {
        await Linking.openURL(depositData.checkout_url);
      } else {
        Alert.alert('Error', 'Unable to open payment page.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to initiate top-up.');
    } finally {
      setIsTopping(false);
    }
  };

  useEffect(() => {
    if (walletRefreshKey) {
      void fetchWallet();
    }
  }, [fetchWallet, walletRefreshKey]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchWallet();
  };

  // Open withdraw modal
  const openWithdrawModal = useCallback(() => {
    setWithdrawAmount('');
    setWithdrawModalVisible(true);
  }, []);

  // Handle actual withdrawal request
  const handleWithdraw = async () => {
    if (withdrawing) return;
    const amount = parseFloat(withdrawAmount);

    if (!amount || amount < 100) {
      Alert.alert('Invalid Amount', 'Minimum withdrawal amount is PHP 100');
      return;
    }

    if (amount > balance) {
      Alert.alert('Insufficient Balance', 'You cannot withdraw more than your available balance');
      return;
    }

    if (!selectedPayoutMethod) {
      Alert.alert('No Payout Method', 'Please add a payout method first');
      return;
    }

    try {
      setWithdrawing(true);

      const { data, error } = await supabase.functions.invoke('withdrawals', {
        body: {
          action: 'request_withdrawal',
          amount: amount,
          payout_method_id: selectedPayoutMethod.id
        }
      });

      if (error) {
        await handleWithdrawalError('Withdrawal Failed', error);
        return;
      }

      if (data?.error) {
        await handleWithdrawalError('Withdrawal Failed', null, data as WithdrawalErrorPayload);
        return;
      }

      const isMockCashout = Boolean((data as any)?.mock_cashout);

      Alert.alert(
        isMockCashout ? 'Mock Cashout Success (Test Mode)' : 'Withdrawal Submitted!',
        data?.message || (isMockCashout
          ? 'Mock cashout recorded. No real money was transferred.'
          : 'Your payout will be processed within 1-3 business days.'),
        [{
          text: 'OK', onPress: () => {
            setWithdrawModalVisible(false);
            setWithdrawAmount('');
            fetchWallet(); // Refresh to update balance
          }
        }]
      );
    } catch (e: any) {
      await handleWithdrawalError('Error', e);
    } finally {
      setWithdrawing(false);
    }
  };

  // Add payout method
  const handleAddPayoutMethod = async () => {
    if (addingPayoutMethod) return;
    if (!newAccountName.trim() || !newAccountNumber.trim()) {
      Alert.alert('Missing Information', 'Please fill in all required fields');
      return;
    }

    if (newPayoutType === 'bank' && !newBankName.trim()) {
      Alert.alert('Missing Bank Name', 'Please enter your bank name');
      return;
    }

    try {
      setAddingPayoutMethod(true);

      const { data, error } = await supabase.functions.invoke('withdrawals', {
        body: {
          action: 'add_payout_method',
          payout_type: newPayoutType,
          account_name: newAccountName.trim(),
          account_number: newAccountNumber.trim(),
          bank_name: newPayoutType === 'bank' ? newBankName.trim() : null
        }
      });

      if (error) throw error;

      if (data?.error) {
        Alert.alert('Error', data.error);
        return;
      }

      // Reset form and close modal
      setNewAccountName('');
      setNewAccountNumber('');
      setNewBankName('');
      setNewPayoutType('gcash');
      setAddPayoutModalVisible(false);

      // Refresh payout methods
      await fetchPayoutMethods();

      Alert.alert('Success', 'Payout method added successfully');
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to add payout method');
    } finally {
      setAddingPayoutMethod(false);
    }
  };

  // Cancel pending withdrawal
  const handleCancelWithdrawal = async (withdrawalId: string) => {
    Alert.alert(
      'Cancel Withdrawal',
      'Are you sure you want to cancel this withdrawal? The funds will be returned to your wallet.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data, error } = await supabase.functions.invoke('withdrawals', {
                body: {
                  action: 'cancel_withdrawal',
                  withdrawal_id: withdrawalId
                }
              });

              if (error) throw error;

              Alert.alert('Success', data?.message || 'Withdrawal cancelled');
              fetchWallet();
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to cancel withdrawal');
            }
          }
        }
      ]
    );
  };

  // Get payout type icon
  const getPayoutIcon = (type: string) => {
    switch (type) {
      case 'gcash': return 'phone-portrait-outline';
      case 'maya': return 'phone-portrait-outline';
      case 'bank': return 'business-outline';
      case 'paypal': return 'logo-paypal';
      default: return 'wallet-outline';
    }
  };

  // Get payout type label
  const getPayoutLabel = (type: string) => {
    switch (type) {
      case 'gcash': return 'GCash';
      case 'maya': return 'Maya';
      case 'bank': return 'Bank Transfer';
      case 'paypal': return 'PayPal';
      default: return type;
    }
  };

  // Get withdrawal status color
  const getWithdrawalStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return { bg: '#FEF3C7', text: '#D97706' };
      case 'processing': return { bg: '#DBEAFE', text: '#2563EB' };
      case 'completed': return { bg: '#DCFCE7', text: '#15803D' };
      case 'failed': return { bg: '#FEE2E2', text: '#DC2626' };
      case 'cancelled': return { bg: '#F3F4F6', text: '#6B7280' };
      default: return { bg: '#E5E7EB', text: '#6B7280' };
    }
  };

  const pendingWithdrawals = useMemo(
    () => withdrawals.filter((w) => w.status === 'pending' || w.status === 'processing'),
    [withdrawals],
  );

  const pendingBalance = useMemo(
    () => pendingWithdrawals.reduce((sum, w) => sum + (Number(w.amount) || 0), 0),
    [pendingWithdrawals],
  );

  const filteredTransactions = useMemo(() => {
    if (txFilter === "all") return transactions;
    return transactions.filter((tx: any) => tx.reference_type === txFilter);
  }, [transactions, txFilter]);

  const txFilterOptions = [
    { key: "all", label: "All earnings" },
    { key: "booking_payment", label: "Full payment" },
    { key: "booking_downpayment", label: "Downpayment" },
    { key: "booking_balance", label: "Balance" },
  ];

  if (isGuest) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Wallet" />
        <GuestSignInGate message="Sign in to view your wallet and payment history." />
        <View style={styles.navbarContainer}>
          <AppNavbar />
        </View>
      </View>
    );
  }

  return (
    <>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Wallet" />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
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
              <Text style={styles.balanceValue}>? {balance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>

              <View style={styles.balanceRow}>
                <View>
                  <Text style={styles.balanceSubLabel}>Pending</Text>
                  <Text style={styles.balanceSubValue}>? {pendingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                </View>
                <View style={[styles.balanceDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
                <View>
                  <Text style={styles.balanceSubLabel}>Available</Text>
                  <Text style={styles.balanceSubValue}>? {balance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity activeOpacity={1}
                onPress={openWithdrawModal}
                style={[
                  styles.actionButton,
                  { backgroundColor: colors.surface, borderColor: colors.border }
                ]}
              >
                <Ionicons name="arrow-down-circle-outline" size={20} color={colors.primary} />
                <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>Withdraw</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={1}
                onPress={() => setTopUpModalVisible(true)}
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
                    PHP {unpaidBookings.reduce((sum, b) => sum + (b.remaining_balance || 0), 0).toLocaleString()}
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
                        {formatFriendlyDateTime(booking.booking_date, { forceDateOnly: true })} at {booking.start_time?.slice(0, 5) || 'Time TBA'}
                      </Text>
                      <Text style={styles.unpaidAmount}>
                        Balance: PHP {booking.remaining_balance?.toLocaleString()}
                      </Text>
                    </View>
                    <TouchableOpacity activeOpacity={payingBookingId === booking.id ? 1 : 0.78}
                      onPress={() => handlePayBalance(booking)}
                      disabled={payingBookingId === booking.id}
                      style={[styles.payNowBtn, { opacity: payingBookingId === booking.id ? 0.6 : 1 }]}
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
                  You can settle outstanding balances from Activity when ready.
                </Text>
              </View>
            </View>
          )}

          {/* Pending Withdrawals Section */}
          {pendingWithdrawals.length > 0 && (
            <View style={styles.historySection}>
              <Text style={[styles.historyTitle, { color: colors.text }]}>Pending Withdrawals</Text>
              <View style={[styles.historyContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {pendingWithdrawals.map((withdrawal, index, arr) => (
                  <View
                    key={withdrawal.id}
                    style={[
                      styles.withdrawalItem,
                      { borderBottomWidth: index === arr.length - 1 ? 0 : 1, borderBottomColor: colors.border }
                    ]}
                  >
                    <View style={styles.withdrawalLeft}>
                      <View style={[styles.transactionIcon, { backgroundColor: '#FEF3C7' }]}>
                        <Ionicons name="time-outline" size={18} color="#D97706" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.withdrawalHeader}>
                          <Text style={[styles.transactionType, { color: colors.text }]}>
                            {getPayoutLabel(withdrawal.payout_type)}
                          </Text>
                          <View style={[styles.withdrawalStatusBadge, { backgroundColor: getWithdrawalStatusColor(withdrawal.status).bg }]}>
                            <Text style={[styles.withdrawalStatusText, { color: getWithdrawalStatusColor(withdrawal.status).text }]}>
                              {withdrawal.status.charAt(0).toUpperCase() + withdrawal.status.slice(1)}
                            </Text>
                          </View>
                        </View>
                        <Text style={[styles.transactionDate, { color: colors.textSecondary }]}>
                          {formatFriendlyDateTime(withdrawal.created_at)} | ****{withdrawal.payout_account_number.slice(-4)}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.withdrawalRight}>
                      <Text style={[styles.transactionAmount, { color: '#D97706' }]}>
                        -PHP {withdrawal.amount.toLocaleString()}
                      </Text>
                      {withdrawal.status === 'pending' && (
                        <TouchableOpacity activeOpacity={1} onPress={() => handleCancelWithdrawal(withdrawal.id)}>
                          <Text style={styles.cancelWithdrawalText}>Cancel</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Transaction History */}
          <View style={styles.historySection}>
            <Text style={[styles.historyTitle, { color: colors.text }]}>Earnings Activity</Text>

            {/* Filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {txFilterOptions.map((opt) => (
                <TouchableOpacity activeOpacity={1}
                  key={opt.key}
                  onPress={() => setTxFilter(opt.key)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8,
                    backgroundColor: txFilter === opt.key ? colors.primary : colors.card,
                    borderWidth: 1, borderColor: txFilter === opt.key ? colors.primary : colors.border,
                  }}
                >
                  <Text style={{
                    fontFamily: 'Poppins_500Medium', fontSize: 12,
                    color: txFilter === opt.key ? '#fff' : colors.textSecondary,
                  }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={[styles.historyContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {loading ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : filteredTransactions.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>No booking earnings yet</Text>
                </View>
              ) : (
                filteredTransactions.map((tx, index) => (
                  <View
                    key={tx.id}
                    style={[
                      styles.transactionItem,
                      { borderBottomWidth: index === filteredTransactions.length - 1 ? 0 : 1, borderBottomColor: colors.border }
                    ]}
                  >
                    <View style={styles.transactionLeft}>
                      <View
                        style={[
                          styles.transactionIcon,
                          { backgroundColor: tx.is_credit ? '#DCFCE7' : '#FEE2E2' }
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
                        {tx.reference_type && tx.reference_type !== 'booking' && (
                          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 11, color: colors.primary }}>
                            {tx.reference_type.replace(/_/g, ' ')}
                          </Text>
                        )}
                        <Text style={[styles.transactionDate, { color: colors.textSecondary }]}>
                          {formatFriendlyDateTime(tx.created_at)}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.transactionAmount, { color: tx.is_credit ? '#10B981' : '#EF4444' }]}>
                      {tx.is_credit ? '+' : '-'}? {tx.amount.toFixed(2)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>

        </ScrollView>
        <View style={styles.navbarContainer}>
          <AppNavbar />
        </View>
      </View>

      {/* Top-Up Modal */}
      <BottomModal
        visible={topUpModalVisible}
        overlayLabel="WalletTopUpModal"
        onClose={() => setTopUpModalVisible(false)}
        keyboardAvoiding
      >
          <View style={[styles.withdrawModal, { backgroundColor: colors.background }]}>
            <View style={styles.withdrawModalHeader}>
              <View>
                <Text style={[styles.withdrawModalTitle, { color: colors.text }]}>Top Up Wallet</Text>
                <Text style={[styles.withdrawModalSubtitle, { color: colors.textSecondary }]}>
                  Add funds via GCash or Card
                </Text>
              </View>
              <TouchableOpacity activeOpacity={1}
                onPress={() => setTopUpModalVisible(false)}
                style={[styles.closeModalButton, { backgroundColor: colors.surface }]}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputSection}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>Amount to Add</Text>
              <View style={[styles.amountInputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.currencyPrefix, { color: colors.textSecondary }]}>?</Text>
                <TextInput
                  style={[styles.amountInput, { color: colors.text }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="decimal-pad"
                  value={topUpAmount}
                  onChangeText={setTopUpAmount}
                />
              </View>
              <Text style={[styles.inputHint, { color: colors.textSecondary }]}>
                Minimum top-up: PHP 50
              </Text>
            </View>

            <View style={styles.quickAmounts}>
              {[100, 250, 500, 1000].map((preset) => (
                <TouchableOpacity activeOpacity={1}
                  key={preset}
                  onPress={() => setTopUpAmount(String(preset))}
                  style={[
                    styles.quickAmountBtn,
                    {
                      backgroundColor: parseFloat(topUpAmount) === preset ? colors.primary : colors.surface,
                      borderColor: colors.border
                    }
                  ]}
                >
                  <Text style={[
                    styles.quickAmountText,
                    { color: parseFloat(topUpAmount) === preset ? 'white' : colors.text }
                  ]}>
                    PHP {preset}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity activeOpacity={isTopUpSubmitDisabled ? 1 : 0.78}
              onPress={handleTopUp}
              disabled={isTopUpSubmitDisabled}
              style={[
                styles.withdrawSubmitBtn,
                {
                  backgroundColor: isTopUpReady ? colors.primary : colors.border,
                  marginTop: 24,
                  opacity: isTopUpSubmitDisabled ? 0.6 : 1,
                }
              ]}
            >
              {isTopping
                ? <ActivityIndicator size="small" color="white" />
                : <Text style={[styles.withdrawSubmitText, { color: isTopUpReady ? "white" : colors.textSecondary }]}>Proceed to Payment</Text>
              }
            </TouchableOpacity>
          </View>
      </BottomModal>

      {/* Withdraw Modal */}
      <BottomModal
        visible={withdrawModalVisible}
        overlayLabel="WalletWithdrawModal"
        onClose={() => setWithdrawModalVisible(false)}
        keyboardAvoiding
      >
          <View style={[styles.withdrawModal, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={styles.withdrawModalHeader}>
              <View>
                <Text style={[styles.withdrawModalTitle, { color: colors.text }]}>Withdraw Funds</Text>
                <Text style={[styles.withdrawModalSubtitle, { color: colors.textSecondary }]}>
                  Available: PHP {balance?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Text>
              </View>
              <TouchableOpacity activeOpacity={1}
                onPress={() => setWithdrawModalVisible(false)}
                style={[styles.closeModalButton, { backgroundColor: colors.surface }]}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* Amount Input */}
              <View style={styles.inputSection}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Amount to Withdraw</Text>
                <View style={[styles.amountInputContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.currencyPrefix, { color: colors.textSecondary }]}>?</Text>
                  <TextInput
                    style={[styles.amountInput, { color: colors.text }]}
                    placeholder="0.00"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="decimal-pad"
                    value={withdrawAmount}
                    onChangeText={setWithdrawAmount}
                  />
                </View>
                <Text style={[styles.inputHint, { color: colors.textSecondary }]}>
                  Minimum withdrawal: PHP 100
                </Text>
              </View>

              {/* Quick Amount Buttons */}
              <View style={styles.quickAmounts}>
                {[100, 500, 1000, balance].map((amount, idx) => (
                  <TouchableOpacity activeOpacity={1}
                    key={idx}
                    onPress={() => setWithdrawAmount(amount.toString())}
                    style={[
                      styles.quickAmountBtn,
                      {
                        backgroundColor: parseFloat(withdrawAmount) === amount ? colors.primary : colors.surface,
                        borderColor: colors.border
                      }
                    ]}
                  >
                    <Text style={[
                      styles.quickAmountText,
                      { color: parseFloat(withdrawAmount) === amount ? 'white' : colors.text }
                    ]}>
                      {idx === 3 ? 'Max' : `PHP ${amount}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Payout Method Section */}
                <View style={styles.inputSection}>
                  <View style={styles.payoutMethodHeader}>
                    <Text style={[styles.inputLabel, { color: colors.text }]}>Payout Method</Text>
                    <TouchableOpacity activeOpacity={1} onPress={() => setAddPayoutModalVisible(true)}>
                      <Text style={[styles.addMethodLink, { color: colors.primary }]}>+ Add New</Text>
                    </TouchableOpacity>
                  </View>

                  {loadingPayoutMethods ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
                  ) : payoutMethods.length === 0 ? (
                    <TouchableOpacity activeOpacity={1}
                      onPress={() => setAddPayoutModalVisible(true)}
                      style={[styles.addPayoutBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    >
                      <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
                      <Text style={[styles.addPayoutText, { color: colors.primary }]}>Add Payout Method</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.payoutMethodsList}>
                      {payoutMethods.map((method) => (
                        <TouchableOpacity activeOpacity={1}
                          key={method.id}
                          onPress={() => setSelectedPayoutMethod(method)}
                          style={[
                            styles.payoutMethodCard,
                            {
                              backgroundColor: colors.surface,
                              borderColor: selectedPayoutMethod?.id === method.id ? colors.primary : colors.border,
                              borderWidth: selectedPayoutMethod?.id === method.id ? 2 : 1
                            }
                          ]}
                        >
                          <View style={styles.payoutMethodLeft}>
                            <View style={[styles.payoutIconBox, { backgroundColor: isDark ? colors.primaryLight : '#EEF2FF' }]}>
                              <Ionicons name={getPayoutIcon(method.type) as any} size={20} color={colors.primary} />
                            </View>
                            <View>
                              <Text style={[styles.payoutMethodName, { color: colors.text }]}>
                                {getPayoutLabel(method.type)}
                                {method.bank_name ? ` - ${method.bank_name}` : ''}
                              </Text>
                              <Text style={[styles.payoutMethodAccount, { color: colors.textSecondary }]}>
                                {method.account_name} | ****{method.account_number.slice(-4)}
                              </Text>
                            </View>
                          </View>
                          {selectedPayoutMethod?.id === method.id && (
                            <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

              {/* Withdrawal Summary */}
              {withdrawAmount && parseFloat(withdrawAmount) >= 100 && (
                <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Withdrawal Amount</Text>
                    <Text style={[styles.summaryValue, { color: colors.text }]}>PHP {parseFloat(withdrawAmount).toLocaleString()}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Processing Fee</Text>
                    <Text style={[styles.summaryValue, { color: colors.text }]}>PHP 0.00</Text>
                  </View>
                  <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.summaryRow}>
                    <Text style={[styles.summaryLabelBold, { color: colors.text }]}>{"You'll Receive"}</Text>
                    <Text style={[styles.summaryValueBold, { color: colors.primary }]}>PHP {parseFloat(withdrawAmount).toLocaleString()}</Text>
                  </View>
                </View>
              )}

              {/* Note */}
              <View style={[styles.noteCard, { backgroundColor: isDark ? colors.surface : '#FEF3C7' }]}>
                <Ionicons name="time-outline" size={20} color="#D97706" />
                <Text style={[styles.noteText, { color: isDark ? colors.textSecondary : '#92400E' }]}>
                  Simulated withdrawals complete immediately and deduct from your real in-app wallet balance. No external money is sent.
                </Text>
              </View>
            </ScrollView>

            {/* Submit Button */}
            <TouchableOpacity activeOpacity={isWithdrawSubmitDisabled ? 1 : 0.78}
              onPress={handleWithdraw}
              disabled={isWithdrawSubmitDisabled}
              style={[
                styles.withdrawSubmitBtn,
                {
                  backgroundColor: isWithdrawReady ? colors.primary : colors.border,
                  opacity: isWithdrawSubmitDisabled ? 0.6 : 1
                }
              ]}
            >
              {withdrawing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="arrow-down-circle" size={20} color={isWithdrawReady ? "white" : colors.textSecondary} />
                  <Text style={[styles.withdrawSubmitText, { color: isWithdrawReady ? "white" : colors.textSecondary }]}>
                    Confirm Withdrawal
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
      </BottomModal>

      {/* Add Payout Method Modal */}
      <BottomModal
        visible={addPayoutModalVisible}
        overlayLabel="WalletAddPayoutModal"
        onClose={() => setAddPayoutModalVisible(false)}
        keyboardAvoiding
      >
          <View style={[styles.addPayoutModal, { backgroundColor: colors.background }]}>
            <View style={styles.withdrawModalHeader}>
              <Text style={[styles.withdrawModalTitle, { color: colors.text }]}>Add Payout Method</Text>
              <TouchableOpacity activeOpacity={1}
                onPress={() => setAddPayoutModalVisible(false)}
                style={[styles.closeModalButton, { backgroundColor: colors.surface }]}
              >
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Payout Type Selection */}
              <View style={styles.inputSection}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Payout Type</Text>
                <View style={styles.payoutTypeGrid}>
                  {(['gcash', 'maya', 'bank'] as const).map((type) => (
                    <TouchableOpacity activeOpacity={1}
                      key={type}
                      onPress={() => setNewPayoutType(type)}
                      style={[
                        styles.payoutTypeBtn,
                        {
                          backgroundColor: newPayoutType === type ? colors.primary : colors.surface,
                          borderColor: newPayoutType === type ? colors.primary : colors.border
                        }
                      ]}
                    >
                      <Ionicons
                        name={getPayoutIcon(type) as any}
                        size={24}
                        color={newPayoutType === type ? 'white' : colors.text}
                      />
                      <Text style={[
                        styles.payoutTypeBtnText,
                        { color: newPayoutType === type ? 'white' : colors.text }
                      ]}>
                        {getPayoutLabel(type)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Bank Name (only for bank type) */}
              {newPayoutType === 'bank' && (
                <View style={styles.inputSection}>
                  <Text style={[styles.inputLabel, { color: colors.text }]}>Bank Name</Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                    placeholder="e.g., BDO, BPI, Metrobank"
                    placeholderTextColor={colors.textSecondary}
                    value={newBankName}
                    onChangeText={setNewBankName}
                  />
                </View>
              )}

              {/* Account Name */}
              <View style={styles.inputSection}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>Account Name</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  placeholder="Full name as registered"
                  placeholderTextColor={colors.textSecondary}
                  value={newAccountName}
                  onChangeText={setNewAccountName}
                />
              </View>

              {/* Account Number */}
              <View style={styles.inputSection}>
                <Text style={[styles.inputLabel, { color: colors.text }]}>
                  {newPayoutType === 'gcash' || newPayoutType === 'maya' ? 'Mobile Number' : 'Account Number'}
                </Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  placeholder={
                    newPayoutType === 'gcash' || newPayoutType === 'maya' ? '09XX XXX XXXX' : 'XXXX XXXX XXXX'
                  }
                  placeholderTextColor={colors.textSecondary}
                  keyboardType={newPayoutType === 'gcash' || newPayoutType === 'maya' ? 'phone-pad' : 'default'}
                  value={newAccountNumber}
                  onChangeText={setNewAccountNumber}
                />
              </View>
            </ScrollView>

            {/* Add Button */}
            <TouchableOpacity activeOpacity={isPayoutMethodSubmitDisabled ? 1 : 0.78}
              onPress={handleAddPayoutMethod}
              disabled={isPayoutMethodSubmitDisabled}
              style={[styles.withdrawSubmitBtn, { backgroundColor: isPayoutMethodReady ? colors.primary : colors.border, opacity: isPayoutMethodSubmitDisabled ? 0.6 : 1 }]}
            >
              {addingPayoutMethod ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="add-circle" size={20} color={isPayoutMethodReady ? "white" : colors.textSecondary} />
                  <Text style={[styles.withdrawSubmitText, { color: isPayoutMethodReady ? "white" : colors.textSecondary }]}>Add Payout Method</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
      </BottomModal>

      <CustomModal
        visible={withdrawing}
        loading
        loadingMessage="Processing withdrawal..."
        onClose={() => { }}
      />

      <CustomModal
        visible={addingPayoutMethod}
        loading
        loadingMessage="Adding payout method..."
        onClose={() => { }}
      />

      <CustomAlert
        visible={alertVisible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        buttons={alertConfig.buttons}
        onClose={() => setAlertVisible(false)}
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  closeModalButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Withdraw Modal Styles
  withdrawModal: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  withdrawModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  withdrawModalTitle: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
  },
  withdrawModalSubtitle: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    marginTop: 2,
  },
  inputSection: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 8,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    height: 56,
  },
  currencyPrefix: {
    fontSize: 24,
    fontFamily: 'Poppins_600SemiBold',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontFamily: 'Poppins_600SemiBold',
    textAlignVertical: 'center',
  },
  inputHint: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    marginTop: 6,
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  quickAmountBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAmountText: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  methodOption: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    gap: 6,
    position: 'relative',
  },
  methodOptionTitle: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  methodOptionDesc: {
    fontSize: 11,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
  },
  payoutMethodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addMethodLink: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  addPayoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  addPayoutText: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  payoutMethodsList: {
    gap: 10,
  },
  payoutMethodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  payoutMethodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  payoutIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payoutMethodName: {
    fontSize: 14,
    fontFamily: 'Poppins_600SemiBold',
  },
  payoutMethodAccount: {
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    marginTop: 2,
  },
  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  summaryDivider: {
    height: 1,
    marginVertical: 8,
  },
  summaryLabelBold: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
  },
  summaryValueBold: {
    fontSize: 18,
    fontFamily: 'Poppins_700Bold',
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Poppins_400Regular',
    lineHeight: 18,
  },
  withdrawSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 8,
  },
  withdrawSubmitText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  // Add Payout Modal
  addPayoutModal: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  payoutTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  payoutTypeBtn: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  payoutTypeBtnText: {
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  textInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'Poppins_400Regular',
    textAlignVertical: 'center',
  },
  // Withdrawal history styles
  withdrawalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  withdrawalLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  withdrawalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  withdrawalStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  withdrawalStatusText: {
    fontSize: 10,
    fontFamily: 'Poppins_600SemiBold',
  },
  withdrawalRight: {
    alignItems: 'flex-end',
  },
  cancelWithdrawalText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    color: '#DC2626',
    marginTop: 4,
  },
});

