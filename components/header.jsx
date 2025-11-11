import { FontAwesome, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { router, usePathname } from "expo-router";
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Modal, ScrollView, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';

const DRAWER_WIDTH = 280;

export default function Header({title}) {

    const pathname = usePathname();
    const [backVisible, setBackVisible] = useState(false);
    const [profileVisible, setProfileVisible] = useState(false);
    const [notifVisible, setnotifVisible] = useState(false);
    const [addbtnvisible, setaddbtnvisible] = useState(false);
    const [showDrawer, setShowDrawer] = useState(false);
    const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

    useEffect(() => {
        if (pathname === "/explore" || pathname === "/home" || pathname === "/manage" ){
            setProfileVisible(true)
            setnotifVisible(true)
            setBackVisible(false)     
            setaddbtnvisible(false)      
        }else if(pathname === "/my_group"|| pathname === "/my_gig" || pathname === "/my_studio"){
            setProfileVisible(true)
            setnotifVisible(false)
            setBackVisible(false)   
            setaddbtnvisible(true) 
        }else{
            setBackVisible(true)
            setProfileVisible(false)
            setnotifVisible(false)     
            setaddbtnvisible(false)       
        }
    }, [pathname]);

    const openDrawer = () => {
        setShowDrawer(true);
        Animated.timing(slideAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
        }).start();
    };

    const closeDrawer = () => {
        Animated.timing(slideAnim, {
            toValue: -DRAWER_WIDTH,
            duration: 300,
            useNativeDriver: true,
        }).start(() => {
            setShowDrawer(false);
        });
    };


    return (
    <>
    <Modal
        visible={showDrawer}
        transparent={true}
        animationType="none"
        onRequestClose={closeDrawer}
    >
        <View className="flex-1 flex-row bg-black/50">
            <Animated.View 
                className="bg-white shadow-lg"
                style={{ 
                    width: DRAWER_WIDTH,
                    elevation: 5,
                    transform: [{ translateX: slideAnim }]
                }}
            >
                <DrawerContent closeDrawer={closeDrawer} />
            </Animated.View>
            
            <TouchableWithoutFeedback onPress={closeDrawer}>
                <View className="flex-1" />
            </TouchableWithoutFeedback>
        </View>
    </Modal>

    {/* Header */}
    <View className="flex-row bg-white justify-between items-center pt-8 gap-2">
        {/*back button. Conditional of visibility*/}
        {/*profile icon. Conditional. navigation still not yet set*/}
        <View className="w-12 justify-center items-start">
        {backVisible ? (
            <TouchableOpacity onPress={() => router.back()}>
                <Ionicons name ="arrow-back" size={24} color="black"/>
            </TouchableOpacity>
        ):profileVisible ? (
            <TouchableOpacity onPress={openDrawer}>
                <FontAwesome name="user-circle" size={28} color="black" />
            </TouchableOpacity>
        ):null}
        </View>

        {/*Title of the Page in the center*/}
        <View className="flex-1 justify-center items-center">
            <Text className="text-black text-xl font-semibold">{title}</Text>
        </View>

        <View className="w-12 justify-center items-end">
            {/*notification icon. Conditional. navigation not yet set*/}
            {notifVisible ? (
                <TouchableOpacity onPress={() => router.push('notifications')}>
                      <MaterialIcons name="notifications-none" size={33} color="black" />
                </TouchableOpacity>
            ):addbtnvisible ? (
                <TouchableOpacity onPress={openDrawer}>
                    <Ionicons name="add-circle-outline" size={33} color="black" />
                </TouchableOpacity>
            ):null}

        </View>

    </View>
    </>
    );
}

function DrawerContent({ closeDrawer }) {
    return (
        <ScrollView className="flex-1 bg-white">
            <View className="pt-12 px-4">
                <View className="flex-row items-center pb-6 border-b border-gray-200 mb-4">
                    <Image 
                        source={{ uri: 'https://via.placeholder.com/60' }} 
                        className="rounded-full border h-[60px] w-[60px]"
                    />
                    <View className="ml-3 flex-1">
                        <Text className="text-lg font-semibold">
                            Jared Cariaso
                        </Text>
                        <TouchableOpacity onPress={() => {
                            closeDrawer();
                            router.push('/');
                        }}>
                            <Text className="text-[#5E8C87] text-sm font-normal">
                                View Profile
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Menu Items. No route yet */}
                <DrawerMenuItem 
                    icon="check" 
                    label="To Confirm" 
                    onPress={() => {
                        closeDrawer();
                        router.push('/');
                    }} 
                />
                <DrawerMenuItem 
                    icon="calendar" 
                    label="Upcoming" 
                    onPress={() => {
                        closeDrawer();
                        router.push('/');
                    }} 
                />
                <DrawerMenuItem 
                    icon="calendar-check-o" 
                    label="Ongoing" 
                    onPress={() => {
                        closeDrawer();
                        router.push('/');
                    }} 
                />
                <DrawerMenuItem 
                    icon="pencil" 
                    label="To Review" 
                    onPress={() => {
                        closeDrawer();
                        router.push('/');
                    }} 
                />
                <DrawerMenuItem 
                    icon="credit-card" 
                    label="Payments" 
                    onPress={() => {
                        closeDrawer();
                        router.push('/');
                    }} 
                />
                <DrawerMenuItem 
                    icon="cog" 
                    label="Settings" 
                    onPress={() => {
                        closeDrawer();
                        router.push('/');
                    }} 
                />

                {/* Logout Button */}
                <View className="mt-8 pt-6 border-t border-gray-200">
                    <TouchableOpacity 
                        className="flex-row items-center py-3 px-4 bg-red-50 rounded-lg"
                        onPress={() => {
                            closeDrawer();
                            router.push('/');
                        }}
                    >
                        <FontAwesome name="sign-out" size={20} color="#dc2626" />
                        <Text className="ml-3 text-red-600 font-medium">
                            Logout
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </ScrollView>
    );
}

function DrawerMenuItem({ icon, label, onPress }) {
    return (
        <TouchableOpacity 
            className="flex-row items-center py-4 px-4 mb-1 rounded-lg active:bg-gray-100"
            onPress={onPress}
        >
            <FontAwesome name={icon} size={22} color="#374151" />
            <Text className="ml-4 text-gray-700 text-base font-normal">
                {label}
            </Text>
        </TouchableOpacity>
    );
}
