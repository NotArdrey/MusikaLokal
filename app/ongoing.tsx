import React, { useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar';


export default function OngoingScreen() {


  const [afterImage, setAfterImage] = useState('');
  const [beforeImage, setBeforeImage] = useState('');


    return (
    <View className="flex-1 bg-white px-6">
      <Header title ="Ongoing"></Header>

    


      <ScrollView showsHorizontalScrollIndicator={false} className ="pb-24">

      <View className="mt-10">
        <Text style={{fontFamily: 'Poppins_600SemiBold', fontSize: 18}}>Ongoing Bookings</Text>
      </View>
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
            <View className="flex justify-between gap-2 py-5"> 
              <Text className="text-green-600"style={{fontFamily: 'Poppins_400Regular', fontSize: 12}}>Active</Text>
              <Text style={{fontFamily: 'Poppins_600SemiBold', fontSize: 16}}>Music One Studios Makati</Text>
              <Text style={{fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#666'}}>Sat, Dec 14 - 2:00 PM - 4:00 PM</Text>
              <TouchableOpacity className="bg-blue-600 rounded-lg px-4 py-2 mt-2 self-start bg-[#14b8a6]">
                <Text className="text-white" style={{fontFamily: 'Poppins_500Medium', fontSize: 14}}>Upload Proof</Text>
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
                style={{height: 100, width: 180}}
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
            <View className="flex justify-between gap-2 py-5"> 
              <Text className="text-green-600"style={{fontFamily: 'Poppins_400Regular', fontSize: 12}}>Active</Text>
              <Text style={{fontFamily: 'Poppins_600SemiBold', fontSize: 16}}>Saguijo Cafe + Bar Makati</Text>
              <Text style={{fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#666'}}>Fri, Dec 13 - 8:00 PM - 11:00 PM</Text>
              <TouchableOpacity className="bg-blue-600 rounded-lg px-4 py-2 mt-2 self-start bg-[#14b8a6]">
                <Text className="text-white" style={{fontFamily: 'Poppins_500Medium', fontSize: 14}}>Upload Proof</Text>
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
                style={{height: 100, width: 180}}
                resizeMode="cover"
              />
            </View>  
          </View>
        </View>

        

  
      {/* <View>
        <Text className="pt-6" style={{fontFamily: 'Poppins_600SemiBold', fontSize: 18}}>Before Event</Text>
      </View>


            <View className ="justify-center items-center border border-dashed border-gray-300 rounded-lg p-6 mt-3" style={{minHeight: 150, width: '100%'}}>
                <TouchableOpacity  className='justify-center items-center'>
                  <Text className ="text-gray-500" style={{ fontFamily: 'Poppins_400Regular' }}>Tap to capture your proof before the event at the venue</Text>
                </TouchableOpacity>
            </View>

      <View>
        <Text className="pt-6" style={{fontFamily: 'Poppins_600SemiBold', fontSize: 18}}>After Event</Text>
      </View>


            <View className ="justify-center items-center border border-dashed border-gray-300 rounded-lg p-6 mt-3 mb-3" style={{minHeight: 150, width: '100%'}}>
                <TouchableOpacity className='justify-center items-center'>
                  <Text className ="text-gray-500" style={{ fontFamily: 'Poppins_400Regular' }}>Tap to capture your proof after the event at the venue</Text>
                </TouchableOpacity>
            </View> */}





      </ScrollView>











        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
              <Navbar/>
        </View>
    </View>
    
    );
}