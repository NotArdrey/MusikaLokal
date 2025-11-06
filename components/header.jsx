import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

export default function Header({ title}) {

    const navigation = useNavigation();

    return (
    <View className="flex-row bg-white items-center pt-8">
        <TouchableOpacity onPress={() => navigation.goBack()} className="z-10">
            <Ionicons name ="arrow-back" size={24} color="black"/>
        </TouchableOpacity>
        <View className="absolute left-0 right-0 items-center">
            <Text className="text-black text-xl" style={{ fontFamily: 'Poppins_600SemiBold' }}>{title}</Text>
        </View>
    </View>
    );
}
