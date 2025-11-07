import { FontAwesome, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { usePathname } from "expo-router";
import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';


export default function Header({ title}) {

    const pathname = usePathname();
    const [backVisible, setBackVisible] = useState(false);
    const [profileVisible, setProfileVisible] = useState(false);
    const [notifVisible, setnotifVisible] = useState(false);
    const navigation = useNavigation();

    useEffect(() => {
        if (pathname === "/explore" || pathname === "/home" || pathname === "/manage" ){
            setProfileVisible(true)
            setnotifVisible(true)
            setBackVisible(false)           
        }else{
            setBackVisible(true)
            setProfileVisible(false)
            setnotifVisible(false)           
        }
    }, [pathname]);
        

    return (
    <View className="flex-row bg-white justify-between items-center pt-8 px-4 gap-2">
        {/*back button. Conditional of visibility*/}
        <View className="w-1/4">
        {backVisible&&(
            <TouchableOpacity onPress={() => navigation.goBack()}>
                <Ionicons name ="arrow-back" size={24} color="black"/>
            </TouchableOpacity>
        )}
        </View>

        <View className="w-1/4">
            {/*profile icon. Conditional. navigation still not yet set*/}
            {profileVisible&&(
                <TouchableOpacity onPress={() =>navigation.goBack()} >
                    <FontAwesome name="user-circle" size={28} color="black" />
                </TouchableOpacity>
            )}
        </View>

        {/*Title of the Page in the center*/}
        <View className="flex-1 items-center">
            <Text className="text-black text-xl" style={{ fontFamily: 'Poppins_600SemiBold' }}>{title}</Text>
        </View>

        <View className="w-1/4 flex-row justify-end">
            {/*notification icon. Conditional. navigation not yet set*/}
            {notifVisible&&(
                <TouchableOpacity onPress = {() => navigation.goBack()}>
                    <MaterialIcons name="notifications-none" size={33} color="black" />
                </TouchableOpacity>
            )}
        </View>

    </View>
    );
}
