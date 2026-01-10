import { FontAwesome, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { router, usePathname } from "expo-router";
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, ScrollView, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const DRAWER_WIDTH = 280;

interface HeaderProps {
    title: string;
}

export default function Header({ title }: HeaderProps) {
    const { colors, isDark } = useTheme();

    const pathname = usePathname();
    const [backVisible, setBackVisible] = useState(false);
    const [profileVisible, setProfileVisible] = useState(false);
    const [notifVisible, setnotifVisible] = useState(false);
    const [addbtnvisible, setaddbtnvisible] = useState(false);
    const [showDrawer, setShowDrawer] = useState(false);
    const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
    const addPath = usePathname();
    const [btn, setBtn] = useState<'/add_gig' | '/add_studio' | '/add_group'>('/add_gig');

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


    useEffect(()=> {

        if(addPath === "/my_gig"){
            setBtn("/add_gig")
        }else if(addPath === "/my_studio"){
            setBtn("/add_studio")
        }else if(addPath === "/my_group"){
            setBtn("/add_group")
        }

    }, [addPath])



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
    {showDrawer && (
        <View
            className="flex-1 flex-row bg-black/50"
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 50 }}
        >
            <Animated.View 
                style={{ 
                    width: DRAWER_WIDTH,
                    elevation: 5,
                    transform: [{ translateX: slideAnim }],
                    backgroundColor: colors.background,
                    shadowColor: '#000',
                    shadowOffset: { width: 2, height: 0 },
                    shadowOpacity: 0.25,
                    shadowRadius: 4,
                }}
            >
                <DrawerContent closeDrawer={closeDrawer} colors={colors} isDark={isDark} />
            </Animated.View>
            
            <TouchableWithoutFeedback onPress={closeDrawer}>
                <View className="flex-1" />
            </TouchableWithoutFeedback>
        </View>
    )}

    {/* Header */}
    <View className="flex-row justify-between items-center pt-8 gap-2 pb-3" style={{ backgroundColor: colors.background }}>
        {/*back button. Conditional of visibility*/}
        {/*profile icon. Conditional. navigation still not yet set*/}
        <View className="w-12 justify-center items-start">
        {backVisible ? (
            <TouchableOpacity onPress={() => router.back()}>
                <Ionicons name ="arrow-back" size={24} color={colors.text}/>
            </TouchableOpacity>
        ):profileVisible ? (
            <TouchableOpacity onPress={openDrawer}>
                <Image 
                    source={{ uri: 'https://i.pravatar.cc/28' }} 
                    className="rounded-full"
                    style={{ height: 40, width: 40 }}
                />
            </TouchableOpacity>
        ):null}
        </View>

        {/*Title of the Page in the center*/}
        <View className="flex-1 justify-center items-center">
            <Text className="text-xl font-semibold" style={{ color: colors.text }}>{title}</Text>
        </View>

        <View className="w-12 justify-center items-end">

            {notifVisible ? (
                <TouchableOpacity onPress={() => router.push('/notifications')}>
                      <MaterialIcons name="notifications-none" size={33} color={colors.text} />
                </TouchableOpacity>
            ):addbtnvisible ? (
                <TouchableOpacity onPress={() => router.push(btn)}>
                    <Ionicons name="add-circle-outline" size={30} color={colors.text} />
                </TouchableOpacity>
            ):null}

        </View>

    </View>
    </>
    );
}

interface DrawerContentProps {
    closeDrawer: () => void;
    colors: any;
    isDark: boolean;
}

function DrawerContent({ closeDrawer, colors, isDark }: DrawerContentProps) {
    return (
        <ScrollView className="flex-1" style={{ backgroundColor: colors.background }}>
            <View className="pt-12 px-4">
                <View className="flex-row items-center pb-6 mb-4" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Image 
                        source={{ uri: 'https://i.pravatar.cc/60' }} 
                        className="rounded-full"
                        style={{ height: 60, width: 60 }}
                    />
                    <View className="ml-3 flex-1">
                        <Text className="text-lg font-semibold" style={{ color: colors.text }}>
                            Jared Cariaso
                        </Text>
                        <TouchableOpacity onPress={() => {
                            closeDrawer();
                            router.push('/profile');
                        }}>
                            <Text className="text-sm font-normal" style={{ color: colors.primary }}>
                                View Profile
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Menu Items. No route yet */}
                <DrawerMenuItem 
                    icon="check" 
                    label="Pending" 
                    colors={colors}
                    onPress={() => {
                        closeDrawer();
                        router.push('/pending');
                    }} 
                />
                <DrawerMenuItem 
                    icon="calendar" 
                    label="Upcoming" 
                    colors={colors}
                    onPress={() => {
                        closeDrawer();
                        router.push('/upcoming');
                    }} 
                />
                <DrawerMenuItem 
                    icon="calendar-check-o" 
                    label="Ongoing" 
                    colors={colors}
                    onPress={() => {
                        closeDrawer();
                        router.push('/ongoing');
                    }} 
                />
                <DrawerMenuItem 
                    icon="pencil" 
                    label="To Review" 
                    colors={colors}
                    onPress={() => {
                        closeDrawer();
                        router.push('/to_review');
                    }} 
                />
                <DrawerMenuItem 
                    icon="credit-card" 
                    label="Payments" 
                    colors={colors}
                    onPress={() => {
                        closeDrawer();
                        router.push('/wallet');
                    }} 
                />
                <DrawerMenuItem 
                    icon="cog" 
                    label="Settings" 
                    colors={colors}
                    onPress={() => {
                        closeDrawer();
                        router.push('/settings');
                    }} 
                />

                {/* Logout Button */}
                <View className="mt-8 pt-6" style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                    <TouchableOpacity 
                        className="flex-row items-center py-3 px-4 rounded-lg"
                        style={{ backgroundColor: isDark ? 'rgba(220, 38, 38, 0.15)' : '#FEF2F2' }}
                        onPress={() => {
                            closeDrawer();
                            router.push('/');
                        }}
                    >
                        <FontAwesome name="sign-out" size={20} color="#dc2626" />
                        <Text className="ml-3 font-medium" style={{ color: '#dc2626' }}>
                            Logout
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </ScrollView>
    );
}

interface DrawerMenuItemProps {
    icon: string;
    label: string;
    onPress: () => void;
    colors: any;
}

function DrawerMenuItem({ icon, label, onPress, colors }: DrawerMenuItemProps) {
    return (
        <TouchableOpacity 
            className="flex-row items-center py-4 px-4 mb-1 rounded-lg"
            onPress={onPress}
        >
            <FontAwesome name={icon as any} size={22} color={colors.textSecondary} />
            <Text className="ml-4 text-base font-normal" style={{ color: colors.text }}>
                {label}
            </Text>
        </TouchableOpacity>
    );
}
