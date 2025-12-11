import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar';




export default function WalletScreen() {

    return (
    <View className="flex-1 bg-white px-6">
      <Header title="Wallet"></Header>

      <ScrollView showsVerticalScrollIndicator={false} className="pb-24">
        <View className="pt-6">
          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: '#6B7280' }}>
            Current Balance
          </Text>
          <Text style={{ fontFamily: 'Poppins_700Bold', fontSize: 32, color: '#000', marginTop: 4 }}>
            ₱ 1,250.00
          </Text>
        </View>

        <View className="flex-row justify-between mt-6">
          <View className="flex-1">
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6B7280' }}>
              Pending Balance
            </Text>
            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: '#000', marginTop: 4 }}>
              ₱ 500.00
            </Text>
          </View>
          <View className="flex-1">
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6B7280' }}>
              Withdrawable Balance
            </Text>
            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: '#000', marginTop: 4 }}>
              ₱ 750.00
            </Text>
          </View>
        </View>

        <TouchableOpacity 
          className="mt-6 rounded-xl bg-teal-500 items-center justify-center py-3"
        >
          <Text className="text-white" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14 }}>
            Withdraw
          </Text>
        </TouchableOpacity>

        <View className="mt-6 bg-gray-50 rounded-xl p-4 border border-gray-200">
          <View className="flex-row justify-between items-center mb-2">
            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: '#000' }}>
              Subscription Status
            </Text>
            <View className="bg-teal-500 px-3 py-1 rounded-full">
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: '#FFF' }}>
                Active
              </Text>
            </View>
          </View>
          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6B7280', marginTop: 4 }}>
            Premium Plan
          </Text>
          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6B7280', marginTop: 2 }}>
            Renews on July 15, 2024
          </Text>
          <TouchableOpacity className="mt-4 border border-teal-500 rounded-lg items-center justify-center py-2">
            <Text className="text-teal-500" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14 }}>
              Manage Subscription
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mt-8 border-t border-gray-200 pt-6">
          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 17, color: '#000' }}>
            Transaction History
          </Text>

          <View className="mt-4">
            <View className="flex-row justify-between items-center py-4 border-b border-gray-100">
              <View>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000' }}>
                  June 15, 2024
                </Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                  Booking Payment
                </Text>
              </View>
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: '#10B981' }}>
                +₱ 500.00
              </Text>
            </View>

            <View className="flex-row justify-between items-center py-4 border-b border-gray-100">
              <View>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000' }}>
                  June 10, 2024
                </Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                  Refund
                </Text>
              </View>
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: '#10B981' }}>
                +₱ 250.00
              </Text>
            </View>

            <View className="flex-row justify-between items-center py-4 border-b border-gray-100">
              <View>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000' }}>
                  June 5, 2024
                </Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                  Withdrawal
                </Text>
              </View>
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: '#EF4444' }}>
                -₱ 500.00
              </Text>
            </View>

            <View className="flex-row justify-between items-center py-4 border-b border-gray-100">
              <View>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000' }}>
                  May 20, 2024
                </Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6B7280', marginTop: 2 }}>
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
    
    );
}