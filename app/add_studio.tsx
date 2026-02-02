import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { AlertType } from '../src/components/CustomAlert';
import Header from '../src/components/header';
import ImageUploader from '../src/components/ImageUploader';
import LocationPicker from '../src/components/LocationPicker';
import Modal from '../src/components/modal';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

// Helper function to format time input
const formatTimeInput = (text: string): string => {
    // Remove all non-digit characters except colon
    let cleaned = text.replace(/[^0-9:]/g, '');

    // Limit to 5 characters (HH:MM)
    if (cleaned.length > 5) cleaned = cleaned.substring(0, 5);

    // Auto-add colon after 2 digits
    if (cleaned.length === 2 && !cleaned.includes(':')) {
        cleaned = cleaned + ':';
    }

    // If user types more than 2 digits before colon, insert colon
    if (cleaned.length > 2 && !cleaned.includes(':')) {
        cleaned = cleaned.substring(0, 2) + ':' + cleaned.substring(2);
    }

    // Validate hour (01-12)
    const parts = cleaned.split(':');
    if (parts[0] && parts[0].length === 2) {
        const hour = parseInt(parts[0]);
        if (hour < 1 || hour > 12) {
            return cleaned.substring(0, 1);
        }
    }

    // Validate minute (00-59)
    if (parts[1] && parts[1].length === 2) {
        const minute = parseInt(parts[1]);
        if (minute > 59) {
            return parts[0] + ':' + parts[1].substring(0, 1);
        }
    }

    return cleaned;
};

