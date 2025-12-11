import React, { useState } from 'react';
import { Dimensions, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar';

const { width: screenWidth } = Dimensions.get('window');
const imageWidth = screenWidth * 0.35;

const cardStyle = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.1,
  shadowRadius: 6,
  elevation: 8,
  marginHorizontal: 4,
  marginVertical: 8,
  backgroundColor: '#fff',
};

export default function OngoingScreen() {

  const [afterImage, setAfterImage] = useState('');
  const [beforeImage, setBeforeImage] = useState('');

    return (
    <View className="flex-1 bg-white px-4">
      <Header title="Ongoing"></Header>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 100}}>

        <View className="mt-10">
          <Text style={{fontFamily: 'Poppins_600SemiBold', fontSize: 18}}>Ongoing Bookings</Text>
        </View>
        <View className="flex flex-col gap-2 mt-3">

          <View className="flex flex-row items-stretch p-3 rounded-xl" style={cardStyle}>
            <View className="flex-1 flex justify-between gap-2 py-2 pr-3"> 
              <Text className="text-green-600" style={{fontFamily: 'Poppins_400Regular', fontSize: 12}}>Active</Text>
              <Text style={{fontFamily: 'Poppins_600SemiBold', fontSize: 14}} numberOfLines={2}>Music One Studios Makati</Text>
              <Text style={{fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#666'}} numberOfLines={1}>Sat, Dec 14 - 2:00 PM - 4:00 PM</Text>
              <TouchableOpacity className="bg-[#14b8a6] rounded-lg px-3 py-2 mt-1 self-start">
                <Text className="text-white" style={{fontFamily: 'Poppins_500Medium', fontSize: 12}}>Upload Proof</Text>
              </TouchableOpacity>
            </View>
            
            <View className="rounded-xl overflow-hidden" style={{width: imageWidth}}>
              <Image 
                className="rounded-xl"
                source={{uri: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=400&h=130&fit=crop'}}
                style={{height: '100%', width: '100%'}}
                resizeMode="cover"
              />
            </View>  
          </View>

          <View className="flex flex-row items-stretch p-3 rounded-xl" style={cardStyle}>
            <View className="flex-1 flex justify-between gap-2 py-2 pr-3"> 
              <Text className="text-green-600" style={{fontFamily: 'Poppins_400Regular', fontSize: 12}}>Active</Text>
              <Text style={{fontFamily: 'Poppins_600SemiBold', fontSize: 14}} numberOfLines={2}>Saguijo Cafe + Bar Makati</Text>
              <Text style={{fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#666'}} numberOfLines={1}>Fri, Dec 13 - 8:00 PM - 11:00 PM</Text>
              <TouchableOpacity className="bg-[#14b8a6] rounded-lg px-3 py-2 mt-1 self-start">
                <Text className="text-white" style={{fontFamily: 'Poppins_500Medium', fontSize: 12}}>Upload Proof</Text>
              </TouchableOpacity>
            </View>
            
            <View className="rounded-xl overflow-hidden" style={{width: imageWidth}}>
              <Image 
                className="rounded-xl"
                source={{uri: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=400&h=130&fit=crop'}}
                style={{height: '100%', width: '100%'}}
                resizeMode="cover"
              />
            </View>  
          </View>
        </View>

      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar/>
      </View>
    </View>
    
    );
}