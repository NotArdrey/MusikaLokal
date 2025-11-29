import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar';



export default function myStudioScreen() {

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
                    source={{uri: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&h=130&fit=crop'}} 
                    style={{ minHeight: 130, minWidth:100}}
                    resizeMode="cover"
                />
            </View>
            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_600SemiBold', fontSize: 16}}>Makati Corporate Event - July 20, 2024</Text>
            </View>

            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#666'}}>Corporate anniversary celebration at BGC. Jazz and lounge music for 4 hours. Audience of 200+ guests. ₱25,000</Text>
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