import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Header from '../src/components/header';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

export default function AddStudioScreen() {
    const { colors, isDark } = useTheme();
    const [step, setStep] = useState(1);
    const [studioName, setStudioName] = useState('');
    const [description, setDescription] = useState('');
    const [address, setAddress] = useState('');
    const [cost, setCost] = useState('');
    const [modalVisible, setModalVisible] = useState(false);

    // Arrays
    const [amenities, setAmenities] = useState<string[]>([]);
    const [newAmenity, setNewAmenity] = useState('');

    const steps = [
        { id: 1, title: 'Details', icon: 'business' },
        { id: 2, title: 'Amenities', icon: 'mic' },
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
        console.log('Studio Created');
        router.back();
    };

    const addAmenity = () => {
        if (newAmenity.trim()) {
            setAmenities([...amenities, newAmenity.trim()]);
            setNewAmenity('');
        }
    };

    const removeAmenity = (index: number) => {
        setAmenities(amenities.filter((_, i) => i !== index));
    };

    const renderInput = (label: string, value: string, setValue: (text: string) => void, placeholder: string, multiline = false, numeric = false) => (
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
                    keyboardType={numeric ? 'numeric' : 'default'}
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
                <Header title="Create Studio" />

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
                                Studio Information
                            </Text>
                            {renderInput('Studio Name', studioName, setStudioName, 'e.g. SoundWave Studios')}
                            {renderInput('Address', address, setAddress, 'e.g. 123 Music St, Manila')}
                            {renderInput('Hourly Rate (PHP)', cost, setCost, 'e.g. 500', false, true)}
                            {renderInput('Description', description, setDescription, 'Describe your gear and space...', true)}
                        </View>
                    )}

                    {step === 2 && (
                        <View>
                            <Text className="text-xl mb-6 text-center" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
                                Studio Amenities
                            </Text>

                            <View className="flex-row gap-2 mb-6">
                                <View className={`flex-1 rounded-xl border ${isDark ? 'border-gray-700' : 'border-gray-200'} overflow-hidden`} style={{ backgroundColor: colors.inputBackground }}>
                                    <TextInput
                                        value={newAmenity}
                                        onChangeText={setNewAmenity}
                                        placeholder="Add amenity (e.g. Drum Kit, AC)..."
                                        placeholderTextColor={colors.textSecondary}
                                        style={{ padding: 12, fontFamily: 'Poppins_400Regular', color: colors.text }}
                                    />
                                </View>
                                <TouchableOpacity
                                    onPress={addAmenity}
                                    className="w-12 rounded-xl items-center justify-center"
                                    style={{ backgroundColor: colors.primary }}
                                >
                                    <Ionicons name="add" size={24} color="#fff" />
                                </TouchableOpacity>
                            </View>

                            {amenities.length === 0 ? (
                                <View className="items-center justify-center p-8 border-2 border-dashed rounded-2xl border-gray-300 dark:border-gray-700">
                                    <Ionicons name="mic-outline" size={48} color={colors.textSecondary} />
                                    <Text className="mt-2 text-sm" style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary }}>
                                        No amenities listed
                                    </Text>
                                </View>
                            ) : (
                                <View className="gap-2">
                                    {amenities.map((item, index) => (
                                        <View key={index} className="flex-row items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                                            <View className="flex-row items-center gap-3">
                                                <Ionicons name="checkmark-circle-outline" size={20} color={colors.primary} />
                                                <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>{item}</Text>
                                            </View>
                                            <TouchableOpacity onPress={() => removeAmenity(index)}>
                                                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    )}

                    {step === 3 && (
                        <View>
                            <Text className="text-xl mb-6 text-center" style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
                                Review Details
                            </Text>

                            <View className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800 gap-4 mb-4">
                                <View>
                                    <Text className="text-xs uppercase text-gray-400 font-bold mb-1">Studio Info</Text>
                                    <Text className="text-lg font-bold" style={{ color: colors.text }}>{studioName || 'No Name'}</Text>
                                    <Text style={{ color: colors.textSecondary }}>{address || 'No Address'}</Text>
                                    <Text style={{ color: colors.primary, fontFamily: 'Poppins_600SemiBold', marginTop: 4 }}>₱{cost}/hr</Text>
                                </View>

                                <View className="h-[1px] bg-gray-200 dark:bg-gray-700" />

                                <View>
                                    <Text className="text-xs uppercase text-gray-400 font-bold mb-2">Amenities ({amenities.length})</Text>
                                    <View className="flex-row flex-wrap gap-2">
                                        {amenities.map((m, i) => (
                                            <View key={i} className="px-2 py-1 rounded-md bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                                                <Text style={{ fontSize: 12, color: colors.text }}>{m}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            </View>

                            <Text className="text-center text-xs text-gray-400 px-4">
                                By tapping Create Studio, you agree to our Terms and Conditions.
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
                                {step === 3 ? 'Create Studio' : 'Next'}
                            </Text>
                        </TouchableOpacity>
                    </View>

                </ScrollView>

                <Navbar />
            </View>

            <Modal
                visible={modalVisible}
                title="Success!"
                message={`Studio "${studioName}" has been successfully listed.`}
                buttonText="View Studio"
                onClose={handleConfirm}
            />
        </>
    );
}
