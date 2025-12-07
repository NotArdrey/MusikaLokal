import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar';



export default function GigDetailsScreen() {
  const [activeTab, setActiveTab] = useState('About');

  return (
    <View className="flex-1 bg-white">
      <View className="px-6">
        <Header title="Gig Details"></Header>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} className="px-6" contentContainerStyle={{ paddingBottom: 20 }}>
        <View className="flex flex-1 mt-3 flex-col">
          <View className="justify-center items-center gap-1">
            <View
              className="rounded-xl"
              style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 6,
                elevation: 8,
                marginHorizontal: 4,
                marginVertical: 8,
                height: 200,
                width: '50%',
              }}
            >
              <Image
                className="rounded-xl flex flex-1"
                source={{uri: 'https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=400&h=130&fit=crop'}}
                style={{
                  flex: 1,
                  height: 200,
                  width: '100%',
                }}
                resizeMode="cover"
              />
            </View>
            
            <Text className="mt-2" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16 }}>Junction 88 Music Bar</Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14 }}>Live Music Venue</Text>
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13 }}>Plaridel, Bulacan, Philippines</Text>
          </View>

          <View className="flex flex-row gap-5 mt-8 border-b border-gray-300  justify-center">
            <TouchableOpacity onPress={() => {setActiveTab('About')}}>
              <Text className ="border-b border-gray-300 pb-2" style={{ fontFamily: activeTab === 'About'? 'Poppins_600SemiBold': 'Poppins_500Medium', fontSize: 15 }}>About</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => {setActiveTab('Apply')}}>
              <Text className ="border-b border-gray-300 pb-2" style={{ fontFamily: activeTab === 'Apply'? 'Poppins_600SemiBold': 'Poppins_500Medium', fontSize: 15  }}>Apply</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => {setActiveTab('Review')}}>
              <Text className ="border-b border-gray-300 pb-2" style={{ fontFamily: activeTab === 'Review'? 'Poppins_600SemiBold': 'Poppins_500Medium', fontSize: 15 }}>Review</Text>
            </TouchableOpacity>
          </View>

          {activeTab ==='About'? (
            <View className="flex flex-1 flex-col mt-4">
              <View>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14 }}>The Junction 88 Music Bar is a premier live music venue in Plaridel, Bulacan, Philippines, known for its intimate atmosphere and diverse lineup of artists. We offer a full bar, stage lighting, and sound equipment for performers.</Text>
              </View>

              <View className='flex flex-row mt-2 gap-4 mt-5'>
                <View className="justify-start items-center">
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14 }} >Capacity</Text>
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13 }} >69</Text>
                </View>

                <View>
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 14 }}>Services</Text>
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13 }}>Sound System, Stage Lighting</Text>
                </View>
              </View>

              <View className="mt-5 flex gap-2 border-t border-gray-300 pt-3">
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16 }}>Gallery</Text>

                <ScrollView showsHorizontalScrollIndicator={false}>
                  <View className="flex-row flex">
                    <View
                      className="rounded-xl"
                      style={{
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.1,
                        shadowRadius: 6,
                        elevation: 8,
                        marginHorizontal: 4,
                        marginVertical: 8,
                        height: 200,
                        width: 200,
                      }}
                    >
                      <Image
                        className="rounded-xl"
                        source={{uri: 'https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=400&h=130&fit=crop'}}
                        style={{
                          flex: 1,
                          height: 200,
                          width: 200
                        }}
                      />
                    </View>

                    <View
                      className="rounded-xl"
                      style={{
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.1,
                        shadowRadius: 6,
                        elevation: 8,
                        marginHorizontal: 4,
                        marginVertical: 8,
                        height: 200,
                        width: 200,
                      }}
                    >
                      <Image
                        className="rounded-xl"
                        source={{uri: 'https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=400&h=130&fit=crop'}}
                        style={{
                          flex: 1,
                          height: 200,
                          width: 200
                        }}
                      />
                    </View>

                    <View
                      className="rounded-xl"
                      style={{
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.1,
                        shadowRadius: 6,
                        elevation: 8,
                        marginHorizontal: 4,
                        marginVertical: 8,
                        height: 200,
                        width: 200,
                      }}
                    >
                      <Image
                        className="rounded-xl"
                        source={{uri: 'https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=400&h=130&fit=crop'}}
                        style={{
                          flex: 1,
                          height: 200,
                          width: 200
                        }}
                      />
                    </View>
                  </View>
                </ScrollView>
              </View>
            </View>

          ): activeTab === 'Apply'? (
            <View className="flex flex-1 flex-col mt-4">
              <View>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>Message to event owner</Text>
              </View>

              <View className="border border-gray-300 rounded-xl px-3 py-2 justify-start items-start mt-3">
                <TextInput className ="justify-start items-start" placeholder='Enter your message' multiline={true} style={{height: 200, width: '100%', outline: '0', fontFamily: 'Poppins_400Regular', fontSize: 14}}>
                </TextInput>
              </View>

              <View className="mt-5">
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>Upload Sample Video</Text>
                <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, color: '#6b7280', marginTop: 4 }}>Share a video of your performance to showcase your talent</Text>
              </View>

              <View className="justify-center items-center border border-dashed border-gray-300 rounded-xl p-6 mt-3" style={{ minHeight: 150, width: '100%' }}>
                <TouchableOpacity className="justify-center items-center">
                  <Ionicons name="cloud-upload-outline" size={48} color="#9CA3AF" />
                  <Text className="text-gray-500 mt-2" style={{ fontFamily: 'Poppins_400Regular', fontSize: 14 }}>Upload Video</Text>
                  <Text className="text-gray-400 mt-1" style={{ fontFamily: 'Poppins_400Regular', fontSize: 12 }}>MP4, MOV (Max 50MB)</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity className="mt-5 rounded-xl" style={{
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.1,
                  shadowRadius: 6,
                  elevation: 8,
                  marginHorizontal: 4,
                  marginVertical: 8,
                }}>


                <View className=" justify-center items-center flex flex-row gap-4 pl-3 bg-gray-200 rounded-xl mt-5">
                      
                    <View className="flex flex-col justify-center items-center" style={{width: '40%'}}>
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>Contract of the Gig</Text>
                      <Text className="text-teal-500" style={{ fontFamily: 'Poppins_400Regular', fontSize: 13 }}>View Contract</Text>
                    </View>

                    <Image
                        className="rounded-r-xl flex flex-1"
                        source={{uri: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=400&h=200&fit=crop'}}
                        style={{
                          height: 120
                        }}
                        resizeMode="contain"
                      />                  
                </View>
              </TouchableOpacity>

              <TouchableOpacity className="rounded-xl bg-gray-300 mt-3 justify-center items-center py-3 bg-teal-500">
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>Submit</Text>
              </TouchableOpacity>
            </View>
          ) : activeTab ==="Review" ? (
            <View className="flex flex-1 flex-col mt-4">
              <View>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>User Reviews</Text>
              </View>

              <View className ="justify-center items-center flex flex-row gap-10 mt-4">

                <View className="w-1/4 items-center">
                  <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 32 }}>4.5</Text>
                  <View className="flex-row">
                    <Ionicons name="star" size={16} color="#14b8a6" />
                    <Ionicons name="star" size={16} color="#14b8a6" />
                    <Ionicons name="star" size={16} color="#14b8a6" />
                    <Ionicons name="star" size={16} color="#14b8a6" />
                    <Ionicons name="star-half" size={16} color="#14b8a6" />
                  </View>
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13 }}>25 Reviews</Text>
                </View>

                <View className="flex-1">
                  <View className="flex flex-row items-center gap-2">
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, width: 12 }}>5</Text>
                    <View className="flex-1 h-3 bg-gray-300 rounded-xl overflow-hidden">
                      <View className="h-full bg-teal-500 w-full rounded-xl" />
                    </View>                  
                  </View>

                  <View className="flex flex-row items-center gap-2">
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, width: 12 }}>4</Text>
                    <View className="flex-1 h-3 bg-gray-300 rounded-xl overflow-hidden">
                      <View className="h-full bg-teal-500 w-4/5 rounded-xl" />
                    </View>                  
                  </View>
          
                  <View className="flex flex-row items-center gap-2">
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, width: 12 }}>3</Text>
                    <View className="flex-1 h-3 bg-gray-300 rounded-xl overflow-hidden">
                      <View className="h-full bg-teal-500 w-3/5 rounded-xl" />
                    </View>                  
                  </View>

                  <View className="flex flex-row items-center gap-2">
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, width: 12 }}>2</Text>
                    <View className="flex-1 h-3 bg-gray-300 rounded-xl overflow-hidden">
                      <View className="h-full bg-teal-500 w-2/5 rounded-xl" />
                    </View>                  
                  </View>

                  <View className="flex flex-row items-center gap-2">
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 13, width: 12 }}>1</Text>
                    <View className="flex-1 h-3 bg-gray-300 rounded-xl overflow-hidden">
                      <View className="h-full bg-teal-500 w-1/5 rounded-xl" />
                    </View>                  
                  </View>
                </View>
              </View>

              <View className="mt-5">
                <View className="flex-row gap-2 items-center">
                  <View className="rounded-3xl border border-gray-300 overflow-hidden" style={{height: 50, width: 50}}>
                    <Image
                      source={{uri: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop'}}
                      style={{
                        height: 50,
                        width: 50,
                      }}
                      resizeMode="cover"
                    />
                  </View>

                  <View className="flex-col">
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>Jared Cariaso</Text>
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: '#6b7280' }}>1 month ago</Text>
                  </View>
                </View>

                <View className="flex-row mt-2">
                  <Ionicons name="star" size={16} color="#14b8a6" />
                  <Ionicons name="star" size={16} color="#14b8a6" />
                  <Ionicons name="star" size={16} color="#14b8a6" />
                  <Ionicons name="star" size={16} color="#14b8a6" />
                  <Ionicons name="star-half" size={16} color="#14b8a6" />
                </View>


                <View className="flex-1 mt-2">
                  <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14 }}>Amazing venue! The sound system was top-notch and the staff was incredibly professional. The crowd was great and we had an unforgettable night performing here. Highly recommend for any musician looking for a quality gig.</Text>
                </View>


                <View className ="flex-row items-center gap-4 mt-3">
                  <TouchableOpacity className="flex-row items-center gap-1">
                    <Ionicons name="heart-outline" size={24} color="#262626" />
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: '#262626' }}>8</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="flex-row items-center gap-1">
                    <Ionicons name="chatbubble-outline" size={22} color="#262626" />
                    <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 14, color: '#262626' }}>1</Text>
                  </TouchableOpacity>
                </View>
              </View>

            </View>
          ) : null}


        </View>
      </ScrollView>

      <Navbar/>
    </View>
  );
}