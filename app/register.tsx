import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role, setRole] = useState('');
  const [imageID, setImageID] = useState('null');
  const [userImage, setUserImage] = useState('null');

  const pickImageID = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if(permission.status != 'granted'){
      alert('Permission to access Gallery is required');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 4],
      quality: 1,
    });

    if (!result.canceled) {
      setImageID(result.assets[0].uri);
    }
  };

  const pickUserImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if(permission.status != 'granted'){
      alert('Permission to access Gallery is required');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 4],
      quality: 1,
    });

    if (!result.canceled) {
      setUserImage(result.assets[0].uri);
    }
  };

  return (
      <ScrollView className="bg-white" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingVertical: 16 }}>
      <View className="items-center mb-16 pt-20">
        <View className="w-48 h-24 bg-gray-100 rounded-lg items-center justify-center">
          <Text className="text-gray-400 text-sm" style={{ fontFamily: 'Poppins_400Regular' }}>Logo Space</Text>
        </View>
      </View>

      <View className ="mb-2">
        <Text className = "text-black text-xl font-semibold" style={{ fontFamily: 'Poppins_600SemiBold' }}>Email</Text>
      </View>

      <View className= "mb-4">
        <TextInput
          className ="border border-gray-300 rounded-lg pt-4 pb-4 text-base px-4 text-[#4D998C]"
          placeholder ="Email"
          placeholderTextColor ="#4D998C"
          value ={email}
          onChangeText={setEmail}
          keyboardType ="email-address"
          style={{ fontFamily: 'Poppins_400Regular' }}
        />
      </View>

      <View className ="mb-2">
        <Text className ="text-black text-xl font-semibold" style={{ fontFamily: 'Poppins_600SemiBold' }}>Password</Text>
      </View>

      <View className = "mb-4">
        <TextInput
          className ="border border-gray-300 rounded-lg pt-4 pb-4 text-base px-4 text-[#4D998C]"
          placeholder = "Create Password"
          placeholderTextColor ="#4D998C"
          value ={password}
          onChangeText ={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize='none'
          style={{ fontFamily: 'Poppins_400Regular' }}
        />

        <TouchableOpacity 
          className="absolute right-4 top-4"
          onPress={() => setShowPassword(!showPassword)}
        >
          <Ionicons 
            name={showPassword ? 'eye-outline' : 'eye-off-outline'} 
            size={22} 
            color="#9CA3AF" 
          />
        </TouchableOpacity>
      </View>

      <View className = "mb-4">
        <TextInput
          className ="border border-gray-300 rounded-lg pt-4 pb-4 text-base px-4 text-[#4D998C]"
          placeholder = "Confirm Password"
          placeholderTextColor ="#4D998C"
          value ={confirmPassword}
          onChangeText ={setConfirmPassword}
          secureTextEntry={!showConfirmPassword}
          autoCapitalize='none'
          style={{ fontFamily: 'Poppins_400Regular' }}
        />

        <TouchableOpacity 
          className="absolute right-4 top-4"
          onPress={() => setShowConfirmPassword(!showConfirmPassword)}
        >
          <Ionicons 
            name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'} 
            size={22} 
            color="#9CA3AF" 
          />
        </TouchableOpacity>
      </View>

      <View className="mb-2">
        <Text className="text-black text-xl font-semibold" style={{ fontFamily: 'Poppins_600SemiBold' }}>Select Role</Text>
      </View>

      <View className="border border-gray-300 rounded-lg mb-4 overflow-hidden bg-gray px-3">
        <Picker
          selectedValue={role}
          onValueChange={(itemValue) => setRole(itemValue)}
          style={{ 
            height: 56,
            color: '#4D998C',
            fontFamily: 'Poppins_400Regular'
          }}
        >
          <Picker.Item label="Select a role..." value="" color="#9CA3AF" />
          <Picker.Item label="Artist" value="artist" color="#4D998C" />
          <Picker.Item label="Studio" value="studio" color="#4D998C" />
          <Picker.Item label="Organizer" value="organizer" color="#4D998C" />
        </Picker>
      </View>

      <View>
        <Text className = "text-black text-xl font-semibold" style={{ fontFamily: 'Poppins_600SemiBold' }}>Verify Your Identity</Text>
      </View>

      <View>
        <Text className ="text-black text-l font-light pt-2.5" style={{ fontFamily: 'Poppins_300Light' }}>To ensure the safety of our community, we require all users to verify their identity by uploading a valid government-issued ID.</Text>
      </View>

      <View className="justify-center items-center border border-dashed border-gray-300 rounded-lg p-6 mt-3" style={{ minHeight: 150, width: '100%' }}>
        <TouchableOpacity
          onPress={pickImageID}
          className="justify-center items-center"
        >
          <Text className="text-gray-500" style={{ fontFamily: 'Poppins_400Regular' }}>Upload Your Government ID</Text>
        </TouchableOpacity>
      </View>

      <View className ="justify-center items-center border border-dashed border-gray-300 rounded-lg p-6 mt-3" style={{minHeight: 150, width: '100%'}}>
          <TouchableOpacity onPress={pickUserImage} className='justify-center items-center'>
            <Text className ="text-gray-500" style={{ fontFamily: 'Poppins_400Regular' }}>Selfie ka na Pogi</Text>
          </TouchableOpacity>
      </View>

      <View className="justify-center items-center mt-1">
          <TouchableOpacity className="bg-[#12D4B5] rounded-md py-4 mt-6 justify-center items-center" style={{width: '100%'}}>
            <Text className='text-black font-semibold' style={{ fontFamily: 'Poppins_600SemiBold' }}>Create Account</Text>
          </TouchableOpacity>
      </View>

      <View className='justify-center items-center mt-2 mb-2'>
        <Text className ="text-teal-500 text-sm font-normal" style={{ fontFamily: 'Poppins_400Regular' }}>Already have an account?<TouchableOpacity> <Text onPress ={() => router.push('/')} style={{ fontFamily: 'Poppins_400Regular' }}> Login</Text></TouchableOpacity></Text>
      </View>

  </ScrollView>
  );
}

