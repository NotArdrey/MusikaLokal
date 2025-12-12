import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';



export default function MyGigScreen() {

    return (
    <View className="flex-1 bg-white px-6">
      <Header title ="My Gig" />

      <ScrollView showsHorizontalScrollIndicator ={false}  className="pb-24">
        <View className ="flex flex-col rounded-xl gap-2" style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 6,
            elevation: 8,
            marginHorizontal: 4,
            marginVertical: 8,
            minHeight: 130,
            minWidth:100
        }}>
            <View className ="rounded-t-xl bg-gray-200" style={{ minHeight: 130, minWidth:100}}>
                <Image className ="rounded-t-xl "
                    source={{uri: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=400&h=130&fit=crop'}} 
                    style={{ minHeight: 130, minWidth:100}}
                    resizeMode="cover"
                />
            </View>
            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_600SemiBold', fontSize: 16}}>Barasoain Church Wedding - June 15, 2024</Text>
            </View>

            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#666'}}>Wedding ceremony music for 3 hours. Play classical, contemporary Christian, and OPM love songs. Malolos, Bulacan. ₱15,000</Text>
            </View>


            <View className="px-3 pb-3 flex-row justify-end gap-2">
                <TouchableOpacity 
                    className="rounded-lg bg-teal-500 items-center justify-center" 
                    style={{height: 36, width: 36}}
                    onPress={() => router.push('/manage_gig')}
                >
                    <Ionicons name="eye" size={20} color="#ffffff" />
                </TouchableOpacity>

                <TouchableOpacity 
                    className="rounded-lg bg-cyan-500 items-center justify-center" 
                    style={{height: 36, width: 36}}
                    onPress={() => router.push('/edit_gig')}
                >
                    <Ionicons name="pencil" size={20} color="#ffffff" />
                </TouchableOpacity>

                <TouchableOpacity 
                    className="rounded-lg bg-red-500 items-center justify-center" 
                    style={{height: 36, width: 36}}
                >
                    <Ionicons name="trash" size={20} color="#ffffff" />
                </TouchableOpacity>
            </View>
        </View>

        <View className="flex flex-col rounded-xl gap-2" style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 6,
            elevation: 8,
            marginHorizontal: 4,
            marginVertical: 8,
            minHeight: 130,
            minWidth: 100
        }}>
            <View className="rounded-t-xl bg-gray-200" style={{ minHeight: 130, minWidth: 100}}>
                <Image className="rounded-t-xl"
                    source={{uri: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&h=130&fit=crop'}} 
                    style={{ minHeight: 130, minWidth: 100}}
                    resizeMode="cover"
                />
            </View>
            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_600SemiBold', fontSize: 16}}>Makati Corporate Event - July 20, 2024</Text>
            </View>

            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#666'}}>Corporate anniversary celebration at BGC. Jazz and lounge music for 4 hours. Audience of 200+ guests. ₱25,000</Text>
            </View>

            <View className="border-gray-200 border-t-2 mx-3"></View>

            <View className="px-3 pb-3 flex-row justify-end gap-2">
                <TouchableOpacity 
                    className="rounded-lg bg-teal-500 items-center justify-center" 
                    style={{height: 36, width: 36}}
                    onPress={() => router.push('/manage_gig')}
                >
                    <Ionicons name="eye-outline" size={20} color="#ffffff" />
                </TouchableOpacity>

                <TouchableOpacity 
                    className="rounded-lg bg-cyan-500 items-center justify-center" 
                    style={{height: 36, width: 36}}
                    onPress={() => router.push('/edit_gig')}
                >
                    <Ionicons name="create-outline" size={20} color="#ffffff" />
                </TouchableOpacity>

                <TouchableOpacity 
                    className="rounded-lg bg-red-500 items-center justify-center" 
                    style={{height: 36, width: 36}}
                >
                    <Ionicons name="trash-outline" size={20} color="#ffffff" />
                </TouchableOpacity>
            </View>
        </View>
      </ScrollView>

        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
              <Navbar/>
        </View>
    </View>
    
    );
}