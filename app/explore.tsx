import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View, } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar';

export default function ExploreScreen() {

  {/*const [email, setEmail] = useState(''); sample*/}
  return (
    <View className="flex-1 bg-white px-6">
      <Header title ="Explore"/>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="pt-10">
          <Text style ={{fontFamily:'Poppins_600semibold', fontSize: 15 }}>What are you looking for?</Text>
        </View>
        <View className="pt-2 flex flex-col gap-4">
          <TouchableOpacity onPress={() => router.push('/find_talent_and_spaces')}>
            <View className="flex flex-row justify-between items-center gap-4">
              <View className="flex flex-col justify-center items-start flex-1">
                <Text style={{fontFamily:'Poppins_600SemiBold', fontSize: 15}}>Search for Gigs</Text>
                <Text className="text-[#638782]" numberOfLines={2} style={{fontFamily:'Poppins_400Regular', fontSize: 13}}>Find the perfect gig for you</Text>
              </View>
              <View  className="rounded-xl" style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 6,
                elevation: 10,
                marginHorizontal: 4,
                marginVertical: 8,
                minHeight: 100,
                minWidth:150
              }}>
                <Image source={{uri: 'https://picsum.photos/150/100?random=7'}}  className="rounded-xl" style={{height: 100, width: 150}}  resizeMode="cover"/>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/find_talent_and_spaces')}>
            <View className="flex flex-row justify-between items-center gap-4">
              <View className="flex flex-col justify-center items-start flex-1">
                <Text style={{fontFamily:'Poppins_600SemiBold', fontSize: 15}}>Search for Studios</Text>
                <Text className="text-[#638782]" numberOfLines={2} style={{fontFamily:'Poppins_400Regular', fontSize: 13}}>Find the perfect recording or practice studio for you</Text>
              </View>
              <View  className="rounded-xl" style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 6,
                elevation: 10,
                marginHorizontal: 4,
                marginVertical: 8,
                minHeight: 100,
                minWidth:150
              }}>
                <Image source={{uri: 'https://picsum.photos/150/100?random=7'}}  className="rounded-xl" style={{height: 100, width: 150}}  resizeMode="cover"/>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push('/find_talent_and_spaces')}>
            <View className="flex flex-row justify-between items-center gap-4">
              <View className="flex flex-col justify-center items-start flex-1">
                <Text style={{fontFamily:'Poppins_600SemiBold', fontSize: 15}}>Search for Musician Groups</Text>
                <Text className="text-[#638782]" numberOfLines={2} style={{fontFamily:'Poppins_400Regular', fontSize: 13}}>Find the perfect music group for you</Text>
              </View>
              <View  className="rounded-xl" style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 6,
                elevation: 10,
                marginHorizontal: 4,
                marginVertical: 8,
                minHeight: 100,
                minWidth:150
              }}>
                <Image source={{uri: 'https://picsum.photos/150/100?random=7'}}  className="rounded-xl" style={{height: 100, width: 150}}  resizeMode="cover"/>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/*Title of this section-Studio*/}
        <View className="pt-10">
          <Text className="" style={{ fontFamily: 'Poppins_600SemiBold' }}>Recommendations</Text>
        </View>
        {/*studio Sample Card. redirection not yet set*/}
        <View className="pt-2 justify-between items-start gap-3">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="pt-2 justify-between items-start gap-3">
              <ScrollView horizontal showsHorizontalScrollIndicator ={false}>
                <View className ="rounded-xl overflow-hidden flex-col flex-1" style={{
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.1,
                  shadowRadius: 6,
                  elevation: 8,
                  marginHorizontal: 4,
                  marginVertical: 8,
                  minHeight: 100,
                  minWidth:200
                }}>
                  <TouchableOpacity className="flex-col items-start justify-between"  onPress={() => router.push('/')}>

                    <View style={{height: 150, width:200}}>
                      <Image 
                        source={{uri: 'https://picsum.photos/200/150?random=9'}} 
                        style={{height: 150, width:200}}
                        resizeMode="cover"
                      />
                      <View className="flex-row items-center bg-amber-50 rounded-md absolute top-3 left-3 rounded-lg px-3 py-1.5">
                        <Ionicons name="star" size={14} color="#FFB800" />
                        <Text className="ml-1 text-xs font-semibold text-black">4.7</Text>
                      </View>
                    </View>

                    
                    <View className ="flex-row flex justify-between items-center">
                      <Text className ="px-3 mt-3" numberOfLines={2}    ellipsizeMode="clip" style={{fontFamily: 'Poppins_400Regular', fontSize: 12 }}>Hiyas Convention Center</Text>
                    </View>
                
                    <Text className ="text-[#638782] px-3 mt-1" style={{ fontFamily: 'Poppins_400Regular', fontSize: 10 }} >Bocaue, Bulacan</Text>
                    <View className="flex-row items-center gap-2 mb-3 px-3 mt-2">
                      <View className="flex-row items-center gap-1 bg-teal-100 rounded-md px-3 py-1.5">
                        <Text className="text-[11px] text-teal-700 font-medium">Events</Text>
                      </View>
                      <View className="flex-row items-center gap-1 bg-cyan-100 rounded-md px-3 py-1.5">
                        <Text className="text-[11px] text-cyan-700 font-medium">Concerts</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </ScrollView>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar/>
      </View>
    </View>
  );
}
