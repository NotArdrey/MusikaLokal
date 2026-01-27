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
    const { userRole, userId } = useAuth();
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState('All');
    // State for different sections
    const [featured, setFeatured] = useState<any[]>([]);
    const [discover, setDiscover] = useState<any[]>([]);
    const [recentlyViewed, setRecentlyViewed] = useState<any[]>([]);
    const [userName, setUserName] = useState('Guest');
    const [userStats, setUserStats] = useState<any>(null);
    const [timeGreeting, setTimeGreeting] = useState('Hey');

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
        fetchRecentlyViewed();
        fetchUserStats();
        setTimeBasedGreeting();
    }, [userRole, userId]); // Re-fetch if role changes (e.g. login)

    const setTimeBasedGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) setTimeGreeting('Good morning');
        else if (hour < 18) setTimeGreeting('Good afternoon');
        else setTimeGreeting('Good evening');
    };

    const fetchUserStats = async () => {
        if (!userId) return;
        try {
            // Fetch user-specific stats based on role
            if (userRole === 'venue-owner') {
                const { data: gigs } = await supabase
                    .from('gigs')
                    .select('id')
                    .eq('organizer_id', userId);
                const { data: pending } = await supabase
                    .from('gig_applications')
                    .select('id')
                    .eq('gig_id', gigs?.[0]?.id || '')
                    .eq('status', 'pending');
                setUserStats({ listings: gigs?.length || 0, pending: pending?.length || 0 });
            } else if (userRole === 'studio-owner') {
                const { data: studios } = await supabase
                    .from('studios')
                    .select('id')
                    .eq('owner_id', userId);
                const { data: bookings } = await supabase
                    .from('studio_bookings')
                    .select('id')
                    .eq('studio_id', studios?.[0]?.id || '')
                    .eq('status', 'confirmed')
                    .gte('date', new Date().toISOString());
                setUserStats({ listings: studios?.length || 0, bookings: bookings?.length || 0 });
            } else if (userRole === 'musician') {
                const { data: groups } = await supabase
                    .from('groups')
                    .select('id')
                    .eq('owner_id', userId);
                const { data: applications } = await supabase
                    .from('gig_applications')
                    .select('id')
                    .eq('applicant_id', userId);
                setUserStats({ groups: groups?.length || 0, applications: applications?.length || 0 });
            }
        } catch (e) {
            console.log('Error fetching user stats:', e);
        }
    };

    const fetchUserProfile = async () => {
        try {
            let user;
            if (userId) {
                // Use userId from context first
                user = { id: userId };
            } else {
                // Fallback to auth
                const { data: { user: authUser } } = await supabase.auth.getUser();
                user = authUser;
            }
            
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

            // Always fetch groups (musicians)
            const { data: gData } = await supabase.from('groups_with_stats').select('*').limit(20);
            groups = gData || [];

            // Musicians can see studios and gigs, but owners cannot
            if (!isOwner && userRole === 'musician') {
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

    const handleCardPress = async (item: any) => {
        setSelectedListingId(item.id);
        bottomSheetRef.current?.present();
        
        // Save to recently viewed
        await saveToRecentlyViewed(item);
    };

    const saveToRecentlyViewed = async (item: any) => {
        try {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            const existingJson = await AsyncStorage.getItem('recently_viewed_items');
            let items = existingJson ? JSON.parse(existingJson) : [];
            
            // Remove if already exists to avoid duplicates
            items = items.filter((i: any) => i.id !== item.id);
            
            // Add to front
            items.unshift(item);
            
            // Keep only last 10
            items = items.slice(0, 10);
            
            await AsyncStorage.setItem('recently_viewed_items', JSON.stringify(items));
            
            // Update state
            setRecentlyViewed(items);
        } catch (e) {
            console.log('Error saving to recently viewed:', e);
        }
    };

    const fetchRecentlyViewed = async () => {
        try {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            const existingJson = await AsyncStorage.getItem('recently_viewed_items');
            if (existingJson) {
                const items = JSON.parse(existingJson);
                setRecentlyViewed(items.slice(0, 5)); // Show first 5
            }
        } catch (e) {
            console.log('Error fetching recently viewed:', e);
        }
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
                {/* Greeting with Stats */}
                <View>
                    <Text style={styles.heroGreeting}>{timeGreeting}, {userName}!</Text>
                    {userStats && (
                        <Text style={styles.heroSubtitle}>
                            {userRole === 'venue-owner' && `${userStats.listings} venue${userStats.listings !== 1 ? 's' : ''} • ${userStats.pending} pending request${userStats.pending !== 1 ? 's' : ''}`}
                            {userRole === 'studio-owner' && `${userStats.listings} studio${userStats.listings !== 1 ? 's' : ''} • ${userStats.bookings} upcoming booking${userStats.bookings !== 1 ? 's' : ''}`}
                            {userRole === 'musician' && `${userStats.groups} group${userStats.groups !== 1 ? 's' : ''} • ${userStats.applications} application${userStats.applications !== 1 ? 's' : ''}`}
                        </Text>
                    )}
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

    // 2. Promotional Carousel & Top Picks
    const renderHighlightsSection = () => {
        const topItems = [...featured, ...discover].slice(0, 12);
        
        return (
            <View style={{ marginTop: 24 }}>
                {/* Promotional Carousel */}
                <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    decelerationRate="fast"
                    snapToInterval={width - 48}
                    contentContainerStyle={styles.carouselContainer}
                >
                    {/* Promo 1 */}
                    <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => searchSheetRef.current?.present()}
                        style={[styles.promoCard, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]}
                    >
                        <LinearGradient
                            colors={['#8B5CF6', '#EC4899']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.promoGradient}
                        >
                            <View style={styles.promoContent}>
                                <View style={styles.promoIconBg}>
                                    <Ionicons name="sparkles" size={28} color="#FFF" />
                                </View>
                                <Text style={styles.promoTitle}>Discover Your Sound</Text>
                                <Text style={styles.promoSubtitle}>{isOwner ? 'Find the perfect musicians for your venue' : 'Explore studios & gigs near you'}</Text>
                            </View>
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* Promo 2 */}
                    <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => require('expo-router').router.push(userRole === 'musician' ? '/my_group' : userRole === 'venue-owner' ? '/add_gig' : '/add_studio')}
                        style={[styles.promoCard, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]}
                    >
                        <LinearGradient
                            colors={['#10B981', '#06B6D4']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.promoGradient}
                        >
                            <View style={styles.promoContent}>
                                <View style={styles.promoIconBg}>
                                    <Ionicons name="add-circle" size={28} color="#FFF" />
                                </View>
                                <Text style={styles.promoTitle}>
                                    {userRole === 'venue-owner' ? 'Post a Gig' : userRole === 'studio-owner' ? 'Add Your Studio' : 'Create Your Band'}
                                </Text>
                                <Text style={styles.promoSubtitle}>Start connecting with the music community</Text>
                            </View>
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* Promo 3 */}
                    {userStats && (
                        <View style={[styles.promoCard, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]}>
                            <LinearGradient
                                colors={['#F59E0B', '#EF4444']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.promoGradient}
                            >
                                <View style={styles.promoContent}>
                                    <View style={styles.promoIconBg}>
                                        <Ionicons name="trophy" size={28} color="#FFF" />
                                    </View>
                                    <Text style={styles.promoTitle}>Your Progress</Text>
                                    <View style={styles.promoStats}>
                                        {userRole === 'venue-owner' && (
                                            <Text style={styles.promoStatsText}>{userStats.listings} Venues • {userStats.pending} Pending</Text>
                                        )}
                                        {userRole === 'studio-owner' && (
                                            <Text style={styles.promoStatsText}>{userStats.listings} Studios • {userStats.bookings} Bookings</Text>
                                        )}
                                        {userRole === 'musician' && (
                                            <Text style={styles.promoStatsText}>{userStats.groups} Groups • {userStats.applications} Applied</Text>
                                        )}
                                    </View>
                                </View>
                            </LinearGradient>
                        </View>
                    )}
                </ScrollView>

                {/* Top Picks Grid */}
                {topItems.length >= 4 && (
                    <View style={styles.topPicksContainer}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Text style={[styles.sectionTitle, { marginLeft: 0, marginBottom: 0, color: colors.text }]}>Top Picks</Text>
                            <TouchableOpacity onPress={() => searchSheetRef.current?.present()}>
                                <Text style={{ color: colors.primary, fontFamily: 'Poppins_500Medium', fontSize: 12 }}>See all</Text>
                            </TouchableOpacity>
                        </View>
                        
                        <View style={styles.topPicksGrid}>
                            {/* Large Featured */}
                            <TouchableOpacity
                                activeOpacity={0.9}
                                onPress={() => handleCardPress(topItems[0])}
                                style={styles.topPickLarge}
                            >
                                <Image source={{ uri: topItems[0].image }} style={styles.topPickImage} />
                                <LinearGradient
                                    colors={['transparent', 'rgba(0,0,0,0.7)']}
                                    style={styles.topPickOverlay}
                                >
                                    <View style={styles.topPickBadge}>
                                        <Ionicons name="star" size={12} color="#FCD34D" />
                                        <Text style={styles.topPickBadgeText}>{topItems[0].rating?.toFixed(1) || '5.0'}</Text>
                                    </View>
                                    <Text style={styles.topPickTitle} numberOfLines={1}>{topItems[0].name}</Text>
                                    <Text style={styles.topPickLocation} numberOfLines={1}>
                                        <Ionicons name="location" size={12} color="rgba(255,255,255,0.8)" /> {topItems[0].location}
                                    </Text>
                                </LinearGradient>
                            </TouchableOpacity>

                            {/* Small Grid Items */}
                            <View style={styles.topPickSmallColumn}>
                                {topItems.slice(1, 3).map((item, index) => (
                                    <TouchableOpacity
                                        key={item.id}
                                        activeOpacity={0.9}
                                        onPress={() => handleCardPress(item)}
                                        style={styles.topPickSmall}
                                    >
                                        <Image source={{ uri: item.image }} style={styles.topPickImage} />
                                        <LinearGradient
                                            colors={['transparent', 'rgba(0,0,0,0.7)']}
                                            style={styles.topPickOverlay}
                                        >
                                            <View style={styles.topPickBadge}>
                                                <Ionicons name="star" size={10} color="#FCD34D" />
                                                <Text style={[styles.topPickBadgeText, { fontSize: 10 }]}>{item.rating?.toFixed(1) || '5.0'}</Text>
                                            </View>
                                            <Text style={[styles.topPickTitle, { fontSize: 13 }]} numberOfLines={1}>{item.name}</Text>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Bottom Row */}
                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                            {topItems.slice(3, 5).map((item) => (
                                <TouchableOpacity
                                    key={item.id}
                                    activeOpacity={0.9}
                                    onPress={() => handleCardPress(item)}
                                    style={styles.topPickWide}
                                >
                                    <Image source={{ uri: item.image }} style={styles.topPickImage} />
                                    <LinearGradient
                                        colors={['transparent', 'rgba(0,0,0,0.7)']}
                                        style={styles.topPickOverlay}
                                    >
                                        <View style={styles.topPickBadge}>
                                            <Ionicons name="star" size={10} color="#FCD34D" />
                                            <Text style={[styles.topPickBadgeText, { fontSize: 10 }]}>{item.rating?.toFixed(1) || '5.0'}</Text>
                                        </View>
                                        <Text style={[styles.topPickTitle, { fontSize: 12 }]} numberOfLines={1}>{item.name}</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}
            </View>
        );
    };

    // 3. Category Chips - Hidden for owners since they only see musicians
    const renderCategories = () => {
        // Hide categories for studio/venue owners
        if (isOwner) return null;
        
        return (
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
    };

    // Handle invite action - opens the details sheet for booking/connecting
    const handleInvite = (item: any) => {
        setSelectedListingId(item.id);
        bottomSheetRef.current?.present();
        // The ListingDetailsSheet will show the "Connect" tab for Groups
        // allowing venue/studio owners to send booking requests
    };

    // Unified Card Renderer
    const renderUnifiedCard = (item: any) => {
        return (
            <ListingCard
                key={item.id}
                item={item}
                onPress={handleCardPress}
                onInvite={handleInvite}
                variant="horizontal"
            />
        );
    };

    // 4. For You - Smart Feed (Merged Featured + Discover with variety)
    const renderSmartFeed = () => {
        const allItems = [...filteredItems, ...discover];
        const uniqueItems = allItems.filter((item, index, self) => 
            index === self.findIndex((t) => t.id === item.id)
        );

        if (uniqueItems.length === 0) {
            return (
                <View style={styles.sectionContainer}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>For You</Text>
                    <View style={{ paddingHorizontal: 24, paddingVertical: 40, alignItems: 'center' }}>
                        <Ionicons name="musical-notes-outline" size={48} color={colors.textSecondary} />
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No recommendations yet</Text>
                        <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>Start exploring to get personalized suggestions</Text>
                    </View>
                </View>
            );
        }

        return (
            <View style={styles.sectionContainer}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 24, marginBottom: 8 }}>
                    <View>
                        <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 4 }]}>For You</Text>
                        <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Personalized picks based on your taste</Text>
                    </View>
                    <TouchableOpacity onPress={() => searchSheetRef.current?.present()}>
                        <Text style={{ color: colors.primary, fontFamily: 'Poppins_500Medium', fontSize: 12 }}>See all</Text>
                    </TouchableOpacity>
                </View>
                
                {/* Featured Large Card */}
                {uniqueItems[0] && (
                    <View style={{ paddingHorizontal: 24, marginBottom: 16 }}>
                        <TouchableOpacity
                            activeOpacity={0.9}
                            onPress={() => handleCardPress(uniqueItems[0])}
                            style={[styles.featuredCard, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]}
                        >
                            <Image source={{ uri: uniqueItems[0].image }} style={styles.featuredImage} />
                            <LinearGradient
                                colors={['transparent', 'rgba(0,0,0,0.8)']}
                                style={styles.featuredGradient}
                            >
                                <View style={styles.featuredBadge}>
                                    <Text style={styles.featuredBadgeText}>⭐ Featured</Text>
                                </View>
                                <Text style={styles.featuredTitle}>{uniqueItems[0].name}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                    <Ionicons name="location" size={14} color="rgba(255,255,255,0.9)" />
                                    <Text style={styles.featuredLocation}>{uniqueItems[0].location}</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 12 }}>
                                        <Ionicons name="star" size={14} color="#FCD34D" />
                                        <Text style={styles.featuredRating}>{uniqueItems[0].rating?.toFixed(1) || '0.0'}</Text>
                                    </View>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Horizontal Scroll for Rest */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingLeft: 24, paddingRight: 8 }}
                    decelerationRate="fast"
                    snapToInterval={width * 0.6 + 16}
                >
                    {uniqueItems.slice(1, 11).map((item, index) => (
                        <View key={item.id} style={{ position: 'relative' }}>
                            {index < 3 && (
                                <View style={[styles.badge, { backgroundColor: index === 0 ? '#10B981' : index === 1 ? '#3B82F6' : '#F59E0B' }]}>
                                    <Text style={styles.badgeText}>{index === 0 ? '🔥 Hot' : index === 1 ? '⭐ Top' : '✨ New'}</Text>
                                </View>
                            )}
                            {renderUnifiedCard(item)}
                        </View>
                    ))}
                </ScrollView>
            </View>
        );
    };

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

                {renderHighlightsSection()}

                <View style={{ marginTop: 20 }}>
                    {renderCategories()}
                </View>

                {renderSmartFeed()}

                {/* Recently Viewed Section */}
                {recentlyViewed.length > 0 && (
                    <View style={styles.sectionContainer}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingRight: 24 }}>
                            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recently Viewed</Text>
                            <TouchableOpacity onPress={() => searchSheetRef.current?.present()}>
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
                            {recentlyViewed.map(item => renderUnifiedCard(item))}
                        </ScrollView>
                    </View>
                )}

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
        marginBottom: 4,
    },
    heroSubtitle: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 14,
        color: 'rgba(255,255,255,0.9)',
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

    // Promotional Carousel
    carouselContainer: {
        paddingHorizontal: 24,
        gap: 16,
    },
    promoCard: {
        width: width - 48,
        height: 140,
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 5,
    },
    promoGradient: {
        flex: 1,
        padding: 24,
        justifyContent: 'center',
    },
    promoContent: {
        flex: 1,
        justifyContent: 'center',
    },
    promoIconBg: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    promoTitle: {
        fontFamily: 'Poppins_700Bold',
        fontSize: 20,
        color: '#FFF',
        marginBottom: 4,
    },
    promoSubtitle: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 13,
        color: 'rgba(255,255,255,0.9)',
    },
    promoStats: {
        marginTop: 8,
    },
    promoStatsText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 16,
        color: '#FFF',
    },

    // Top Picks Grid
    topPicksContainer: {
        paddingHorizontal: 24,
        marginTop: 32,
    },
    topPicksGrid: {
        flexDirection: 'row',
        gap: 12,
    },
    topPickLarge: {
        flex: 2,
        height: 240,
        borderRadius: 16,
        overflow: 'hidden',
    },
    topPickSmallColumn: {
        flex: 1,
        gap: 12,
    },
    topPickSmall: {
        height: 114,
        borderRadius: 16,
        overflow: 'hidden',
    },
    topPickWide: {
        flex: 1,
        height: 100,
        borderRadius: 16,
        overflow: 'hidden',
    },
    topPickImage: {
        width: '100%',
        height: '100%',
    },
    topPickOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'flex-end',
        padding: 12,
    },
    topPickBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        marginBottom: 8,
        gap: 4,
    },
    topPickBadgeText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 11,
        color: '#FFF',
    },
    topPickTitle: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 14,
        color: '#FFF',
    },
    topPickLocation: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 11,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 2,
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
        fontSize: 20,
        marginLeft: 24,
        marginBottom: 0,
    },
    sectionSubtitle: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 13,
        marginLeft: 24,
        marginBottom: 16,
    },
    emptyText: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 16,
        marginTop: 12,
        textAlign: 'center',
    },
    emptySubtext: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 13,
        marginTop: 4,
        textAlign: 'center',
    },

    // Featured Card
    featuredCard: {
        height: 240,
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 5,
    },
    featuredImage: {
        width: '100%',
        height: '100%',
    },
    featuredGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '70%',
        justifyContent: 'flex-end',
        padding: 20,
    },
    featuredBadge: {
        backgroundColor: 'rgba(255,255,255,0.95)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        alignSelf: 'flex-start',
        marginBottom: 12,
    },
    featuredBadgeText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 12,
        color: '#1F2937',
    },
    featuredTitle: {
        fontFamily: 'Poppins_700Bold',
        fontSize: 22,
        color: '#FFF',
    },
    featuredLocation: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 13,
        color: 'rgba(255,255,255,0.9)',
        marginLeft: 4,
    },
    featuredRating: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 13,
        color: '#FFF',
        marginLeft: 4,
    },

    // Badge
    badge: {
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 10,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 3,
    },
    badgeText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 11,
        color: '#FFF',
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
