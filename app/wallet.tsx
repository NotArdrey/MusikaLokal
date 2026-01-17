import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
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
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Header title="Wallet" />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

          {/* Balance Card */}
          <View className="px-6 mt-6">
            <View
              className="rounded-3xl p-6 shadow-lg overflow-hidden relative"
              style={{ backgroundColor: colors.primary }}
            >
              {/* Background decoration */}
              <View className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10" />
              <View className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full -ml-8 -mb-8" />

              <Text className="text-white/80 text-sm mb-1" style={{ fontFamily: 'Poppins_500Medium' }}>Current Balance</Text>
              <Text className="text-white text-4xl mb-6" style={{ fontFamily: 'Poppins_700Bold' }}>₱ 1,250.00</Text>

              <View className="flex-row gap-4">
                <View>
                  <Text className="text-white/70 text-xs" style={{ fontFamily: 'Poppins_400Regular' }}>Pending</Text>
                  <Text className="text-white text-lg" style={{ fontFamily: 'Poppins_600SemiBold' }}>₱ 500.00</Text>
                </View>
                <View className="w-[1px] bg-white/20 h-full" />
                <View>
                  <Text className="text-white/70 text-xs" style={{ fontFamily: 'Poppins_400Regular' }}>Available</Text>
                  <Text className="text-white text-lg" style={{ fontFamily: 'Poppins_600SemiBold' }}>₱ 750.00</Text>
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <View className="flex-row mt-4 gap-3">
              <TouchableOpacity
                onPress={() => setModalVisible(true)}
                className="flex-1 flex-row items-center justify-center p-3 rounded-xl gap-2"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <Ionicons name="arrow-down-circle-outline" size={20} color={colors.primary} />
                <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>Withdraw</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 flex-row items-center justify-center p-3 rounded-xl gap-2"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>Top Up</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Subscription Card */}
          <View className="px-6 mt-6">
            <View className="p-5 rounded-2xl border" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
              <View className="flex-row justify-between items-start mb-2">
                <View>
                  <Text className="text-base" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Premium Plan</Text>
                  <Text className="text-xs" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Renews on July 15, 2024</Text>
                </View>
                <View className="px-3 py-1 rounded-full bg-green-100">
                  <Text className="text-xs text-green-700" style={{ fontFamily: 'Poppins_600SemiBold' }}>Active</Text>
                </View>
              </View>
              <TouchableOpacity className="mt-2 self-start">
                <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.primary, fontSize: 13 }}>Manage Subscription</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Transaction History */}
          <View className="px-6 mt-8">
            <Text className="mb-4 text-base" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Transaction History</Text>

            <View className="rounded-2xl border overflow-hidden" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
              {transactions.map((tx, index) => (
                <View
                  key={tx.id}
                  className="flex-row items-center justify-between p-4"
                  style={{ borderBottomWidth: index === transactions.length - 1 ? 0 : 1, borderBottomColor: colors.border }}
                >
                  <View className="flex-row items-center gap-3">
                    <View
                      className={`w-10 h-10 rounded-full items-center justify-center ${tx.isCredit ? 'bg-green-100' : 'bg-red-100'}`}
                    >
                      <Ionicons
                        name={tx.isCredit ? 'arrow-down' : 'arrow-up'}
                        size={18}
                        color={tx.isCredit ? '#10B981' : '#EF4444'}
                      />
                    </View>
                    <View>
                      <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text, fontSize: 14 }}>{tx.type}</Text>
                      <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 12 }}>{tx.date}</Text>
                    </View>
                  </View>
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', color: tx.isCredit ? '#10B981' : '#EF4444', fontSize: 14 }}>
                    {tx.isCredit ? '+' : '-'}₱ {tx.amount.toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>
          </View>

        </ScrollView>
        <Navbar />
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
