import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';



export default function Navbar() {
    const [activeTab, setActiveTab] = useState("home");

    return (
    <View className="flex-row bg-white justify-between items-start gap-15 px-10 mb-5 border-t border-gray-300 pt-5">
        <View className="flex-col justify-between items-center">
            <TouchableOpacity className='justify-center items-center' 
                onPress={()=> {
                    setActiveTab("home");
                    router.push("/home");
            }}>
                <Ionicons name="home-outline" size={24} color ={activeTab === "home"? "#000000" : "#638782"}/>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', color: activeTab === "home"? "#000000" : "#638782"}}>Home</Text>
            </TouchableOpacity>
        </View>

        <View className="flex-col justify-between items-center">
            <TouchableOpacity className='justify-center items-center' 
                onPress={()=> {
                    setActiveTab("explore");
                    router.push("/home");
            }}>
                <Ionicons name="search-outline" size={24} color ={activeTab === "explore"? "#000000" : "#638782"}/>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', color: activeTab === "explore"? "#000000" : "#638782"}}>Explore</Text>
            </TouchableOpacity>
        </View>

        <View className="flex-col justify-between items-center">
            <TouchableOpacity className='justify-center items-center' 
                onPress={()=> {
                    setActiveTab("manage");
                    router.push("/home");
            }}>
                <Ionicons name="newspaper-outline" size={24} color ={activeTab === "manage"? "#000000" : "#638782"}/>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', color: activeTab === "manage"? "#000000" : "#638782"}}>Manage</Text>
            </TouchableOpacity>
        </View>

        
    </View>
    
    );
}
