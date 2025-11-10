import { router } from 'expo-router';
import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View, } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar';


export default function HomeScreen() {
  return (
    <View className="flex-1 bg-white px-6">
      <Header title ="Home"/>
        <ScrollView showsHorizontalScrollIndicator ={false}>

          {/*Title of this section-GiG*/}
            <View className="pt-10">
              <Text className =""style={{ fontFamily: 'Poppins_600SemiBold' }}>Gigs</Text>
            </View>
          {/*Gig Sample Card. redirection not yet set*/}
            <View className="pt-2 justify-between items-start gap-3">
              <ScrollView horizontal showsHorizontalScrollIndicator ={false}>
                <View>
                  <TouchableOpacity className="flex-col items-start justify-between gap-2" onPress={() => router.push('/')}>
                    <Image source ={{uri: 'https://www.freepik.com/photos/studio'}} className ="border rounded-md"style={{minHeight: 100, minWidth: 100}}/>
                    <Text numberOfLines={2}    ellipsizeMode="clip" style={{ maxWidth: 100, fontFamily: 'Poppins_400Regular', fontSize: 12 }} >Gig Name</Text>
                    <Text className ="text-[#638782]"numberOfLines={2}    ellipsizeMode="clip" style={{ maxWidth: 100, fontFamily: 'Poppins_400Regular', fontSize: 10 }} >calumpit, Bulacan</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>


          {/*Title of this section-Musicians Group*/}
            <View className="pt-10">
              <Text className =""style={{ fontFamily: 'Poppins_600SemiBold' }}>Musicians</Text>
            </View>
          {/*Musician Group Sample Card. redirection not yet set*/}
            <View className="pt-2 justify-between items-start gap-3">
              <ScrollView horizontal showsHorizontalScrollIndicator ={false}>
                <View>
                  <TouchableOpacity className="flex-col items-start justify-between gap-2" onPress={() => router.push('/')}>
                    <Image source ={{uri: 'https://www.freepik.com/photos/studio'}} className ="border rounded-md"style={{minHeight: 100, minWidth: 100}}/>
                    <Text numberOfLines={2}    ellipsizeMode="clip" style={{ maxWidth: 100, fontFamily: 'Poppins_400Regular', fontSize: 12 }} >Musicians Group Name</Text>
                    <Text className ="text-[#638782]" numberOfLines={2}    ellipsizeMode="clip" style={{ maxWidth: 100, fontFamily: 'Poppins_400Regular', fontSize: 10 }} >calumpit, Bulacan</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
            
          {/*Title of this section-Studio*/}
            <View className="pt-10">
              <Text className =""style={{ fontFamily: 'Poppins_600SemiBold' }}>Studios</Text>
            </View>
          {/*studio Sample Card. redirection not yet set*/}
            <View className="pt-2 justify-between items-start gap-3">
              <ScrollView horizontal showsHorizontalScrollIndicator ={false}>
                <View>
                  <TouchableOpacity className="flex-col items-start justify-between gap-2" onPress={() => router.push('/')}>
                    <Image source ={{uri: 'https://www.freepik.com/photos/studio'}} className ="border rounded-md"style={{minHeight: 100, minWidth: 100}}/>
                    <Text numberOfLines={2}    ellipsizeMode="clip" style={{ maxWidth: 100, fontFamily: 'Poppins_400Regular', fontSize: 12 }} >Studio Name</Text>
                    <Text className ="text-[#638782]" numberOfLines={2}    ellipsizeMode="clip" style={{ maxWidth: 100, fontFamily: 'Poppins_400Regular', fontSize: 10 }} >calumpit, Bulacan</Text>
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
