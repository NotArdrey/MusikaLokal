import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
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

    // Form Steps Configuration
    const steps = [
        { id: 1, title: 'Gig Details', icon: 'information-circle' },
        { id: 2, title: 'Requirements', icon: 'list' },
        { id: 3, title: 'Review', icon: 'checkmark-circle' },
    ];

    const handleNext = () => {
        if (step < 3) setStep(step + 1);
        else setModalVisible(true);
    };

    const handleBack = () => {
        if (step > 1) setStep(step - 1);
        else router.back();
    };

    const handleConfirm = () => {
        setModalVisible(false);
        console.log('Gig Created');
        router.back();
    };

    const renderInput = (label: string, value: string, setValue: (text: string) => void, placeholder: string, multiline = false, keyboardType: any = 'default') => (
        <View className="mb-4">
            <Text className="mb-2 text-xs uppercase tracking-wider" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.textSecondary }}>{label}</Text>
            <View className={`rounded-xl border ${isDark ? 'border-gray-700' : 'border-gray-200'} overflow-hidden`} style={{ backgroundColor: colors.inputBackground }}>
                <TextInput
                    value={value}
                    onChangeText={setValue}
                    placeholder={placeholder}
                    placeholderTextColor={colors.textSecondary}
                    multiline={multiline}
                    numberOfLines={multiline ? 4 : 1}
                    keyboardType={keyboardType}
                    className="p-4"
                    style={{
                        fontFamily: 'Poppins_400Regular',
                        color: colors.text,
                        height: multiline ? 120 : 'auto',
                        textAlignVertical: multiline ? 'top' : 'center'
                    }}
                />
            </View>
        </View>
    );

    return (
        <>
            <View className="flex-1" style={{ backgroundColor: colors.background }}>
                <Header title="Create Gig" />

                {/* Enhanced Step Indicator (Fixed at top) */}
                <View className="px-6 py-6 pb-2">
                    <View className="flex-row items-center justify-between relative">
                        {/* Progress Line Background */}
                        <View className="absolute left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700 top-5 z-0" />

                        {/* Active Progress Line */}
                        <View
                            className="absolute left-0 h-1 top-5 z-0 transition-all duration-300"
                            style={{ width: `${((step - 1) / (steps.length - 1)) * 100}%`, backgroundColor: colors.primary }}
                        />

                        {steps.map((s) => {
                            const isActive = step >= s.id;
                            const isCurrent = step === s.id;
                            return (
                                <View key={s.id} className="items-center z-10 w-20">
                                    <View
                                        className="w-10 h-10 rounded-full items-center justify-center border-4"
                                        style={{
                                            backgroundColor: isActive ? colors.primary : (isDark ? '#334155' : '#E5E7EB'),
                                            borderColor: isActive ? colors.primaryLight : (isDark ? '#1E293B' : '#F3F4F6')
                                        }}
                                    >
                                        <Ionicons
                                            name={isActive ? "checkmark" : s.icon as any}
                                            size={18}
                                            color={isActive ? "#fff" : colors.textSecondary}
                                        />
                                    </View>
                                    <Text
                                        className="text-xs mt-2 text-center"
                                        style={{
                                            fontFamily: isCurrent ? 'Poppins_600SemiBold' : 'Poppins_400Regular',
                                            color: isActive ? colors.text : colors.textSecondary,
                                            fontWeight: isCurrent ? 'bold' : 'normal'
                                        }}
                                    >
                                        {s.title}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                </View>

                <ScrollView className="flex-1 px-6 mt-4" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 }}>
                    {step === 1 && (
                        <View>
                            <Text className="text-xl mb-6 text-center" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
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
                            <Text className="text-xl mb-6 text-center" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
                                Requirements
                            </Text>

                            <View className="items-center justify-center p-8 border-2 border-dashed rounded-2xl border-gray-300 dark:border-gray-700 mb-6">
                                <Ionicons name="options-outline" size={48} color={colors.textSecondary} />
                                <Text className="mt-2 text-sm text-center" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
                                    Additional filters like Genre, Instrument, or Experience Level would go here.
                                </Text>
                            </View>
                        </View>
                    )}

                    {step === 3 && (
                        <View>
                            <Text className="text-xl mb-6 text-center" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
                                Review Details
                            </Text>

                            <View className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 gap-4 mb-4">
                                <View>
                                    <Text className="text-xs uppercase text-gray-400 font-bold mb-1">Gig Info</Text>
                                    <Text className="text-lg font-bold" style={{ color: colors.text }}>{gigName || 'No Name'}</Text>
                                    <Text style={{ color: colors.textSecondary }}>{address || 'No Location'}</Text>
                                    <Text style={{ color: colors.primary, fontFamily: 'Poppins_600SemiBold', marginTop: 4 }}>Budget: ₱{cost}</Text>
                                </View>

                                <View className="h-[1px] bg-gray-200 dark:bg-gray-700" />

                                <View>
                                    <Text className="text-xs uppercase text-gray-400 font-bold mb-2">Description</Text>
                                    <Text style={{ fontSize: 13, color: colors.text, lineHeight: 20 }}>{description || 'No description provided.'}</Text>
                                </View>
                            </View>

                            <Text className="text-center text-xs text-gray-400 px-4">
                                By tapping Create Gig, you agree to our Terms and Conditions.
                            </Text>
                        </View>
                    )}

                    {/* Navigation Buttons (Inside ScrollView) */}
                    <View className="mt-8 flex-row gap-4 mb-4">
                        {step > 1 && (
                            <TouchableOpacity
                                onPress={handleBack}
                                className="flex-1 py-4 rounded-xl items-center border border-gray-200 dark:border-gray-700"
                            >
                                <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Back</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            onPress={handleNext}
                            className="flex-1 py-4 rounded-xl items-center shadow-lg"
                            style={{ backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.3 }}
                        >
                            <Text style={{ fontFamily: 'Poppins_600SemiBold', color: '#fff' }}>
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
