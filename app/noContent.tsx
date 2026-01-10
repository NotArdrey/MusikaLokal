import React from 'react';
import { View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';




export default function myStudioScreen() {
    const { colors } = useTheme();

    return (
    <View className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
      <Header title ="My Studio"></Header>

        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
              <Navbar/>
        </View>
    </View>
    
    );
}
