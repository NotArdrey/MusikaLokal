import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function Navbar() {
    const { colors } = useTheme();
    const pathname = usePathname();
    let activeTab = ''; 

    // Active/Inactive colors from theme
    const ACTIVE_COLOR = colors.primary;
    const INACTIVE_COLOR = colors.muted;

    if (pathname.includes('explore')) {
        activeTab = 'explore';
    } else if (pathname.includes('home')) {
        activeTab = 'home';
    } else if (pathname.includes('my_studio') || pathname.includes('my_gig') || pathname.includes('my_group')) {
        activeTab = 'manage';
    }
    
    return (
    <View className="flex-row justify-between items-start gap-15 px-10 pb-5 pt-5" style={{ backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border }}>
        <View className="flex-col justify-between items-center">
            <TouchableOpacity className='justify-center items-center' 
                onPress={()=> {
                    router.push("/home");
            }}>
                <MaterialCommunityIcons name="music-note" size={24} color={activeTab === "home" ? ACTIVE_COLOR : INACTIVE_COLOR}/>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: activeTab === "home" ? ACTIVE_COLOR : INACTIVE_COLOR}}>Home</Text>
            </TouchableOpacity>
        </View>

        <View className="flex-col justify-between items-center">
            <TouchableOpacity className='justify-center items-center' 
                onPress={()=> {
                    router.push("/explore");
            }}>
                <MaterialCommunityIcons name="compass-outline" size={24} color={activeTab === "explore" ? ACTIVE_COLOR : INACTIVE_COLOR}/>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: activeTab === "explore" ? ACTIVE_COLOR : INACTIVE_COLOR}}>Explore</Text>
            </TouchableOpacity>
        </View>

        <View className="flex-col justify-between items-center">
            <TouchableOpacity className='justify-center items-center' 
                onPress={()=> {
                    router.push("/my_studio");
            }}>
                <MaterialCommunityIcons name="music-box-multiple-outline" size={24} color={activeTab === "manage" ? ACTIVE_COLOR : INACTIVE_COLOR}/>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: activeTab === "manage" ? ACTIVE_COLOR : INACTIVE_COLOR}}>Manage</Text>
            </TouchableOpacity>
        </View>
    </View>
    
    );
}
