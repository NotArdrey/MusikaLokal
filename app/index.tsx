import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../src/context/ThemeContext';

export default function LoginScreen() {
  const { colors } = useTheme();

  // useEffect(() => {
  //   router.replace('/gig_details');
  // }, []);



  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  return (
    <View className="flex-1 px-6 justify-center" style={{ backgroundColor: colors.background }}>
      <View className="items-center mb-16">
        <Image 
          source={require('../assets/images/green-logo.png')} 
          style={{ width: 400, height: 200 }}
          resizeMode="contain"
        />
      </View>
      
      <View className="mb-4">
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 text-base text-[#169C46]"
          placeholder="Email"
          placeholderTextColor="#9CA3AF"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          style={{ fontFamily: 'Poppins_400Regular' , outline: '0'}}
        />
      </View>

      <View className="mb-2 relative">
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 text-base pr-12 text-[#169C46]"
          placeholder="Password"
          placeholderTextColor="#9CA3AF"
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
      
        <Text className="text-primary-500 text-sm" style={{ fontFamily: 'Poppins_400Regular' }}>Forget Password</Text>
      </TouchableOpacity>


      {error &&<Text className="text-red-500 mb-4" style={{ fontFamily: 'Poppins_400Regular' }}>{error}</Text>}

      <TouchableOpacity onPress={()=> router.push('home' as any)}className="bg-primary-500 rounded-xl py-4 mb-4">
        <Text className="text-white text-center text-base font-semibold" style={{ fontFamily: 'Poppins_600SemiBold' }}>Login</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={()=> router.push('home' as any)} className="border rounded-xl py-4 mb-6 items-center justify-center" style={{ borderColor: colors.border }}>
        <Text className="text-base" style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary }}>Continue as Guest</Text>
      </TouchableOpacity>
  
      <View className="flex-row justify-center">
        <Text className="text-sm" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Don't have an account? </Text>
        <TouchableOpacity>
          <Text onPress={() => router.push('register' as any)} className="text-primary-500 text-sm font-medium" style={{ fontFamily: 'Poppins_500Medium' }}>Sign up</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

