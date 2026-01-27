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

const { width, height } = Dimensions.get('window');

import { useAuth } from '../src/context/AuthContext';

export default function HomeScreen() {
    const { colors, isDark } = useTheme();
    const { userRole } = useAuth();
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState('All');
    // State for different sections
    const [featured, setFeatured] = useState<any[]>([]);
    const [discover, setDiscover] = useState<any[]>([]);
    const [userName, setUserName] = useState('Guest');

    // Refined Categories based on Role
    const isOwner = userRole === 'venue-owner' || userRole === 'studio-owner';
    const CATEGORIES = isOwner ? ['All', 'Musicians'] : ['All', 'Musicians', 'Venues', 'Studios'];

    // ... refs ...
    const bottomSheetRef = React.useRef<import('@gorhom/bottom-sheet').BottomSheetModal>(null);
    const searchSheetRef = React.useRef<import('@gorhom/bottom-sheet').BottomSheetModal>(null);
    const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

    // Filter items selection
    const filteredItems = activeCategory === 'All'
        ? featured
        : featured.filter(item => {
            if (activeCategory === 'Musicians') return item.type === 'Group';
            if (activeCategory === 'Venues') return item.type === 'Venue' || item.type === 'Gig' || (item.type === 'Studio' && item.amenities?.includes('Stage'));
            if (activeCategory === 'Studios') return item.type === 'Studio';
            return item.type === activeCategory; // Fallback
        });

    useEffect(() => {
        fetchHomeData();
        fetchUserProfile();
    }, [userRole]); // Re-fetch if role changes (e.g. login)

    const fetchUserProfile = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', user.id)
                .single();

            if (data?.full_name) {
                setUserName(data.full_name.split(' ')[0]);
            }
        } catch (e) {
            console.log('Error fetching user profile:', e);
        }
    };

    const fetchHomeData = async () => {
        setLoading(true);
        try {
            // Fetch based on Role
            // If Owner, ONLY fetch groups (musicians)
            let groups: any[] = [];
            let studios: any[] = [];
            let gigs: any[] = [];

            const isOwner = userRole === 'venue-owner' || userRole === 'studio-owner';

            // Always fetch groups
            const { data: gData } = await supabase.from('groups_with_stats').select('*').limit(20);
            groups = gData || [];

            if (!isOwner) {
                const { data: sData } = await supabase.from('studios_with_stats').select('*').limit(20);
                studios = sData || [];
                const { data: gigData } = await supabase.from('gigs_with_stats').select('*').limit(20);
                gigs = gigData || [];
            }

            // Normalize
            const normalize = (items: any[], type: string) => items.map(item => ({
                id: item.id,
                type,
                name: item.name,
                image: item.images?.[0] || 'https://via.placeholder.com/300',
                rating: item.rating || 0,
                review_count: item.review_count || 0,
                // Explicitly pass rate fields
                hourly_rate: item.hourly_rate?.toString(),
                budget: item.budget?.toString(),
                rate: item.rate || item.hourly_rate?.toString() || item.budget?.toString(),
                location: item.location || item.address || '',
                amenities: item.amenities || [],
                embedding: item.embedding
            }));

            const allGroups = normalize(groups, 'Group');
            const allStudios = normalize(studios, 'Studio');
            const allGigs = normalize(gigs, 'Gig');

            const allItems = [...allGroups, ...allStudios, ...allGigs];

            // AI Personalization
            // Strategy:
            // 1. "Featured": If we have a selectedListingId (last viewed), find similar items.
            // 2. "Discover": Random mix of high-rated items (Exploration)

            let recommended = [...allItems]; // Default: all items

            // Simulating "Last Viewed" text/embedding context
            // In a real app, this would come from a user_history table or local storage
            // For now, if we have selectedListingId, we could try to find it in the list and use its embedding
            // But selectedListingId is local to this session's tap, so it might not be set on first load.
            // Let's rely on a randomized Sort for "Discover" and maybe a Rating Sort for "Featured" for now,
            // as true history needs persistent tracking which is another task.

            // However, we CAN demonstration the vector match if we pick a random "Seed" item
            // effectively "Simulating" that the user likes one item.

            if (allItems.length > 0) {
                const seed = allItems[Math.floor(Math.random() * allItems.length)];
                // console.log('Personalizing based on seed:', seed.name);

                // If seed has embedding, sort others by similarity (approximate JS cosine if not doing DB RPC query for feed)
                // Since we fetched `embedding` column, we can do client-side sort for small lists
                // or fetches from DB for cleaner approach. 
                // Let's keep it simple: Random shuffle for Discover, Rating for Featured.
                // Actually the user asked for "AI". Let's try to fetch using the RPC if possible, 
                // or just enable the capability. 

                // Real Implementation:
                // The `ListingDetailsSheet` handles the item-to-item AI.
                // This Home feed is User-to-Item. Without user history vectors, we can't do User personalization yet.
                // So we will stick to:
                // Featured = Highest Rated (Popularity)
                // Discover = Randomized (Exploration)
            }

            // AI Personalization (Long-Term Learning)
            const { data: { user } } = await supabase.auth.getUser();
            let sortedItems = [...allItems];
            let usedPersonalization = false;

            if (user) {
                // Fetch Profile Vector
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('interest_vector')
                    .eq('id', user.id)
                    .single();

                if (profile && profile.interest_vector) {
                    usedPersonalization = true;
                    const dot = (a: number[], b: number[]) => a.reduce((acc, cur, i) => acc + cur * b[i], 0);
                    const pVec = typeof profile.interest_vector === 'string' ? JSON.parse(profile.interest_vector) : profile.interest_vector;

                    if (pVec && Array.isArray(pVec)) {
                        sortedItems.sort((a, b) => {
                            if (!a.embedding || !b.embedding) return 0;
                            const aVec = typeof a.embedding === 'string' ? JSON.parse(a.embedding) : a.embedding;
                            const bVec = typeof b.embedding === 'string' ? JSON.parse(b.embedding) : b.embedding;
                            return dot(pVec, bVec) - dot(pVec, aVec); // Descending
                        });
                    }
                }
            }

            if (!usedPersonalization) {
                sortedItems.sort(() => 0.5 - Math.random());
            }

            setFeatured(sortedItems.slice(0, 10)); // Top 10 Personalized
            setDiscover(sortedItems.slice(10, 20)); // Next 10

        } catch (e) {
            console.log('Error fetching home feed:', e);
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
                {filteredItems.slice(0, 10).map(item => renderUnifiedCard(item))}
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
                decelerationRate="fast"
                snapToInterval={width * 0.6 + 16}
            >
                {discover.length > 0 ? discover.map(item => renderUnifiedCard(item)) : (
                    <Text style={{ marginLeft: 24, color: colors.textSecondary }}>No items found.</Text>
                )}
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
