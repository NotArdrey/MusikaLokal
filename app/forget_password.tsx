import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import { useTheme } from '../src/context/ThemeContext';


export default function ForgetPasswordScreen() {

    const { colors, isDark } = useTheme();
    const [email, setEmail] = useState('');
    const [modalVisible, setModalVisible] = useState(false);

    return (
        <>
            <View className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
                <Header title="Forget Password" />

                <View className="mt-8">
                    <Text className="text-base mb-2 font-medium" style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>
                        Email Address
                    </Text>

                    <View
                        className="w-full px-4 py-3.5 rounded-xl border flex-row items-center"
                        style={{
                            backgroundColor: colors.inputBackground,
                            borderColor: colors.border
                        }}
                    >
                        <TextInput
                            className="flex-1 text-base ml-1"
                            placeholder="example@email.com"
                            placeholderTextColor={colors.textSecondary}
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}
                        />
                    </View>
                    <Text className="text-xs mt-2 ml-1" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
                        We'll send a password reset link to this email.
                    </Text>
                </View>

                <View className="mt-8">
                    <TouchableOpacity
                        className="w-full py-4 rounded-xl shadow-lg shadow-indigo-500/30 items-center justify-center"
                        style={{ backgroundColor: colors.primary }}
                        onPress={() => setModalVisible(true)}
                    >
                        <Text className="text-white text-base font-semibold" style={{ fontFamily: 'Poppins_600SemiBold' }}>
                            Send Link
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            <Modal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                title="Confirm Email"
                message="Are you sure you want to send a reset link to this email?"
                buttonText="Confirm"
            />
        </>
    );
}
