import React, { useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar';



export default function GigDetailsScreen() {
  const [activeTab, setActiveTab] = useState('About');
  const [aboutVisible, setAboutVisible] = useState(false);
  const [applyVisible, setApplyVisible] = useState(false);
  const [reviewVisible, setReviewVisible] = useState(false);

  const renderTabContent = () => {
    if (activeTab === 'Apply') {
      return (
        <View>
        </View>
      )
    }
  }

  return (
    <View className="flex-1 bg-white px-6">
      <Header title="Gig Details"></Header>

      <ScrollView showsVerticalScrollIndicator={false} className="pb-24">
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
            <TouchableOpacity onPress={() => {setActiveTab('About'); setAboutVisible(true)}}>
              <Text className ="border-b border-gray-300 pb-2" style={{ fontFamily: 'Poppins_500Medium', fontSize: 15 }}>About</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => {setActiveTab('Apply'); setApplyVisible(true)}}>
              <Text className ="border-b border-gray-300 pb-2" style={{ fontFamily: 'Poppins_500Medium', fontSize: 15 }}>Apply</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => {setActiveTab('Review'); setReviewVisible(true)}}>
              <Text className ="border-b border-gray-300 pb-2" style={{ fontFamily: 'Poppins_500Medium', fontSize: 15 }}>Review</Text>
            </TouchableOpacity>
          </View>

          {aboutVisible ? (
            <View className="flex flex-1 flex-col mt-3">
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

          ) : applyVisible ? (
            <View className="flex flex-1 flex-col mt-3">
              <View>
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>Message to event owner</Text>
              </View>

              <View className="border border-gray-300 rounded-xl px-3 py-2 justify-start items-start mt-2">
                <TextInput className ="justify-start items-start" placeholder='Enter your message' multiline={true} style={{height: 200, width: '100%', outline: '0', fontFamily: 'Poppins_400Regular', fontSize: 14}}>
                </TextInput>
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


                <View className=" justify-center items-center flex flex-row gap-4 pl-3 bg-gray-200 rounded-xl">
                      
                    <View className="flex flex-col justify-center items-center" style={{width: '40%'}}>
                      <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>Contract of the Gig</Text>
                      <Text className="text-teal-500" style={{ fontFamily: 'Poppins_400Regular', fontSize: 13 }}>View Contract</Text>
                    </View>

                    <Image
                        className="rounded-r-xl flex-1"
                        source={{uri: 'https://images.unsplash.com/photo-1519508234439-4f23643125c1?w=400&h=130&fit=crop'}}
                        style={{
                          height: 200,
                          width: '50%',
                        }}
                        resizeMode="cover"
                      />                  
                </View>
              </TouchableOpacity>

              <TouchableOpacity className="rounded-xl bg-gray-300 mt-3 justify-center items-center py-3 bg-teal-500">
                <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 15 }}>Submit</Text>
              </TouchableOpacity>
            </View>
          ) : reviewVisible ? (
            <View className="flex flex-1 flex-col mt-3">
              aafafa

            </View>
          ) : null}












        </View>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar/>
      </View>
    </View>
  );
}