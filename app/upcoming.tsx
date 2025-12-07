import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar';




export default function UpcomingScreen() {

    return (
    <View className="flex-1 bg-white px-6">
      <Header title ="Upcoming"></Header>

      <View className="mt-10">
        <Text style={{fontFamily: 'Poppins_600SemiBold', fontSize: 18}}>Upcoming Bookings</Text>
      </View>

      <ScrollView showsHorizontalScrollIndicator={false}>
        <View className="flex flex-1 flex-col justify-between gap-1 mt-3">
          <View className="flex flex-1 flex-row justify-between items-center px-3 rounded-xl" style={{
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
            <View className="flex justify-between gap-2 py-4"> 
              <Text className="text-green-600"style={{fontFamily: 'Poppins_400Regular', fontSize: 12}}>Active</Text>
              <Text style={{fontFamily: 'Poppins_600SemiBold', fontSize: 16}}>Echo Music Hub San Jose</Text>
              <Text style={{fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#666'}}>Sun, Nov 17 - 4:30 PM - 5:00 PM</Text>
              <TouchableOpacity className="bg-[#009c8d] rounded-lg px-4 py-2 flex-1 flex-row gap-1 justify-center items-center">
                <Text style={{fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: '#fff'}}>View Details</Text>
              </TouchableOpacity>
              <TouchableOpacity className="bg-red-700 rounded-lg px-4 py-2 flex-1 flex-row gap-1 justify-center items-center">
                <Text style={{fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: '#fff'}}>Cancel</Text>
              </TouchableOpacity>
            </View>
            
            <View className="rounded-xl" style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.1,
              shadowRadius: 6,
              elevation: 8,
              marginHorizontal: 4,
              marginVertical: 8
            }}>
              <Image 
                className="rounded-xl"
                source={{uri: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=400&h=130&fit=crop'}}
                style={{height: 160, width: 180}}
                resizeMode="cover"
              />
            </View>  
          </View>

          <View className="flex flex-1 flex-row justify-between items-center px-3 rounded-xl" style={{
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
            <View className="flex justify-between gap-2 py-4"> 
              <Text className="text-red-600"style={{fontFamily: 'Poppins_400Regular', fontSize: 12}}>Cancelled</Text>
              <Text style={{fontFamily: 'Poppins_600SemiBold', fontSize: 16}}>Echo Music Hub San Jose</Text>
              <Text style={{fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#666'}}>Sun, Nov 17 - 4:30 PM - 5:00 PM</Text>
              <TouchableOpacity className="bg-[#009c8d] rounded-lg px-4 py-2 flex-1 flex-row gap-1 justify-center items-center">
                <Text style={{fontFamily: 'Poppins_600SemiBold', fontSize: 12, color: '#fff'}}>View Details</Text>
              </TouchableOpacity>
            </View>
            
            <View className="rounded-xl" style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.1,
              shadowRadius: 6,
              elevation: 8,
              marginHorizontal: 4,
              marginVertical: 8
            }}>
              <Image 
                className="rounded-xl"
                source={{uri: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=400&h=130&fit=crop'}}
                style={{height: 160, width: 180}}
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