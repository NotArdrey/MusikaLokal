import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import { useTheme } from '../src/context/ThemeContext';


export default function ForgetPasswordScreen() {

    const { colors } = useTheme();
    const [email, setEmail] = useState('');
    const [modalVisible, setModalVisible] = useState(false);

    return (
    <>
    <View className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
            <Header title ="Change Email"/>
        <View className ="pt-10">
            <Text className ="text-black text-lg" style={{ fontFamily: 'Poppins_600SemiBold' }}>Email Address</Text>
        </View>

        <View className ="pt-3">
            <TextInput className="border border-gray-500 rounded-lg pt-4 pb-4 px-4"
            placeholder='example@email.com'
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={setEmail}
            keyboardType='email-address'
            style={{ fontFamily: 'Poppins_400Regular' }}
            />
        </View>

        <View className ="pt-6">
            <TouchableOpacity className ="border border-black rounded-xl bg-primary-500 pt-4 pb-4 justify-center items-center"
            onPress={() => setModalVisible(true)}>
                <Text className ="text-white"style={{ fontFamily: 'Poppins_400Regular' }}>Submit</Text>
            </TouchableOpacity>     
        </View>
    </View>
    
    <Modal
    visible = {modalVisible}
    onClose={() => setModalVisible(false)}
    title="Confirm Email Change"
    message="Are you sure you want to change your email?"
    buttonText="Confirm">
    </Modal>
    </>
    );

}
