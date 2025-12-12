import { router } from 'expo-router';
import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';


export default function ForgetPasswordScreen() {

    const [email, setEmail] = useState('');

    return (

    <View  className="flex-1 bg-white px-6">
            <Header title ="Forget Password"/>
        <View className ="pt-10">
            <Text className ="text-black text-lg" style={{ fontFamily: 'Poppins_600SemiBold' }}>Email Address</Text>
        </View>

        <View className ="pt-3">
            <TextInput className="border border-gray-500 rounded-lg pt-4 pb-4 px-4"
            placeholder='example@email.com'
            placeholderTextColor="#4D998C"
            value={email}
            onChangeText={setEmail}
            keyboardType='email-address'
            style={{ fontFamily: 'Poppins_400Regular' }}
            />
        </View>

        <View className ="pt-6">
            <TouchableOpacity className ="border border-black rounded-xl bg-teal-500 pt-4 pb-4 justify-center items-center"
            onPress={() => router.push('./')}>
                <Text className ="text-white"style={{ fontFamily: 'Poppins_400Regular' }}>Submit</Text>
            </TouchableOpacity>     
        </View>


    




    </View>
    

    
    );

}
