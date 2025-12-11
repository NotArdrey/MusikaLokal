import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar';


export default function MyStudioScreen() {

    return (
    <View className="flex-1 bg-white px-6">
      <Header title ="My Studio" />

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
                    source={{uri: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400&h=130&fit=crop'}} 
                    style={{ minHeight: 130, minWidth:100}}
                    resizeMode="cover"
                />
            </View>
            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_600SemiBold', fontSize: 16}}>Harmony Recording Studio</Text>
            </View>

            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#666'}}>Professional recording studio with state-of-the-art equipment. Perfect for vocals, instruments, and full band recordings.</Text>
            </View>


            <View className="px-3 pb-3 flex-row justify-end gap-2">
                <TouchableOpacity 
                    className="rounded-lg bg-teal-500 items-center justify-center" 
                    style={{height: 36, width: 36}}
                    onPress={() => router.push('/manage_studio')}
                >
                    <Ionicons name="eye-outline" size={20} color="#ffffff" />
                </TouchableOpacity>

                <TouchableOpacity 
                    className="rounded-lg bg-cyan-500 items-center justify-center" 
                    style={{height: 36, width: 36}}
                    onPress={() => router.push('/edit_studio')}
                >
                    <Ionicons name="pencil" size={20} color="#ffffff" />
                </TouchableOpacity>

                <TouchableOpacity 
                    className="rounded-lg bg-red-500 items-center justify-center" 
                    style={{height: 36, width: 36}}
                >
                    <Ionicons name="trash-outline" size={20} color="#ffffff" />
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
                    source={{uri: 'https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=400&h=130&fit=crop'}} 
                    style={{ minHeight: 130, minWidth: 100}}
                    resizeMode="cover"
                />
            </View>
            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_600SemiBold', fontSize: 16}}>Studio Akustik Jakarta</Text>
            </View>

            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#666'}}>Acoustic treatment studio with soundproof rooms. Ideal for podcast recording, voice-over sessions, and acoustic performances.</Text>
            </View>


            <View className="px-3 pb-3 flex-row justify-end gap-2">
                <TouchableOpacity 
                    className="rounded-lg bg-teal-500 items-center justify-center" 
                    style={{height: 36, width: 36}}
                    onPress={() => router.push('/manage_studio')}
                >
                    <Ionicons name="eye" size={20} color="#ffffff" />
                </TouchableOpacity>

                <TouchableOpacity 
                    className="rounded-lg bg-cyan-500 items-center justify-center" 
                    style={{height: 36, width: 36}}
                    onPress={() => router.push('/edit_studio')}
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
      </ScrollView>

        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
              <Navbar/>
        </View>
    </View>
    
    );
}