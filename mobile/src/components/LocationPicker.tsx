import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react'; // Added useEffect
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import CustomAlert, { AlertType } from './CustomAlert';

const debugLog = (..._args: unknown[]) => {};
const LOCATION_UNAVAILABLE_MESSAGE =
    'Current location is unavailable. Turn on Location Services, then try again, or search/select the address manually.';

interface LocationPickerProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (location: { address: string; lat: number; lng: number }) => void;
    initialLocation?: { lat: number; lng: number };
}

export default function LocationPicker({ visible, onClose, onSelect, initialLocation }: LocationPickerProps) {
    const webviewRef = useRef<WebView>(null);
    const [searchText, setSearchText] = useState('');
    const [loading, setLoading] = useState(true);
    const [gettingLocation, setGettingLocation] = useState(false);
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

    // Default to Manila, Philippines
    const defaultLocation = {
        lat: 14.5995,
        lng: 120.9842
    };

    const startLocation = initialLocation || defaultLocation;

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
            body { margin: 0; padding: 0; }
            #map { width: 100%; height: 100vh; }
            .leaflet-control-attribution { font-size: 10px; }
        </style>
    </head>
    <body>
        <div id="map"></div>
        <script>
            var map = L.map('map', { zoomControl: false }).setView([${startLocation.lat}, ${startLocation.lng}], 13);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(map);

            var marker = L.marker([${startLocation.lat}, ${startLocation.lng}], { draggable: true }).addTo(map);

            function updatePosition(lat, lng) {
                marker.setLatLng([lat, lng]);
                map.setView([lat, lng], 16);
            }

            // Send coords to React Native on drag end
            marker.on('dragend', function(e) {
                var position = marker.getLatLng();
                var message = JSON.stringify({
                    type: 'locationSelected',
                    lat: position.lat,
                    lng: position.lng
                });
                window.ReactNativeWebView.postMessage(message);
            });

            // Map click to move marker
            map.on('click', function(e) {
                marker.setLatLng(e.latlng);
                var message = JSON.stringify({
                    type: 'locationSelected',
                    lat: e.latlng.lat,
                    lng: e.latlng.lng
                });
                window.ReactNativeWebView.postMessage(message);
            });

            // Listen for messages from React Native
            document.addEventListener("message", function(event) {
                handleMessage({data: event.data});
            });
            
            window.addEventListener("message", function(event) {
                handleMessage({data: event.data});
            });

            function handleMessage(event) {
                try {
                    var data = JSON.parse(event.data);
                    if (data.type === 'updateLocation') {
                        updatePosition(data.lat, data.lng);
                    }
                } catch(e) {}
            }
        </script>
    </body>
    </html>
    `;


    useEffect(() => {
        if (visible && startLocation) {
            // Fetch initial address
            fetchAddress(startLocation.lat, startLocation.lng);
        }
    }, [visible]);

    const fetchAddress = async (lat: number, lng: number) => {
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
                headers: {
                    'User-Agent': 'MusikaLokalApp/1.0 (internal-test)'
                }
            });

            const text = await response.text();
            try {
                const addrData = JSON.parse(text);
                const locationData = {
                    lat,
                    lng,
                    address: addrData.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`
                };
                setCurrentSelection(locationData);
            } catch (parseError) {
                debugLog('Error parsing JSON from reverse geocode:', parseError);
                debugLog('Response text:', text);
                throw parseError;
            }
        } catch (e) {
            debugLog('Error fetching initial address:', e);
            // Fallback
            setCurrentSelection({
                lat,
                lng,
                address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`
            });
        }
    };

    const handleSearch = async () => {
        if (!searchText.trim()) return;
        setLoading(true);
        try {
            // Use Nominatim API for geocoding (Free, subject to usage policy)
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
                debugLog('Response text:', text);
                showAlert('error', 'Search Error', 'Invalid response from server');
                return;
            }

            if (data && data.length > 0) {
                const { lat, lon, display_name } = data[0];
                const latitude = parseFloat(lat);
                const longitude = parseFloat(lon);

                // Update WebView map
                webviewRef.current?.postMessage(JSON.stringify({
                    type: 'updateLocation',
                    lat: latitude,
                    lng: longitude
                }));

                // Immediately consider this a selection so we have the address text
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

    const applyDeviceLocation = async (loc: Location.LocationObject) => {
        const latitude = loc.coords.latitude;
        const longitude = loc.coords.longitude;

        webviewRef.current?.postMessage(JSON.stringify({
            type: 'updateLocation',
            lat: latitude,
            lng: longitude
        }));

        await fetchAddress(latitude, longitude);
    };

    const getLastKnownDeviceLocation = async () => {
        try {
            return await Location.getLastKnownPositionAsync({
                maxAge: 5 * 60 * 1000,
            });
        } catch {
            return null;
        }
    };

    const handleGetCurrentAddress = async () => {
        setGettingLocation(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                showAlert('warning', 'Permission Required', 'Allow location permission to use current address.');
                return;
            }

            const servicesEnabled = await Location.hasServicesEnabledAsync();
            if (!servicesEnabled) {
                showAlert('warning', 'Location Services Off', LOCATION_UNAVAILABLE_MESSAGE);
                return;
            }

            const current = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });
            await applyDeviceLocation(current);
        } catch (error) {
            const lastKnown = await getLastKnownDeviceLocation();
            if (lastKnown) {
                await applyDeviceLocation(lastKnown);
                showAlert(
                    'info',
                    'Using Last Known Location',
                    'A fresh location was not available, so the map used your last known position.'
                );
                return;
            }

            showAlert('error', 'Location Unavailable', LOCATION_UNAVAILABLE_MESSAGE);
        } finally {
            setGettingLocation(false);
        }
    };

    const handleMessage = async (event: any) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'locationSelected') {
                // Reverse geocode to get address text
                await fetchAddress(data.lat, data.lng);
            }
        } catch (e) {
            debugLog("Error parsing message", e);
        }
    };

    const [currentSelection, setCurrentSelection] = useState<{ address: string; lat: number; lng: number } | null>(null);

    if (!visible) {
        return alertVisible ? (
            <CustomAlert
                visible
                type={alertConfig.type}
                title={alertConfig.title}
                message={alertConfig.message}
                buttons={alertConfig.buttons}
                onClose={() => setAlertVisible(false)}
            />
        ) : null;
    }

    return (
        <>
        <Modal visible animationType="slide" onRequestClose={onClose}>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.closeBtn}>
                        <Ionicons name="close" size={24} color="#000" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Pin Location</Text>
                    <View style={{ width: 24 }} />
                </View>

                {/* Search Bar */}
                <View style={styles.searchContainer}>
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
                    <TouchableOpacity
                        activeOpacity={gettingLocation ? 1 : 0.78}
                        onPress={handleGetCurrentAddress}
                        style={styles.currentLocationBtn}
                        disabled={gettingLocation}
                    >
                        {gettingLocation ? (
                            <ActivityIndicator size="small" color="#4F46E5" />
                        ) : (
                            <Ionicons name="locate" size={16} color="#4F46E5" />
                        )}
                        <Text style={styles.currentLocationBtnText}>Get Current Address</Text>
                    </TouchableOpacity>
                </View>

                {/* Map */}
                <WebView
                    ref={webviewRef}
                    source={{ html: htmlContent }}
                    style={styles.webview}
                    onMessage={handleMessage}
                    onLoadEnd={() => setLoading(false)}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    originWhitelist={['*']}
                />

                {/* Confirm Button */}
                <View style={styles.footer}>
                    <Text style={styles.addressPreview} numberOfLines={2}>
                        {currentSelection ? currentSelection.address : 'Loading location...'}
                    </Text>
                    <TouchableOpacity activeOpacity={!currentSelection ? 1 : 0.78}
                        style={[styles.confirmBtn, !currentSelection && styles.disabledBtn, { opacity: currentSelection ? 1 : 0.6 }]}
                        onPress={() => currentSelection && onSelect(currentSelection)}
                        disabled={!currentSelection}
                    >
                        <Text style={styles.confirmBtnText}>Confirm Location</Text>
                    </TouchableOpacity>
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

    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
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
    searchContainer: {
        position: 'absolute',
        top: 70, // Below header
        left: 16,
        right: 16,
        zIndex: 100,
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: '#F3F4F6',
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 48,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 5,
    },
    currentLocationBtn: {
        marginTop: 8,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#fff',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
        elevation: 3,
    },
    currentLocationBtnText: {
        color: '#4F46E5',
        fontSize: 12,
        fontWeight: '600',
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
    },
    webview: {
        flex: 1,
    },
    footer: {
        padding: 16,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        backgroundColor: '#fff',
    },
    addressPreview: {
        fontSize: 13,
        color: '#666',
        marginBottom: 12,
        textAlign: 'center',
    },
    confirmBtn: {
        backgroundColor: '#6366f1', // Primary color
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

