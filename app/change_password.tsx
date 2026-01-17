import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import { useTheme } from '../src/context/ThemeContext';

export default function ChangePasswordScreen() {
    const { colors } = useTheme();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);

    const renderPasswordInput = (
        label: string,
        value: string,
        setValue: (text: string) => void,
        show: boolean,
        setShow: (show: boolean) => void,
        placeholder: string
    ) => (
        <View className="mb-6">
            <Text className="text-base mb-2 font-medium" style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>
                {label}
            </Text>
            <View
                className="w-full px-4 py-3.5 rounded-xl border flex-row items-center relative"
                style={{
                    backgroundColor: colors.inputBackground,
                    borderColor: colors.border
                }}
            >
                <TextInput
                    className="flex-1 text-base ml-1 pr-8"
                    placeholder={placeholder}
                    placeholderTextColor={colors.textSecondary}
                    value={value}
                    onChangeText={setValue}
                    secureTextEntry={!show}
                    style={{ fontFamily: 'Poppins_400Regular', color: colors.text }}
                />
                <TouchableOpacity
                    className="absolute right-4"
                    onPress={() => setShow(!show)}
                >
                    <Ionicons
                        name={show ? 'eye-outline' : 'eye-off-outline'}
                        size={22}
                        color={colors.textSecondary}
                    />
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <>
            <View className="flex-1 px-6" style={{ backgroundColor: colors.background }}>
                <Header title="Change Password" />

                <View className="mt-8">
                    {renderPasswordInput(
                        "Current Password",
                        currentPassword,
                        setCurrentPassword,
                        showCurrentPassword,
                        setShowCurrentPassword,
                        "Enter current password"
                    )}

                    {renderPasswordInput(
                        "New Password",
                        newPassword,
                        setNewPassword,
                        showNewPassword,
                        setShowNewPassword,
                        "Create a new password"
                    )}

                    {renderPasswordInput(
                        "Confirm New Password",
                        confirmPassword,
                        setConfirmPassword,
                        showConfirmPassword,
                        setShowConfirmPassword,
                        "Re-enter new password"
                    )}
                </View>

                <View className="mt-2">
                    <TouchableOpacity
                        className="w-full py-4 rounded-xl shadow-lg shadow-indigo-500/30 items-center justify-center"
                        style={{ backgroundColor: colors.primary }}
                        onPress={() => setModalVisible(true)}
                    >
                        <Text className="text-white text-base font-semibold" style={{ fontFamily: 'Poppins_600SemiBold' }}>
                            Update Password
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            <Modal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                title="Confirm Password Change"
                message="Are you sure you want to change your password?"
                buttonText="Confirm"
            />
        </>
    );
}

