import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../components/header';


export default function ChangePasswordScreen() {

    const [currentPassword, setcurrentPassword] = useState('');
    const [newPassword, setnewPassword] = useState('');
    const [confirmPassword, setPassword] = useState('');

    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShownewPassword] = useState(false);
    const [showConfirmPassword, setShowPassword] = useState(false);
    return (

    <View  className="flex-1 bg-white px-6 gap-2">
        <Header title ="Change Password"/>

        {/* current pass */}
        <View className ="pt-3 relative mt-8">
            <TextInput className="border border-gray-500 rounded-lg pt-4 pb-4 px-4"
            placeholder='Enter your current password'
            placeholderTextColor="#4D998C"
            value={currentPassword}
            onChangeText={setcurrentPassword}
            secureTextEntry={!showCurrentPassword}
            style={{ fontFamily: 'Poppins_400Regular' }}
            />
            <TouchableOpacity 
            className="absolute right-5 top-[1.69rem]"
            onPress={() => setShowCurrentPassword(!showCurrentPassword)}
            >
            <Ionicons 
                name={showCurrentPassword ? 'eye-outline' : 'eye-off-outline'} 
                size={22} 
                color="#9CA3AF" 
            />
            </TouchableOpacity>      
        </View>


        {/* new pass */}
        <View className ="pt-3 relative">
            <TextInput className="border border-gray-500 rounded-lg pt-4 pb-4 px-4"
            placeholder='Create a new password'
            placeholderTextColor="#4D998C"
            value={newPassword}
            onChangeText={setnewPassword}
            secureTextEntry={!showNewPassword}
            style={{ fontFamily: 'Poppins_400Regular' }}
            />
            <TouchableOpacity 
            className="absolute right-5 top-[1.69rem]"
            onPress={() => setShownewPassword(!showNewPassword)}
            >
            <Ionicons 
                name={showNewPassword ? 'eye-outline' : 'eye-off-outline'} 
                size={22} 
                color="#9CA3AF" 
            />
            </TouchableOpacity>      
        </View>



        {/* re enter*/}
        <View className ="pt-3 relative">
            <TextInput className="border border-gray-500 rounded-lg pt-4 pb-4 px-4"
            placeholder='Re-enter new password'
            placeholderTextColor="#4D998C"
            value={confirmPassword}
            onChangeText={setPassword}
            secureTextEntry={!showConfirmPassword}
            style={{ fontFamily: 'Poppins_400Regular' }}
            />
            <TouchableOpacity 
            className="absolute right-5 top-[1.69rem]"
            onPress={() => setShowPassword(!showConfirmPassword)}
            >
            <Ionicons 
                name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'} 
                size={22} 
                color="#9CA3AF" 
            />
            </TouchableOpacity>      
        </View>

        <View className ="pt-3">
            <TouchableOpacity className ="border border-black rounded-lg pt-4 pb-4 justify-center items-center bg-blue-600"
            onPress={() => router.push('./')}>
                <Text className ="text-white" style={{ fontFamily: 'Poppins_400Regular' }}>Submit</Text>
            </TouchableOpacity>     
        </View>
    </View>
    

    
    );

}
