import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function WalletScreen() {
  const { colors, isDark } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);

  // Mock transaction data
  const transactions = [
    { id: 1, date: 'June 15, 2024', type: 'Booking Payment', amount: 500.00, isCredit: true },
    { id: 2, date: 'June 10, 2024', type: 'Refund', amount: 250.00, isCredit: true },
    { id: 3, date: 'June 5, 2024', type: 'Withdrawal', amount: 500.00, isCredit: false },
    { id: 4, date: 'May 20, 2024', type: 'Booking Payment', amount: 1000.00, isCredit: true },
  ];

  const handleWithdraw = () => {
    setModalVisible(false);
    console.log('Withdraw confirmed');
  };

  return (
    <>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title="Wallet" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

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
              <Text style={styles.balanceValue}>₱ 1,250.00</Text>

              <View style={styles.balanceRow}>
                <View>
                  <Text style={styles.balanceSubLabel}>Pending</Text>
                  <Text style={styles.balanceSubValue}>₱ 500.00</Text>
                </View>
                <View style={[styles.balanceDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
                <View>
                  <Text style={styles.balanceSubLabel}>Available</Text>
                  <Text style={styles.balanceSubValue}>₱ 750.00</Text>
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
              {transactions.map((tx, index) => (
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
                        { backgroundColor: tx.isCredit ? '#DCFCE7' : '#FEE2E2' } // green-100 / red-100
                      ]}
                    >
                      <Ionicons
                        name={tx.isCredit ? 'arrow-down' : 'arrow-up'}
                        size={18}
                        color={tx.isCredit ? '#10B981' : '#EF4444'}
                      />
                    </View>
                    <View>
                      <Text style={[styles.transactionType, { color: colors.text }]}>{tx.type}</Text>
                      <Text style={[styles.transactionDate, { color: colors.textSecondary }]}>{tx.date}</Text>
                    </View>
                  </View>
                  <Text style={[styles.transactionAmount, { color: tx.isCredit ? '#10B981' : '#EF4444' }]}>
                    {tx.isCredit ? '+' : '-'}₱ {tx.amount.toFixed(2)}
                  </Text>
                </View>
              ))}
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
});
