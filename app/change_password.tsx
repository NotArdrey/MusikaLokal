import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
        <View style={styles.inputWrapper}>
            <Text style={[styles.label, { color: colors.text }]}>
                {label}
            </Text>
            <View
                style={[
                    styles.inputContainer,
                    {
                        backgroundColor: colors.inputBackground,
                        borderColor: colors.border
                    }
                ]}
            >
                <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder={placeholder}
                    placeholderTextColor={colors.textSecondary}
                    value={value}
                    onChangeText={setValue}
                    secureTextEntry={!show}
                />
                <TouchableOpacity
                    style={styles.eyeIcon}
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
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <Header title="Change Password" />

                <View style={styles.formContainer}>
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

                <View style={styles.buttonContainer}>
                    <TouchableOpacity
                        style={[
                            styles.button,
                            {
                                backgroundColor: colors.primary,
                                shadowColor: '#6366F1', // indigo-500
                            }
                        ]}
                        onPress={() => setModalVisible(true)}
                    >
                        <Text style={styles.buttonText}>
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

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 24,
    },
    formContainer: {
        marginTop: 32,
    },
    inputWrapper: {
        marginBottom: 24,
    },
    label: {
        fontSize: 16,
        marginBottom: 8,
        fontFamily: 'Poppins_500Medium',
    },
    inputContainer: {
        width: '100%',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        position: 'relative',
    },
    input: {
        flex: 1,
        fontSize: 16,
        marginLeft: 4,
        paddingRight: 32,
        fontFamily: 'Poppins_400Regular',
    },
    eyeIcon: {
        position: 'absolute',
        right: 16,
    },
    buttonContainer: {
        marginTop: 8,
    },
    button: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 8,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    buttonText: {
        color: 'white',
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
});
