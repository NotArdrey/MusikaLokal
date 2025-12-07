import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar';



export default function myStudioScreen() {

    return (
    <View className="flex-1 bg-white px-6">
      <Header title ="My Group" />

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
                    source={{uri: 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=400&h=130&fit=crop'}} 
                    style={{ minHeight: 130, minWidth:100}}
                    resizeMode="cover"
                />
            </View>
            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_600SemiBold', fontSize: 16}}>The Manila Sound Collective</Text>
            </View>

            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#666'}}>5-piece OPM band specializing in classic hits and modern Filipino rock. Available for weddings, corporate events, and private parties.</Text>
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
                    source={{uri: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=130&fit=crop'}} 
                    style={{ minHeight: 130, minWidth:100}}
                    resizeMode="cover"
                />
            </View>
            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_600SemiBold', fontSize: 16}}>Indie Pinoy Acoustic Trio</Text>
            </View>

            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#666'}}>Acoustic trio performing indie Filipino music, folk, and pop ballads. Perfect for intimate gigs, cafes, and chill venues around Metro Manila.</Text>
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