import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import React, { useRef, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { WebView } from "react-native-webview";
import { useTheme } from "../context/ThemeContext";

interface LeafletAddressPickerProps {
    value: string;
    onAddressSelect: (address: string, lat?: number, lng?: number) => void;
    placeholder?: string;
}

export default function LeafletAddressPicker({
    value,
    onAddressSelect,
    placeholder = "Select your address",
}: LeafletAddressPickerProps) {
    const { colors, isDark } = useTheme();
    const [modalVisible, setModalVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searching, setSearching] = useState(false);
    const [currentAddress, setCurrentAddress] = useState(value);
    const [gettingLocation, setGettingLocation] = useState(false);
    const webViewRef = useRef<WebView>(null);

    const leafletHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; width: 100%; }
    #map { height: 100%; width: 100%; }
    .leaflet-control-attribution { display: none; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    // Default to Philippines
    var map = L.map('map').setView([14.5995, 120.9842], 6);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);
    
    var marker = null;
    
    function setMarker(lat, lng, zoom) {
      if (marker) {
        marker.setLatLng([lat, lng]);
      } else {
        marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.on('dragend', function(e) {
          var pos = marker.getLatLng();
          reverseGeocode(pos.lat, pos.lng);
        });
      }
      map.setView([lat, lng], zoom || 15);
    }
    
    function reverseGeocode(lat, lng) {
      fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng)
        .then(r => r.json())
        .then(data => {
          var addr = data.display_name || '';
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'address',
            address: addr,
            lat: lat,
            lng: lng
          }));
        })
        .catch(err => console.error(err));
    }
    
    map.on('click', function(e) {
      setMarker(e.latlng.lat, e.latlng.lng);
      reverseGeocode(e.latlng.lat, e.latlng.lng);
    });
    
    // Listen for search commands from React Native
    window.searchLocation = function(query) {
      fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query) + '&limit=1')
        .then(r => r.json())
        .then(data => {
          if (data && data.length > 0) {
            var result = data[0];
            setMarker(parseFloat(result.lat), parseFloat(result.lon), 16);
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'address',
              address: result.display_name,
              lat: parseFloat(result.lat),
              lng: parseFloat(result.lon)
            }));
          } else {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'error',
              message: 'Location not found'
            }));
          }
        })
        .catch(err => {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'error',
            message: 'Search failed'
          }));
        });
    };
    
    window.setCurrentLocation = function(lat, lng) {
      setMarker(lat, lng, 16);
      reverseGeocode(lat, lng);
    };
  </script>
