import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';




export default function AccountDetailsScreen() {
  const [modalVisible, setModalVisible] = useState(false);

    return (
    <>
    <View className="flex-1 bg-white px-6">
      <Header title="Account Details"></Header>

      <ScrollView showsVerticalScrollIndicator={false} className="pb-24">
        <View className="pt-6">
   

          <View className="mb-4">
            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000', marginBottom: 4 }}>
              Full Name
            </Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: '#6B7280' }}>
              Jared Carioso
            </Text>
          </View>

          <View className="mb-6">
            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000', marginBottom: 4 }}>
              Email
            </Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: '#6B7280' }}>
              Jaredcarioso69@gmail.com
            </Text>
          </View>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 18, color: '#000', marginTop: 8, marginBottom: 16 }}>
            Security
          </Text>

          <TouchableOpacity 
            className="flex-row items-center justify-between py-4 border-b border-gray-200"
            onPress={() => router.push('/change_email')}
          >
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: '#000' }}>
              Change email
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#000" />
          </TouchableOpacity>

          <TouchableOpacity 
            className="flex-row items-center justify-between py-4 border-b border-gray-200"
            onPress={() => router.push('/change_password')}
          >
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: '#000' }}>
              Change password
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#000" />
          </TouchableOpacity>

          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 18, color: '#000', marginTop: 24, marginBottom: 16 }}>
            Other
          </Text>

          <TouchableOpacity 
            className="flex-row items-center justify-between py-4"
            onPress={() => setModalVisible(true)}
          >
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: '#000' }}>
              Close account
            </Text>
            <Ionicons name="close" size={20} color="#000" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar/>
      </View>
    </View>
    <Modal
        isVisible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Close Account"
        message="Are you sure you want to close your account? This action cannot be undone."
        buttonText="Close Account"
        onConfirm={() => setModalVisible(false)}
    />
    </>
    );
}