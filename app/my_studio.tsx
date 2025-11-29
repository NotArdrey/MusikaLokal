import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar';
import { router } from 'expo-router';


export default function myStudioScreen() {

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

            <View className ="border-gray-200 border-t-2 mx-3"></View>

            <View className="px-3 justify-center">
                <TouchableOpacity className ="rounded-lg bg-teal-600 items-center justify-center" style={{height:30}} onPress={()=> router.push('/edit_gig')}>
                    <Text style={{fontFamily: 'Poppins_500Medium', color: '#ffffff'}}>View Details</Text>
                </TouchableOpacity>
            </View>

            <View className="px-3 justify-center">
                <TouchableOpacity className ="rounded-lg bg-cyan-600 items-center justify-center" style={{height:30}}>
                    <Text style={{fontFamily: 'Poppins_500Medium', color: '#ffffff'}}>Edit Details</Text>
                </TouchableOpacity>
            </View>

            <View className="px-3 justify-center">
                <TouchableOpacity className ="rounded-lg bg-red-700 items-center justify-center mb-5" style={{height:30}}>
                    <Text style={{fontFamily: 'Poppins_500Medium', color: '#ffffff'}}>Remove</Text>
                </TouchableOpacity>
            </View>
        </View>

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
                    source={{uri: 'https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=400&h=130&fit=crop'}} 
                    style={{ minHeight: 130, minWidth:100}}
                    resizeMode="cover"
                />
            </View>
            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_600SemiBold', fontSize: 16}}>Studio Akustik Jakarta</Text>
            </View>

            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#666'}}>Acoustic treatment studio with soundproof rooms. Ideal for podcast recording, voice-over sessions, and acoustic performances.</Text>
            </View>

            <View className ="border-gray-200 border-t-2 mx-3"></View>

            <View className="px-3 justify-center">
                <TouchableOpacity className ="rounded-lg bg-teal-600 items-center justify-center" style={{height:30}}>
                    <Text style={{fontFamily: 'Poppins_500Medium', color: '#ffffff'}}>View Details</Text>
                </TouchableOpacity>
            </View>

            <View className="px-3 justify-center">
                <TouchableOpacity className ="rounded-lg bg-cyan-600 items-center justify-center" style={{height:30}}>
                    <Text style={{fontFamily: 'Poppins_500Medium', color: '#ffffff'}}>Edit Details</Text>
                </TouchableOpacity>
            </View>

            <View className="px-3 justify-center">
                <TouchableOpacity className ="rounded-lg bg-red-700 items-center justify-center mb-5" style={{height:30}}>
                    <Text style={{fontFamily: 'Poppins_500Medium', color: '#ffffff'}}>Remove</Text>
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