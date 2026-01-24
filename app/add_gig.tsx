import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function AddGigScreen() {
    const { colors, isDark } = useTheme();
    const [step, setStep] = useState(1);
    const [gigName, setGigName] = useState('');
    const [description, setDescription] = useState('');
    const [address, setAddress] = useState('');
    const [cost, setCost] = useState('');
    const [modalVisible, setModalVisible] = useState(false);
    const [authorized, setAuthorized] = useState(false);
    const [checkingAuth, setCheckingAuth] = useState(true);

    // Form Steps Configuration
    const steps = [
        { id: 1, title: 'Gig Details', icon: 'information-circle' },
        { id: 2, title: 'Requirements', icon: 'list' },
        { id: 3, title: 'Review', icon: 'checkmark-circle' },
    ];

    // Role-based access control
    useEffect(() => {
        checkAuthorization();
    }, []);

    const checkAuthorization = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.replace('/');
                return;
            }

            const { data: profile } = await supabase.functions.invoke('manage-profile', {
                body: { action: 'fetch', userId: user.id }
            });

            if (profile?.role !== 'venue-owner') {
                Alert.alert('Unauthorized', 'Only venue owners can create gigs.');
                router.replace('/home');
                return;
            }

            setAuthorized(true);
        } catch (e) {
            console.error('Authorization check failed:', e);
            router.replace('/home');
        } finally {
            setCheckingAuth(false);
        }
    };

    const handleNext = () => {
        if (step < 3) setStep(step + 1);
        else setModalVisible(true);
    };

    const handleBack = () => {
        if (step > 1) setStep(step - 1);
        else router.back();
    };

    const handleConfirm = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const payload = {
                name: gigName,
                description,
                location: address,
                budget: parseFloat(cost) || 0,
                status: 'open'
            };

            const { error } = await supabase.functions.invoke('manage-listings', {
                body: { action: 'create', type: 'gig', userId: user.id, payload }
            });

            if (error) throw error;

            setModalVisible(false);
            console.log('Gig Created');
            // router.back() is handled by modal close usually or manual
        } catch (e) {
            console.log('Error creating gig:', e);
            alert('Failed to create gig');
        }
    };

    // Show loading while checking authorization
    if (checkingAuth) {
        return (
            <View style={[styles.flex1, styles.centerContainer, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ marginTop: 16, color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>
                    Checking permissions...
                </Text>
            </View>
        );
    }

    // Don't render if not authorized
    if (!authorized) {
        return null;
    }

    const renderInput = (label: string, value: string, setValue: (text: string) => void, placeholder: string, multiline = false, keyboardType: any = 'default') => (
        <View style={styles.inputContainer}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{label}</Text>
            <View style={[styles.inputWrapper, { backgroundColor: colors.inputBackground, borderColor: isDark ? '#374151' : '#E5E7EB' }]}>
                <TextInput
                    value={value}
                    onChangeText={setValue}
                    placeholder={placeholder}
                    placeholderTextColor={colors.textSecondary}
                    multiline={multiline}
                    numberOfLines={multiline ? 4 : 1}
                    keyboardType={keyboardType}
                    style={[
                        styles.textInput,
                        {
                            color: colors.text,
                            height: multiline ? 120 : 'auto',
                            textAlignVertical: multiline ? 'top' : 'center'
                        }
                    ]}
                />
            </View>
        </View>
    );

    return (
        <>
            <View style={[styles.flex1, { backgroundColor: colors.background }]}>
                <Header title="Create Gig" />

                {/* Enhanced Step Indicator (Fixed at top) */}
                <View style={styles.stepIndicatorContainer}>
                    <View style={styles.stepIndicatorContent}>
                        {/* Progress Line Background */}
                        <View style={[styles.progressLineBg, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]} />

                        {/* Active Progress Line */}
                        <View
                            style={[
                                styles.activeProgressLine,
                                {
                                    width: `${((step - 1) / (steps.length - 1)) * 100}%`,
                                    backgroundColor: colors.primary
                                }
                            ]}
                        />

                        {steps.map((s) => {
                            const isActive = step >= s.id;
                            const isCurrent = step === s.id;
                            return (
                                <View key={s.id} style={styles.stepItem}>
                                    <View
                                        style={[
                                            styles.stepCircle,
                                            {
                                                backgroundColor: isActive ? colors.primary : (isDark ? '#334155' : '#E5E7EB'),
                                                borderColor: isActive ? '#818cf8' : (isDark ? '#1E293B' : '#F3F4F6') // using primaryLight approx
                                            }
                                        ]}
                                    >
                                        <Ionicons
                                            name={isActive ? "checkmark" : s.icon as any}
                                            size={18}
                                            color={isActive ? "#fff" : colors.textSecondary}
                                        />
                                    </View>
                                    <Text
                                        style={[
                                            styles.stepText,
                                            {
                                                fontFamily: isCurrent ? 'Poppins_600SemiBold' : 'Poppins_400Regular',
                                                color: isActive ? colors.text : colors.textSecondary,
                                                fontWeight: isCurrent ? 'bold' : 'normal'
                                            }
                                        ]}
                                    >
                                        {s.title}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                </View>

                <ScrollView
                    style={styles.formContainer}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                >
                    {step === 1 && (
                        <View>
                            <Text style={[styles.sectionTitle, { color: colors.text }]}>
                                Gig Information
                            </Text>
                            {renderInput('Event Name', gigName, setGigName, 'e.g. Saturday Night Live')}
                            {renderInput('Venue/Location', address, setAddress, 'e.g. 123 Bar St, Manila')}
                            {renderInput('Budget / Fee (PHP)', cost, setCost, 'e.g. 5000', false, 'numeric')}
                            {renderInput('Description', description, setDescription, 'Event vibe, genre preferences...', true)}
                        </View>
                    )}

                    {step === 2 && (
                        <View>
                            <Text style={[styles.sectionTitle, { color: colors.text }]}>
                                Requirements
                            </Text>

                            <View style={[styles.dashedBox, { borderColor: isDark ? '#374151' : '#D1D5DB' }]}>
                                <Ionicons name="options-outline" size={48} color={colors.textSecondary} />
                                <Text style={[styles.dashedBoxText, { color: colors.textSecondary }]}>
                                    Additional filters like Genre, Instrument, or Experience Level would go here.
                                </Text>
                            </View>
                        </View>
                    )}

                    {step === 3 && (
                        <View>
                            <Text style={[styles.sectionTitle, { color: colors.text }]}>
                                Review Details
                            </Text>

                            <View style={[styles.reviewContainer, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB' }]}>
                                <View>
                                    <Text style={styles.reviewLabel}>Gig Info</Text>
                                    <Text style={[styles.reviewValue, { color: colors.text }]}>{gigName || 'No Name'}</Text>
                                    <Text style={{ color: colors.textSecondary }}>{address || 'No Location'}</Text>
                                    <Text style={{ color: colors.primary, fontFamily: 'Poppins_600SemiBold', marginTop: 4 }}>Budget: ₱{cost}</Text>
                                </View>

                                <View style={[styles.divider, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]} />

                                <View>
                                    <Text style={styles.reviewLabel}>Description</Text>
                                    <Text style={[styles.reviewDescription, { color: colors.text }]}>{description || 'No description provided.'}</Text>
                                </View>
                            </View>

                            <Text style={styles.termsText}>
                                By tapping Create Gig, you agree to our Terms and Conditions.
                            </Text>
                        </View>
                    )}

                    {/* Navigation Buttons */}
                    <View style={styles.navigationButtons}>
                        {step > 1 && (
                            <TouchableOpacity
                                onPress={handleBack}
                                style={[styles.backBtn, { borderColor: isDark ? '#374151' : '#E5E7EB' }]}
                            >
                                <Text style={[styles.backBtnText, { color: colors.text }]}>Back</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            onPress={handleNext}
                            style={[styles.nextBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
                        >
                            <Text style={styles.nextBtnText}>
                                {step === 3 ? 'Create Gig' : 'Next'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                </ScrollView>

                <Navbar />
            </View>

            <Modal
                visible={modalVisible}
                title="Success!"
                message={`Gig "${gigName}" has been successfully posted.`}
                buttonText="View Gig"
                onClose={handleConfirm}
            />
        </>
    );
}

const styles = StyleSheet.create({
    flex1: {
        flex: 1,
    },
    centerContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepIndicatorContainer: {
        paddingHorizontal: 24,
        paddingTop: 24,
        paddingBottom: 8,
    },
    stepIndicatorContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'relative',
    },
    progressLineBg: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 4,
        top: 20,
        zIndex: 0,
    },
    activeProgressLine: {
        position: 'absolute',
        left: 0,
        height: 4,
        top: 20,
        zIndex: 0,
    },
    stepItem: {
        alignItems: 'center',
        zIndex: 10,
        width: 80,
    },
    stepCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 4,
    },
    stepText: {
        fontSize: 12,
        marginTop: 8,
        textAlign: 'center',
    },
    formContainer: {
        flex: 1,
        paddingHorizontal: 24,
        marginTop: 16,
    },
    scrollContent: {
        paddingBottom: 150,
    },
    sectionTitle: {
        fontSize: 20,
        marginBottom: 24,
        textAlign: 'center',
        fontFamily: 'Poppins_600SemiBold',
    },
    inputContainer: {
        marginBottom: 16,
    },
    inputLabel: {
        marginBottom: 8,
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 1,
        fontFamily: 'Poppins_600SemiBold',
    },
    inputWrapper: {
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
    },
    textInput: {
        padding: 16,
        fontFamily: 'Poppins_400Regular',
    },
    dashedBox: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderRadius: 16,
        marginBottom: 24,
    },
    dashedBoxText: {
        marginTop: 8,
        fontSize: 14,
        textAlign: 'center',
        fontFamily: 'Poppins_400Regular',
    },
    reviewContainer: {
        padding: 16,
        borderRadius: 16,
        gap: 16,
        marginBottom: 16,
    },
    reviewLabel: {
        fontSize: 12,
        textTransform: 'uppercase',
        color: '#9CA3AF',
        fontWeight: 'bold',
        marginBottom: 4,
    },
    reviewValue: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    reviewDescription: {
        fontSize: 13,
        lineHeight: 20,
    },
    divider: {
        height: 1,
    },
    termsText: {
        textAlign: 'center',
        fontSize: 12,
        color: '#9CA3AF',
        paddingHorizontal: 16,
    },
    navigationButtons: {
        marginTop: 32,
        flexDirection: 'row',
        gap: 16,
        marginBottom: 16,
    },
    backBtn: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
    },
    backBtnText: {
        fontFamily: 'Poppins_600SemiBold',
    },
    nextBtn: {
        flex: 1,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    nextBtnText: {
        fontFamily: 'Poppins_600SemiBold',
        color: '#fff',
    },
});
