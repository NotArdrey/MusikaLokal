import { FontAwesome, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { router, usePathname } from "expo-router";
import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';


export default function Header({title}) {

    const pathname = usePathname();
    const [backVisible, setBackVisible] = useState(false);
    const [profileVisible, setProfileVisible] = useState(false);
    const [notifVisible, setnotifVisible] = useState(false);

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
    <View className="flex-row bg-white justify-between items-center pt-8 gap-2">
        {/*back button. Conditional of visibility*/}
        {/*profile icon. Conditional. navigation still not yet set*/}
        <View className="w-12 justify-center items-start">
        {backVisible ? (
            <TouchableOpacity onPress={() => router.back()}>
                <Ionicons name ="arrow-back" size={24} color="black"/>
            </TouchableOpacity>
        ):profileVisible ? (
            <TouchableOpacity onPress={() => router.push('/home')}>
                <FontAwesome name="user-circle" size={28} color="black" />
            </TouchableOpacity>
        ):null}
        </View>

        {/*Title of the Page in the center*/}
        <View className="flex-1 justify-center items-center">
            <Text className="text-black text-xl" style={{ fontFamily: 'Poppins_600SemiBold' }}>{title}</Text>
        </View>

        <View className="w-12 justify-center items-end">
            {/*notification icon. Conditional. navigation not yet set*/}
            {notifVisible&&(
                <TouchableOpacity onPress={() => router.push('notifications')}>
                    <MaterialIcons name="notifications-none" size={33} color="black" />
                </TouchableOpacity>
            )}
        </View>

    </View>
    );
}