export default function AddStudioScreen() {
    const { colors, isDark } = useTheme();
    const [step, setStep] = useState(1);
    const [studioName, setStudioName] = useState('');
    const [description, setDescription] = useState('');
    const [address, setAddress] = useState('');
    const [latitude, setLatitude] = useState<number | null>(null);
    const [longitude, setLongitude] = useState<number | null>(null);
    const [locationPickerVisible, setLocationPickerVisible] = useState(false);
    // Dynamic pricing per studio type
    const [rehearsalRate, setRehearsalRate] = useState('');
    const [recordingRate, setRecordingRate] = useState('');
    const [studioType, setStudioType] = useState<'Rehearsal' | 'Recording' | 'Both'>('Both');
    const [modalVisible, setModalVisible] = useState(false);
    const [authorized, setAuthorized] = useState(false);
    const [checkingAuth, setCheckingAuth] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newStudioId, setNewStudioId] = useState<string | null>(null);

    // Custom Alert State
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

    const showAlert = (type: AlertType, title: string, message: string, buttons?: any[]) => {
        setAlertConfig({ type, title, message, buttons });
        setAlertVisible(true);
    };

    // Arrays
    const [amenities, setAmenities] = useState<string[]>([]);
    const [newAmenity, setNewAmenity] = useState('');

    // Studio Equipment state (full details with name, quantity, description, image)
    interface EquipmentItem {
        id: string;
        name: string;
        quantity: number;
        description: string;
        image: string;
    }
    const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
    const [showEquipmentModal, setShowEquipmentModal] = useState(false);
    const [editingEquipment, setEditingEquipment] = useState<EquipmentItem | null>(null);
    const [equipmentForm, setEquipmentForm] = useState({ name: '', quantity: '1', description: '', image: '' });

    // Calendar-based availability state
    const [selectedDates, setSelectedDates] = useState<{ [date: string]: { selected: boolean; slots: { start: string; end: string }[] } }>({});
    const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7));

    // Legacy instruments state for backward compatibility
    const [selectedInstruments, setSelectedInstruments] = useState<{ name: string, image: string }[]>([]);

    // Predefined instruments with images (using Unsplash for demo, replace with your own CDN)
    const INSTRUMENT_OPTIONS = [
        { name: 'Drum Kit', image: 'https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=200&h=200&fit=crop' },
        { name: 'Piano', image: 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=200&h=200&fit=crop' },
        { name: 'Guitar Amp', image: 'https://images.unsplash.com/photo-1535587566541-97121a128dc5?w=200&h=200&fit=crop' },
        { name: 'Bass Amp', image: 'https://images.unsplash.com/photo-1516924962500-2b4b3b99ea02?w=200&h=200&fit=crop' },
        { name: 'Microphones', image: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=200&h=200&fit=crop' },
        { name: 'Keyboard', image: 'https://images.unsplash.com/photo-1552422535-c45813c61732?w=200&h=200&fit=crop' },
        { name: 'Electric Guitar', image: 'https://images.unsplash.com/photo-1550985616-10810253b84d?w=200&h=200&fit=crop' },
        { name: 'Bass Guitar', image: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=200&h=200&fit=crop' },
        { name: 'DJ Equipment', image: 'https://images.unsplash.com/photo-1571327073757-71d13c24de30?w=200&h=200&fit=crop' },
        { name: 'Synthesizer', image: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=200&h=200&fit=crop' },
        { name: 'PA System', image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&h=200&fit=crop' },
        { name: 'Mixing Console', image: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=200&h=200&fit=crop' },
    ];

    // Toggle instrument selection
    const toggleInstrument = (instrument: { name: string, image: string }) => {
        const isSelected = selectedInstruments.some(i => i.name === instrument.name);
        if (isSelected) {
            setSelectedInstruments(selectedInstruments.filter(i => i.name !== instrument.name));
        } else {
            setSelectedInstruments([...selectedInstruments, instrument]);
        }
    };

    // Images state
    const [images, setImages] = useState<string[]>([]);
    const [thumbnailIndex, setThumbnailIndex] = useState(0);

    // Contract state
    const [contractUrl, setContractUrl] = useState<string>('');
    const [contractFileName, setContractFileName] = useState<string>('');
    const [uploadingContract, setUploadingContract] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Availability state
    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const [availability, setAvailability] = useState<{ day: string; slots: { start: string; end: string }[] }[]>(
        daysOfWeek.map(day => ({ day, slots: [] }))
    );

    const steps = [
        { id: 1, title: 'Details', icon: 'business' },
        { id: 2, title: 'Amenities', icon: 'mic' },
        { id: 3, title: 'Availability', icon: 'time' },
        { id: 4, title: 'Review', icon: 'checkmark-circle' },
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

            if (profile?.role !== 'studio-owner') {
                Alert.alert('Unauthorized', 'Only studio owners can create studios.');
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

    const validateStep = (currentStep: number): boolean => {
        if (currentStep === 1) {
            if (!studioName.trim()) {
                showAlert('error', 'Required Field', 'Please enter a studio name');
                return false;
            }
            if (!description.trim()) {
                showAlert('error', 'Required Field', 'Please enter a description');
                return false;
            }
            if (!address || !latitude || !longitude) {
                showAlert('error', 'Required Field', 'Please select a location on the map');
                return false;
            }
            // Validate pricing based on studio type
            if (studioType === 'Both') {
                if (!rehearsalRate.trim() || parseFloat(rehearsalRate) <= 0) {
                    showAlert('error', 'Required Field', 'Please enter a valid rehearsal rate');
                    return false;
                }
                if (!recordingRate.trim() || parseFloat(recordingRate) <= 0) {
                    showAlert('error', 'Required Field', 'Please enter a valid recording rate');
                    return false;
                }
            } else if (studioType === 'Rehearsal') {
                if (!rehearsalRate.trim() || parseFloat(rehearsalRate) <= 0) {
                    showAlert('error', 'Required Field', 'Please enter a valid rehearsal rate');
                    return false;
                }
            } else {
                if (!recordingRate.trim() || parseFloat(recordingRate) <= 0) {
                    showAlert('error', 'Required Field', 'Please enter a valid recording rate');
                    return false;
                }
            }
            if (images.length === 0) {
                showAlert('error', 'Required Field', 'Please upload at least one studio photo');
                return false;
            }
        }
        return true;
    };

    const handleNext = async () => {
        if (!validateStep(step)) {
            return;
        }

        if (step < 4) {
            setStep(step + 1);
        } else {
            // Confirmation before creating
            showAlert(
                'warning',
                'Confirm Studio Listing',
                'Are you sure you want to create this studio listing? Please review all details before proceeding.',
                [
                    { text: 'Cancel', style: 'cancel', onPress: () => { } },
                    { text: 'Create', style: 'default', onPress: () => createStudio() }
                ]
            );
        }
    };

    const handleBack = () => {
        if (step > 1) setStep(step - 1);
        else router.back();
    };

    const createStudio = async () => {
        if (creating) return;
        setCreating(true);
        try {
            // Refresh session to ensure valid token
            const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
            console.log('Session refresh result:', {
                hasSession: !!session,
                userId: session?.user?.id,
                accessToken: session?.access_token ? 'present' : 'missing',
                error: sessionError?.message
            });

            if (sessionError || !session || !session.user) {
                showAlert('error', 'Session Expired', 'Please log in again.');
                router.replace('/');
                return;
            }

            const convertTo24Hour = (time12: string): string => {
                const [time, modifier] = time12.split(' ');
                if (!modifier) return time; // Already 24h or invalid
                let [hours, minutes] = time.split(':');
                if (hours === '12') {
                    hours = '00';
                }
                if (modifier === 'PM') {
                    hours = String(parseInt(hours, 10) + 12);
                }
                return `${hours}:${minutes}`;
            };

            // Convert calendar-based availability to the payload format
            const calendarAvailability = Object.entries(selectedDates)
                .filter(([_, data]) => data.selected && data.slots.length > 0)
                .map(([date, data]) => ({
                    date,
                    slots: data.slots.map(slot => ({
                        start: convertTo24Hour(slot.start),
                        end: convertTo24Hour(slot.end)
                    }))
                }));

            // Also include weekly availability for recurring schedule
            const weeklyAvailability = availability
                .filter(day => day.slots.length > 0)
                .map(day => ({
                    ...day,
                    slots: day.slots.map(slot => ({
                        start: convertTo24Hour(slot.start),
                        end: convertTo24Hour(slot.end)
                    }))
                }));

            const payload = {
                name: studioName,
                type: studioType,
                description,
                address,
                // Dynamic pricing based on studio type
                hourly_rate: studioType === 'Recording' ? parseFloat(recordingRate) || 0 : parseFloat(rehearsalRate) || 0,
                rehearsal_rate: parseFloat(rehearsalRate) || 0,
                recording_rate: parseFloat(recordingRate) || 0,
                amenities,
                instruments: selectedInstruments,
                // Include full equipment details
                equipment: equipment.map(e => ({
                    name: e.name,
                    quantity: e.quantity,
                    description: e.description,
                    image: e.image
                })),
                images: images,
                contract_url: contractUrl || null,
                // Include both weekly and calendar availability
                availability: weeklyAvailability,
                calendar_availability: calendarAvailability,
                latitude,
                longitude,
            };

            console.log('� RAW availability state:', JSON.stringify(availability, null, 2));
            console.log('📅 FILTERED availability (days with slots):', payload.availability);
            console.log('📅 Number of days with availability:', payload.availability.length);
            console.log('�🔵 Creating studio with payload:', JSON.stringify({ action: 'create', type: 'studio', userId: session.user.id, payload }, null, 2));

            const { data, error } = await supabase.functions.invoke('manage-listings', {
                body: { action: 'create', type: 'studio', userId: session.user.id, payload }
            });

            console.log('🔵 Response:', { data, error });

            if (error) {
                console.error('❌ Error details:', JSON.stringify(error, null, 2));
                throw error;
            }

            console.log('✅ Studio Created successfully:', data);
            setNewStudioId(data.id);
            setModalVisible(true);
        } catch (e: any) {
            console.error('❌ Error creating studio:', e);
            console.error('❌ Error message:', e?.message);
            console.error('❌ Error stack:', e?.stack);
            console.error('❌ Full error object:', JSON.stringify(e, Object.getOwnPropertyNames(e), 2));
            showAlert('error', 'Error', `Failed to create studio: ${e?.message || 'Unknown error'}`);
        } finally {
            setCreating(false);
        }
    };

    const handleSuccessRedirect = () => {
        setModalVisible(false);
        if (newStudioId) {
            // Redirect to manage page for the new studio
            router.push({ pathname: '/manage_studio', params: { id: newStudioId } });
        } else {
            router.back();
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

    const addAmenity = () => {
        if (newAmenity.trim()) {
            setAmenities([...amenities, newAmenity.trim()]);
            setNewAmenity('');
        }
    };

    const removeAmenity = (index: number) => {
        setAmenities(amenities.filter((_, i) => i !== index));
    };

    const handleContractUpload = async () => {
        try {
            setUploadingContract(true);

            if (Platform.OS === 'web') {
                // Web: Use HTML input element
                if (fileInputRef.current) {
                    fileInputRef.current.click();
                }
                setUploadingContract(false);
                return;
            }

            // Dynamic import for native platforms only
            const DocumentPicker = await import('expo-document-picker');
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/pdf',
                copyToCacheDirectory: true,
            });

            if (result.canceled) {
                setUploadingContract(false);
                return;
            }

            const file = result.assets[0];
            const fileName = file.name;
            const fileUri = file.uri;

            // Get current user session
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                showAlert('error', 'Error', 'Session expired. Please log in again.');
                setUploadingContract(false);
                return;
            }

            // Read file as base64
            const response = await fetch(fileUri);
            const arrayBuffer = await response.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);

            // Upload to Supabase Storage
            const filePath = `contracts/${session.user.id}/${Date.now()}_${fileName}`;
            const { data, error } = await supabase.storage
                .from('documents')
                .upload(filePath, bytes, {
                    contentType: 'application/pdf',
                    upsert: false,
                });

            if (error) throw error;

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('documents')
                .getPublicUrl(filePath);

            setContractUrl(publicUrl);
            setContractFileName(fileName);
            showAlert('success', 'Success', 'Contract uploaded successfully!');
        } catch (error) {
            console.error('Error uploading contract:', error);
            showAlert('error', 'Error', 'Failed to upload contract. Please try again.');
        } finally {
            setUploadingContract(false);
        }
    };

    const removeContract = () => {
        setContractUrl('');
        setContractFileName('');
    };

    const handleWebFileSelect = async (event: any) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setUploadingContract(true);
            const fileName = file.name;

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                showAlert('error', 'Error', 'Session expired. Please log in again.');
                setUploadingContract(false);
                return;
            }

            const filePath = `contracts/${session.user.id}/${Date.now()}_${fileName}`;
            const { data, error } = await supabase.storage
                .from('documents')
                .upload(filePath, file, {
                    contentType: 'application/pdf',
                    upsert: false,
                });

            if (error) throw error;

            const { data: { publicUrl } } = supabase.storage
                .from('documents')
                .getPublicUrl(filePath);

            setContractUrl(publicUrl);
            setContractFileName(fileName);
            showAlert('success', 'Success', 'Contract uploaded successfully!');
        } catch (error) {
            console.error('Error uploading contract:', error);
            showAlert('error', 'Error', 'Failed to upload contract. Please try again.');
        } finally {
            setUploadingContract(false);
            if (event.target) {
                event.target.value = '';
            }
        }
    };

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
            {Platform.OS === 'web' && (
                <input
                    ref={fileInputRef as any}
                    type="file"
                    accept="application/pdf"
                    onChange={handleWebFileSelect}
                    style={{ display: 'none' }}
                />
            )}
            <View style={[styles.flex1, { backgroundColor: colors.background }]}>
                <Header title="List Studio" />

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
                                                borderColor: isActive ? '#818cf8' : (isDark ? '#1E293B' : '#F3F4F6')
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
                                Studio Details
                            </Text>
                            {renderInput('Studio Name', studioName, setStudioName, 'e.g. SoundWave Studios')}

                            {/* Studio Type Selection */}
                            <View style={styles.inputContainer}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Studio Type</Text>
                                <View style={{ flexDirection: 'row', gap: 12 }}>
                                    {(['Rehearsal', 'Recording', 'Both'] as const).map((type) => (
                                        <TouchableOpacity
                                            key={type}
                                            onPress={() => setStudioType(type)}
                                            style={{
                                                flex: 1,
                                                paddingVertical: 12,
                                                borderRadius: 12,
                                                backgroundColor: studioType === type ? colors.primary : (isDark ? '#374151' : '#F3F4F6'),
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderWidth: 1,
                                                borderColor: studioType === type ? colors.primary : 'transparent'
                                            }}
                                        >
                                            <Text style={{
                                                color: studioType === type ? '#FFF' : colors.textSecondary,
                                                fontFamily: 'Poppins_600SemiBold',
                                                fontSize: type === 'Both' ? 14 : 12
                                            }}>
                                                {type === 'Both' ? 'Both' : type}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            {renderInput('Description', description, setDescription, 'Brief description of your studio', true)}

                            {/* Image Upload */}
                            <View style={styles.inputContainer}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Studio Photos</Text>
                                <ImageUploader
                                    images={images}
                                    onImagesChange={setImages}
                                    thumbnailIndex={thumbnailIndex}
                                    onThumbnailChange={setThumbnailIndex}
                                    maxImages={10}
                                    bucketName="listings"
                                    userId={newStudioId || 'temp'}
                                    folder="studios"
                                />
                            </View>

                            <View style={styles.inputContainer}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Address / Location</Text>
                                <TouchableOpacity
                                    onPress={() => setLocationPickerVisible(true)}
                                    style={[styles.inputWrapper, { backgroundColor: colors.inputBackground, borderColor: isDark ? '#374151' : '#E5E7EB', padding: 16 }]}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Ionicons name="location-outline" size={20} color={colors.textSecondary} />
                                        <Text style={{
                                            flex: 1,
                                            color: address ? colors.text : colors.textSecondary,
                                            fontFamily: 'Poppins_400Regular'
                                        }}>
                                            {address || 'Tap to select location on map'}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            </View>

                            {/* Dynamic Pricing Section */}
                            <View style={styles.inputContainer}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Pricing</Text>
                                <Text style={[styles.inputSubLabel, { color: colors.textSecondary }]}>
                                    Set hourly rates for each studio type
                                </Text>
                                
                                {/* Rehearsal Rate */}
                                {(studioType === 'Rehearsal' || studioType === 'Both') && (
                                    <View style={{ marginBottom: 12 }}>
                                        <View style={[styles.inputWrapper, { backgroundColor: colors.inputBackground, borderColor: isDark ? '#374151' : '#E5E7EB', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }]}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                                <Ionicons name="musical-notes" size={20} color={colors.primary} />
                                                <Text style={{ color: colors.textSecondary, fontFamily: 'Poppins_500Medium', minWidth: 80 }}>Rehearsal</Text>
                                            </View>
                                            <Text style={{ color: colors.text, fontFamily: 'Poppins_600SemiBold', marginRight: 4 }}>₱</Text>
                                            <TextInput
                                                value={rehearsalRate}
                                                onChangeText={setRehearsalRate}
                                                placeholder="500"
                                                placeholderTextColor={colors.textSecondary}
                                                keyboardType="numeric"
                                                style={{
                                                    color: colors.text,
                                                    fontFamily: 'Poppins_600SemiBold',
                                                    fontSize: 16,
                                                    minWidth: 80,
                                                    textAlign: 'right',
                                                    paddingVertical: 16
                                                }}
                                            />
                                            <Text style={{ color: colors.textSecondary, fontFamily: 'Poppins_400Regular', marginLeft: 4 }}>/hr</Text>
                                        </View>
                                    </View>
                                )}

                                {/* Recording Rate */}
                                {(studioType === 'Recording' || studioType === 'Both') && (
                                    <View>
                                        <View style={[styles.inputWrapper, { backgroundColor: colors.inputBackground, borderColor: isDark ? '#374151' : '#E5E7EB', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }]}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                                <Ionicons name="mic" size={20} color="#EF4444" />
                                                <Text style={{ color: colors.textSecondary, fontFamily: 'Poppins_500Medium', minWidth: 80 }}>Recording</Text>
                                            </View>
                                            <Text style={{ color: colors.text, fontFamily: 'Poppins_600SemiBold', marginRight: 4 }}>₱</Text>
                                            <TextInput
                                                value={recordingRate}
                                                onChangeText={setRecordingRate}
                                                placeholder="1000"
                                                placeholderTextColor={colors.textSecondary}
                                                keyboardType="numeric"
                                                style={{
                                                    color: colors.text,
                                                    fontFamily: 'Poppins_600SemiBold',
                                                    fontSize: 16,
                                                    minWidth: 80,
                                                    textAlign: 'right',
                                                    paddingVertical: 16
                                                }}
                                            />
                                            <Text style={{ color: colors.textSecondary, fontFamily: 'Poppins_400Regular', marginLeft: 4 }}>/hr</Text>
                                        </View>
                                    </View>
                                )}
                            </View>

                            {/* Contract Upload */}
                            <View style={styles.inputContainer}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                                    Custom Contract
                                </Text>
                                <Text style={[styles.inputSubLabel, { color: colors.textSecondary }]}>
                                    Upload a PDF contract that musicians will see before applying
                                </Text>
                                {contractUrl ? (
                                    <View style={[styles.contractPreview, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6', borderColor: isDark ? '#374151' : '#E5E7EB' }]}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                                            <View style={[styles.pdfIcon, { backgroundColor: colors.primary }]}>
                                                <Ionicons name="document-text" size={24} color="#fff" />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.contractFileName, { color: colors.text }]} numberOfLines={1}>
                                                    {contractFileName}
                                                </Text>
                                                <Text style={[styles.contractFileSize, { color: colors.textSecondary }]}>
                                                    PDF Document
                                                </Text>
                                            </View>
                                        </View>
                                        <TouchableOpacity onPress={removeContract} style={styles.removeContractBtn}>
                                            <Ionicons name="trash-outline" size={20} color="#EF4444" />
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        onPress={handleContractUpload}
                                        disabled={uploadingContract}
                                        style={[styles.uploadContractBtn, { backgroundColor: colors.inputBackground, borderColor: isDark ? '#374151' : '#E5E7EB' }]}
                                    >
                                        {uploadingContract ? (
                                            <ActivityIndicator size="small" color={colors.primary} />
                                        ) : (
                                            <>
                                                <Ionicons name="cloud-upload-outline" size={32} color={colors.textSecondary} />
                                                <Text style={[styles.uploadText, { color: colors.text }]}>
                                                    Upload Contract (PDF)
                                                </Text>
                                                <Text style={[styles.uploadSubText, { color: colors.textSecondary }]}>
                                                    Tap to browse files
                                                </Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    )}

                    {step === 2 && (
                        <View>
                            <Text style={[styles.sectionTitle, { color: colors.text }]}>
                                Amenities
                            </Text>

                            <View style={[styles.addAmenityContainer, { borderColor: isDark ? '#374151' : '#E5E7EB' }]}>
                                <View style={[styles.addAmenityInput, { backgroundColor: colors.inputBackground, borderColor: isDark ? '#374151' : '#E5E7EB' }]}>
                                    <TextInput
                                        value={newAmenity}
                                        onChangeText={setNewAmenity}
                                        placeholder="Add amenity (e.g. WiFi, AC)..."
                                        placeholderTextColor={colors.textSecondary}
                                        style={[styles.textInput, { color: colors.text, textAlignVertical: 'center', paddingVertical: 12 }]}
                                        onSubmitEditing={addAmenity}
                                    />
                                </View>
                                <TouchableOpacity
                                    onPress={addAmenity}
                                    style={[styles.addAmenityButton, { backgroundColor: colors.primary }]}
                                >
                                    <Ionicons name="add" size={24} color="#fff" />
                                </TouchableOpacity>
                            </View>

                            {amenities.length === 0 ? (
                                <View style={[styles.emptyStateContainer, { borderColor: isDark ? '#374151' : '#D1D5DB' }]}>
                                    <Ionicons name="mic-outline" size={32} color={colors.textSecondary} />
                                    <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>
                                        No amenities added yet
                                    </Text>
                                </View>
                            ) : (
                                <View style={styles.amenitiesList}>
                                    {amenities.map((item, index) => (
                                        <View key={index} style={[styles.amenityItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                            <Text style={[styles.amenityText, { color: colors.text }]}>{item}</Text>
                                            <TouchableOpacity onPress={() => removeAmenity(index)}>
                                                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {/* Studio Equipment Section */}
                            <View style={{ marginTop: 24 }}>
                                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                                    Studio Equipment
                                </Text>
                                <Text style={[styles.subtitle, { color: colors.textSecondary, marginBottom: 12 }]}>
                                    Add equipment available at your studio with details
                                </Text>

                                {/* Add Equipment Button */}
                                <TouchableOpacity
                                    onPress={() => {
                                        setEditingEquipment(null);
                                        setEquipmentForm({ name: '', quantity: '1', description: '', image: '' });
                                        setShowEquipmentModal(true);
                                    }}
                                    style={[styles.addEquipmentBtn, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6', borderColor: colors.primary }]}
                                >
                                    <Ionicons name="add-circle" size={24} color={colors.primary} />
                                    <Text style={{ color: colors.primary, fontFamily: 'Poppins_600SemiBold', marginLeft: 8 }}>
                                        Add Equipment
                                    </Text>
                                </TouchableOpacity>

                                {/* Equipment List */}
                                {equipment.length > 0 && (
                                    <View style={{ marginTop: 16 }}>
                                        {equipment.map((item) => (
                                            <View key={item.id} style={[styles.equipmentCard, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderColor: colors.border }]}>
                                                <View style={{ flexDirection: 'row', gap: 12 }}>
                                                    {item.image ? (
                                                        <Image source={{ uri: item.image }} style={styles.equipmentImage} />
                                                    ) : (
                                                        <View style={[styles.equipmentImage, { backgroundColor: isDark ? '#374151' : '#E5E7EB', alignItems: 'center', justifyContent: 'center' }]}>
                                                            <Ionicons name="cube-outline" size={24} color={colors.textSecondary} />
                                                        </View>
                                                    )}
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={[styles.equipmentName, { color: colors.text }]}>{item.name}</Text>
                                                        <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: 'Poppins_400Regular' }}>
                                                            Qty: {item.quantity}
                                                        </Text>
                                                        {item.description && (
                                                            <Text style={{ color: colors.textSecondary, fontSize: 11, fontFamily: 'Poppins_400Regular', marginTop: 4 }} numberOfLines={2}>
                                                                {item.description}
                                                            </Text>
                                                        )}
                                                    </View>
                                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                                        <TouchableOpacity
                                                            onPress={() => {
                                                                setEditingEquipment(item);
                                                                setEquipmentForm({
                                                                    name: item.name,
                                                                    quantity: item.quantity.toString(),
                                                                    description: item.description,
                                                                    image: item.image
                                                                });
                                                                setShowEquipmentModal(true);
                                                            }}
                                                        >
                                                            <Ionicons name="pencil" size={18} color={colors.primary} />
                                                        </TouchableOpacity>
                                                        <TouchableOpacity
                                                            onPress={() => setEquipment(equipment.filter(e => e.id !== item.id))}
                                                        >
                                                            <Ionicons name="trash-outline" size={18} color="#EF4444" />
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                {equipment.length > 0 && (
                                    <Text style={[styles.selectedCount, { color: colors.textSecondary }]}>
                                        {equipment.length} equipment item{equipment.length !== 1 ? 's' : ''} added
                                    </Text>
                                )}

                                {/* Quick Add from Presets */}
                                <Text style={[styles.subtitle, { color: colors.textSecondary, marginTop: 24, marginBottom: 12 }]}>
                                    Or quickly select from common equipment
                                </Text>

                                <View style={styles.instrumentsGrid}>
                                    {INSTRUMENT_OPTIONS.map((instrument) => {
                                        const isSelected = selectedInstruments.some(i => i.name === instrument.name);
                                        return (
                                            <TouchableOpacity
                                                key={instrument.name}
                                                onPress={() => toggleInstrument(instrument)}
                                                style={[
                                                    styles.instrumentCard,
                                                    {
                                                        backgroundColor: isSelected ? colors.primary + '20' : (isDark ? '#1F2937' : '#F9FAFB'),
                                                        borderColor: isSelected ? colors.primary : (isDark ? '#374151' : '#E5E7EB'),
                                                    }
                                                ]}
                                            >
                                                <Image
                                                    source={{ uri: instrument.image }}
                                                    style={styles.instrumentImage}
                                                />
                                                <Text style={[styles.instrumentName, { color: colors.text }]} numberOfLines={1}>
                                                    {instrument.name}
                                                </Text>
                                                {isSelected && (
                                                    <View style={[styles.instrumentCheckmark, { backgroundColor: colors.primary }]}>
                                                        <Ionicons name="checkmark" size={12} color="#fff" />
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                {selectedInstruments.length > 0 && (
                                    <Text style={[styles.selectedCount, { color: colors.textSecondary }]}>
                                        {selectedInstruments.length} preset{selectedInstruments.length !== 1 ? 's' : ''} selected
                                    </Text>
                                )}
                            </View>
                        </View>
                    )}

                    {step === 3 && (
                        <View>
                            <Text style={[styles.sectionTitle, { color: colors.text }]}>
                                Set Your Availability
                            </Text>
                            <Text style={[styles.subtitle, { color: colors.textSecondary, marginBottom: 16 }]}>
                                Set your regular weekly schedule and/or select specific dates
                            </Text>

                            {/* Calendar Date Selection */}
                            <View style={{ marginBottom: 24 }}>
                                <Text style={[styles.sectionSubtitle, { color: colors.text, marginBottom: 12 }]}>
                                    <Ionicons name="calendar" size={16} color={colors.primary} /> Specific Dates
                                </Text>
                                <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: 'Poppins_400Regular', marginBottom: 12 }}>
                                    Tap on dates to set your opening schedule for specific days
                                </Text>
                                
                                <View style={[styles.calendarContainer, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderColor: colors.border }]}>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        {Array.from({ length: 60 }).map((_, i) => {
                                            const date = new Date();
                                            date.setDate(date.getDate() + i);
                                            const dateStr = date.toISOString().split('T')[0];
                                            const isSelected = selectedDates[dateStr]?.selected;
                                            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                                            const dayNum = date.getDate();
                                            const monthName = date.toLocaleDateString('en-US', { month: 'short' });

                                            return (
                                                <TouchableOpacity
                                                    key={dateStr}
                                                    onPress={() => {
                                                        const newDates = { ...selectedDates };
                                                        if (isSelected) {
                                                            delete newDates[dateStr];
                                                        } else {
                                                            newDates[dateStr] = {
                                                                selected: true,
                                                                slots: [{ start: '09:00 AM', end: '05:00 PM' }]
                                                            };
                                                        }
                                                        setSelectedDates(newDates);
                                                    }}
                                                    style={[
                                                        styles.dateCard,
                                                        {
                                                            backgroundColor: isSelected ? colors.primary : (isDark ? '#374151' : '#FFF'),
                                                            borderColor: isSelected ? colors.primary : (isDark ? '#4B5563' : '#E5E7EB')
                                                        }
                                                    ]}
                                                >
                                                    <Text style={{ color: isSelected ? '#FFF' : colors.textSecondary, fontSize: 10, fontFamily: 'Poppins_500Medium' }}>
                                                        {dayName}
                                                    </Text>
                                                    <Text style={{ color: isSelected ? '#FFF' : colors.text, fontSize: 18, fontFamily: 'Poppins_700Bold' }}>
                                                        {dayNum}
                                                    </Text>
                                                    <Text style={{ color: isSelected ? '#FFF' : colors.textSecondary, fontSize: 10, fontFamily: 'Poppins_400Regular' }}>
                                                        {monthName}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </ScrollView>
                                </View>

                                {/* Selected Dates with Time Slots */}
                                {Object.entries(selectedDates).filter(([_, data]) => data.selected).length > 0 && (
                                    <View style={{ marginTop: 16 }}>
                                        <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: 'Poppins_600SemiBold', marginBottom: 8 }}>
                                            SELECTED DATES
                                        </Text>
                                        {Object.entries(selectedDates)
                                            .filter(([_, data]) => data.selected)
                                            .sort(([a], [b]) => a.localeCompare(b))
                                            .map(([dateStr, data]) => {
                                                const date = new Date(dateStr + 'T00:00:00');
                                                return (
                                                    <View key={dateStr} style={[styles.selectedDateCard, { backgroundColor: isDark ? '#374151' : '#FFF', borderColor: colors.border }]}>
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <Text style={{ color: colors.text, fontFamily: 'Poppins_600SemiBold' }}>
                                                                {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                                            </Text>
                                                            <TouchableOpacity onPress={() => {
                                                                const newDates = { ...selectedDates };
                                                                delete newDates[dateStr];
                                                                setSelectedDates(newDates);
                                                            }}>
                                                                <Ionicons name="close-circle" size={20} color="#EF4444" />
                                                            </TouchableOpacity>
                                                        </View>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                                                            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                                                                {data.slots[0]?.start} - {data.slots[0]?.end}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                    </View>
                                )}
                            </View>

                            {/* Weekly Schedule Section */}
                            <Text style={[styles.sectionSubtitle, { color: colors.text, marginBottom: 12 }]}>
                                <Ionicons name="repeat" size={16} color={colors.primary} /> Weekly Schedule
                            </Text>
                            <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: 'Poppins_400Regular', marginBottom: 16 }}>
                                Set recurring availability for each day of the week
                            </Text>

                            {availability.map((daySchedule, dayIndex) => (
                                <View key={daySchedule.day} style={[styles.dayCard, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderColor: colors.border, marginBottom: 12 }]}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <Text style={[styles.dayLabel, { color: colors.text }]}>{daySchedule.day}</Text>
                                        <TouchableOpacity
                                            onPress={() => {
                                                const newAvailability = [...availability];
                                                if (newAvailability[dayIndex].slots.length === 0) {
                                                    newAvailability[dayIndex].slots.push({ start: '09:00 AM', end: '05:00 PM' });
                                                } else {
                                                    newAvailability[dayIndex].slots = [];
                                                }
                                                setAvailability(newAvailability);
                                            }}
                                            style={[styles.toggleBtn, { backgroundColor: daySchedule.slots.length > 0 ? colors.primary : (isDark ? '#374151' : '#E5E7EB') }]}
                                        >
                                            <Text style={{ color: daySchedule.slots.length > 0 ? '#FFFFFF' : colors.textSecondary, fontSize: 12, fontFamily: 'Poppins_600SemiBold' }}>
                                                {daySchedule.slots.length > 0 ? 'Available' : 'Closed'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>

                                    {daySchedule.slots.map((slot, slotIndex) => {
                                        const toggleAmPm = (timeStr: string) => {
                                            const [time, period] = timeStr.split(' ');
                                            return `${time} ${period === 'AM' ? 'PM' : 'AM'}`;
                                        };

                                        return (
                                            <View key={slotIndex} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4, fontFamily: 'Poppins_600SemiBold' }}>START</Text>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                        <TextInput
                                                            value={slot.start.split(' ')[0]}
                                                            onChangeText={(text) => {
                                                                const formatted = formatTimeInput(text);
                                                                const newAvailability = [...availability];
                                                                const period = slot.start.split(' ')[1];
                                                                newAvailability[dayIndex].slots[slotIndex].start = `${formatted} ${period}`;
                                                                setAvailability(newAvailability);
                                                            }}
                                                            placeholder="09:00"
                                                            keyboardType="numeric"
                                                            maxLength={5}
                                                            style={[styles.timeInput, { backgroundColor: isDark ? '#374151' : 'white', borderColor: colors.border, color: colors.text, flex: 1 }]}
                                                        />
                                                        <TouchableOpacity
                                                            onPress={() => {
                                                                const newAvailability = [...availability];
                                                                newAvailability[dayIndex].slots[slotIndex].start = toggleAmPm(slot.start);
                                                                setAvailability(newAvailability);
                                                            }}
                                                            style={[styles.ampmBtn, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]}
                                                        >
                                                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
                                                                {slot.start.split(' ')[1]}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                                <Ionicons name="arrow-forward" size={20} color={colors.textSecondary} style={{ marginTop: 20 }} />
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4, fontFamily: 'Poppins_600SemiBold' }}>END</Text>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                        <TextInput
                                                            value={slot.end.split(' ')[0]}
                                                            onChangeText={(text) => {
                                                                const formatted = formatTimeInput(text);
                                                                const newAvailability = [...availability];
                                                                const period = slot.end.split(' ')[1];
                                                                newAvailability[dayIndex].slots[slotIndex].end = `${formatted} ${period}`;
                                                                setAvailability(newAvailability);
                                                            }}
                                                            placeholder="05:00"
                                                            keyboardType="numeric"
                                                            maxLength={5}
                                                            style={[styles.timeInput, { backgroundColor: isDark ? '#374151' : 'white', borderColor: colors.border, color: colors.text, flex: 1 }]}
                                                        />
                                                        <TouchableOpacity
                                                            onPress={() => {
                                                                const newAvailability = [...availability];
                                                                newAvailability[dayIndex].slots[slotIndex].end = toggleAmPm(slot.end);
                                                                setAvailability(newAvailability);
                                                            }}
                                                            style={[styles.ampmBtn, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]}
                                                        >
                                                            <Text style={{ fontSize: 12, fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
                                                                {slot.end.split(' ')[1]}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                                {daySchedule.slots.length > 1 && (
                                                    <TouchableOpacity
                                                        onPress={() => {
                                                            const newAvailability = [...availability];
                                                            newAvailability[dayIndex].slots.splice(slotIndex, 1);
                                                            setAvailability(newAvailability);
                                                        }}
                                                        style={{ marginTop: 20 }}
                                                    >
                                                        <Ionicons name="trash-outline" size={20} color="#EF4444" />
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        );
                                    })}

                                    {daySchedule.slots.length > 0 && daySchedule.slots.length < 3 && (
                                        <TouchableOpacity
                                            onPress={() => {
                                                const newAvailability = [...availability];
                                                // Default next slot
                                                newAvailability[dayIndex].slots.push({
                                                    start: '06:00 PM',
                                                    end: '09:00 PM'
                                                });
                                                setAvailability(newAvailability);
                                            }}
                                            style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                                        >
                                            <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                                            <Text style={{ color: colors.primary, fontSize: 12, fontFamily: 'Poppins_500Medium' }}>Add Time Slot</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ))}
                        </View>
                    )}

                    {step === 4 && (
                        <View>
                            <Text style={[styles.sectionTitle, { color: colors.text }]}>
                                Review Details
                            </Text>

                            <View style={[styles.reviewContainer, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB' }]}>
                                <View>
                                    <Text style={styles.reviewLabel}>Studio Info</Text>
                                    <Text style={[styles.reviewValue, { color: colors.text }]}>{studioName || 'No Name'}</Text>
                                    <Text style={{ color: colors.textSecondary }}>{address || 'No Address'}</Text>
                                    <Text style={{ color: colors.textSecondary, marginTop: 4 }}>Type: {studioType}</Text>
                                </View>

                                <View style={[styles.divider, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]} />

                                {/* Pricing Review */}
                                <View>
                                    <Text style={styles.reviewLabel}>Pricing</Text>
                                    {(studioType === 'Rehearsal' || studioType === 'Both') && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <Ionicons name="musical-notes" size={14} color={colors.primary} />
                                            <Text style={{ color: colors.text, fontFamily: 'Poppins_500Medium' }}>Rehearsal: ₱{rehearsalRate || '0'}/hr</Text>
                                        </View>
                                    )}
                                    {(studioType === 'Recording' || studioType === 'Both') && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                            <Ionicons name="mic" size={14} color="#EF4444" />
                                            <Text style={{ color: colors.text, fontFamily: 'Poppins_500Medium' }}>Recording: ₱{recordingRate || '0'}/hr</Text>
                                        </View>
                                    )}
                                </View>

                                <View style={[styles.divider, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]} />

                                <View>
                                    <Text style={styles.reviewLabel}>Images ({images.length})</Text>
                                    {images.length > 0 ? (
                                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                                            {images.length} photo{images.length !== 1 ? 's' : ''} uploaded
                                        </Text>
                                    ) : (
                                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>No images added</Text>
                                    )}
                                </View>

                                <View style={[styles.divider, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]} />

                                <View>
                                    <Text style={styles.reviewLabel}>Amenities ({amenities.length})</Text>
                                    <View style={styles.amenitiesList}>
                                        {amenities.map((a, i) => (
                                            <View key={i} style={[styles.tag, { backgroundColor: isDark ? '#374151' : 'white', borderColor: isDark ? '#4B5563' : '#E5E7EB' }]}>
                                                <Text style={{ fontSize: 12, color: colors.text }}>{a}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>

                                <View style={[styles.divider, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]} />

                                <View>
                                    <Text style={styles.reviewLabel}>Studio Equipment ({equipment.length + selectedInstruments.length})</Text>
                                    {equipment.length > 0 && (
                                        <View style={{ marginBottom: 8 }}>
                                            {equipment.map((eq, i) => (
                                                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                    {eq.image ? (
                                                        <Image source={{ uri: eq.image }} style={{ width: 24, height: 24, borderRadius: 4 }} />
                                                    ) : (
                                                        <View style={{ width: 24, height: 24, borderRadius: 4, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                                                            <Ionicons name="cube" size={12} color={colors.textSecondary} />
                                                        </View>
                                                    )}
                                                    <Text style={{ fontSize: 12, color: colors.text }}>{eq.name} (x{eq.quantity})</Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                    {selectedInstruments.length > 0 ? (
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                            {selectedInstruments.map((inst, i) => (
                                                <View key={i} style={{ alignItems: 'center', width: 60 }}>
                                                    <Image source={{ uri: inst.image }} style={{ width: 40, height: 40, borderRadius: 8 }} />
                                                    <Text style={{ fontSize: 10, color: colors.textSecondary, textAlign: 'center' }} numberOfLines={1}>{inst.name}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    ) : equipment.length === 0 && (
                                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>No equipment added</Text>
                                    )}}
                                </View>

                                <View style={[styles.divider, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]} />

                                <View>
                                    <Text style={styles.reviewLabel}>Contract</Text>
                                    {contractUrl ? (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <Ionicons name="document-text" size={16} color={colors.primary} />
                                            <Text style={{ color: colors.text, fontSize: 12 }}>{contractFileName}</Text>
                                        </View>
                                    ) : (
                                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>No contract uploaded</Text>
                                    )}
                                </View>

                                <View style={[styles.divider, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }]} />

                                <View>
                                    <Text style={styles.reviewLabel}>Availability</Text>
                                    {availability.filter(d => d.slots.length > 0).map(daySchedule => (
                                        <View key={daySchedule.day} style={{ marginBottom: 4 }}>
                                            <Text style={{ color: colors.text, fontFamily: 'Poppins_500Medium' }}>{daySchedule.day}</Text>
                                            {daySchedule.slots.map((slot, i) => (
                                                <Text key={i} style={{ color: colors.textSecondary, fontSize: 12, marginLeft: 8 }}>
                                                    {slot.start} - {slot.end}
                                                </Text>
                                            ))}
                                        </View>
                                    ))}
                                </View>
                            </View>

                            <Text style={styles.termsText}>
                                By tapping List Studio, you agree to our Terms and Conditions.
                            </Text>
                        </View>
                    )}

                    {/* Navigation Buttons */}
                    <View style={styles.navigationButtons}>
                        {step > 1 && (
                            <TouchableOpacity
                                onPress={handleBack}
                                disabled={creating}
                                style={[styles.backBtn, { borderColor: isDark ? '#374151' : '#E5E7EB', opacity: creating ? 0.5 : 1 }]}
                            >
                                <Text style={[styles.backBtnText, { color: colors.text }]}>Back</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            onPress={handleNext}
                            disabled={creating}
                            style={[
                                styles.nextBtn,
                                {
                                    backgroundColor: colors.primary,
                                    shadowColor: colors.primary,
                                    opacity: creating ? 0.7 : 1
                                }
                            ]}
                        >
                            {creating ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.nextBtnText}>
                                    {step === 4 ? 'List Studio' : 'Next'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </ScrollView>

                <Navbar />
            </View>

            <Modal
                visible={modalVisible}
                title="Success!"
                message={`Studio "${studioName}" has been successfully listed.`}
                buttonText="Manage Studio"
                onClose={handleSuccessRedirect}
            />

            <LocationPicker
                visible={locationPickerVisible}
                onClose={() => setLocationPickerVisible(false)}
                onSelect={(location) => {
                    setAddress(location.address);
                    setLatitude(location.lat);
                    setLongitude(location.lng);
                    setLocationPickerVisible(false);
                }}
            />

            {/* Equipment Modal */}
            {showEquipmentModal && (
                <View style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 24,
                    zIndex: 1000
                }}>
                    <View style={{
                        backgroundColor: colors.background,
                        borderRadius: 16,
                        padding: 24,
                        width: '100%',
                        maxWidth: 400,
                        maxHeight: '80%'
                    }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Text style={{ fontSize: 18, fontFamily: 'Poppins_600SemiBold', color: colors.text }}>
                                {editingEquipment ? 'Edit Equipment' : 'Add Equipment'}
                            </Text>
                            <TouchableOpacity onPress={() => setShowEquipmentModal(false)}>
                                <Ionicons name="close" size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Name */}
                            <View style={{ marginBottom: 16 }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: 'Poppins_600SemiBold', marginBottom: 8 }}>NAME *</Text>
                                <TextInput
                                    value={equipmentForm.name}
                                    onChangeText={(text) => setEquipmentForm({ ...equipmentForm, name: text })}
                                    placeholder="e.g. Yamaha DTX Drums"
                                    placeholderTextColor={colors.textSecondary}
                                    style={{
                                        backgroundColor: colors.inputBackground,
                                        borderRadius: 12,
                                        padding: 16,
                                        color: colors.text,
                                        fontFamily: 'Poppins_400Regular',
                                        borderWidth: 1,
                                        borderColor: isDark ? '#374151' : '#E5E7EB'
                                    }}
                                />
                            </View>

                            {/* Quantity */}
                            <View style={{ marginBottom: 16 }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: 'Poppins_600SemiBold', marginBottom: 8 }}>QUANTITY *</Text>
                                <TextInput
                                    value={equipmentForm.quantity}
                                    onChangeText={(text) => setEquipmentForm({ ...equipmentForm, quantity: text.replace(/[^0-9]/g, '') })}
                                    placeholder="1"
                                    placeholderTextColor={colors.textSecondary}
                                    keyboardType="numeric"
                                    style={{
                                        backgroundColor: colors.inputBackground,
                                        borderRadius: 12,
                                        padding: 16,
                                        color: colors.text,
                                        fontFamily: 'Poppins_400Regular',
                                        borderWidth: 1,
                                        borderColor: isDark ? '#374151' : '#E5E7EB'
                                    }}
                                />
                            </View>

                            {/* Description */}
                            <View style={{ marginBottom: 16 }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: 'Poppins_600SemiBold', marginBottom: 8 }}>DESCRIPTION</Text>
                                <TextInput
                                    value={equipmentForm.description}
                                    onChangeText={(text) => setEquipmentForm({ ...equipmentForm, description: text })}
                                    placeholder="Brief description of the equipment"
                                    placeholderTextColor={colors.textSecondary}
                                    multiline
                                    numberOfLines={3}
                                    style={{
                                        backgroundColor: colors.inputBackground,
                                        borderRadius: 12,
                                        padding: 16,
                                        color: colors.text,
                                        fontFamily: 'Poppins_400Regular',
                                        borderWidth: 1,
                                        borderColor: isDark ? '#374151' : '#E5E7EB',
                                        height: 80,
                                        textAlignVertical: 'top'
                                    }}
                                />
                            </View>

                            {/* Image Upload */}
                            <View style={{ marginBottom: 24 }}>
                                <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: 'Poppins_600SemiBold', marginBottom: 8 }}>IMAGE</Text>
                                {equipmentForm.image ? (
                                    <View style={{ position: 'relative' }}>
                                        <Image source={{ uri: equipmentForm.image }} style={{ width: '100%', height: 150, borderRadius: 12 }} />
                                        <TouchableOpacity
                                            onPress={() => setEquipmentForm({ ...equipmentForm, image: '' })}
                                            style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 4 }}
                                        >
                                            <Ionicons name="close" size={16} color="#FFF" />
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        style={{
                                            backgroundColor: colors.inputBackground,
                                            borderRadius: 12,
                                            padding: 24,
                                            alignItems: 'center',
                                            borderWidth: 2,
                                            borderStyle: 'dashed',
                                            borderColor: isDark ? '#374151' : '#E5E7EB'
                                        }}
                                    >
                                        <Ionicons name="camera-outline" size={32} color={colors.textSecondary} />
                                        <Text style={{ color: colors.textSecondary, fontFamily: 'Poppins_400Regular', marginTop: 8 }}>Tap to add image</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            {/* Submit Button */}
                            <TouchableOpacity
                                onPress={() => {
                                    if (!equipmentForm.name.trim()) {
                                        showAlert('error', 'Required', 'Please enter equipment name');
                                        return;
                                    }
                                    if (editingEquipment) {
                                        setEquipment(equipment.map(e =>
                                            e.id === editingEquipment.id
                                                ? { ...e, ...equipmentForm, quantity: parseInt(equipmentForm.quantity) || 1 }
                                                : e
                                        ));
                                    } else {
                                        setEquipment([...equipment, {
                                            id: Date.now().toString(),
                                            name: equipmentForm.name,
                                            quantity: parseInt(equipmentForm.quantity) || 1,
                                            description: equipmentForm.description,
                                            image: equipmentForm.image
                                        }]);
                                    }
                                    setShowEquipmentModal(false);
                                    setEquipmentForm({ name: '', quantity: '1', description: '', image: '' });
                                    setEditingEquipment(null);
                                }}
                                style={{
                                    backgroundColor: colors.primary,
                                    borderRadius: 12,
                                    padding: 16,
                                    alignItems: 'center'
                                }}
                            >
                                <Text style={{ color: '#FFF', fontFamily: 'Poppins_600SemiBold' }}>
                                    {editingEquipment ? 'Update Equipment' : 'Add Equipment'}
                                </Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            )}
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

    // Improved Amenities Styles
    addAmenityContainer: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 24,
    },
    addAmenityInput: {
        flex: 1,
        borderRadius: 12,
        borderWidth: 1,
        overflow: 'hidden',
    },
    addAmenityButton: {
        width: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyStateContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderRadius: 16,
        marginBottom: 24,
    },
    emptyStateText: {
        marginTop: 8,
        fontSize: 14,
        textAlign: 'center',
        fontFamily: 'Poppins_400Regular',
    },
    amenitiesList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    amenityItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 24,
    },
    amenityText: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 14,
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
    divider: {
        height: 1,
    },
    tag: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
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
    dayCard: {
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
    },
    dayLabel: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
    toggleBtn: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 20,
    },
    timeInput: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontFamily: 'Poppins_400Regular',
    },
    ampmBtn: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    subtitle: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    inputSubLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginTop: -8,
        marginBottom: 8,
    },
    uploadContractBtn: {
        padding: 32,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    uploadText: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
        marginTop: 8,
    },
    uploadSubText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
    contractPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        gap: 12,
    },
    pdfIcon: {
        width: 48,
        height: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    contractFileName: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
    contractFileSize: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginTop: 2,
    },
    removeContractBtn: {
        padding: 8,
    },
    // Instruments styles
    instrumentsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    instrumentCard: {
        width: '30%',
        aspectRatio: 1,
        borderRadius: 12,
        borderWidth: 1.5,
        padding: 8,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    instrumentImage: {
        width: 48,
        height: 48,
        borderRadius: 8,
        marginBottom: 6,
    },
    instrumentName: {
        fontSize: 10,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
    },
    instrumentCheckmark: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectedCount: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginTop: 12,
        textAlign: 'center',
    },
    // Equipment styles
    addEquipmentBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 12,
        borderWidth: 2,
        borderStyle: 'dashed',
    },
    equipmentCard: {
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 8,
    },
    equipmentImage: {
        width: 56,
        height: 56,
        borderRadius: 8,
    },
    equipmentName: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
    // Calendar styles
    calendarContainer: {
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    dateCard: {
        width: 60,
        height: 80,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    selectedDateCard: {
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 8,
    },
    sectionSubtitle: {
        fontSize: 14,
        fontFamily: 'Poppins_600SemiBold',
    },
});