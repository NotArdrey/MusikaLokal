import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import React, { forwardRef, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';
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

    // Review State
    const [reviews, setReviews] = useState<any[]>([]);
    const [relatedListings, setRelatedListings] = useState<any[]>([]);

    // Tab State
    const [activeTab, setActiveTab] = useState('About');

    // Booking State
    const [date, setDate] = useState(new Date());
    const [endTime, setEndTime] = useState(() => {
        const d = new Date();
        d.setHours(d.getHours() + 4);
        return d;
    });
    const [showPicker, setShowPicker] = useState(false);
    const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
    const [activeField, setActiveField] = useState<'date' | 'start' | 'end'>('date');
    const [duration, setDuration] = useState(4);

    // Auto-calculate duration
    useEffect(() => {
        const start = new Date(date).getTime();
        const end = new Date(endTime).getTime();
        // Handle cross-day or invalid times? For now simple diff
        // If end is before start, assume next day? Or just show 0.
        // Let's keep it simple: if end < start, maybe just valid hours.
        // Actually, let's normalize the dates to be on the same day as 'date' for calculation if only time changed

        let diff = (end - start) / (1000 * 60 * 60);
        if (diff < 0) diff += 24; // Assume next day if end < start

        // Round to 1 decimal
        setDuration(Math.max(1, parseFloat(diff.toFixed(1))));
    }, [date, endTime]);

    // Confirmation State (reusing modal props logic or simple alerts)
    const [confirmAction, setConfirmAction] = useState<() => void>(() => { });
    const [confirmMessage, setConfirmMessage] = useState('');
    const [confirmTitle, setConfirmTitle] = useState('');

    const handleConfirm = (action: () => void, title: string, message: string) => {
        setConfirmAction(() => action);
        setConfirmTitle(title);
        setConfirmMessage(message);
        setModalVisible(true);
    };

    // Snap points
    const snapPoints = useMemo(() => ['50%', '95%'], []);

    useEffect(() => {
        if (listingId) {
            fetchGroupDetails();
            setActiveTab('About');
            // Reset booking state
            const now = new Date();
            setDate(now);
            const next = new Date(now);
            next.setHours(now.getHours() + 4);
            setEndTime(next);
        }
    }, [listingId]);

    const fetchGroupDetails = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();

            let data = null;
            let type = 'Group';

            // Try Group
            const { data: groupData } = await supabase
                .from('groups_with_stats')
                .select('*, owner_profile:owner_id(full_name, avatar_url, role)')
                .eq('id', listingId)
                .single();

            if (groupData) {
                data = groupData;
                type = 'Group';
            } else {
                // Try Studio
                const { data: studioData } = await supabase
                    .from('studios_with_stats')
                    .select('*, owner_profile:owner_id(full_name, avatar_url, role)')
                    .eq('id', listingId)
                    .single();

                if (studioData) {
                    data = studioData;
                    type = 'Studio';
                    if (studioData.amenities?.includes('Stage')) type = 'Venue';
                } else {
                    // Try Gig
                    const { data: gigData } = await supabase
                        .from('gigs_with_stats')
                        .select('*, organizer_profile:organizer_id(full_name, avatar_url, role)')
                        .eq('id', listingId)
                        .single();

                    if (gigData) {
                        data = gigData;
                        type = 'Gig';
                    }
                }
            }

            if (data) {
                const normalizedData = {
                    ...data,
                    type,
                    owner_name: data.owner_profile?.full_name || data.organizer_profile?.full_name || 'Unknown',
                    owner_avatar: data.owner_profile?.avatar_url || data.organizer_profile?.avatar_url,
                    role: data.owner_profile?.role || data.organizer_profile?.role,
                    rate: data.hourly_rate?.toString() || data.budget?.toString() || data.rate || '0',
                    review_count: data.review_count || 0,
                    rating: data.rating || 0
                };
                setGroup(normalizedData);
            }

        } catch (e) {
            console.log('Error fetching details:', e);
        } finally {
            setLoading(false);
        }
    };


    const toggleFavorite = async () => {
        const nextState = !isFavorited;
        setIsFavorited(nextState);

        // AI LEARNING: If favoriting, update user interest profile
        if (nextState && group && group.embedding) {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    await supabase.rpc('update_user_interest', {
                        p_user_id: user.id,
                        p_item_vector: group.embedding,
                        p_weight: 0.3 // Strong learning signal for explicit favorite
                    });
                    // console.log('AI Learned from Favorite!');
                }
            } catch (e) {
                console.log('Error updating interest:', e);
            }
        }
    };

    // Track View History (AI Signal)
    useEffect(() => {
        const trackView = async () => {
            if (group && group.embedding) {
                try {
                    await AsyncStorage.setItem('last_viewed_item', JSON.stringify({
                        id: listingId,
                        embedding: group.embedding,
                        type: group.type,
                        timestamp: Date.now()
                    }));
                } catch (e) {
                    console.log('Error saving history:', e);
                }
            }
        };
        trackView();
    }, [listingId, group]);

    // Fetch Reviews
    useEffect(() => {
        const fetchDetails = async () => {
            if (!listingId) return;
            try {
                // Determine filter column based on type
                // Note: type might not be set yet if group is null, but we can try common logic or wait for group
                // Better: fetch all reviews linked to this ID if we assume ID is unique across tables?
                // Actually schema has separate columns. We need to know the type or check all cols.
                // However, listingId comes from props.
                // Let's use the `group` type if available or try to infer.
                if (!group) return;

                let col = 'group_id';
                if (group.type === 'Studio') col = 'studio_id';
                if (group.type === 'Gig') col = 'gig_id';

                const { data: rData } = await supabase
                    .from('reviews')
                    .select('*, author:author_id(full_name, avatar_url)')
                    .eq(col, listingId)
                    .order('created_at', { ascending: false })
                    .limit(5);

                if (rData) setReviews(rData);
            } catch (e) {
                console.log('Error reviews:', e);
            }

            // 2. Fetch Related Listings (AI Recommendation)
            if (group.embedding) {
                try {
                    const { data: relatedData, error } = await supabase.rpc('match_listings', {
                        query_embedding: group.embedding,
                        match_threshold: 0.5, // 50% similarity
                        match_count: 5,
                        listing_type: group.type
                    });

                    if (relatedData && relatedData.length > 0) {
                        // Filter out self
                        const relatedIds = relatedData.map((r: any) => r.id).filter((id: string) => id !== listingId);

                        if (relatedIds.length > 0) {
                            // Fetch full details for these IDs from the respective view
                            let viewName = 'groups_with_stats';
                            if (group.type === 'Studio') viewName = 'studios_with_stats';
                            if (group.type === 'Gig') viewName = 'gigs_with_stats';

                            const { data: fullRelated } = await supabase
                                .from(viewName)
                                .select('*')
                                .in('id', relatedIds);

                            if (fullRelated) setRelatedListings(fullRelated);
                        }
                    }
                } catch (e) {
                    console.log('Error fetching related:', e);
                }
            }
        };
        fetchDetails();
    }, [listingId, group]);



    const renderBackdrop = React.useCallback(
        (props: any) => (
            <BottomSheetModal
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
            case 'Venue':
                return {
                    aboutTitle: 'About this venue',
                    tabs: ['About', 'Specs', 'Book', 'Review'],
                    unit: 'event'
                };
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
    const displayRate = group?.rate ? parseInt(group.rate).toLocaleString() : '0';
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

    const onChangePicker = (event: any, selectedValue?: Date) => {
        if (Platform.OS === 'android') {
            setShowPicker(false);
        }
        if (selectedValue) {
            if (activeField === 'date') {
                // Update both start and end date components, keep times
                const newStart = new Date(date);
                newStart.setFullYear(selectedValue.getFullYear(), selectedValue.getMonth(), selectedValue.getDate());
                setDate(newStart);

                const newEnd = new Date(endTime);
                newEnd.setFullYear(selectedValue.getFullYear(), selectedValue.getMonth(), selectedValue.getDate());
                setEndTime(newEnd);

            } else if (activeField === 'start') {
                const newDate = new Date(date);
                newDate.setHours(selectedValue.getHours(), selectedValue.getMinutes());
                setDate(newDate);
            } else if (activeField === 'end') {
                const newEnd = new Date(endTime);
                newEnd.setHours(selectedValue.getHours(), selectedValue.getMinutes());
                // If end time is earlier than start, maybe it's next day? 
                // For UI simplicity, we just update the time part. Logic handles diff.
                setEndTime(newEnd);
            }
        }
    };

    const showPickerBtn = (field: 'date' | 'start' | 'end') => {
        setActiveField(field);
        setPickerMode(field === 'date' ? 'date' : 'time');
        setShowPicker(true);
    };

    const renderBookingControls = () => (
        <View style={styles.pickerSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Schedule Session</Text>

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                <TouchableOpacity
                    style={[styles.nativePickerBtn, { borderColor: colors.border, backgroundColor: isDark ? '#374151' : '#F9FAFB', flex: 1.5 }]}
                    onPress={() => showPickerBtn('date')}
                >
                    <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                    <View>
                        <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>Date</Text>
                        <Text style={[styles.pickerValue, { color: colors.text }]}>
                            {date.toLocaleDateString()}
                        </Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.nativePickerBtn, { borderColor: colors.border, backgroundColor: isDark ? '#374151' : '#F9FAFB', flex: 1 }]}
                    onPress={() => showPickerBtn('start')}
                >
                    <View>
                        <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>Start</Text>
                        <Text style={[styles.pickerValue, { color: colors.text }]}>
                            {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.nativePickerBtn, { borderColor: colors.border, backgroundColor: isDark ? '#374151' : '#F9FAFB', flex: 1 }]}
                    onPress={() => showPickerBtn('end')}
                >
                    <View>
                        <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>End</Text>
                        <Text style={[styles.pickerValue, { color: colors.text }]}>
                            {endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                    </View>
                </TouchableOpacity>
            </View>

            {/* Native Picker Component */}
            {showPicker && (
                <DateTimePicker
                    testID="dateTimePicker"
                    value={activeField === 'end' ? endTime : date}
                    mode={pickerMode}
                    is24Hour={true}
                    onChange={onChangePicker}
                    minimumDate={activeField === 'date' ? new Date() : undefined}
                    style={{ backgroundColor: colors.background }}
                />
            )}

            <View style={[styles.durationWrapper, { backgroundColor: isDark ? '#1F2937' : '#EFF6FF', borderColor: colors.primary, borderWidth: 1 }]}>
                <Ionicons name="time" size={20} color={colors.primary} />
                <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.primary, marginLeft: 8 }}>
                    Duration: {duration} hours
                </Text>
            </View>
        </View>
    );

    const renderDurationControl = () => null; // Removed in favor of computed duration



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

    // Responsive Review Card Width
    const CARD_WIDTH = width * 0.85;

    const renderReviews = () => (
        <View style={[styles.tabContent, { paddingHorizontal: 0 }]}>
            <View style={[styles.reviewHeader, { paddingHorizontal: 24 }]}>
                <Text style={[styles.ratingBig, { color: colors.text }]}>{group.rating ? group.rating.toFixed(1) : '0.0'}</Text>
                <View>
                    <View style={{ flexDirection: 'row' }}>
                        {[1, 2, 3, 4, 5].map(i => (
                            <Ionicons
                                key={i}
                                name={i <= Math.round(group.rating || 0) ? "star" : "star-outline"}
                                size={14}
                                color={colors.primary}
                            />
                        ))}
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{group.review_count || 0} reviews</Text>
                </View>
            </View>

            <View style={[styles.reviewsScroll, { paddingHorizontal: 24 }]}>
                {reviews.length > 0 ? reviews.map((review) => (
                    <View key={review.id} style={[styles.reviewCard, { borderColor: colors.border, width: '100%' }]}>
                        <View style={styles.reviewUser}>
                            <Image source={{ uri: review.author?.avatar_url || 'https://via.placeholder.com/100' }} style={styles.reviewAvatar} />
                            <View>
                                <Text style={[styles.reviewName, { color: colors.text }]}>{review.author?.full_name || 'Anonymous'}</Text>
                                <Text style={[styles.reviewDate, { color: colors.textSecondary }]}>
                                    {new Date(review.created_at).toLocaleDateString()}
                                </Text>
                            </View>
                        </View>
                        <Text style={[styles.reviewBody, { color: colors.text }]}>
                            {review.content}
                        </Text>
                    </View>
                )) : (
                    <Text style={{ color: colors.textSecondary, fontStyle: 'italic' }}>No reviews yet.</Text>
                )}
            </View>

            {/* Related Listings Section (AI Recommendations) */}
            {relatedListings.length > 0 && (
                <View style={[styles.section, { marginTop: 32 }]}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>You Might Also Like</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: 24, paddingRight: 8, gap: 12 }}>
                        {relatedListings.map(item => {
                            // Normalize item for ListingCard
                            const normalizedItem = {
                                ...item,
                                type: group.type, // Assume same type for now or use item.type if available from view
                                image: item.images?.[0] || 'https://via.placeholder.com/300',
                                rate: item.hourly_rate?.toString() || item.budget?.toString() || item.rate || '0',
                                location: item.location || item.address || '',
                            };

                            // We need to import ListingCard or render a mini version
                            // Since ListingCard might not be imported, let's render a mini card inline/simple for now to avoid circular deps or complex imports if not already there.
                            // Actually, let's reuse the logic but render simple.
                            return (
                                <TouchableOpacity
                                    key={item.id}
                                    style={{ width: 160, marginRight: 0 }}
                                    onPress={() => {
                                        // Close current and open new? Or just push new?
                                        // Ideally we just update the listingId prop if possible, but that's controlled by parent.
                                        // For now, let's just log or try to navigate if we had navigation.
                                        console.log('Open related:', item.id);
                                        // In a real app we'd call a prop onListingPress(item.id)
                                    }}
                                >
                                    <Image
                                        source={{ uri: normalizedItem.image }}
                                        style={{ width: 160, height: 100, borderRadius: 8, backgroundColor: colors.border }}
                                    />
                                    <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text, marginTop: 8, fontSize: 13 }} numberOfLines={1}>
                                        {item.name}
                                    </Text>
                                    <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, fontSize: 11 }}>
                                        {normalizedItem.location}
                                    </Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                        <Ionicons name="star" size={12} color={colors.primary} />
                                        <Text style={{ fontSize: 11, color: colors.text, marginLeft: 4, fontFamily: 'Poppins_500Medium' }}>
                                            {item.rating ? item.rating.toFixed(1) : 'New'}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            )}
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
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Amenities</Text>
                <View style={styles.tagsContainer}>
                    {group.amenities && group.amenities.length > 0 ? group.amenities.map((tag: string) => (
                        <View key={tag} style={[styles.tag, { borderColor: colors.border }]}>
                            <Text style={{ color: colors.text, fontSize: 13 }}>{tag}</Text>
                        </View>
                    )) : (
                        <Text style={{ color: colors.textSecondary }}>No specific amenities listed.</Text>
                    )}
                </View>
            </View>

        </View>
    );

    // Studio: Book Tab
    const renderStudioBook = () => (
        <View style={styles.tabContent}>

            {renderBookingControls()}

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
                    <Text style={{ color: colors.text }}>{duration} hrs</Text>
                </View>
                <View style={[styles.divider, { marginVertical: 12 }]} />
                <View style={styles.summaryRow}>
                    <Text style={{ color: colors.text, fontFamily: 'Poppins_600SemiBold' }}>Total</Text>
                    <Text style={{ color: colors.primary, fontFamily: 'Poppins_600SemiBold', fontSize: 18 }}>₱{(parseInt(displayRate.replace(/,/g, '')) * duration).toLocaleString()}</Text>
                </View>
            </View>

            <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                onPress={() => handleConfirm(
                    () => console.log('Confirm Booking'),
                    'Confirm Booking',
                    `Book ${group.name} on ${date.toDateString()}\n${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\nTotal: ₱${(parseInt(displayRate.replace(/,/g, '')) * duration).toLocaleString()}`
                )}
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
                    <Text style={[styles.infoValue, { color: colors.text }]}>Full PA</Text>
                </View>
            </View>

            <View style={[styles.section, { marginTop: 24 }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Tech Specs</Text>
                {/* TODO: Use real data from group.requirements or amenities */}
                {group.requirements && Array.isArray(group.requirements) && group.requirements.length > 0 ? group.requirements.map((spec: string, i: number) => (
                    <View key={i} style={styles.checkRow}>
                        <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                        <Text style={{ color: colors.text, marginLeft: 12 }}>{spec}</Text>
                    </View>
                )) : (
                    <Text style={{ color: colors.textSecondary }}>No specific tech specs listed.</Text>
                )}
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
                onPress={() => handleConfirm(
                    () => console.log('Submitted Application'),
                    'Confirm Application',
                    'Are you sure you want to submit this application including your pitch and video?'
                )}
            >
                <Text style={styles.primaryBtnText}>Submit Application</Text>
            </TouchableOpacity>
        </View>
    );

    // --- GROUP TABS ---

    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [hasExistingVenue, setHasExistingVenue] = useState(false);
    const [checkingVenue, setCheckingVenue] = useState(false);

    // Fetch current user role and ID
    useEffect(() => {
        const fetchUserRole = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setCurrentUserId(user.id);
                const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
                if (data) {
                    setCurrentUserRole(data.role);
                    // If venue-owner, check if they have any gigs uploaded
                    if (data.role === 'venue-owner') {
                        checkForExistingVenue(user.id);
                    }
                }
            }
        };
        fetchUserRole();
    }, []);

    // Check if venue-owner has any gigs/venues uploaded
    const checkForExistingVenue = async (userId: string) => {
        setCheckingVenue(true);
        try {
            const { data, error } = await supabase
                .from('gigs')
                .select('id')
                .eq('organizer_id', userId)
                .limit(1);
            
            if (!error && data && data.length > 0) {
                setHasExistingVenue(true);
            } else {
                setHasExistingVenue(false);
            }
        } catch (e) {
            console.log('Error checking venue:', e);
            setHasExistingVenue(false);
        } finally {
            setCheckingVenue(false);
        }
    };

    const handleProfileNavigation = () => {
        // Implementation for navigation
        // If owner -> Edit/Manage
        // If visitor -> View Profile
        // For now, we'll just log the action as the routes might need to be confirmed
        if (group.owner_id === currentUserId) {
            console.log('Navigate to Manage Profile/Edit Listing');
            // router.push('/profile/manage');
        } else {
            console.log('Navigate to Public Profile', group.owner_id);
            // router.push(`/profile/${group.owner_id}`);
        }
    };

    // Helper to calculate profile completion
    const calculateCompletion = () => {
        let score = 0;
        let total = 5;
        if (group.name) score++;
        if (group.owner_avatar || group.image) score++;
        if (group.description && group.description.length > 20) score++;
        if (group.location) score++;
        if (group.images && group.images.length > 1) score++;

        return Math.round((score / total) * 100);
    };

    // Group: About Tab
    const renderGroupAbout = () => {
        const completionRate = calculateCompletion();

        return (
            <View style={styles.tabContent}>
                {/* Bio Card */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Bio</Text>
                    <Text style={[styles.description, { color: colors.textSecondary }]}>
                        {group.description || 'No description provided.'}
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
                        <Text style={[styles.statValue, { color: colors.text }]}>{group.rating ? group.rating.toFixed(1) : '-'}</Text>
                    </View>
                </View>

                {/* Managed By & Completion Rate */}
                <View style={[styles.managerCard, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
                    <View style={{ marginBottom: 16 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <Image source={{ uri: group.owner_avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&fit=crop' }} style={styles.hostAvatar} />
                            <View>
                                <Text style={[styles.managerLabel, { color: colors.textSecondary }]}>Managed by</Text>
                                <Text style={[styles.managerName, { color: colors.text }]}>{group.owner_name || 'Unknown User'}</Text>
                            </View>
                        </View>

                        {/* Completion Rate Indicator */}
                        <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ flex: 1, height: 6, backgroundColor: isDark ? '#374151' : '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
                                <View style={{ width: `${completionRate}%`, height: '100%', backgroundColor: completionRate === 100 ? '#10B981' : colors.primary }} />
                            </View>
                            <Text style={{ fontSize: 11, fontFamily: 'Poppins_600SemiBold', color: completionRate === 100 ? '#10B981' : colors.textSecondary }}>
                                {completionRate}% Complete
                            </Text>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={[styles.visitBtn, { borderColor: colors.primary }]}
                        onPress={handleProfileNavigation}
                    >
                        <Text style={{ color: colors.primary, fontSize: 12, fontFamily: 'Poppins_600SemiBold' }}>
                            {group.owner_id === currentUserId ? 'Manage Profile' : 'Visit Profile'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    // ... (rest of the render methods) ...

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

            {/* Input List - Placeholder for now until DB field exists */}
            {/* <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Input List</Text>
             <Text style={{ color: colors.textSecondary }}>No input list available.</Text>
        </View> */}

            {/* Hospitality */}
            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Hospitality Rider</Text>
                <Text style={[styles.description, { color: colors.textSecondary }]}>
                    No specific hospitality requirements listed.
                </Text>
            </View>
        </View>
    );

    // Handler for Send Request button with venue check
    const handleSendBookingRequest = () => {
        // Check if venue-owner has a venue uploaded
        if (currentUserRole === 'venue-owner' && !hasExistingVenue) {
            handleConfirm(
                () => {
                    // Navigate to add gig/venue page
                    const router = require('expo-router').router;
                    router.push('/add_gig');
                },
                'No Venue Found',
                'You need to create a venue first before sending booking requests. Would you like to create one now?'
            );
            return;
        }

        // Proceed with normal booking request
        handleConfirm(
            () => console.log('Sent Request'),
            'Send Booking Request',
            'Are you sure you want to send this booking request to the artist?'
        );
    };

    // Group: Connect Tab
    const renderGroupConnect = () => (
        <View style={styles.tabContent}>
            {/* Show Booking Request for Venues/Organizers OR if role is unknown/not logged in (fallback) */}
            {(!currentUserRole || currentUserRole === 'venue-owner' || currentUserRole === 'studio-owner') && (
                <View style={styles.section}>
                    <View style={{ marginTop: 0 }}>
                        {renderBookingControls()}

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
                            onPress={handleSendBookingRequest}
                            disabled={checkingVenue}
                        >
                            <Text style={styles.primaryBtnText}>
                                {checkingVenue ? 'Checking...' : 'Send Request'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Show Audition for Musicians OR if role is unknown */}
            {(!currentUserRole || currentUserRole === 'musician') && (
                <View style={[styles.section, (!currentUserRole || currentUserRole === 'venue-owner') && { marginTop: 32 }]}>
                    {currentUserRole === 'musician' && (
                        <>
                            <View style={[styles.auditionBanner, { borderColor: isDark ? '#065F46' : '#86EFAC' }]}>
                                <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Active Audition: Keyboardist</Text>
                                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>We are looking for a keys player for our upcoming tour.</Text>
                            </View>

                            <View style={{ marginTop: 16 }}>
                                <TouchableOpacity
                                    style={[styles.primaryBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary }]}
                                    onPress={() => handleConfirm(
                                        () => console.log('Applied for Audition'),
                                        'Apply for Audition',
                                        'Confirm your application for the Keyboardist position?'
                                    )}
                                >
                                    <Text style={[styles.primaryBtnText, { color: colors.primary }]}>Apply for Audition</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    )}
                </View>
            )}
        </View>
    );

    return (
        <BottomSheetModal
            ref={ref}
            index={1} // Open at 95%
            snapPoints={snapPoints}
            backdropComponent={renderBackdrop}
            backgroundStyle={{ backgroundColor: colors.background }}
            handleComponent={null} // Remove the default handle to remove gap
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
                            <View style={[styles.headerActions, { paddingTop: 20 }]}>
                                <TouchableOpacity
                                    onPress={() => (ref as any)?.current?.dismiss()}
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
                                                        <Text style={[styles.statValue, { color: colors.text }]}>
                                                            {group.event_date ? new Date(group.event_date).toLocaleDateString(undefined, {
                                                                weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
                                                            }) : 'TBA'}
                                                        </Text>
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
                                                        <Text style={[styles.statValue, { color: colors.text }]}>{group.rating ? group.rating.toFixed(1) : '-'}</Text>
                                                    </View>
                                                    <View style={[styles.statCard, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
                                                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Completion</Text>
                                                        <Text style={[styles.statValue, { color: colors.text }]}>{group.completion_rate !== undefined ? `${group.completion_rate}%` : '--'}</Text>
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

                                            {/* Managed By & Completion Rate (Shared-like Component) */}
                                            <View style={[styles.managerCard, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, marginBottom: 24 }]}>
                                                <View style={{ marginBottom: 16 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                                        <Image source={{ uri: group.owner_avatar || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&fit=crop' }} style={styles.hostAvatar} />
                                                        <View>
                                                            <Text style={[styles.managerLabel, { color: colors.textSecondary }]}>
                                                                {group.type === 'Gig' ? 'Organized by' : 'Managed by'}
                                                            </Text>
                                                            <Text style={[styles.managerName, { color: colors.text }]}>{group.owner_name || 'Unknown User'}</Text>
                                                        </View>
                                                    </View>

                                                    {/* Completion Rate Indicator - Unified */}
                                                    <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                        <View style={{ flex: 1, height: 6, backgroundColor: isDark ? '#374151' : '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
                                                            <View style={{
                                                                width: `${group.completion_rate !== undefined ? group.completion_rate : calculateCompletion()}%`,
                                                                height: '100%',
                                                                backgroundColor: (group.completion_rate !== undefined ? group.completion_rate : calculateCompletion()) >= 90 ? '#10B981' : colors.primary
                                                            }} />
                                                        </View>
                                                        <Text style={{
                                                            fontSize: 11,
                                                            fontFamily: 'Poppins_600SemiBold',
                                                            color: (group.completion_rate !== undefined ? group.completion_rate : calculateCompletion()) >= 90 ? '#10B981' : colors.textSecondary
                                                        }}>
                                                            {group.completion_rate !== undefined ? group.completion_rate : calculateCompletion()}% Complete
                                                        </Text>
                                                    </View>
                                                </View>

                                                <TouchableOpacity
                                                    style={[styles.visitBtn, { borderColor: colors.primary }]}
                                                    onPress={handleProfileNavigation}
                                                >
                                                    <Text style={{ color: colors.primary, fontSize: 12, fontFamily: 'Poppins_600SemiBold' }}>
                                                        {group.owner_id === currentUserId ? 'Manage Profile' : 'Visit Profile'}
                                                    </Text>
                                                </TouchableOpacity>
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
                                onPress={() => handleConfirm(
                                    () => console.log('Group Reserved'),
                                    'Reserve Artist',
                                    'Confirm reservation request?'
                                )}
                            >
                                <Text style={styles.bookBtnText}>Reserve</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <Modal
                        visible={modalVisible}
                        onClose={() => setModalVisible(false)}
                        onConfirm={() => {
                            setModalVisible(false);
                            confirmAction();
                        }}
                        title={confirmTitle}
                        message={confirmMessage}
                        buttonText="Confirm"
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
    // Picker / Booking Widgets
    pickerSection: {
        marginBottom: 24,
    },
    nativePickerBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        gap: 12,
    },
    pickerLabel: {
        fontSize: 10,
        textTransform: 'uppercase',
        fontFamily: 'Poppins_600SemiBold',
    },
    pickerValue: {
        fontSize: 15,
        fontFamily: 'Poppins_500Medium',
    },
    durationWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
    },
    durationBtn: {
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 24,
        backgroundColor: 'rgba(128,128,128,0.1)',
    },
    durationVal: {
        fontSize: 20,
        fontFamily: 'Poppins_600SemiBold',
    },

    // Reviews
    reviewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 24,
    },
    ratingBig: {
        fontSize: 56,
        fontFamily: 'Poppins_600SemiBold',
        lineHeight: 64,
        letterSpacing: -1,
    },
    reviewsScroll: {
        gap: 16,
        paddingRight: 24,
    },
    reviewCard: {
        width: '100%',
        padding: 20,
        borderRadius: 24,
        borderWidth: 1,
    },
    reviewUser: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16,
    },
    reviewAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
    },
    reviewName: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 15,
    },
    reviewDate: {
        fontSize: 12,
        opacity: 0.7,
    },
    reviewBody: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 14,
        lineHeight: 22,
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
    hostAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
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
