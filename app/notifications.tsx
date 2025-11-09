import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar';


export default function NotificationsScreen() {
    return (
    <View className="flex-1 bg-white px-6">
      <Header title="Notifications"/>
        <ScrollView showsVerticalScrollIndicator={false}>
            <View className="pt-10">
                <Text style={{ fontFamily: 'Poppins_400Regular' }}>
                    Date of The notification
                </Text>
            </View>
            <TouchableOpacity>
                <View className="flex-1 flex-row justify-betweem items-center gap-4 mt-2">
                    <View>
                        <Image source={{uri: 'https://www.freepik.com/photos/studio'}} className="border rounded-md" style={{minHeight: 100, minWidth: 100}}/>
                    </View>


                    <View>
                        <Text style={{ fontFamily: 'Poppins_400Regular' }}>Description</Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular' }}>Sub Description</Text>
                    </View>
                </View>
            </TouchableOpacity>    
        </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar />
      </View>
    </View>
    );
}
