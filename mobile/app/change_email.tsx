import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import CustomAlert, { AlertType } from '../src/components/CustomAlert';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import { useTheme } from '../src/context/ThemeContext';

export default function ChangeEmailScreen() {
    const { colors } = useTheme();
    const [email, setEmail] = useState('');
    const [modalVisible, setModalVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState<{
        type: AlertType;
        title: string;
        message: string;
        buttons?: any[];
    }>({
        type: 'info',
        title: '',
        message: '',
    });

    const showAlert = (
        type: AlertType,
        title: string,
        message: string,
        buttons?: any[],
    ) => {
        setAlertConfig({ type, title, message, buttons });
        setAlertVisible(true);
    };

    const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value);

    const handleConfirmEmailChange = async () => {
        if (loading) return;
        setModalVisible(false);

        const trimmedEmail = email.trim().toLowerCase();
        if (!trimmedEmail) {
            showAlert('error', 'Email Required', 'Please enter a new email address.');
            return;
        }

        if (!isValidEmail(trimmedEmail)) {
            showAlert('error', 'Invalid Email', 'Please enter a valid email address.');
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ email: trimmedEmail });
            if (error) {
                showAlert('error', 'Update Failed', error.message || 'Failed to update email.');
                return;
            }

            showAlert(
                'success',
                'Verification Sent',
                'We sent a verification link to your new email. Please verify it to complete the change.',
                [{ text: 'OK', onPress: () => router.back() }],
            );
        } catch (e: any) {
            showAlert('error', 'Error', e?.message || 'An unexpected error occurred.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <Header title="Change Email" />

                <View style={styles.formContainer}>
                    <Text style={[styles.label, { color: colors.text }]}>
                        New Email Address
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
                            placeholder="new.email@example.com"
                            placeholderTextColor={colors.textSecondary}
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />
                    </View>
                    <Text style={[styles.helperText, { color: colors.textSecondary }]}>
                        You will need to verify this new email address.
                    </Text>
                </View>

                <View style={styles.buttonContainer}>
                    <TouchableOpacity activeOpacity={1}
                        style={[
                            styles.button,
                            {
                                backgroundColor: colors.primary,
                                shadowColor: '#6366F1', // indigo-500
                            },
                            loading && { opacity: 0.7 }
                        ]}
                        disabled={loading}
                        onPress={() => setModalVisible(true)}
                    >
                        <Text style={styles.buttonText}>
                            {loading ? 'Updating...' : 'Update Email'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            <Modal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                title="Confirm Email Change"
                message="Are you sure you want to change your email to this new address?"
                buttonText="Confirm"
                onConfirm={handleConfirmEmailChange}
            />

            <Modal
                visible={loading}
                loading
                loadingMessage="Updating email..."
                onClose={() => { }}
            />

            <CustomAlert
                visible={alertVisible}
                type={alertConfig.type}
                title={alertConfig.title}
                message={alertConfig.message}
                buttons={alertConfig.buttons}
                onClose={() => setAlertVisible(false)}
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
    buttonContainer: {
        marginTop: 32,
    },
    button: {
        width: '100%',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        // Shadow props need specific handling or elevation
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
