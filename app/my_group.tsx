import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';



export default function MyGroupScreen() {
  const { colors, isDark } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);

    return (
    <>
    <View className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
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
            minWidth:100,
            backgroundColor: colors.card,
            borderWidth: isDark ? 1 : 0,
            borderColor: colors.border
        }}>
            <View className ="rounded-t-xl bg-gray-200" style={{ minHeight: 130, minWidth:100}}>
                <Image className ="rounded-t-xl "
                    source={{uri: 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=400&h=130&fit=crop'}} 
                    style={{ minHeight: 130, minWidth:100}}
                    resizeMode="cover"
                />
            </View>
            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text}}>The Manila Sound Collective</Text>
            </View>

            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary}}>5-piece OPM band specializing in classic hits and modern Filipino rock. Available for weddings, corporate events, and private parties.</Text>
            </View>


            <View className="px-3 pb-3 flex-row justify-end gap-2">
                <TouchableOpacity 
                    className="rounded-lg bg-primary-500 items-center justify-center" 
                    style={{height: 36, width: 36}}
                    onPress={() => router.push('/manage_group')}
                >
                    <Ionicons name="eye" size={20} color="#ffffff" />
                </TouchableOpacity>

                <TouchableOpacity 
                    className="rounded-lg bg-accent-500 items-center justify-center" 
                    style={{height: 36, width: 36}}
                    onPress={() => router.push('/edit_group')}
                >
                    <Ionicons name="pencil" size={20} color="#ffffff" />
                </TouchableOpacity>

                <TouchableOpacity 
                    className="rounded-lg bg-red-500 items-center justify-center" 
                    style={{height: 36, width: 36}}
                    onPress={() => setModalVisible(true)}
                >
                    <Ionicons name="trash" size={20} color="#ffffff" />
                </TouchableOpacity>
            </View>
        </View>

        <View className="flex flex-col rounded-xl gap-2" style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 6,
            elevation: 8,
            marginHorizontal: 4,
            marginVertical: 8,
            minHeight: 130,
            minWidth: 100,
            backgroundColor: colors.card,
            borderWidth: isDark ? 1 : 0,
            borderColor: colors.border
        }}>
            <View className="rounded-t-xl bg-gray-200" style={{ minHeight: 130, minWidth: 100}}>
                <Image className="rounded-t-xl"
                    source={{uri: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=130&fit=crop'}} 
                    style={{ minHeight: 130, minWidth: 100}}
                    resizeMode="cover"
                />
            </View>
            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_600SemiBold', fontSize: 16, color: colors.text}}>Indie Pinoy Acoustic Trio</Text>
            </View>

            <View>
                <Text className="px-3" style={{fontFamily: 'Poppins_400Regular', fontSize: 13, color: colors.textSecondary}}>Acoustic trio performing indie Filipino music, folk, and pop ballads. Perfect for intimate gigs, cafes, and chill venues around Metro Manila.</Text>
            </View>

            <View className="mx-3" style={{ borderTopWidth: 2, borderTopColor: colors.border }}></View>

            <View className="px-3 pb-3 flex-row justify-end gap-2">
                <TouchableOpacity 
                    className="rounded-lg bg-primary-500 items-center justify-center" 
                    style={{height: 36, width: 36}}
                    onPress={() => router.push('/manage_group')}
                >
                    <Ionicons name="eye" size={20} color="#ffffff" />
                </TouchableOpacity>

                <TouchableOpacity 
                    className="rounded-lg bg-accent-500 items-center justify-center" 
                    style={{height: 36, width: 36}}
                    onPress={() => router.push('/edit_group')}
                >
                    <Ionicons name="pencil" size={20} color="#ffffff" />
                </TouchableOpacity>

                <TouchableOpacity 
                    className="rounded-lg bg-red-500 items-center justify-center" 
                    style={{height: 36, width: 36}}
                    onPress={() => setModalVisible(true)}
                >
                    <Ionicons name="trash" size={20} color="#ffffff" />
                </TouchableOpacity>
            </View>
        </View>
      </ScrollView>
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
              <Navbar/>
        </View>
    </View>
    <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title="Delete Group"
        message="Are you sure you want to delete this group?"
        buttonText="Delete"
    />
    </>
    );
}

