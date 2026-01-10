import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function HomeScreen() {
  const { colors, isDark } = useTheme();
  
  return (
    <View className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
      <Header title ="Home"/>
        <ScrollView showsHorizontalScrollIndicator ={false} className="pb-24">

          {/*Title of this section-GiG*/}
          <View className="pt-10 flex-row items-center">
            <MaterialCommunityIcons name="microphone-variant" size={22} color={colors.primary} />
            <Text className="ml-2" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 17, color: colors.text }}>Gigs</Text>
          </View>
          {/*Gig Sample Card. redirection not yet set*/}
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
                minWidth:200,
                backgroundColor: colors.card,
                borderWidth: isDark ? 1 : 0,
                borderColor: colors.border
              }}>
                <TouchableOpacity className="flex-col items-start justify-between"  onPress={() => router.push('/gig_details')}>

                  <View style={{height: 150, width:200}}>
                    <Image 
                      source={{uri: 'https://picsum.photos/200/150?random=1'}} 
                      style={{height: 150, width:200}}
                      resizeMode="cover"
                    />
                    <View className="flex-row items-center bg-amber-50 rounded-md absolute top-3 left-3 rounded-lg px-3 py-1.5">
                      <Ionicons name="star" size={14} color="#FFB800" />
                      <Text className="ml-1 text-xs font-semibold" style={{ color: colors.text }}>4.8</Text>
                    </View>
                  </View>

                  
                  <View className ="flex-row flex justify-between items-center">
                    <Text className ="px-3 mt-3" numberOfLines={2}    ellipsizeMode="clip" style={{fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.text }}>Barasoain Church Events</Text>
                  </View>
              
                  <View className="mt-1 px-2.5 flex flex-row">
                    <Ionicons name="location-outline" size={12} color="#808080" />
                    <Text className =" px-0.5 text-[#808080]"style={{ fontFamily: 'Poppins_400Regular', fontSize: 10 }}>Malolos, Bulacan</Text>
                  </View>

                  <View className="flex-row items-center gap-2 mb-3 px-3 mt-2">
                    <View className="flex-row items-center gap-1 bg-primary-100 rounded-md px-3 py-1.5">
                      <Text className="text-[11px] text-primary-700 font-medium">Church</Text>
                    </View>
                    <View className="flex-row items-center gap-1 bg-accent-100 rounded-md px-3 py-1.5">
                      <Text className="text-[11px] text-accent-700 font-medium">Wedding</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>


          {/*Title of this section-Musicians Group*/}
            <View className="pt-10 flex-row items-center">
              <MaterialCommunityIcons name="account-music" size={22} color={colors.primary} />
              <Text className="ml-2" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 17, color: colors.text }}>Musicians</Text>
            </View>
          {/*Musician Group Sample Card. redirection not yet set*/}
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
                minWidth:200,
                backgroundColor: colors.card,
                borderWidth: isDark ? 1 : 0,
                borderColor: colors.border
              }}>
                <TouchableOpacity className="flex-col items-start justify-between"  onPress={() => router.push('/group_details')}>

                  <View style={{height: 150, width:200}}>
                    <Image 
                      source={{uri: 'https://picsum.photos/200/150?random=2'}} 
                      style={{height: 150, width:200}}
                      resizeMode="cover"
                    />
                    <View className="flex-row items-center bg-amber-50 rounded-md absolute top-3 left-3 rounded-lg px-3 py-1.5">
                      <Ionicons name="star" size={14} color="#FFB800" />
                      <Text className="ml-1 text-xs font-semibold" style={{ color: colors.text }}>4.8</Text>
                    </View>
                  </View>

                  <View className ="flex-row flex justify-between items-center">
                    <Text className ="px-3 mt-3" numberOfLines={2}    ellipsizeMode="clip" style={{fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.text }}>Juan Dela Cruz Band</Text>
                  </View>
              
                  <View className="mt-1 px-2.5 flex flex-row">
                    <Ionicons name="location-outline" size={12} color="#808080" />
                    <Text className =" px-0.5 text-[#808080]"style={{ fontFamily: 'Poppins_400Regular', fontSize: 10 }}>San Jose Del Monte, Bulacan</Text>
                  </View>

                  <View className="flex-row items-center gap-2 mb-3 px-3 mt-2">
                    <View className="flex-row items-center gap-1 bg-primary-100 rounded-md px-3 py-1.5">
                      <Text className="text-[11px] text-primary-700 font-medium">Rock</Text>
                    </View>
                    <View className="flex-row items-center gap-1 bg-accent-100 rounded-md px-3 py-1.5">
                      <Text className="text-[11px] text-accent-700 font-medium">OPM</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
            
          {/*Title of this section-Studio*/}
            <View className="pt-10 flex-row items-center">
              <MaterialCommunityIcons name="music-box-outline" size={22} color={colors.primary} />
              <Text className="ml-2" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 17, color: colors.text }}>Studios</Text>
            </View>
          {/*studio Sample Card. redirection not yet set*/}
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
                minWidth:200,
                backgroundColor: colors.card,
                borderWidth: isDark ? 1 : 0,
                borderColor: colors.border
              }}>
                <TouchableOpacity className="flex-col items-start justify-between"  onPress={() => router.push('/studio_details')}>

                  <View style={{height: 150, width:200}}>
                    <Image 
                      source={{uri: 'https://picsum.photos/200/150?random=3'}} 
                      style={{height: 150, width:200}}
                      resizeMode="cover"
                    />
                    <View className="flex-row items-center bg-amber-50 rounded-md absolute top-3 left-3 rounded-lg px-3 py-1.5">
                      <Ionicons name="star" size={14} color="#FFB800" />
                      <Text className="ml-1 text-xs font-semibold" style={{ color: colors.text }}>4.8</Text>
                    </View>
                  </View>

                  
                  <View className ="flex-row flex justify-between items-center">
                    <Text className ="px-3 mt-3" numberOfLines={2}    ellipsizeMode="clip" style={{fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.text }}>SM City Marilao Events Hall</Text>
                  </View>
              
                  <View className="mt-1 px-2.5 flex flex-row">
                    <Ionicons name="location-outline" size={12} color="#808080" />
                    <Text className =" px-0.5 text-[#808080]"style={{ fontFamily: 'Poppins_400Regular', fontSize: 10 }}>Marilao, Bulacan</Text>
                  </View>

                  <View className="flex-row items-center gap-2 mb-3 px-3 mt-2">
                    <View className="flex-row items-center gap-1 bg-primary-100 rounded-md px-3 py-1.5">
                      <Text className="text-[11px] text-primary-700 font-medium">Gay</Text>
                    </View>
                    <View className="flex-row items-center gap-1 bg-accent-100 rounded-md px-3 py-1.5">
                      <Text className="text-[11px] text-accent-700 font-medium">homosapiens</Text>
                    </View>
                  </View>
                </TouchableOpacity>
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
