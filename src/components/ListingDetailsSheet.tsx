import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import React, { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { MOCK_LISTINGS } from '../data/mockData';
import Modal from './modal';

const { width, height } = Dimensions.get('window');
const IMG_HEIGHT = height * 0.4;

interface ListingDetailsSheetProps {
    listingId: string | null;
}

const ListingDetailsSheet = forwardRef<BottomSheetModal, ListingDetailsSheetProps>(({ listingId }, ref) => {
    const { colors, isDark } = useTheme();
    const [loading, setLoading] = useState(false);
    const [group, setGroup] = useState<any>(null);
    const [isFavorited, setIsFavorited] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);

    // Tab State
    const [activeTab, setActiveTab] = useState('About');

    // Snap points
    const snapPoints = useMemo(() => ['50%', '95%'], []);

    useEffect(() => {
        if (listingId) {
            fetchGroupDetails();
            setActiveTab('About');
        }
    }, [listingId]);

    const fetchGroupDetails = async () => {
        setLoading(true);
        try {
            // Check if it's a mock item first
            const mockItem = MOCK_LISTINGS.find(item => item.id === listingId);
            if (mockItem) {
                setGroup(mockItem);
                setIsFavorited(false); // Default state for mock
                setLoading(false);
                return;
            }

            const { data: { user } } = await supabase.auth.getUser();
            const userId = user?.id;

            const { data, error } = await supabase.functions.invoke('manage-details', {
                body: { action: 'fetch', type: 'group', id: listingId, userId }
            });

            if (error) throw error;
            setGroup(data);
            setIsFavorited(data.is_favorited);
        } catch (e) {
            console.log('Error fetching group:', e);
        } finally {
            setLoading(false);
        }
    };

    const toggleFavorite = () => setIsFavorited(!isFavorited);

    const renderBackdrop = useCallback(
        (props: any) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.5}
            />
        ),
        []
    );

    // Dynamic Labels based on Type
    const getTypeLabels = (type: string) => {
        switch (type) {
            case 'Studio':
                return {
                    aboutTitle: 'About this studio',
                    tabs: ['About', 'Setup', 'Book', 'Review'],
                    unit: 'hour'
                };
            case 'Venue': // Assuming "Venue" listing uses Gig structure per user request (Apply tab)
            case 'Gig':
                return {
                    aboutTitle: 'About this gig',
                    tabs: ['About', 'Info', 'Apply', 'Review'],
                    unit: 'project'
                };
            default: // Group
                return {
                    aboutTitle: 'About this artist',
                    tabs: ['About', 'Setup', 'Connect', 'Review'],
                    unit: 'night'
                };
        }
    };



    const labels = group ? getTypeLabels(group.type) : getTypeLabels('Group');
    const displayRate = group?.hourly_rate || group?.rate || '1,500';
    const showTabs = labels.tabs.length > 0;

    const renderTabs = () => (
        <View style={[styles.tabsContainer, { borderBottomColor: colors.border }]}>
            {labels.tabs.map(tab => (
                <TouchableOpacity
                    key={tab}
                    style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
                    onPress={() => setActiveTab(tab)}
                >
                    <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.textSecondary }]}>{tab}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );

    // --- SUB-SECTIONS ---

    const renderGallery = () => (
        <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Gallery</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryContainer}>
                {[1, 2, 3, 4].map((i) => (
                    <Image
                        key={i}
                        source={{ uri: group.images?.[i % (group.images?.length || 1)] || `https://picsum.photos/300/200?random=${i + 10}` }}
                        style={styles.galleryImage}
                    />
                ))}
            </ScrollView>
        </View>
    );

    const renderReviews = () => (
        <View style={[styles.tabContent, { paddingHorizontal: 0 }]}>
            <View style={[styles.reviewHeader, { paddingHorizontal: 24 }]}>
                <Text style={[styles.ratingBig, { color: colors.text }]}>{group.rating?.toFixed(1) || '4.9'}</Text>
                <View>
                    <View style={{ flexDirection: 'row' }}>
                        {[1, 2, 3, 4, 5].map(i => <Ionicons key={i} name="star" size={14} color={colors.primary} />)}
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{group.review_count || 12} reviews</Text>
                </View>
            </View>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.reviewsScroll, { paddingHorizontal: 24 }]}
            >
                {[1, 2].map((i) => (
                    <View key={i} style={[styles.reviewCard, { borderColor: colors.border }]}>
                        <View style={styles.reviewUser}>
                            <Image source={{ uri: `https://i.pravatar.cc/100?img=${i + 5}` }} style={styles.reviewAvatar} />
                            <View>
                                <Text style={[styles.reviewName, { color: colors.text }]}>Jane Doe</Text>
                                <Text style={[styles.reviewDate, { color: colors.textSecondary }]}>Oct 2025</Text>
                            </View>
                        </View>
                        <Text style={[styles.reviewBody, { color: colors.text }]} numberOfLines={3}>
                            Absolutely amazing! Professional and high quality. Highly recommended.
                        </Text>
                    </View>
                ))}
            </ScrollView>
        </View>
    );

    // Studio: Setup Tab
    const renderStudioSetup = () => (
        <View style={styles.tabContent}>
            <View style={[styles.searchBar, { backgroundColor: isDark ? '#374151' : '#F3F4F6' }]}>
                <Ionicons name="search" size={20} color={colors.textSecondary} />
                <Text style={{ marginLeft: 8, color: colors.textSecondary }}>Search microphones, amps...</Text>
            </View>

            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Microphones</Text>
                <View style={styles.tagsContainer}>
                    {['Shure SM57', 'Neumann U87', 'AKG C414'].map(tag => (
                        <View key={tag} style={[styles.tag, { borderColor: colors.border }]}>
                            <Text style={{ color: colors.text, fontSize: 13 }}>{tag}</Text>
                        </View>
                    ))}
                </View>
            </View>
            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>DAW & Interfaces</Text>
                <View style={styles.tagsContainer}>
                    {['Logic Pro X', 'Pro Tools', 'Apollo Twin'].map(tag => (
                        <View key={tag} style={[styles.tag, { borderColor: colors.border }]}>
                            <Text style={{ color: colors.text, fontSize: 13 }}>{tag}</Text>
                        </View>
                    ))}
                </View>
            </View>
        </View>
    );

    // Studio: Book Tab
    const renderStudioBook = () => (
        <View style={styles.tabContent}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Select Date & Time</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                <TouchableOpacity style={[styles.dateBtn, { borderColor: colors.border }]}>
                    <Ionicons name="calendar-outline" size={20} color={colors.text} />
                    <Text style={{ color: colors.text, fontFamily: 'Poppins_500Medium' }}>Oct 25, 2025</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.dateBtn, { borderColor: colors.border }]}>
                    <Ionicons name="time-outline" size={20} color={colors.text} />
                    <Text style={{ color: colors.text, fontFamily: 'Poppins_500Medium' }}>2:00 PM</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Duration (Hours)</Text>
                <View style={[styles.inputWrapper, { backgroundColor: isDark ? '#374151' : '#F9FAFB' }]}>
                    <TextInput style={[styles.input, { color: colors.text }]} placeholder="4" placeholderTextColor={colors.textSecondary} keyboardType="numeric" />
                </View>
            </View>

            <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Notes</Text>
                <View style={[styles.inputWrapper, { backgroundColor: isDark ? '#374151' : '#F9FAFB', height: 80 }]}>
                    <TextInput
                        style={[styles.input, { color: colors.text, height: '100%' }]}
                        placeholder="Tell us about your session..."
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        textAlignVertical="top"
                    />
                </View>
            </View>

            <View style={[styles.paymentSummary, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB' }]}>
                <View style={styles.summaryRow}>
                    <Text style={{ color: colors.textSecondary }}>Rate</Text>
                    <Text style={{ color: colors.text }}>₱{displayRate} / hr</Text>
                </View>
                <View style={styles.summaryRow}>
                    <Text style={{ color: colors.textSecondary }}>Duration</Text>
                    <Text style={{ color: colors.text }}>4 hrs</Text>
                </View>
                <View style={[styles.divider, { marginVertical: 12 }]} />
                <View style={styles.summaryRow}>
                    <Text style={{ color: colors.text, fontFamily: 'Poppins_600SemiBold' }}>Total</Text>
                    <Text style={{ color: colors.primary, fontFamily: 'Poppins_600SemiBold', fontSize: 18 }}>₱{(parseInt(displayRate.replace(/,/g, '')) * 4).toLocaleString()}</Text>
                </View>
            </View>

            <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={() => setModalVisible(true)}
            >
                <Text style={styles.primaryBtnText}>Confirm Booking</Text>
            </TouchableOpacity>
        </View>
    );

    // Gig: Info Tab
    const renderGigInfo = () => (
        <View style={styles.tabContent}>
            <View style={{ flexDirection: 'row', gap: 16 }}>
                <View style={[styles.infoCard, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Capacity</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>200pax</Text>
                </View>
                <View style={[styles.infoCard, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Audio</Text>
                    <Text style={{ fontFamily: 'Poppins_500Medium', fontSize: 13, color: colors.text }}>Full PA</Text>
                </View>
            </View>

            <View style={[styles.section, { marginTop: 24 }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Tech Specs</Text>
                {['Sound Engineer included', 'Drum kit provided', 'Bass amp provided', 'Projector available'].map(spec => (
                    <View key={spec} style={styles.checkRow}>
                        <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                        <Text style={{ color: colors.text, marginLeft: 12 }}>{spec}</Text>
                    </View>
                ))}
            </View>
        </View>
    );

    // Gig: Apply Tab
    const renderGigApply = () => (
        <View style={styles.tabContent}>
            <View style={styles.inputContainer}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Pitch Message</Text>
                <View style={[styles.inputWrapper, { backgroundColor: isDark ? '#374151' : '#F9FAFB', height: 100 }]}>
                    <TextInput
                        style={[styles.input, { color: colors.text, height: '100%' }]}
                        placeholder="Why are you a good fit for this gig?"
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        textAlignVertical="top"
                    />
                </View>
            </View>

            <TouchableOpacity style={[styles.uploadBox, { borderColor: colors.border }]}>
                <Ionicons name="videocam-outline" size={32} color={colors.primary} />
                <Text style={{ color: colors.text, marginTop: 8, fontFamily: 'Poppins_500Medium' }}>Upload Performance Sample</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Max 50MB</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
                <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, marginLeft: 8, textDecorationLine: 'underline' }}>Review Terms & Conditions</Text>
            </View>

            <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={() => setModalVisible(true)}
            >
                <Text style={styles.primaryBtnText}>Submit Application</Text>
            </TouchableOpacity>
        </View>
    );

    // --- GROUP TABS ---

    // Group: About Tab
    const renderGroupAbout = () => (
        <View style={styles.tabContent}>
            {/* Bio Card */}
            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Bio</Text>
                <Text style={[styles.description, { color: colors.textSecondary }]}>
                    {group.description || 'No description provided. We are a passionate group of musicians dedicated to bringing the best live performance experience to your events.'}
                </Text>
            </View>

            {/* Stats Row */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                <View style={[styles.statCard, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6', flex: 1 }]}>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Genre</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>{group.genre || 'Multi-Genre'}</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6', flex: 1 }]}>
                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Rating</Text>
                    <Text style={[styles.statValue, { color: colors.text }]}>{group.rating || '4.9'}</Text>
                </View>
            </View>

            {/* Managed By */}
            <View style={[styles.managerCard, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Image source={{ uri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&fit=crop' }} style={styles.hostAvatar} />
                    <View>
                        <Text style={[styles.managerLabel, { color: colors.textSecondary }]}>Managed by</Text>
                        <Text style={[styles.managerName, { color: colors.text }]}>{group.owner_name || 'Martin'}</Text>
                    </View>
                </View>
                <TouchableOpacity style={[styles.visitBtn, { borderColor: colors.primary }]}>
                    <Text style={{ color: colors.primary, fontSize: 12, fontFamily: 'Poppins_600SemiBold' }}>Visit Profile</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    // Group: Setup Tab
    const renderGroupSetup = () => (
        <View style={styles.tabContent}>
            {/* Stage Plot Placeholder */}
            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Stage Plot</Text>
                <View style={[styles.stagePlotPlaceholder, { borderColor: colors.border, backgroundColor: isDark ? '#1F2937' : '#F9FAFB' }]}>
                    <Ionicons name="image-outline" size={32} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Stage Layout Visual</Text>
                </View>
            </View>

            {/* Input List */}
            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Input List</Text>
                <View style={{ gap: 8 }}>
                    {['Ch 1: Kick - AKG D112', 'Ch 2: Snare - SM57', 'Ch 3: Hi-Hat - SM81', 'Ch 4: Bass - DI'].map((item, i) => (
                        <View key={i} style={[styles.inputRow, { borderBottomColor: colors.border }]}>
                            <Text style={{ color: colors.text, fontFamily: 'Poppins_500Medium' }}>{item.split(':')[0]}</Text>
                            <Text style={{ color: colors.text, fontFamily: 'Poppins_400Regular' }}>{item.split(':')[1]}</Text>
                        </View>
                    ))}
                </View>
            </View>

            {/* Hospitality */}
            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Hospitality Rider</Text>
                <Text style={[styles.description, { color: colors.textSecondary }]}>
                    - 4 Bottles of Water (Room Temp)
                    {'\n'}- Safe parking for 2 vehicles
                    {'\n'}- Secure dressing room
                </Text>
            </View>
        </View>
    );

    // Group: Connect Tab
    const renderGroupConnect = () => (
        <View style={styles.tabContent}>
            {/* SECTION 1: FOR VENUES (Booking) */}
            <View style={styles.section}>
                <View style={[styles.roleHeader, { backgroundColor: isDark ? '#374151' : '#E0E7FF' }]}>
                    <Text style={[styles.roleTitle, { color: isDark ? '#FFF' : '#3730A3' }]}>For Venues / Organizers</Text>
                </View>

                <View style={{ marginTop: 16 }}>
                    <Text style={[styles.label, { color: colors.text }]}>Send Booking Request</Text>
                    <View style={[styles.inputWrapper, { backgroundColor: isDark ? '#374151' : '#F9FAFB', height: 100, marginBottom: 16 }]}>
                        <TextInput
                            style={[styles.input, { color: colors.text, height: '100%' }]}
                            placeholder="Describe your event..."
                            placeholderTextColor={colors.textSecondary}
                            multiline
                            textAlignVertical="top"
                        />
                    </View>

                    <TouchableOpacity style={[styles.uploadBox, { borderColor: colors.border, height: 80, marginBottom: 16 }]}>
                        <Ionicons name="attach-outline" size={24} color={colors.primary} />
                        <Text style={{ color: colors.text, fontFamily: 'Poppins_500Medium' }}>Attach Event Proposal</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                        onPress={() => setModalVisible(true)}
                    >
                        <Text style={styles.primaryBtnText}>Send Request</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={[styles.divider, { marginVertical: 32 }]} />

            {/* SECTION 2: FOR MUSICIANS (Audition) */}
            <View style={styles.section}>
                <View style={[styles.roleHeader, { backgroundColor: isDark ? '#064E3B' : '#DCFCE7' }]}>
                    <Text style={[styles.roleTitle, { color: isDark ? '#D1FAE5' : '#166534' }]}>For Musicians</Text>
                </View>

                <View style={[styles.auditionBanner, { borderColor: isDark ? '#065F46' : '#86EFAC' }]}>
                    <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Active Audition: Keyboardist</Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>We are looking for a keys player for our upcoming tour.</Text>
                </View>

                <View style={{ marginTop: 16 }}>
                    <TouchableOpacity
                        style={[styles.primaryBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary }]}
                        onPress={() => setModalVisible(true)}
                    >
                        <Text style={[styles.primaryBtnText, { color: colors.primary }]}>Apply for Audition</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );

    return (
        <BottomSheetModal
            ref={ref}
            index={1} // Open at 95%
            snapPoints={snapPoints}
            backdropComponent={renderBackdrop}
            backgroundStyle={{ backgroundColor: colors.background }}
            handleIndicatorStyle={{ opacity: 0 }} // Hidden per request
        >
            {loading ? (
                <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : group ? (
                <View style={{ flex: 1 }}>
                    <BottomSheetScrollView
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                        showsHorizontalScrollIndicator={false}
                    >
                        {/* Immersive Hero Image */}
                        <View style={styles.imageContainer}>
                            <Image
                                source={{ uri: (group.images && group.images[0]) || group.image || 'https://images.unsplash.com/photo-1511735111819-a3f7709049c?w=800&fit=crop' }}
                                style={styles.image}
                                resizeMode="cover"
                            />
                            <LinearGradient
                                colors={['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.6)']}
                                style={styles.gradient}
                            />

                            {/* Header Actions */}
                            <View style={styles.headerActions}>
                                <TouchableOpacity
                                    onPress={() => ref?.current?.dismiss()}
                                    style={styles.roundBtn}
                                >
                                    <Ionicons name="close" size={22} color="#000" />
                                </TouchableOpacity>

                                <View style={styles.rightActions}>
                                    <TouchableOpacity style={styles.roundBtn}>
                                        <Ionicons name="share-outline" size={22} color="#000" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={toggleFavorite}
                                        style={styles.roundBtn}
                                    >
                                        <Ionicons name={isFavorited ? "heart" : "heart-outline"} size={22} color={isFavorited ? "#EF4444" : "#000"} />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Hero Identity (Bottom Left of Image) */}
                            <View style={styles.heroIdentity}>
                                {/* Status Tags */}
                                <View style={styles.statusRow}>
                                    {/* Report button could be here */}
                                </View>
                                <Text style={styles.heroTitle}>{group.name}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                    <Ionicons name="location" size={14} color="#FFF" />
                                    <Text style={styles.heroLocation}>{group.location || 'Manila'}</Text>
                                    <Text style={[styles.heroLocation, { marginLeft: 12 }]}>•  {group.genre || 'Music'}</Text>
                                </View>
                            </View>
                        </View>

                        {/* TABS SELECTOR */}
                        {showTabs && renderTabs()}

                        {/* CONTENT BODY */}
                        <View style={[styles.contentBody, { backgroundColor: colors.background }]}>

                            {/* GENERAL RENDERLOGIC */}

                            {/* Group Specific Tabs */}
                            {(group.type === 'Group' || !group.type) && (
                                <>
                                    {(activeTab === 'About' || !showTabs) && renderGroupAbout()}
                                    {activeTab === 'Setup' && renderGroupSetup()}
                                    {activeTab === 'Connect' && renderGroupConnect()}
                                    {activeTab === 'Review' && renderReviews()}
                                </>
                            )}

                            {/* Existing Tabs for Studio/Gig */}
                            {group.type !== 'Group' && group.type && (
                                <>
                                    {activeTab === 'About' && (
                                        <View style={styles.tabContent}>
                                            {/* Stats Row (Gig) */}
                                            {(group.type === 'Gig') && (
                                                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                                                    <View style={[styles.statCard, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
                                                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Budget</Text>
                                                        <Text style={[styles.statValue, { color: colors.text }]}>₱{group.budget || '5,000'}</Text>
                                                    </View>
                                                    <View style={[styles.statCard, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
                                                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Event Date</Text>
                                                        <Text style={[styles.statValue, { color: colors.text }]}>{group.event_date || 'Oct 30'}</Text>
                                                    </View>
                                                </View>
                                            )}

                                            {/* Stats Row (Studio) */}
                                            {(group.type === 'Studio') && (
                                                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                                                    <View style={[styles.statCard, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
                                                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Hourly Rate</Text>
                                                        <Text style={[styles.statValue, { color: colors.text }]}>₱{displayRate}/hr</Text>
                                                    </View>
                                                    <View style={[styles.statCard, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
                                                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Rating</Text>
                                                        <Text style={[styles.statValue, { color: colors.text }]}>{group.rating || '4.9'}</Text>
                                                    </View>
                                                </View>
                                            )}

                                            {/* Description */}
                                            <View style={styles.section}>
                                                <Text style={[styles.sectionTitle, { color: colors.text }]}>{labels.aboutTitle}</Text>
                                                <Text style={[styles.description, { color: colors.textSecondary }]}>
                                                    {group.description || 'No description provided.'}
                                                </Text>
                                            </View>

                                            {/* Deal Card (Gig) */}
                                            {group.type === 'Gig' && (
                                                <View style={[styles.dealCard, { backgroundColor: isDark ? '#1e293b' : '#ECFDF5', borderColor: isDark ? '#064e3b' : '#10B981' }]}>
                                                    <Text style={{ fontFamily: 'Poppins_600SemiBold', color: isDark ? '#6ee7b7' : '#047857', marginBottom: 8 }}>The Deal</Text>
                                                    <Text style={{ fontFamily: 'Poppins_500Medium', color: isDark ? '#d1fae5' : '#065F46' }}>Guarantee + Door Split</Text>
                                                    <Text style={{ fontFamily: 'Poppins_400Regular', color: isDark ? '#d1fae5' : '#065F46', fontSize: 13, marginTop: 4 }}>45 min set • Meal Included</Text>
                                                </View>
                                            )}

                                            {/* Gallery */}
                                            <View style={{ marginTop: 24 }}>
                                                {renderGallery()}
                                            </View>
                                        </View>
                                    )}
                                    {activeTab === 'Setup' && renderStudioSetup()}
                                    {activeTab === 'Book' && renderStudioBook()}
                                    {activeTab === 'Info' && renderGigInfo()}
                                    {activeTab === 'Apply' && renderGigApply()}
                                    {activeTab === 'Review' && renderReviews()}
                                </>
                            )}

                        </View>
                    </BottomSheetScrollView>

                    {/* Bottom Bar for GROUP/Default only - Tabs have their own CTAs */}
                    {!showTabs && (
                        <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
                            <View style={styles.priceContainer}>
                                <Text style={[styles.priceText, { color: colors.text }]}>
                                    ₱{displayRate} <Text style={{ fontSize: 14, fontWeight: '400', color: colors.textSecondary }}>{labels.unit}</Text>
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={[styles.bookBtn, { backgroundColor: colors.primary }]}
                                onPress={() => setModalVisible(true)}
                            >
                                <Text style={styles.bookBtnText}>Reserve</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <Modal
                        visible={modalVisible}
                        onClose={() => setModalVisible(false)}
                        title={group.type === 'Gig' ? "Application Submitted" : "Booking Confirmed"}
                        message={group.type === 'Gig' ? "Your pitch has been sent to the organizer." : "Your booking request has been sent."}
                        buttonText="Okay"
                    />
                </View>
            ) : null}
        </BottomSheetModal>
    );
});

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        height: 300,
    },
    scrollContent: {
        paddingBottom: 100,
        minHeight: '100%',
    },
    imageContainer: {
        height: IMG_HEIGHT,
        width: '100%',
        position: 'relative',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    gradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    headerActions: {
        position: 'absolute',
        top: 16,
        left: 20,
        right: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        zIndex: 10,
    },
    rightActions: {
        flexDirection: 'row',
        gap: 12,
    },
    roundBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#FFF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 4,
    },
    heroIdentity: {
        position: 'absolute',
        bottom: 24,
        left: 24,
        right: 24,
    },
    heroTitle: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 28,
        color: '#FFF',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    heroLocation: {
        color: '#FFF',
        fontFamily: 'Poppins_400Regular',
        fontSize: 14,
        marginLeft: 4,
    },
    statusRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
    },
    // Tabs
    tabsContainer: {
        flexDirection: 'row',
        borderBottomWidth: 1,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
    },
    tabText: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 14,
    },
    contentBody: {
        flex: 1,
        minHeight: 500,
    },
    tabContent: {
        padding: 24,
    },
    // Sections
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 12,
    },
    description: {
        fontSize: 14,
        lineHeight: 22,
    },
    // Stats
    statCard: {
        flex: 1,
        padding: 12,
        borderRadius: 12,
    },
    statLabel: {
        fontSize: 11,
        textTransform: 'uppercase',
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 4,
    },
    statValue: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
    dealCard: {
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        marginTop: 8,
    },
    // Gallery
    galleryContainer: {
        gap: 12,
    },
    galleryImage: {
        width: 160,
        height: 112,
        borderRadius: 12,
        marginRight: 12,
    },
    // Reviews
    reviewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    ratingBig: {
        fontSize: 48,
        fontFamily: 'Poppins_600SemiBold',
        lineHeight: 56,
    },
    reviewsScroll: {
        gap: 16,
        paddingRight: 24,
    },
    reviewCard: {
        width: 280,
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
    },
    reviewUser: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    reviewAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    reviewName: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 14,
    },
    reviewDate: {
        fontSize: 12,
    },
    reviewBody: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 14,
        lineHeight: 20,
    },
    // Setup / Tags
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        marginBottom: 24,
    },
    tagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    tag: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
    },
    // Forms
    inputContainer: {
        marginBottom: 16,
    },
    label: {
        fontFamily: 'Poppins_500Medium',
        marginBottom: 8,
    },
    inputWrapper: {
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12, // For text input centering
        justifyContent: 'center',
    },
    input: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 14,
        padding: 0, // Remove default padding
    },
    dateBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    paymentSummary: {
        padding: 16,
        borderRadius: 16,
        marginBottom: 24,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    divider: {
        height: 1,
        backgroundColor: '#E5E7EB',
        width: '100%',
    },
    primaryBtn: {
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
    },
    primaryBtnText: {
        color: '#FFF',
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 16,
    },
    // Gig Info
    infoCard: {
        flex: 1,
        padding: 16,
        borderRadius: 16,
    },
    infoLabel: {
        fontSize: 11,
        textTransform: 'uppercase',
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 4,
    },
    infoValue: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
    },
    checkRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    // Upload Box
    uploadBox: {
        borderWidth: 1,
        borderStyle: 'dashed',
        borderRadius: 16,
        height: 120,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    // Bottom Bar (Group)
    bottomBar: {
        paddingHorizontal: 24,
        paddingTop: 16,
        paddingBottom: 32,
        borderTopWidth: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    priceContainer: {
        justifyContent: 'center',
    },
    priceText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 18,
    },
    bookBtn: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
    },
    bookBtnText: {
        color: '#FFF',
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 15,
    },
    rowCenter: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    // Manager Card
    managerCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        marginBottom: 8,
    },
    managerLabel: {
        fontSize: 10,
        textTransform: 'uppercase',
    },
    managerName: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 14,
    },
    visitBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
        borderWidth: 1,
    },
    // Stage Plot
    stagePlotPlaceholder: {
        height: 200,
        width: '100%',
        borderRadius: 16,
        borderWidth: 2,
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
    },
    inputRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    // Connect Tab
    roleHeader: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        alignSelf: 'flex-start',
        marginBottom: 16,
    },
    roleTitle: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 12,
        textTransform: 'uppercase',
    },
    auditionBanner: {
        padding: 16,
        borderRadius: 16,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderStyle: 'dashed',
    }
});

export default ListingDetailsSheet;
