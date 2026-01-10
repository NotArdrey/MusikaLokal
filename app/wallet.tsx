import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';




export default function WalletScreen() {
  const { colors, isDark } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);

    return (
    <>
    <View className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
      <Header title="Wallet"></Header>

      <ScrollView showsVerticalScrollIndicator={false} className="pb-24">
        <View className="pt-6">
          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary }}>
            Current Balance
          </Text>
          <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 32, color: colors.text, marginTop: 4 }}>
            ₱ 1,250.00
          </Text>
        </View>

        <View className="flex-row justify-between mt-6">
          <View className="flex-1">
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>
              Pending Balance
            </Text>
            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text, marginTop: 4 }}>
              ₱ 500.00
            </Text>
          </View>
          <View className="flex-1">
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary }}>
              Withdrawable Balance
            </Text>
            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text, marginTop: 4 }}>
              ₱ 750.00
            </Text>
          </View>
        </View>

        <TouchableOpacity 
          className="mt-6 rounded-xl bg-primary-500 items-center justify-center py-3"
          onPress={() => setModalVisible(true)}
        >
          <Text className="text-white" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14 }}>
            Withdraw
          </Text>
        </TouchableOpacity>

        <View className="mt-6 rounded-xl p-4" style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
          <View className="flex-row justify-between items-center mb-2">
            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text }}>
              Subscription Status
            </Text>
            <View className="bg-primary-500 px-3 py-1 rounded-full">
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: '#FFF' }}>
                Active
              </Text>
            </View>
          </View>
          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>
            Premium Plan
          </Text>
          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
            Renews on July 15, 2024
          </Text>
          <TouchableOpacity className="mt-4 border border-primary-500 rounded-lg items-center justify-center py-2">
            <Text className="text-primary-500" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14 }}>
              Manage Subscription
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mt-8 pt-6" style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 17, color: colors.text }}>
            Transaction History
          </Text>

          <View className="mt-4">
            <View className="flex-row justify-between items-center py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>
                  June 15, 2024
                </Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                  Booking Payment
                </Text>
              </View>
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: '#10B981' }}>
                +₱ 500.00
              </Text>
            </View>

            <View className="flex-row justify-between items-center py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>
                  June 10, 2024
                </Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                  Refund
                </Text>
              </View>
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: '#10B981' }}>
                +₱ 250.00
              </Text>
            </View>

            <View className="flex-row justify-between items-center py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>
                  June 5, 2024
                </Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                  Withdrawal
                </Text>
              </View>
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: '#EF4444' }}>
                -₱ 500.00
              </Text>
            </View>

            <View className="flex-row justify-between items-center py-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text }}>
                  May 20, 2024
                </Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                  Booking Payment
                </Text>
              </View>
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: '#10B981' }}>
                +₱ 1,000.00
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar/>
      </View>
    </View>
    <Modal
      visible={modalVisible}
      onClose={() => setModalVisible(false)}
      title="Withdraw Funds"
      message="Are you sure you want to withdraw your funds?"
      buttonText="Withdraw"
    />
    </>
    );
}
