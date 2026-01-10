import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Modal from '../src/components/modal';
import { useTheme } from '../src/context/ThemeContext';

export default function RegisterScreen() {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role, setRole] = useState('');
  const [imageID, setImageID] = useState('null');
  const [userImage, setUserImage] = useState('null');
  const [modalVisible, setModalVisible] = useState(false);

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
      <>
      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingVertical: 16 }}>
      <View className="items-center mb-16 pt-20">
        <Image 
          source={require('../assets/images/green-logo.png')} 
          style={{ width: 400, height: 200 }}
          resizeMode="contain"
        />
      </View>

      <View className ="mb-2">
        <Text className = "text-xl font-semibold" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Email</Text>
      </View>

      <View className= "mb-4">
        <TextInput
          className ="border border-gray-300 rounded-lg pt-4 pb-4 text-base px-4 text-[#169C46]"
          placeholder ="Email"
          placeholderTextColor="#9CA3AF"
          value ={email}
          onChangeText={setEmail}
          keyboardType ="email-address"
          style={{ fontFamily: 'Poppins_400Regular', outline: '0' }}
        />
      </View>

      <View className ="mb-2">
        <Text className ="text-xl font-semibold" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Password</Text>
      </View>

      <View className = "mb-4">
        <TextInput
          className ="border border-gray-300 rounded-lg pt-4 pb-4 text-base px-4 text-[#169C46]"
          placeholder = "Create Password"
          placeholderTextColor="#9CA3AF"
          value ={password}
          onChangeText ={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize='none'
          style={{ fontFamily: 'Poppins_400Regular', outline: '0' }}
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
          className ="border border-gray-300 rounded-lg pt-4 pb-4 text-base px-4 text-[#169C46]"
          placeholder = "Confirm Password"
          placeholderTextColor="#9CA3AF"
          value ={confirmPassword}
          onChangeText ={setConfirmPassword}
          secureTextEntry={!showConfirmPassword}
          autoCapitalize='none'
          style={{ fontFamily: 'Poppins_400Regular', outline: '0' }}
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
        <Text className="text-xl font-semibold" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Select Role</Text>
      </View>

      <View className="border border-gray-300 rounded-lg mb-4 overflow-hidden bg-gray px-3">
        <Picker
          selectedValue={role}
          onValueChange={(itemValue) => setRole(itemValue)}
          style={{ 
            height: 56,
            color: '#169C46',
            fontFamily: 'Poppins_400Regular'
            , outline: '0'
          }}
        >
          <Picker.Item label="Select a role..." value="" color="#9CA3AF" />
          <Picker.Item label="Artist" value="artist" color="#169C46" />
          <Picker.Item label="Studio" value="studio" color="#169C46" />
          <Picker.Item label="Organizer" value="organizer" color="#169C46" />
        </Picker>
      </View>

      <View>
        <Text className = "text-xl font-semibold" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Verify Your Identity</Text>
      </View>

      <View>
        <Text className ="text-l font-light pt-2.5" style={{ fontFamily: 'Poppins_300Light', color: colors.text }}>To ensure the safety of our community, we require all users to verify their identity by uploading a valid government-issued ID.</Text>
        <Text className ="text-sm pt-2" style={{ fontFamily: 'Poppins_300Light', color: colors.textSecondary }}>Accepted IDs: Philippine National ID, Driver's License, Passport, SSS ID, PhilHealth ID, Postal ID, Voter's ID, or PRC ID.</Text>
      </View>

      <View className="justify-center items-center border border-dashed border-gray-300 rounded-lg p-6 mt-3" style={{ minHeight: 150, width: '100%' }}>
        <TouchableOpacity
          onPress={pickImageID}
          className="justify-center items-center"
        >
          <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Upload Your Government ID</Text>
        </TouchableOpacity>
      </View>

      <View className ="justify-center items-center border border-dashed border-gray-300 rounded-lg p-6 mt-3" style={{minHeight: 150, width: '100%'}}>
          <TouchableOpacity onPress={pickUserImage} className='justify-center items-center'>
            <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>Capture Your Selfie</Text>
          </TouchableOpacity>
      </View>

      <View className="justify-center items-center mt-1">
          <TouchableOpacity className="bg-primary-500 rounded-xl py-4 mt-6 justify-center items-center" style={{width: '100%'}} onPress={() => setModalVisible(true)}>
            <Text className='text-white font-semibold' style={{ fontFamily: 'Poppins_600SemiBold' }}>Create Account</Text>
          </TouchableOpacity>
      </View>

      <View className='justify-center items-center mt-5 mb-2'>
        <Text className ="text-sm font-normal" style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}>Already have an account?<TouchableOpacity> <Text  className ='text-primary-500'onPress ={() => router.push('/')} style={{ fontFamily: 'Poppins_400Regular' }}> Login</Text></TouchableOpacity></Text>
      </View>

  </ScrollView>
  
    <Modal
    visible = {modalVisible}
    onClose={() => setModalVisible(false)}
    title="Confirm Registration"
    message="Are you sure you want to create this account?"
    buttonText="Register">
    </Modal>
  </>
  );
}


