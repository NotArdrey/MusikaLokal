import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import CustomAlert, { AlertType } from './CustomAlert';

const debugLog = (..._args: unknown[]) => {};

interface LocationPickerProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (location: { address: string; lat: number; lng: number }) => void;
    initialLocation?: { lat: number; lng: number };
}

const DEFAULT_LOCATION = { lat: 14.5995, lng: 120.9842 };
const MAP_DELTA = 0.02;
const BROWSER_LOCATION_UNAVAILABLE_MESSAGE =
    'Current location is unavailable. Turn on Location Services, allow browser access, then try again.';

const toMapEmbedUrl = (lat: number, lng: number): string => {
    const left = (lng - MAP_DELTA).toFixed(6);
    const right = (lng + MAP_DELTA).toFixed(6);
    const bottom = (lat - MAP_DELTA).toFixed(6);
    const top = (lat + MAP_DELTA).toFixed(6);
    const markerLat = lat.toFixed(6);
    const markerLng = lng.toFixed(6);

    return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${markerLat}%2C${markerLng}`;
};

const toMapDeepLinkUrl = (lat: number, lng: number): string => {
    const markerLat = lat.toFixed(6);
    const markerLng = lng.toFixed(6);
    return `https://www.openstreetmap.org/?mlat=${markerLat}&mlon=${markerLng}#map=16/${markerLat}/${markerLng}`;
};

export default function LocationPicker({ visible, onClose, onSelect, initialLocation }: LocationPickerProps) {
    const initialCenter = initialLocation || DEFAULT_LOCATION;
    const [searchText, setSearchText] = useState('');
    const [loading, setLoading] = useState(false);
    const [gettingLocation, setGettingLocation] = useState(false);
    const [currentSelection, setCurrentSelection] = useState<{ address: string; lat: number; lng: number } | null>(null);
    const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>(initialCenter);
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

    const getBrowserLocationErrorMessage = (error: unknown) => {
        const code = typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: number }).code
            : undefined;

        if (code === 1) {
            return 'Allow browser location access to use current address, or search manually.';
        }

        if (code === 3) {
            return 'Location lookup timed out. Try again near a window, or search the address manually.';
        }

        return BROWSER_LOCATION_UNAVAILABLE_MESSAGE;
    };

    useEffect(() => {
        if (!visible) return;
        const startPoint = initialLocation || DEFAULT_LOCATION;
        setMapCenter(startPoint);
        if (initialLocation) {
            setCurrentSelection((prev) =>
                prev || {
                    lat: initialLocation.lat,
                    lng: initialLocation.lng,
                    address: `${initialLocation.lat.toFixed(5)}, ${initialLocation.lng.toFixed(5)}`,
                },
            );
        }
    }, [visible, initialLocation?.lat, initialLocation?.lng]);

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
                setMapCenter({ lat: latitude, lng: longitude });
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
            setMapCenter({ lat: latitude, lng: longitude });
        } catch (error) {
            showAlert('warning', 'Location Unavailable', getBrowserLocationErrorMessage(error));
        } finally {
            setGettingLocation(false);
        }
    };

    const mapPoint = currentSelection || {
        lat: mapCenter.lat,
        lng: mapCenter.lng,
        address: '',
    };

    const handleOpenFullMap = () => {
        const url = toMapDeepLinkUrl(mapPoint.lat, mapPoint.lng);
        if (typeof window !== 'undefined') {
            window.open(url, '_blank', 'noopener,noreferrer');
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
                            Search an address or use your current location. The map updates with your selected point.
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
                            activeOpacity={gettingLocation ? 1 : 0.78}
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

                        <View style={styles.mapContainer}>
                            <iframe
                                src={toMapEmbedUrl(mapPoint.lat, mapPoint.lng)}
                                style={{ width: '100%', height: '100%', border: 'none' }}
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                                title="Location preview map"
                            />
                        </View>

                        <TouchableOpacity activeOpacity={1} onPress={handleOpenFullMap} style={styles.openMapBtn}>
                            <Ionicons name="open-outline" size={16} color="#4338CA" />
                            <Text style={styles.openMapBtnText}>Open full map</Text>
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
                        <TouchableOpacity activeOpacity={!currentSelection ? 1 : 0.78}
                            style={[styles.confirmBtn, !currentSelection && styles.disabledBtn, { opacity: currentSelection ? 1 : 0.6 }]}
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
        maxWidth: 640,
        backgroundColor: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
        maxHeight: '88%',
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
        backgroundColor: '#f3f4f6',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    searchInput: {
        flex: 1,
        marginLeft: 8,
        fontSize: 14,
        outlineStyle: 'none', // Web specific
    } as any,
    searchBtn: {
        marginTop: 12,
        alignItems: 'center',
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
    mapContainer: {
        marginTop: 16,
        height: 220,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#D1D5DB',
        backgroundColor: '#E5E7EB',
    },
    openMapBtn: {
        marginTop: 10,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    openMapBtnText: {
        color: '#4338CA',
        fontWeight: '600',
        fontSize: 12,
    },
    resultContainer: {
        marginTop: 16,
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

