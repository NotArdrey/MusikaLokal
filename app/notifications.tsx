import React from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar';


export default function NotificationsScreen() {
    return (
    <View className="flex-1 bg-white px-6">
      <Header title="Notifications"/>
        <ScrollView showsVerticalScrollIndicator={false} className="pb-24">
            <View className="pt-6">
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#6B7280', marginBottom: 12 }}>
                    Today
                </Text>

                <TouchableOpacity className="flex-row items-start gap-3 mb-4 p-3 bg-blue-50 rounded-lg">
                    <View className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200">
                        <Image 
                            source={{uri: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=100&h=100&fit=crop'}} 
                            style={{width: 64, height: 64}}
                            resizeMode="cover"
                        />
                    </View>
                    <View className="flex-1">
                        <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000' }}>
                            Booking Confirmed
                        </Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                            Your booking at The Jazz Club is confirmed for June 15, 2024.
                        </Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                            2 hours ago
                        </Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity className="flex-row items-start gap-3 mb-4 p-3 bg-blue-50 rounded-lg">
                    <View className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200">
                        <Image 
                            source={{uri: 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=100&h=100&fit=crop'}} 
                            style={{width: 64, height: 64}}
                            resizeMode="cover"
                        />
                    </View>
                    <View className="flex-1">
                        <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000' }}>
                            Payment Received
                        </Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                            ₱15,000 has been added to your wallet from Barasoain Church Wedding.
                        </Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                            5 hours ago
                        </Text>
                    </View>
                </TouchableOpacity>
            </View>

            <View className="pt-4">
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#6B7280', marginBottom: 12 }}>
                    Yesterday
                </Text>

                <TouchableOpacity className="flex-row items-start gap-3 mb-4 p-3 rounded-lg">
                    <View className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200">
                        <Image 
                            source={{uri: 'https://images.unsplash.com/photo-1511735111819-9a3f7709049c?w=100&h=100&fit=crop'}} 
                            style={{width: 64, height: 64}}
                            resizeMode="cover"
                        />
                    </View>
                    <View className="flex-1">
                        <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000' }}>
                            New Booking Request
                        </Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                            The Manila Sound Collective wants to book you for a corporate event.
                        </Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                            Yesterday at 3:30 PM
                        </Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity className="flex-row items-start gap-3 mb-4 p-3 rounded-lg">
                    <View className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200">
                        <Image 
                            source={{uri: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=100&h=100&fit=crop'}} 
                            style={{width: 64, height: 64}}
                            resizeMode="cover"
                        />
                    </View>
                    <View className="flex-1">
                        <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000' }}>
                            Event Reminder
                        </Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                            Your gig at BGC starts tomorrow at 8:00 PM. Don't forget your equipment!
                        </Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                            Yesterday at 10:00 AM
                        </Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity className="flex-row items-start gap-3 mb-4 p-3 rounded-lg">
                    <View className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200">
                        <Image 
                            source={{uri: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop'}} 
                            style={{width: 64, height: 64}}
                            resizeMode="cover"
                        />
                    </View>
                    <View className="flex-1">
                        <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14, color: '#000' }}>
                            Review Submitted
                        </Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                            You received a 5-star review from The Acoustic Lounge.
                        </Text>
                        <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                            Yesterday at 9:15 AM
                        </Text>
                    </View>
                </TouchableOpacity>
            </View>
        </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar />
      </View>
    </View>
    );
}