</body>
</html>
  `;

    const handleSearch = () => {
        if (!searchQuery.trim()) return;
        setSearching(true);
        webViewRef.current?.injectJavaScript(
            `searchLocation("${searchQuery.replace(/"/g, '\\"')}"); true;`
        );
        setTimeout(() => setSearching(false), 2000);
    };

    const handleGetCurrentLocation = async () => {
        setGettingLocation(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") {
                setGettingLocation(false);
                return;
            }
            const loc = await Location.getCurrentPositionAsync({});
            webViewRef.current?.injectJavaScript(
                `setCurrentLocation(${loc.coords.latitude}, ${loc.coords.longitude}); true;`
            );
        } catch (err) {
            console.error("Location error:", err);
        }
        setGettingLocation(false);
    };

    const handleMessage = (event: any) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === "address") {
                setCurrentAddress(data.address);
                setSearching(false);
            }
        } catch (e) {
            console.error("WebView message error:", e);
        }
    };

    const handleConfirm = () => {
        onAddressSelect(currentAddress);
        setModalVisible(false);
    };

    return (
        <>
            <TouchableOpacity
                style={[
                    styles.pickerButton,
                    {
                        backgroundColor: colors.inputBackground,
                        borderColor: colors.border,
                    },
                ]}
                onPress={() => setModalVisible(true)}
                activeOpacity={1}
            >
                <Ionicons
                    name="location-outline"
                    size={20}
                    color={colors.primary}
                    style={{ marginRight: 10 }}
                />
                <Text
                    style={[
                        styles.pickerText,
                        { color: value ? colors.text : colors.textSecondary },
                    ]}
                    numberOfLines={2}
                >
                    {value || placeholder}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <Modal
                visible={modalVisible}
                animationType="slide"
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
                    {/* Header */}
                    <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                        <TouchableOpacity activeOpacity={1}
                            onPress={() => setModalVisible(false)}
                            style={styles.closeBtn}
                        >
                            <Ionicons name="close" size={24} color={colors.text} />
                        </TouchableOpacity>
                        <Text style={[styles.modalTitle, { color: colors.text }]}>
                            Select Address
                        </Text>
                        <TouchableOpacity activeOpacity={1} onPress={handleConfirm} style={styles.confirmBtn}>
                            <Text style={[styles.confirmText, { color: colors.primary }]}>
                                Confirm
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Search Bar */}
                    <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
                        <View
                            style={[
                                styles.searchInputWrapper,
                                { backgroundColor: isDark ? "#374151" : "#F3F4F6" },
                            ]}
                        >
                            <Ionicons name="search" size={20} color={colors.textSecondary} />
                            <TextInput
                                style={[styles.searchInput, { color: colors.text }]}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                placeholder="Search location..."
                                placeholderTextColor={colors.textSecondary}
                                returnKeyType="search"
                                onSubmitEditing={handleSearch}
                            />
                            {searching && <ActivityIndicator size="small" color={colors.primary} />}
                        </View>
                        <TouchableOpacity activeOpacity={1}
                            style={[styles.locationBtn, { backgroundColor: colors.primary }]}
                            onPress={handleGetCurrentLocation}
                            disabled={gettingLocation}
                        >
                            {gettingLocation ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Ionicons name="locate" size={20} color="#fff" />
                            )}
                        </TouchableOpacity>
                    </View>

                    {/* Selected Address Display */}
                    {currentAddress ? (
                        <View style={[styles.addressDisplay, { backgroundColor: isDark ? "#374151" : "#F3F4F6" }]}>
                            <Ionicons name="location" size={16} color={colors.primary} />
                            <Text
                                style={[styles.addressText, { color: colors.text }]}
                                numberOfLines={2}
                            >
                                {currentAddress}
                            </Text>
                        </View>
                    ) : null}

                    {/* Map */}
                    <View style={styles.mapContainer}>
                        <WebView
                            ref={webViewRef}
                            source={{ html: leafletHTML }}
                            style={styles.webview}
                            onMessage={handleMessage}
                            javaScriptEnabled
                            domStorageEnabled
                            startInLoadingState
                            renderLoading={() => (
                                <View style={styles.loadingOverlay}>
                                    <ActivityIndicator size="large" color={colors.primary} />
                                </View>
                            )}
                        />
                    </View>

                    {/* Help Text */}
                    <View style={[styles.helpContainer, { backgroundColor: colors.card }]}>
                        <Text style={[styles.helpText, { color: colors.textSecondary }]}>
                            Tap on the map or drag the marker to select your location
                        </Text>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    pickerButton: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderRadius: 10,
        padding: 14,
    },
    pickerText: {
        flex: 1,
        fontSize: 15,
        fontFamily: "Poppins_400Regular",
    },
    modalContainer: {
        flex: 1,
    },
    modalHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    closeBtn: {
        padding: 4,
    },
    modalTitle: {
        fontSize: 17,
        fontFamily: "Poppins_600SemiBold",
    },
    confirmBtn: {
        padding: 4,
    },
    confirmText: {
        fontSize: 16,
        fontFamily: "Poppins_600SemiBold",
    },
    searchContainer: {
        flexDirection: "row",
        padding: 12,
        gap: 10,
    },
    searchInputWrapper: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 48,
        gap: 10,
    },
    searchInput: {
        flex: 1,
        height: 24,
        fontSize: 15,
        fontFamily: "Poppins_500Medium",
        lineHeight: 20,
        includeFontPadding: false,
        padding: 0,
        textAlignVertical: "center",
    },
    locationBtn: {
        width: 44,
        height: 44,
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center",
    },
    addressDisplay: {
        flexDirection: "row",
        alignItems: "center",
        marginHorizontal: 12,
        padding: 12,
        borderRadius: 10,
        gap: 8,
    },
    addressText: {
        flex: 1,
        fontSize: 13,
        fontFamily: "Poppins_400Regular",
    },
    mapContainer: {
        flex: 1,
        margin: 12,
        borderRadius: 12,
        overflow: "hidden",
    },
    webview: {
        flex: 1,
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.9)",
    },
    helpContainer: {
        padding: 12,
        alignItems: "center",
    },
    helpText: {
        fontSize: 12,
        fontFamily: "Poppins_400Regular",
        textAlign: "center",
    },
});
