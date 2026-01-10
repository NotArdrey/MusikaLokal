import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import { useTheme } from '../src/context/ThemeContext';


export default function ChangePasswordScreen() {

    const { colors } = useTheme();
    const [currentPassword, setcurrentPassword] = useState('');
    const [newPassword, setnewPassword] = useState('');
    const [confirmPassword, setPassword] = useState('');

    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShownewPassword] = useState(false);
    const [showConfirmPassword, setShowPassword] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);

    return (
    <>
    <View  className="flex-1 px-6 gap-2" style={{ backgroundColor: colors.background }}>
        <Header title ="Change Password"/>

        {/* current pass */}
        <View className ="pt-3 relative mt-8">
            <TextInput className="border border-gray-500 rounded-lg pt-4 pb-4 px-4"
            placeholder='Enter your current password'
            placeholderTextColor="#9CA3AF"
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
            placeholderTextColor="#9CA3AF"
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
            placeholderTextColor="#9CA3AF"
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
            <TouchableOpacity className ="border border-black rounded-xl bg-primary-500 pt-4 pb-4 justify-center items-center"
            onPress={() => setModalVisible(true)}>
                <Text className ="text-white" style={{ fontFamily: 'Poppins_400Regular' }}>Submit</Text>
            </TouchableOpacity>     
        </View>
    </View>
    
    <Modal
    visible = {modalVisible}
    onClose={() => setModalVisible(false)}
    title="Confirm Password Change"
    message="Are you sure you want to change your password?"
    buttonText="Confirm">
    </Modal>
    </>
    

    
    );

}

