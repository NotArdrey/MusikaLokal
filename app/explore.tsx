import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View, } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar';
import { router } from 'expo-router';


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
            <TouchableOpacity onPress={() => router.push('/')}>
                <View className="flex flex-row justify-between items-center gap-4">
                    <View className="flex flex-col justify-center items-start flex-1">
                        <Text style={{fontFamily:'Poppins_600SemiBold', fontSize: 15}}>Search for Gigs</Text>
                        <Text className="text-[#638782]" numberOfLines={2} style={{fontFamily:'Poppins_400Regular', fontSize: 13}}>Find the perfect gig for you</Text>
                    </View>
                    <View>
                        <Image source={{uri: 'https://www.freepik.com/photos/studio'}} className="border rounded-md" style={{height: 100, width: 150}}/>
                    </View>
                </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/')}>
                <View className="flex flex-row justify-between items-center gap-4">
                    <View className="flex flex-col justify-center items-start flex-1">
                        <Text style={{fontFamily:'Poppins_600SemiBold', fontSize: 15}}>Search for Studios</Text>
                        <Text className="text-[#638782]" numberOfLines={2} style={{fontFamily:'Poppins_400Regular', fontSize: 13}}>Find the perfect recording or practice studio for you</Text>
                    </View>
                    <View>
                        <Image source={{uri: 'https://www.freepik.com/photos/studio'}} className="border rounded-md" style={{height: 100, width: 150}}/>
                    </View>
                </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push('/')}>
                <View className="flex flex-row justify-between items-center gap-4">
                    <View className="flex flex-col justify-center items-start flex-1">
                        <Text style={{fontFamily:'Poppins_600SemiBold', fontSize: 15}}>Search for Musician Groups</Text>
                        <Text className="text-[#638782]" numberOfLines={2} style={{fontFamily:'Poppins_400Regular', fontSize: 13}}>Find the perfect music group for you</Text>
                    </View>
                    <View>
                        <Image source={{uri: 'https://www.freepik.com/photos/studio'}} className="border rounded-md" style={{height: 100, width: 150}}/>
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
                <View>
                    <TouchableOpacity className="flex-col items-start justify-between gap-2" onPress={() => router.push('/')}>
                        <Image source={{uri: 'https://www.freepik.com/photos/studio'}} className="border rounded-md" style={{minHeight: 100, minWidth: 100}}/>
                        <Text numberOfLines={2} ellipsizeMode="clip" style={{ maxWidth: 100, fontFamily: 'Poppins_400Regular', fontSize: 12 }}>Studio Name</Text>
                        <Text className="text-[#638782]" numberOfLines={2} ellipsizeMode="clip" style={{ maxWidth: 100, fontFamily: 'Poppins_400Regular', fontSize: 10 }}>calumpit, Bulacan</Text>
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
