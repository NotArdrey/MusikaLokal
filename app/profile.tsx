import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar'
import { router } from 'expo-router';


export default function ProfileScreen() {
  const [showEdit, setShowEdit] = useState(true);

  return (
    <View className="flex-1 bg-white px-6">
      <Header title="My Profile"></Header>

      <View className="flex-row justify-between gap-5 pt-5">
        <View style={{ width: 96, height: 96, borderRadius: 48, overflow: 'hidden', backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}>
          <Image
            source={{ uri: 'https://via.placeholder.com/150' }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        </View>
        <View className="flex-col flex-1">


          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 18 }}>Jared Lopez Bagtas</Text>
          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14 }}>Drummer</Text>
          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14 }}>Rock, Indie, Folk</Text>
          {showEdit ? (
            <TouchableOpacity onPress={() => router.push('/edit_profile')} className="rounded-xl border border-gray-300 items-center justify-center py-2 px-3 flex-row gap-2 mt-2" style={{ width: '40%' }}>
              <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14 }}>Edit Profile</Text>
              <Ionicons name="pencil" size={16} color="#000" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>


      <View className="mt-5 flex gap-2 border-t border-gray-300 pt-3">
        <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16 }}>Completion Rate</Text>
        <View className="flex flex-row gap-2 items-center">
          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 20, color: '#10b981' }}>98%</Text>
          <View className="flex-1 h-2 bg-gray-300 rounded-full overflow-hidden">
            <View className="h-full bg-green-500 rounded-full" style={{ width: '98%' }} />
          </View>
        </View>
      </View>

      <View className="flex-row flex-wrap mt-5 gap-3">
        <View className="border border-gray-300 rounded-xl flex-col justify-center items-center p-4" style={{ width: '48%' }}>
          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16 }}>Active Gigs</Text>
          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 24 }}>5</Text>
        </View>

        <View className="border border-gray-300 rounded-xl flex-col justify-center items-center p-4" style={{ width: '48%' }}>
          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16 }}>Completed</Text>
          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 24 }}>5</Text>
        </View>

        <View className="border border-gray-300 rounded-xl flex-col justify-center items-center p-4" style={{ width: '48%' }}>
          <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16 }}>Reviews Pending</Text>
          <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 24 }}>5</Text>
        </View>
      </View>

      <View className="mt-5">
        <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16 }}>My Sample Music</Text>
      </View>

      <View className="flex flex-row mt-3">
        <View className="border border-gray-300 rounded-xl overflow-hidden bg-gray-100 items-center justify-center" style={{ width: '48%', height: 150 }}>
          <Image
            source={{ uri: 'https://via.placeholder.com/300x200?text=Video+Preview' }}
            className="w-full h-full"
            resizeMode="cover"
          />
          <View className="absolute inset-0 items-center justify-center">
            <View className="w-12 h-12 rounded-full bg-black/50 items-center justify-center">
              <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 20, color: 'white' }}>▶</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar />
      </View>
    </View>
  );
}