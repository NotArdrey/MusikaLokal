import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';




export default function AccountDetailsScreen() {
  const { colors, isDark } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);

    return (
    <>
    <View className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
      <Header title="Account Details"></Header>

      <ScrollView showsVerticalScrollIndicator={false} className="pb-24">
        <View className="pt-6">
   

          <View className="mb-4">
            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 4 }}>
              Full Name
            </Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary }}>
              Jared Carioso
            </Text>
          </View>

          <View className="mb-6">
            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: colors.text, marginBottom: 4 }}>
              Email
            </Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.textSecondary }}>
              Jaredcarioso69@gmail.com
            </Text>
          </View>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 18, color: colors.text, marginTop: 8, marginBottom: 16 }}>
            Security
          </Text>

          <TouchableOpacity 
            className="flex-row items-center justify-between py-4"
            style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
            onPress={() => router.push('/change_email')}
          >
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text }}>
              Change email
            </Text>
            <Ionicons name="arrow-forward" size={20} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity 
            className="flex-row items-center justify-between py-4"
            style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
            onPress={() => router.push('/change_password')}
          >
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text }}>
              Change password
            </Text>
            <Ionicons name="arrow-forward" size={20} color={colors.text} />
          </TouchableOpacity>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 18, color: colors.text, marginTop: 24, marginBottom: 16 }}>
            Other
          </Text>

          <TouchableOpacity 
            className="flex-row items-center justify-between py-4"
            onPress={() => setModalVisible(true)}
          >
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: colors.text }}>
              Close account
            </Text>
            <Ionicons name="close" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar/>
      </View>
    </View>
    <Modal
      visible={modalVisible}
      onClose={() => setModalVisible(false)}
      title="Close Account"
      message="Are you sure you want to close your account? This action cannot be undone."
      buttonText="Close Account"
    />
    </>
    );
}

