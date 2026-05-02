import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import CustomAlert, { AlertType } from './CustomAlert';

const debugLog = (..._args: unknown[]) => {};

interface LocationPickerProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (location: { address: string; lat: number; lng: number }) => void;
    initialLocation?: { lat: number; lng: number };
}

export default function LocationPicker({ visible, onClose, onSelect, initialLocation }: LocationPickerProps) {
    const [searchText, setSearchText] = useState('');
    const [loading, setLoading] = useState(false);
    const [gettingLocation, setGettingLocation] = useState(false);
    const [currentSelection, setCurrentSelection] = useState<{ address: string; lat: number; lng: number } | null>(null);
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

    // Initialize with something if needed, but on web without map, maybe just wait for search
    // or if initialLocation exists, try to fetch address (simplified for now)

    const handleSearch = async () => {
        if (!searchText.trim()) return;
        setLoading(true);
        try {
            // Use Nominatim API for geocoding
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchText)}`, {
                headers: {
                    'User-Agent': 'MusikaLokalApp/1.0 (internal-test)'
                }
            });

            const text = await response.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (parseError) {
                debugLog('Error parsing JSON from search:', parseError);
                showAlert('error', 'Search Error', 'Invalid response from server');
                return;
            }

            if (data && data.length > 0) {
                const { lat, lon, display_name } = data[0];
                const latitude = parseFloat(lat);
                const longitude = parseFloat(lon);

                const newSelection = {
                    lat: latitude,
                    lng: longitude,
                    address: display_name
                };
                setCurrentSelection(newSelection);
            } else {
                showAlert('warning', 'Not Found', 'Location not found');
            }
        } catch (error) {
            console.error(error);
            showAlert('error', 'Search Failed', 'Search failed');
        } finally {
            setLoading(false);
        }
    };

    const handleGetCurrentAddress = async () => {
        setGettingLocation(true);
        try {
            const maybeNavigator =
                typeof globalThis !== 'undefined' ? (globalThis as any).navigator : undefined;
            if (!maybeNavigator?.geolocation) {
                showAlert('warning', 'Not Supported', 'Geolocation is not available in this browser.');
                return;
            }

            const position = await new Promise<any>((resolve, reject) => {
                maybeNavigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 60000,
                });
            });

            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;

            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
                {
                    headers: {
                        'User-Agent': 'MusikaLokalApp/1.0 (internal-test)'
                    }
                }
            );

            const text = await response.text();
            let data;
            try {
                data = JSON.parse(text);
            } catch (parseError) {
                debugLog('Error parsing reverse geocode JSON:', parseError);
                data = null;
            }

            setCurrentSelection({
                lat: latitude,
                lng: longitude,
                address: data?.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
            });
        } catch (error) {
            console.error(error);
            showAlert('error', 'Location Failed', 'Unable to get your current address.');
        } finally {
            setGettingLocation(false);
        }
    };

    return (
        <>
        <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color="#000" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Pin Location</Text>
                        <View style={{ width: 24 }} />
                    </View>

                    {/* Content */}
                    <View style={styles.content}>
                        <Text style={styles.webNote}>
                            Map view is currently optimized for mobile. Please search for your location below.
                        </Text>

                        <View style={styles.searchBox}>
                            <Ionicons name="search" size={20} color="#666" />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search city, street..."
                                value={searchText}
                                onChangeText={setSearchText}
                                onSubmitEditing={handleSearch}
                                returnKeyType="search"
                            />
                            {loading && <ActivityIndicator size="small" color="#666" style={{ marginLeft: 8 }} />}
                        </View>
                        <TouchableOpacity activeOpacity={1} onPress={handleSearch} style={styles.searchBtn}>
                            <Text style={styles.searchBtnText}>Search</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={handleGetCurrentAddress}
                            style={styles.currentLocationBtn}
                            disabled={gettingLocation}
                        >
                            {gettingLocation ? (
                                <ActivityIndicator size="small" color="#4F46E5" />
                            ) : (
                                <Ionicons name="locate" size={18} color="#4F46E5" />
                            )}
                            <Text style={styles.currentLocationBtnText}>Get Current Address</Text>
                        </TouchableOpacity>

                        {currentSelection && (
                            <View style={styles.resultContainer}>
                                <Ionicons name="location" size={32} color="#4F46E5" />
                                <Text style={styles.resultAddress}>{currentSelection.address}</Text>
                                <Text style={styles.resultCoords}>
                                    {currentSelection.lat.toFixed(5)}, {currentSelection.lng.toFixed(5)}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <TouchableOpacity activeOpacity={1}
                            style={[styles.confirmBtn, !currentSelection && styles.disabledBtn]}
                            onPress={() => currentSelection && onSelect(currentSelection)}
                            disabled={!currentSelection}
                        >
                            <Text style={styles.confirmBtnText}>Confirm Location</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
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
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    container: {
        width: '100%',
        maxWidth: 500,
        backgroundColor: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
        maxHeight: '80%',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    closeBtn: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
    },
    content: {
        padding: 24,
    },
    webNote: {
        fontSize: 14,
        color: '#666',
        marginBottom: 16,
        textAlign: 'center',
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: '#F3F4F6',
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 48,
    },
    searchInput: {
        flex: 1,
        height: 24,
        fontSize: 15,
        fontFamily: 'Poppins_500Medium',
        lineHeight: 20,
        includeFontPadding: false,
        padding: 0,
        textAlignVertical: 'center',
        outlineStyle: 'none', // Web specific
    } as any,
    searchBtn: {
        marginTop: 12,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
    },
    searchBtnText: {
        color: '#4F46E5',
        fontWeight: '600',
    },
    currentLocationBtn: {
        marginTop: 8,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#C7D2FE',
        backgroundColor: '#EEF2FF',
    },
    currentLocationBtnText: {
        color: '#4F46E5',
        fontWeight: '600',
        fontSize: 12,
    },
    resultContainer: {
        marginTop: 24,
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#F0F9FF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#BAE6FD',
    },
    resultAddress: {
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
        marginTop: 8,
        color: '#0C4A6E',
    },
    resultCoords: {
        fontSize: 12,
        color: '#64748B',
        marginTop: 4,
    },
    footer: {
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        backgroundColor: '#fff',
    },
    confirmBtn: {
        backgroundColor: '#4F46E5', // Primary color
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    disabledBtn: {
        backgroundColor: '#a5b4fc',
    },
    confirmBtnText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
    },
});

