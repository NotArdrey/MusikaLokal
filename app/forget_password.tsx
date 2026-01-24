import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import { useTheme } from '../src/context/ThemeContext';


export default function ForgetPasswordScreen() {

    const { colors, isDark } = useTheme();
    const [email, setEmail] = useState('');
    const [modalVisible, setModalVisible] = useState(false);

    return (
        <>
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <Header title="Forget Password" />

                <View style={styles.inputSection}>
                    <Text style={[styles.label, { color: colors.text }]}>
                        Email Address
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
                            placeholder="example@email.com"
                            placeholderTextColor={colors.textSecondary}
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />
                    </View>
                    <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                        We'll send a password reset link to this email.
                    </Text>
                </View>

                <View style={styles.buttonSection}>
                    <TouchableOpacity
                        style={[styles.button, { backgroundColor: colors.primary }]}
                        onPress={() => setModalVisible(true)}
                    >
                        <Text style={styles.buttonText}>
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

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 24,
    },
    inputSection: {
        marginTop: 32,
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
    },
    input: {
        flex: 1,
        fontSize: 16,
        marginLeft: 4,
        fontFamily: 'Poppins_400Regular',
        textAlignVertical: 'center',
        paddingVertical: 0,
    },
    helperText: {
        fontSize: 12,
        marginTop: 8,
        marginLeft: 4,
        fontFamily: 'Poppins_400Regular',
    },
    buttonSection: {
        marginTop: 32,
    },
    button: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#6366f1',
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
        elevation: 8,
    },
    buttonText: {
        color: 'white',
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
});
