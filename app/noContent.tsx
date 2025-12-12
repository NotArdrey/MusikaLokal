import React from 'react';
import { View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';




export default function myStudioScreen() {

    return (
    <View className="flex-1 bg-white px-6">
      <Header title ="My Studio"></Header>

        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
              <Navbar/>
        </View>
    </View>
    
    );
}