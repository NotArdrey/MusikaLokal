import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import Header from '../src/components/header';
import ListingCard from '../src/components/ListingCard';
import ListingDetailsSheet from '../src/components/ListingDetailsSheet';
import Navbar from '../src/components/navbar';
import SearchBottomSheet from '../src/components/SearchBottomSheet';
import { useTheme } from '../src/context/ThemeContext';
import { MOCK_LISTINGS } from '../src/data/mockData';

const { width, height } = Dimensions.get('window');

// Refined Categories
const CATEGORIES = ['All', 'Musicians', 'Venues', 'Studios'];

export default function HomeScreen() {
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState('All');
    const [featured, setFeatured] = useState<any[]>([]);
    const [userName, setUserName] = useState('Martin');

    // Bottom Sheet
    const bottomSheetRef = React.useRef<import('@gorhom/bottom-sheet').BottomSheetModal>(null);
    const searchSheetRef = React.useRef<import('@gorhom/bottom-sheet').BottomSheetModal>(null);
    const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

    // Filter items selection
    const filteredItems = activeCategory === 'All'
        ? featured
        : featured.filter(item => {
            if (activeCategory === 'Musicians') return item.type === 'Group';
            if (activeCategory === 'Venues') return item.type === 'Venue';
            if (activeCategory === 'Studios') return item.type === 'Studio';
            return true;
        });

    // Mock "Discover New" items
    const discoverItems = [
        { id: 'd1', title: 'Hidden Valley', location: 'Rizal', image: 'https://images.unsplash.com/photo-1510784722466-f2aa9c52fff6?w=800&fit=crop' },
        { id: 'd2', title: 'Coastal Vibes', location: 'La Union', image: 'https://images.unsplash.com/photo-1520116468816-95b69f847357?w=800&fit=crop' },
        { id: 'd3', title: 'Mountain Retreat', location: 'Baguio', image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&fit=crop' },
    ];

    useEffect(() => {
        fetchHomeData();
        fetchUserProfile();
    }, []);

    const fetchUserProfile = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data } = await supabase.functions.invoke('manage-profile', {
                body: { action: 'fetch', userId: user.id }
            });
            if (data?.full_name) {
                setUserName(data.full_name.split(' ')[0]);
            }
        } catch (e) {
            console.log('Error fetching user profile:', e);
        }
    };

    const fetchHomeData = async () => {
        try {
            const { data, error } = await supabase.functions.invoke('home-feed');
            let fetchedItems: any[] = [];
            if (data?.featured || data?.newArrivals) {
                fetchedItems = [...(data?.featured || []), ...(data?.newArrivals || [])];
            }
            const uniqueItems = Array.from(new Map(fetchedItems.map(item => [item.id, item])).values());
            setFeatured([...uniqueItems, ...MOCK_LISTINGS]);
        } catch (e) {
            console.log('Error fetching home feed:', e);
            setFeatured([...MOCK_LISTINGS]);
        } finally {
            setLoading(false);
        }
    };

    const handleCardPress = (item: any) => {
        setSelectedListingId(item.id);
        bottomSheetRef.current?.present();
    };

    // 1. Immersive Hero Section
    const renderHero = () => (
        <View style={styles.heroContainer}>
            <Image
                source={{ uri: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&fit=crop' }}
                style={styles.heroImage}
                resizeMode="cover"
            />
            <LinearGradient
                colors={['rgba(0,0,0,0.1)', 'transparent', 'rgba(0,0,0,0.8)']}
                style={styles.heroGradient}
            />

            {/* Header Component Overlay */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 }}>
                <Header title="MusikaLokal" transparent />
            </View>

            {/* Content within Hero */}
            <View style={[styles.heroContent, { paddingTop: insets.top + 60 }]}>
                {/* Greeting */}
                <View>
                    <Text style={styles.heroGreeting}>Hey, {userName}!</Text>
                </View>

                {/* Glassmorphism Search Pill */}
                <BlurView intensity={40} tint="light" style={styles.searchPill}>
                    <TouchableOpacity
                        style={styles.searchTouch}
                        onPress={() => searchSheetRef.current?.present()}
                    >
                        <Ionicons name="search" size={20} color="#FFF" style={{ marginRight: 8 }} />
                        <View style={styles.searchTexts}>
                            <Text style={styles.searchPlaceholder}>Where to?</Text>
                            <Text style={styles.searchSubPlaceholder}>Dates • Guests</Text>
                        </View>
                    </TouchableOpacity>
                </BlurView>
            </View>
        </View>
    );

    // 3. Category Chips
    const renderCategories = () => (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryContainer}
        >
            {CATEGORIES.map(cat => (
                <TouchableOpacity
                    key={cat}
                    onPress={() => setActiveCategory(cat)}
                    style={[
                        styles.categoryChip,
                        activeCategory === cat && { backgroundColor: parseColor(colors.primary), borderColor: 'transparent' }
                    ]}
                >
                    <Text style={[
                        styles.categoryText,
                        activeCategory === cat && { color: '#FFF', fontWeight: '600' }
                    ]}>{cat}</Text>
                </TouchableOpacity>
            ))}
        </ScrollView>
    );

    // Unified Card Renderer
    const renderUnifiedCard = (item: any) => {
        return (
            <ListingCard
                key={item.id}
                item={item}
                onPress={handleCardPress}
                variant="horizontal"
            />
        );
    };

    // 4. "The Most Relevant" Horizontal Carousel
    const renderFeatured = () => (
        <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>The Most Relevant</Text>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingLeft: 24, paddingRight: 8 }}
                decelerationRate="fast"
                snapToInterval={width * 0.6 + 16}
            >
                {filteredItems.slice(0, 5).map(item => renderUnifiedCard(item))}
            </ScrollView>
        </View>
    );

    // 5. Discovery Section
    const renderDiscovery = () => (
        <View style={styles.sectionContainer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 24 }}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Discover new places</Text>
                <TouchableOpacity>
                    <Text style={{ color: colors.primary, fontFamily: 'Poppins_500Medium', fontSize: 12 }}>See all</Text>
                </TouchableOpacity>
            </View>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingLeft: 24, paddingRight: 8 }}
            >
                {discoverItems.map(item => renderUnifiedCard(item))}
            </ScrollView>
        </View>
    );

    // Helpers
    const parseColor = (c: string) => c;

    if (loading) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 100 }}
                bounces={false}
            >
                {renderHero()}

                <View style={{ marginTop: 20 }}>
                    {renderCategories()}
                </View>

                {renderFeatured()}

                {renderDiscovery()}

                {/* Extra space for Recently Viewed mockup if needed */}
                <View style={styles.sectionContainer}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Recently Viewed</Text>
                    <View style={{ paddingHorizontal: 24 }}>
                        <Text style={{ color: colors.textSecondary, fontFamily: 'Poppins_400Regular' }}>No recent items</Text>
                    </View>
                </View>

            </ScrollView>

            <Navbar />

            <ListingDetailsSheet ref={bottomSheetRef} listingId={selectedListingId} />
            <SearchBottomSheet ref={searchSheetRef} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Hero
    heroContainer: {
        height: height * 0.45,
        width: '100%',
        position: 'relative',
    },
    heroImage: {
        width: '100%',
        height: '100%',
    },
    heroGradient: {
        ...StyleSheet.absoluteFillObject,
    },
    heroContent: {
        position: 'absolute',
        bottom: 40,
        left: 24,
        right: 24,
        zIndex: 10,
    },
    heroGreeting: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 32,
        color: '#FFF',
        textShadowColor: 'rgba(0, 0, 0, 0.3)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
        marginBottom: 20,
    },
    searchPill: {
        borderRadius: 100,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    searchTouch: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
    },
    searchTexts: {
        marginLeft: 4,
    },
    searchPlaceholder: {
        color: '#FFF',
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 14,
    },
    searchSubPlaceholder: {
        color: 'rgba(255,255,255,0.8)',
        fontFamily: 'Poppins_400Regular',
        fontSize: 12,
    },

    // Categories
    categoryContainer: {
        paddingHorizontal: 24,
        paddingVertical: 8,
        gap: 10,
    },
    categoryChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        backgroundColor: 'transparent',
    },
    categoryText: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 13,
        color: '#6B7280',
    },

    // Sections
    sectionContainer: {
        marginTop: 32,
    },
    sectionTitle: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 18,
        marginLeft: 24,
        marginBottom: 16,
    },

    // Discovery
    discoveryCard: {
        width: 140,
        height: 180,
        borderRadius: 16,
        overflow: 'hidden',
        marginRight: 12,
        position: 'relative',
    },
    discoveryImage: {
        width: '100%',
        height: '100%',
    },
    discoveryOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.2)',
        justifyContent: 'flex-end',
        padding: 12,
    },
    discoveryTitle: {
        color: '#FFF',
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 14,
    },
    discoveryLoc: {
        color: 'rgba(255,255,255,0.9)',
        fontFamily: 'Poppins_400Regular',
        fontSize: 11,
    }
});
