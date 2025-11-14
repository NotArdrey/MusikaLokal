import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function LoginScreen() {

  // useEffect(() => {
  //   router.replace('/gig_details');
  // }, []);


  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  return (
    <View className="flex-1 bg-white px-6 justify-center">
      <View className="items-center mb-16">
        <View className="w-48 h-24 bg-gray-100 rounded-lg items-center justify-center">
          <Text className="text-gray-400 text-sm" style={{ fontFamily: 'Poppins_400Regular' }}>Logo Space</Text>
        </View>
      </View>
      
      <View className="mb-4">
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 text-base text-[#4D998C]"
          placeholder="Email"
          placeholderTextColor="#4D998C"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          style={{ fontFamily: 'Poppins_400Regular' , outline: '0'}}
        />
      </View>

      <View className="mb-2 relative">
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 text-base pr-12 text-[#4D998C]"
          placeholder="Password"
          placeholderTextColor="#4D998C"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          style={{ fontFamily: 'Poppins_400Regular', outline: '0' }}
        />
        <TouchableOpacity 
          className="absolute right-4 top-3.5"
          onPress={() => setShowPassword(!showPassword)}
        >
          <Ionicons 
            name={showPassword ? 'eye-outline' : 'eye-off-outline'} 
            size={22} 
            color="#9CA3AF" 
          />
        </TouchableOpacity>
      </View>

      <TouchableOpacity className="mb-6" onPress={() => router.push('forget-password' as any)}>
      
        <Text className="text-teal-500 text-sm" style={{ fontFamily: 'Poppins_400Regular' }}>Forget Password</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={()=> router.push('home' as any)}className="bg-teal-500 rounded-lg py-4 mb-4">
        <Text className="text-white text-center text-base font-semibold" style={{ fontFamily: 'Poppins_600SemiBold' }}>Login</Text>
      </TouchableOpacity>
  
      <View className="flex-row justify-center">
        <Text className="text-gray-600 text-sm" style={{ fontFamily: 'Poppins_400Regular' }}>Don't have an account? </Text>
        <TouchableOpacity>
          <Text onPress={() => router.push('register' as any)} className="text-teal-500 text-sm font-medium" style={{ fontFamily: 'Poppins_500Medium' }}>Sign up</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}