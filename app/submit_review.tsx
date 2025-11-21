import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../components/header';
import Navbar from '../components/navbar';



export default function ToReviewScreen() {


  const [selectedValue, setSelectedValue] = useState<number | null>(null);
  const ratingOptions = [1, 2, 3, 4, 5];
  const handleSelection = (value: number) =>{
    setSelectedValue(value);
  }


    return (
    <View className="flex-1 bg-white px-6">
      <Header title ="Submit Feedback"></Header>


      <View className="flex flex-col justify-center items-center">
        <View className ="mt-6">
            <Text style={{ fontFamily: 'Poppins_400Regular', fontSize: 16 }}>How was your experience with us?</Text>
        </View>

        <View className="flex flex-row gap-2 items-center justify-center">
          {ratingOptions.map((item) =>(
            <TouchableOpacity
              key={item}
              onPress={()=> setSelectedValue(item)}
              className="rounded-xl border text-black py-5 px-8 items-center justify-center mt-5"
              style={{ backgroundColor: item === selectedValue ? '#fde047' : '#ffffff' }}
            >
              <Text className="text-black" style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16 }}>
                {item}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
          


      </View>

      <View className="mt-4 items-center">
          <TextInput className="justify-start rounded-xl border border-gray-300 py-5 px-5"
          placeholder='Enter Your Feedback!' style={{height:200, width: '100%'}} multiline={true}>
          </TextInput>
          <TouchableOpacity className ="mt-5 rounded-lg bg-cyan-200 px-5 py-5 items-center" style ={{width: 300}}>
            <Text style={{ fontFamily: 'Poppins_600SemiBold', fontSize: 16 }}>Submit</Text>
          </TouchableOpacity>
      </View>
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
              <Navbar/>
        </View>
    </View>
    
    );
}