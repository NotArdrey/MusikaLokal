import { router } from 'expo-router';
import React, { useRef, useState } from "react";
import { Animated, Image, Text, TouchableOpacity, View } from "react-native";


    const [isOpen, setIsOpen] = useState(true);
    const sidebarWidth = useRef(new Animated.Value(220)).current;

    export const toggleSidebar = () => {
        Animated.timing(sidebarWidth, {
            toValue: isOpen ? 70 : 220,
            duration: 200,
            useNativeDriver: false,
        }).start();
        setIsOpen(!isOpen);
    };

export default function Sidebar() {

    return(
        <View className="flex-1 bg-white flex-col justify-between gap-1 items-center">  
            <View className="flex-1 flex-row justify-center items-center">
                <View>
                     <Image source={{uri: 'https://www.freepik.com/photos/studio'}} className="border rounded-md" style={{height: 30, width: 30}}/>
                </View>
                <View className="flex-1 flex col justify-start items-start">
                    <Text>Jared Cariaso</Text>
                    <TouchableOpacity onPress={()=> router.push('/')}>
                        <Text>View Profile</Text>
                    </TouchableOpacity>
                </View>
                


                <View>

                </View>

            </View>


            <View>
                
            </View>


        </View>
    );
}