import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar';



export default function findAGigScreen() {
    const [selectedType, setSelectedType] = useState('All');
    const [selectedGenre, setSelectedGenre] = useState('All');
    const [sortBy, setSortBy] = useState('Relevance');
    const [showSortModal, setShowSortModal] = useState(false);

    const sortOptions = ['Relevance', 'Distance', 'Rating', 'Price: Low to High', 'Price: High to Low'];

    return (
    <View className="flex-1 bg-white px-6">
      <Header title ="Find Talent & Spaces"/>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 12, paddingBottom: 100 }}>
      <View className ="mt-5 mb-3">
        <Ionicons
          name="search"
          size={20}
          color="#888"
          className="absolute left-2.5 top-3.5 z-10"
        />
        <TextInput          
          className="border border-gray-300 bg-gray-100 rounded-lg px-4 py-3 text-base pl-10"
          placeholder="Search for Venues, Studios, Bands"
          placeholderTextColor="#888"
          autoCapitalize="none"
          style={{ fontFamily: 'Poppins_400Regular' }}/>
      </View>

      {/* Filter Section */}
      <View className="mb-4">
        {/* Type Filter */}
        <View className="mb-3">
          <Text className="text-xs text-gray-600 mb-2" style={{ fontFamily: 'Poppins_500Medium' }}>Type</Text>
          <View style={{ marginHorizontal: -8 }}>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled={true}
              contentContainerStyle={{ paddingHorizontal: 8, paddingRight: 24 }}
            >
              <View className="flex-row gap-2">
                {['All', 'Venue', 'Studio', 'Music Group', 'Solo Artist'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setSelectedType(type)}
                    className={`px-4 py-2 rounded-full ${selectedType === type ? 'bg-[#0D9488]' : 'bg-gray-100'}`}
                  >
                    <Text className={`text-xs ${selectedType === type ? 'text-white' : 'text-gray-700'}`} style={{ fontFamily: 'Poppins_500Medium' }}>
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>

        {/* Genre Filter */}
        <View className="mb-3">
          <Text className="text-xs text-gray-600 mb-2" style={{ fontFamily: 'Poppins_500Medium' }}>Genre</Text>
          <View>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled={true}
              contentContainerStyle={{ paddingHorizontal: 1, paddingRight: 10 }}
            >
              <View className="flex-row gap-2 ">
                {['All', 'Rock', 'Jazz', 'Pop', 'Hip-hop', 'Classical', 'Electronic', 'R&B'].map((genre) => (
                  <TouchableOpacity
                    key={genre}
                    onPress={() => setSelectedGenre(genre)}
                    className={`px-4 py-2 rounded-full ${selectedGenre === genre ? 'bg-[#0D9488]' : 'bg-gray-100'}`}
                  >
                    <Text className={`text-xs ${selectedGenre === genre ? 'text-white' : 'text-gray-700'}`} style={{ fontFamily: 'Poppins_500Medium' }}>
                      {genre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>

        {/* Sort and Filter Row */}
        <View className="flex-row items-center justify-between mt-3">
          <View className="flex-row items-center gap-2">
            <Text className="text-xs text-gray-600" style={{ fontFamily: 'Poppins_500Medium' }}>Sort by:</Text>
            <TouchableOpacity
              onPress={() => setShowSortModal(true)}
              className="flex-row items-center gap-1 px-3 py-1.5 bg-gray-100 rounded-lg"
            >
              <Text className="text-xs text-gray-700" style={{ fontFamily: 'Poppins_500Medium' }}>{sortBy}</Text>
              <Ionicons name="chevron-down" size={14} color="#374151" />
            </TouchableOpacity>
          </View>
        
        </View>
      </View>

      {/* Sort Modal */}
      <Modal
        visible={showSortModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSortModal(false)}
      >
        <TouchableOpacity 
          className="flex-1 bg-black/50 justify-center items-center"
          activeOpacity={1}
          onPress={() => setShowSortModal(false)}
        >
          <View className="bg-white rounded-2xl w-4/5 max-w-sm" style={{ marginHorizontal: 20 }}>
            <View className="border-b border-gray-200 px-6 py-4">
              <Text className="text-base font-semibold text-gray-800" style={{ fontFamily: 'Poppins_600SemiBold' }}>
                Sort by
              </Text>
            </View>
            <View className="py-2">
              {sortOptions.map((option, index) => (
                <TouchableOpacity
                  key={option}
                  onPress={() => {
                    setSortBy(option);
                    setShowSortModal(false);
                  }}
                  className={`px-6 py-3 flex-row items-center justify-between ${
                    index !== sortOptions.length - 1 ? 'border-b border-gray-100' : ''
                  }`}
                >
                  <Text 
                    className={`text-sm ${sortBy === option ? 'text-[#0D9488] font-semibold' : 'text-gray-700'}`}
                    style={{ fontFamily: sortBy === option ? 'Poppins_600SemiBold' : 'Poppins_400Regular' }}
                  >
                    {option}
                  </Text>
                  {sortBy === option && (
                    <Ionicons name="checkmark" size={20} color="#0D9488" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <View className="border-t border-gray-200 px-6 py-3">
              <TouchableOpacity
                onPress={() => setShowSortModal(false)}
                className="py-2 items-center"
              >
                <Text className="text-sm text-gray-500" style={{ fontFamily: 'Poppins_500Medium' }}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
      
        {/*Studio/Venue Card*/}
        <View className="flex-1 flex-col bg-white rounded-3xl overflow-hidden" style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 16,
          elevation: 8,
          marginHorizontal: 4,
          marginVertical: 8
        }}>
          <View className="border-gray-100" style={{height: 200}}>
            <Image 
              source={{uri: 'https://picsum.photos/400/200?random=4'}} 
              style={{height: 200, width: '100%'}}
              resizeMode="cover"
            />
            <View className="absolute top-3 left-3 rounded-lg px-3 py-1.5" style={{backgroundColor: '#0D9488'}}>
              <Text className="text-white text-[10px] font-semibold" style={{ fontFamily: 'Poppins_600SemiBold' }}>VENUE</Text>
            </View>
          </View>
          <View>
            <View className="px-5 flex flex-row justify-between items-center">
              <Text className ="mt-3"style={{ fontFamily: 'Poppins_700Bold'}}>Adonis Gay Bar</Text>
              <View className="flex-row items-center bg-amber-50 rounded-full px-3 py-1 mt-3">
                <Ionicons name="star" size={14} color="#FFB800" />
                <Text className="ml-1 text-xs font-semibold text-black">4.8</Text>
              </View>
            </View>
          </View>
          <View className="mt-1 px-5 flex flex-row ">
             <Ionicons name="location-outline" size={14} color="#638782" />
             <Text className =" px-0.5 text-[#638782]"style={{ fontFamily: 'Poppins_400Regular', fontSize: 12 }}>Plaridel Bulacan</Text>
          </View>

          <View className="flex-row items-center gap-2 mb-3 px-5 mt-2">
            <View className="flex-row items-center gap-1 bg-teal-100 rounded-md px-3 py-1.5">
              <Text className="text-[11px] text-teal-700 font-medium">Gay</Text>
            </View>
            <View className="flex-row items-center gap-1 bg-cyan-100 rounded-md px-3 py-1.5">
              <Text className="text-[11px] text-cyan-700 font-medium">homosapiens</Text>
            </View>
          </View>

          <View className="flex-row items-center gap-4 border-b border-gray-100 pb-3 mb-3 px-6">
            <View className="flex-row items-center gap-1">
              <Ionicons name="cash-outline" size={16} color="#9CA3AF" />
              <Text className="text-[12px] text-gray-500" style={{ fontFamily: 'Poppins_500Medium' }}>₱69,000</Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Ionicons name="navigate-outline" size={16} color="#9CA3AF" />
              <Text className="text-[12px] text-gray-500" style={{ fontFamily: 'Poppins_500Medium' }}>6.9 km</Text>
            </View>
          </View>

          <View className="px-5">
            <Text className =" text-gray-500"style={{ fontFamily: 'Poppins_400Regular', fontSize: 12 }}>Owned by JARED CARIASO who is a gay specialist. Iconic jazz club in the heart of the city known for its intimate setting and world-class performances.</Text>
          </View>

          <View className="flex-1  mt-5 mb-5 mx-5">
            <TouchableOpacity className =" rounded-xl justify-center items-center bg-[#12D4B5] shadow" style={{height:40}}>
              <Text style={{ fontFamily: 'Poppins_600semibold'}}>Apply to Play</Text>
            </TouchableOpacity>
          </View>
        </View>



      {/*Bands Card*/}
        <View className="flex-1 flex-col bg-white rounded-3xl overflow-hidden" 
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.1,
          shadowRadius: 16,
          elevation: 8,
          marginHorizontal: 4,
          marginVertical: 8
        }}>
          <View className="border-gray-100" style={{height: 200}}>
            <Image 
              source={{uri: 'https://picsum.photos/400/200?random=5'}} 
              style={{height: 200, width: '100%'}}
              resizeMode="cover"
            />
            <View className="absolute top-3 left-3 rounded-lg px-3 py-1.5" style={{backgroundColor: '#0D9488'}}>
              <Text className="text-white text-[10px] font-semibold" style={{ fontFamily: 'Poppins_600SemiBold' }}>MUSIC GROUP</Text>
            </View>
          </View>
          <View>
            <View className="px-5 flex flex-row justify-between items-center">
              <Text className ="mt-3"style={{ fontFamily: 'Poppins_700Bold'}}>The Manila Groove</Text>
              <View className="flex-row items-center bg-amber-50 rounded-full px-3 py-1 mt-3">
                <Ionicons name="star" size={14} color="#FFB800" />
                <Text className="ml-1 text-xs font-semibold text-black">4.9</Text>
              </View>
            </View>
          </View>
          <View className="mt-1 px-5 flex flex-row ">
             <Ionicons name="location-outline" size={14} color="#638782" />
             <Text className =" px-0.5 text-[#638782]"style={{ fontFamily: 'Poppins_400Regular', fontSize: 12 }}>Quezon City, Metro Manila</Text>
          </View>

          <View className="flex-row items-center gap-2 mb-3 px-5 mt-2">
            <View className="flex-row items-center gap-1 bg-teal-100 rounded-md px-3 py-1.5">
              <Text className="text-[11px] text-teal-700 font-medium">Rock</Text>
            </View>
            <View className="flex-row items-center gap-1 bg-cyan-100 rounded-md px-3 py-1.5">
              <Text className="text-[11px] text-cyan-700 font-medium">Jazz Fusion</Text>
            </View>
          </View>

          <View className="flex-row items-center gap-4 border-b border-gray-100 pb-3 mb-3 px-6">
            <View className="flex-row items-center gap-1">
              <Ionicons name="navigate-outline" size={16} color="#9CA3AF" />
              <Text className="text-[12px] text-gray-500" style={{ fontFamily: 'Poppins_500Medium' }}>3.2 km</Text>
            </View>
          </View>

          <View className="px-5">
            <Text className =" text-gray-500"style={{ fontFamily: 'Poppins_400Regular', fontSize: 12 }}>5-piece band with 8 years of experience. Specializes in classic rock, jazz standards, and original compositions. Available for weddings, corporate events, and bar gigs.</Text>
          </View>

          <View className="flex-1  mt-5 mb-5 mx-5">
            <TouchableOpacity className =" rounded-xl justify-center items-center bg-[#12D4B5] shadow" style={{height:40}}>
              <Text style={{ fontFamily: 'Poppins_600semibold'}}>Apply to Play</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>


      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <Navbar/>
      </View>      
    </View>
    
    );
}
