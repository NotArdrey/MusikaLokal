import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { forwardRef, useEffect, useMemo, useState } from 'react';
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
import { Calendar } from 'react-native-calendars';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import CustomAlert from './CustomAlert';
import Modal from './modal';
import VideoUploader from './VideoUploader';

const { width, height } = Dimensions.get('window');
const IMG_HEIGHT = height < 700 ? height * 0.3 : height * 0.35;

// Responsive scaling utilities - optimized for iPhone SE and smaller devices
const scale = (size: number) => {
    const newSize = (width / 375) * size;
    return Math.max(newSize, size * 0.85);
};
const verticalScale = (size: number) => {
    const baseHeight = 812;
    const ratio = height / baseHeight;
    const clampedRatio = Math.max(0.8, Math.min(1.2, ratio));
    return size * clampedRatio;
};
const moderateScale = (size: number, factor = 0.3) => {
    const scaled = scale(size);
    return size + (scaled - size) * factor;
};

interface ListingDetailsSheetProps {
    listingId: string | null;
}

const formatTime12 = (time24: string) => {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':');
    const h = parseInt(hours, 10);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${suffix}`;
};

const ListingDetailsSheet = forwardRef<BottomSheetModal, ListingDetailsSheetProps>(({ listingId }, ref) => {
    const { colors, isDark } = useTheme();
    const { userId } = useAuth();
    const [loading, setLoading] = useState(false);
    const [group, setGroup] = useState<any>(null);
    const [isFavorited, setIsFavorited] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [bookingNotes, setBookingNotes] = useState('');

    // Application State (for Gig applications)
    const [pitchMessage, setPitchMessage] = useState('');
    const [videoUrl, setVideoUrl] = useState('');
    const [isSubmittingApplication, setIsSubmittingApplication] = useState(false);
    const [hasExistingApplication, setHasExistingApplication] = useState(false);
    const [existingApplicationStatus, setExistingApplicationStatus] = useState<string | null>(null);

    // Studio Booking State (prevent spam)
    const [hasExistingStudioBooking, setHasExistingStudioBooking] = useState(false);
    const [existingStudioBookingStatus, setExistingStudioBookingStatus] = useState<string | null>(null);

    // Group Selection State (for gig applications)
    const [userGroups, setUserGroups] = useState<any[]>([]);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [loadingGroups, setLoadingGroups] = useState(false);

    // Spam Block State
    const [isBlocked, setIsBlocked] = useState(false);
    const [blockReason, setBlockReason] = useState<string | null>(null);

    // Alert State
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState<{
        type: 'success' | 'error' | 'warning' | 'info';
        title: string;
        message: string;
    }>({ type: 'info', title: '', message: '' });

    // Review State
    const [reviews, setReviews] = useState<any[]>([]);
    const [existingBookings, setExistingBookings] = useState<any[]>([]); // Bookings from DB
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
    const [duration, setDuration] = useState(4);

    // New Calendar and Slot State
    const [selectedDate, setSelectedDate] = useState('');
    const [availableSlots, setAvailableSlots] = useState<string[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
    const [markedDates, setMarkedDates] = useState<any>({});

    // Multiple bookings state with pricing
    const [bookings, setBookings] = useState<{ date: Date; startTime: Date; endTime: Date; pricing?: any }[]>([]);
    const [showAddBooking, setShowAddBooking] = useState(false);
    const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);

    // Auto-calculate duration
    useEffect(() => {
        if (!date || !endTime) {
            setDuration(0);
            return;
        }

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
        console.log('🔵 handleConfirm called');
        console.log('Title:', title);
        console.log('Message:', message);
        console.log('Action function:', action.name || 'anonymous');
        setConfirmAction(() => action);
        setConfirmTitle(title);
        setConfirmMessage(message);
        setModalVisible(true);
        console.log('Modal should now be visible');
    };

    // Check if user has already applied to this gig
    const checkExistingApplication = async () => {
        if (!userId || !listingId || !group || group.type !== 'Gig') return;

        try {
            // Check for any existing application by this user (either personal or via any group)
            const { data, error } = await supabase
                .from('gig_applications')
                .select('id, status, group_id')
                .eq('applicant_id', userId)
                .eq('gig_id', listingId)
                .maybeSingle();

            if (error) {
                console.error('Error checking existing application:', error);
                return;
            }

            if (data) {
                console.log('📋 User has already applied to this gig:', data);
                setHasExistingApplication(true);
                setExistingApplicationStatus(data.status);
            } else {
                setHasExistingApplication(false);
                setExistingApplicationStatus(null);
            }
        } catch (err) {
            console.error('Error checking application:', err);
        }
    };

    // Fetch user's groups for gig application
    const fetchUserGroups = async () => {
        if (!userId || !group || group.type !== 'Gig') return;

        setLoadingGroups(true);
        try {
            const { data, error } = await supabase
                .from('groups')
                .select('id, name, images, genre')
                .eq('owner_id', userId);

            if (error) {
                console.error('Error fetching user groups:', error);
                return;
            }

            setUserGroups(data || []);
        } catch (err) {
            console.error('Error fetching groups:', err);
        } finally {
            setLoadingGroups(false);
        }
    };

    // Check if user has an existing booking for this studio
    const checkExistingStudioBooking = async () => {
        if (!userId || !listingId || !group || group.type !== 'Studio') return;

        try {
            // Check for any recent booking (pending, confirmed, or cancelled)
            const { data, error } = await supabase
                .from('studio_bookings')
                .select('id, status, booking_date')
                .eq('user_id', userId)
                .eq('studio_id', listingId)
                .in('status', ['pending', 'confirmed', 'cancelled'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) {
                console.error('Error checking existing studio booking:', error);
                return;
            }

            if (data) {
                console.log('📋 User has an existing booking for this studio:', data);
                setHasExistingStudioBooking(true);
                setExistingStudioBookingStatus(data.status);
            } else {
                setHasExistingStudioBooking(false);
                setExistingStudioBookingStatus(null);
            }
        } catch (err) {
            console.error('Error checking studio booking:', err);
        }
    };

    // Check Eligibility (Spam Block)
    const checkEligibility = async (organizerId: string) => {
        if (!userId || !organizerId) return;
        try {
            const { data, error } = await supabase.functions.invoke('manage-listings', {
                body: { action: 'check_eligibility', userId, organizerId }
            });
            if (error) throw error;

            if (data && data.blocked) {
                setIsBlocked(true);
                setBlockReason(data.reason);
            } else {
                setIsBlocked(false);
                setBlockReason(null);
            }
        } catch (err) {
            console.error('Error checking eligibility:', err);
        }
    };

    // Handle Submit Application for Gigs
    const handleSubmitApplication = async () => {
        console.log('=== handleSubmitApplication CALLED ===');
        console.log('userId:', userId);
        console.log('listingId:', listingId);
        console.log('group:', group);
        console.log('pitchMessage:', pitchMessage);
        console.log('videoUrl:', videoUrl);

        if (!userId || !listingId || !group) {
            console.error('Missing required data for application:', { userId, listingId, group });
            return;
        }

        // Check if user already applied
        if (hasExistingApplication) {
            setAlertConfig({
                type: 'warning',
                title: 'Already Applied',
                message: `You have already submitted an application for this gig. Status: ${existingApplicationStatus || 'pending'}.`
            });
            setAlertVisible(true);
            return;
        }

        setIsSubmittingApplication(true);
        console.log('Inserting application into database...');

        try {
            const { data, error } = await supabase
                .from('gig_applications')
                .insert({
                    applicant_id: userId,
                    gig_id: listingId,
                    group_id: selectedGroupId || null,
                    pitch_message: pitchMessage,
                    video_url: videoUrl || null,
                    status: 'pending'
                })
                .select()
                .single();

            if (error) {
                console.error('Error submitting application:', error);
                console.error('Error details:', JSON.stringify(error, null, 2));
                setAlertConfig({
                    type: 'error',
                    title: 'Submission Failed',
                    message: error.message || 'Failed to submit application. Please try again.'
                });
                setAlertVisible(true);
                return;
            }

            console.log('✅ Application submitted successfully!', data);

            // Update application status
            setHasExistingApplication(true);
            setExistingApplicationStatus('pending');

            // Show success alert
            setAlertConfig({
                type: 'success',
                title: 'Application Submitted!',
                message: 'Your application has been submitted successfully. The venue owner will review it and get back to you soon.'
            });
            setAlertVisible(true);

            // Clear form
            setPitchMessage('');
            setVideoUrl('');

            // Close the bottom sheet after alert is dismissed
            setTimeout(() => {
                if (ref && 'current' in ref && ref.current) {
                    ref.current.dismiss();
                }
            }, 2500);
        } catch (err) {
            console.error('Unexpected error:', err);
        } finally {
            setIsSubmittingApplication(false);
        }
    };

    // Snap points
    const snapPoints = useMemo(() => ['50%', '95%'], []);

    useEffect(() => {
        console.log('=== ListingDetailsSheet useEffect triggered ===');
        console.log('listingId:', listingId);
        if (listingId) {
            console.log('Fetching group details for:', listingId);
            fetchGroupDetails();
            setActiveTab('About');
            // Reset booking state
            setDate(null as any);
            setEndTime(null as any);
            setBookings([]);
            setBookingNotes('');
            // Reset application state
            setPitchMessage('');
            setVideoUrl('');
            setHasExistingApplication(false);
            setExistingApplicationStatus(null);
            // Reset studio booking state
            setHasExistingStudioBooking(false);
            setExistingStudioBookingStatus(null);
            // Reset group selection state
            setSelectedGroupId(null);
            setUserGroups([]);
            console.log('Application form reset');
            setShowAddBooking(false);
        }
    }, [listingId]);

    // Check for existing application when group data is loaded
    useEffect(() => {
        if (group && userId && group.type === 'Gig') {
            checkExistingApplication();
            fetchUserGroups();
        }
    }, [group, userId]);

    // Check for existing studio booking when group data is loaded
    useEffect(() => {
        if (group && userId && group.type === 'Studio') {
            checkExistingStudioBooking();
        }
        // Check eligibility if Gig (uses organizer_id)
        if (group && userId && group.type === 'Gig' && group.organizer_id) {
            checkEligibility(group.organizer_id);
        }
    }, [group, userId]);

    // Debug effect to monitor application state changes
    useEffect(() => {
        console.log('📝 Application State Updated:');
        console.log('  - pitchMessage:', pitchMessage);
        console.log('  - videoUrl:', videoUrl);
        console.log('  - isSubmittingApplication:', isSubmittingApplication);
    }, [pitchMessage, videoUrl, isSubmittingApplication]);

    // Debug effect to monitor userId changes
    useEffect(() => {
        console.log('👤 userId changed:', userId);
    }, [userId]);

    const fetchGroupDetails = async () => {
        console.log('=== fetchGroupDetails called ===');
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            console.log('User:', user?.id);

            let data = null;
            let type = 'Group';
            let ownerId = null;

            // Try Group
            const { data: groupData } = await supabase
                .from('groups_with_stats')
                .select('*')
                .eq('id', listingId)
                .single();

            if (groupData) {
                data = groupData;
                type = 'Group';
                ownerId = groupData.owner_id;
            } else {
                // Try Studio
                const { data: studioData } = await supabase
                    .from('studios_with_stats')
                    .select('*')
                    .eq('id', listingId)
                    .single();

                if (studioData) {
                    data = studioData;
                    type = 'Studio';
                    ownerId = studioData.owner_id;
                    if (studioData.amenities?.includes('Stage')) type = 'Venue';
                } else {
                    // Try Gig
                    const { data: gigData } = await supabase
                        .from('gigs_with_stats')
                        .select('*')
                        .eq('id', listingId)
                        .single();

                    if (gigData) {
                        data = gigData;
                        type = 'Gig';
                        ownerId = gigData.organizer_id;
                    }
                }
            }

            if (data && ownerId) {
                console.log('Found data:', { type, id: data.id, name: data.name });
                // Fetch owner profile separately
                const { data: ownerProfile } = await supabase
                    .from('profiles')
                    .select('full_name, avatar_url, role')
                    .eq('id', ownerId)
                    .single();
                console.log('Owner profile:', ownerProfile);

                const normalizedData = {
                    ...data,
                    type,
                    owner_name: ownerProfile?.full_name || 'Unknown',
                    owner_avatar: ownerProfile?.avatar_url,
                    role: ownerProfile?.role,
                    rate: data.hourly_rate?.toString() || data.budget?.toString() || data.rate || '0',
                    review_count: data.review_count || 0,
                    rating: data.rating || 0
                };

                // If studio, fetch availability from operating hours
                if (type === 'Studio') {
                    console.log('📅 Fetching studio operating hours...');
                    const { data: operatingHours, error: hoursError } = await supabase
                        .from('studio_operating_hours')
                        .select('*')
                        .eq('studio_id', data.id);

                    if (!hoursError && operatingHours) {
                        console.log('📅 Operating hours fetched:', operatingHours);
                        // Convert operating hours to availability format
                        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                        const availability = dayNames.map((dayName, index) => {
                            const dayHours = operatingHours.filter((h: any) => h.day_of_week === index && h.is_open);
                            return {
                                day: dayName,
                                slots: dayHours.map((h: any) => ({
                                    start: h.open_time,
                                    end: h.close_time
                                }))
                            };
                        });
                        normalizedData.availability = availability;
                        console.log('📅 Converted availability:', availability);
                    } else if (!data.availability) {
                        console.log('⚠️ No operating hours found, checking availability column...');
                        // Fallback: check if availability exists in the data (JSONB column)
                        if (data.availability) {
                            normalizedData.availability = data.availability;
                            console.log('📅 Using availability from JSONB column:', data.availability);
                        }
                    }
                }

                console.log('Setting group data:', normalizedData);
                setGroup(normalizedData);

                // Fetch existing bookings for availability calculation
                const { data: bookingData } = await supabase.functions.invoke('manage-listings', {
                    body: { action: 'fetch_studio_bookings', studioId: data.id }
                });
                const fetchedBookings = bookingData || [];
                setExistingBookings(fetchedBookings);

                // Process availability (Availability + Bookings)
                if (normalizedData.availability) {
                    console.log('📅 Processing availability for calendar...');
                    processAvailability(normalizedData.availability, fetchedBookings);
                } else {
                    console.log('⚠️ No availability data to process');
                }
            } else {
                console.log('No data found for listingId:', listingId);
            }

        } catch (e) {
            console.log('Error fetching details:', e);
        } finally {
            setLoading(false);
            console.log('fetchGroupDetails complete, loading:', false);
        }
    };


    const processAvailability = (availability: any[], bookings: any[]) => {
        console.log('📅 processAvailability called with:', { availability, bookingsCount: bookings.length });
        const marked: any = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Map availability for easier lookup
        const availabilityMap: { [key: number]: any } = {};
        availability.forEach((daySchedule: any) => {
            const dayIndex = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(daySchedule.day.toLowerCase());
            if (dayIndex !== -1) {
                availabilityMap[dayIndex] = daySchedule;
                console.log(`📅 Mapped ${daySchedule.day} (index ${dayIndex}) with ${daySchedule.slots?.length || 0} slots`);
            }
        });

        console.log('📅 Availability map:', availabilityMap);

        // Loop next 90 days to ensure coverage
        for (let i = 0; i < 90; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            const dayIndex = date.getDay();

            const daySchedule = availabilityMap[dayIndex];

            // Check if Open
            if (daySchedule && daySchedule.slots && daySchedule.slots.length > 0) {
                // Calculate if Fully Booked
                // 1. Generate all potential slots for this day
                const potentialSlots: string[] = [];
                daySchedule.slots.forEach((slot: any) => {
                    const start = new Date(`${dateStr}T${slot.start}`);
                    const end = new Date(`${dateStr}T${slot.end}`);
                    const current = new Date(start);
                    while (current < end) {
                        potentialSlots.push(current.toTimeString().slice(0, 5));
                        current.setHours(current.getHours() + 1);
                    }
                });

                // 2. Check bookings for this day (Confirmed OR Pending should block)
                const dayBookings = bookings.filter((b: any) =>
                    b.status !== 'cancelled' && new Date(b.start_time).toISOString().split('T')[0] === dateStr
                );

                // 3. Mark slots as taken
                // Simple logic: If booking starts at X, that slot is taken.
                // NOTE: This assumes 1-hour alignment. For robust check, we need range overlap.
                const bookedSlots = dayBookings.map((b: any) =>
                    new Date(b.start_time).toTimeString().slice(0, 5)
                );

                // If duration > 1, we might need to block multiple slots, but stored bookings have start_time.
                // Robustness: A booking usually blocks its entire duration.
                // Let's refine: For each booking, block all slots covered by it.
                const blockedTimes = new Set<string>();
                dayBookings.forEach((b: any) => {
                    const bStart = new Date(b.start_time);
                    const bEnd = new Date(b.end_time);
                    const current = new Date(bStart);
                    while (current < bEnd) {
                        blockedTimes.add(current.toTimeString().slice(0, 5));
                        current.setHours(current.getHours() + 1);
                    }
                });

                const availableCount = potentialSlots.filter(s => !blockedTimes.has(s)).length;

                if (availableCount > 0) {
                    marked[dateStr] = {
                        marked: true,
                        dotColor: colors.primary
                    };
                } else {
                    // Fully Booked
                    marked[dateStr] = {
                        disabled: true,
                        disableTouchEvent: true,
                        textColor: isDark ? '#4B5563' : '#D1D5DB',
                    };
                }
            } else {
                // Close / Unavailable
                marked[dateStr] = {
                    disabled: true,
                    disableTouchEvent: true,
                    textColor: isDark ? '#4B5563' : '#D1D5DB', // Gray out
                };
            }
        }

        console.log('📅 Marked dates count:', Object.keys(marked).length);
        console.log('📅 Sample marked dates:', Object.keys(marked).slice(0, 5));
        setMarkedDates(marked);
    };

    const fetchAvailableSlots = async (dateStr: string) => {
        console.log('🕐 fetchAvailableSlots called for date:', dateStr);
        console.log('🕐 group.availability:', group?.availability);

        if (!group?.availability) {
            console.log('⚠️ No availability data in group');
            return;
        }

        const selectedDate = new Date(dateStr);
        const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][selectedDate.getDay()];
        console.log('🕐 Looking for day:', dayName);

        const daySchedule = group.availability.find((a: any) => a.day.toLowerCase() === dayName);
        console.log('🕐 Found day schedule:', daySchedule);

        if (!daySchedule || !daySchedule.slots) {
            console.log('⚠️ No slots for this day');
            setAvailableSlots([]);
            return;
        }

        // Generate time slots from the availability
        const slots: string[] = [];

        // Identify blocked times from existing bookings (Confirmed OR Pending)
        const dayBookings = existingBookings.filter((b: any) =>
            b.status !== 'cancelled' && new Date(b.start_time).toISOString().split('T')[0] === dateStr
        );
        console.log('🕐 Day bookings:', dayBookings.length);

        const blockedTimes = new Set<string>();
        dayBookings.forEach((b: any) => {
            const bStart = new Date(b.start_time);
            const bEnd = new Date(b.end_time);
            const current = new Date(bStart);
            while (current < bEnd) {
                blockedTimes.add(current.toTimeString().slice(0, 5));
                current.setHours(current.getHours() + 1);
            }
        });

        daySchedule.slots.forEach((slot: any) => {
            console.log('🕐 Processing slot:', slot);
            const start = new Date(`${dateStr}T${slot.start}`);
            const end = new Date(`${dateStr}T${slot.end}`);

            // Generate hourly slots or based on duration
            const current = new Date(start);
            while (current < end) {
                const timeStr = current.toTimeString().slice(0, 5); // HH:MM
                // Only add if not blocked
                if (!blockedTimes.has(timeStr)) {
                    slots.push(timeStr);
                }
                current.setHours(current.getHours() + 1); // Assuming 1-hour slots
            }
        });

        console.log('🕐 Generated slots:', slots);
        setAvailableSlots(slots);
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

    const renderBookingControls = () => (
        <View style={[styles.bookingContainer, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF', borderColor: colors.border, borderWidth: 1, borderRadius: 16, overflow: 'hidden', padding: 16, marginBottom: 24 }]}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={[styles.sectionTitle, { color: colors.text, fontSize: 16, marginBottom: 0 }]}>Select Date & Time</Text>
                {duration > 0 && (
                    <View style={[styles.durationBadge, { backgroundColor: isDark ? 'rgba(124, 58, 237, 0.15)' : 'rgba(124, 58, 237, 0.1)' }]}>
                        <Ionicons name="time-outline" size={14} color={colors.primary} />
                        <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary, marginLeft: 4, fontSize: 12 }}>
                            {duration}h Session
                        </Text>
                    </View>
                )}
            </View>

            {/* 1. The Calendar (The Anchor) */}
            <Calendar
                current={new Date().toISOString().split('T')[0]}
                minDate={new Date().toISOString().split('T')[0]}
                markedDates={{
                    ...markedDates,
                    [selectedDate]: {
                        selected: true,
                        selectedColor: colors.primary,
                        selectedTextColor: '#FFFFFF',
                        customStyles: {
                            container: {
                                backgroundColor: colors.primary,
                                elevation: 2
                            },
                            text: {
                                fontWeight: 'bold'
                            }
                        }
                    }
                }}
                onDayPress={(day) => {
                    setSelectedDate(day.dateString);
                    setSelectedSlot(null);
                    fetchAvailableSlots(day.dateString);
                    // Update date state
                    const selectedDateObj = new Date(day.dateString);
                    setDate(selectedDateObj);
                }}
                theme={{
                    backgroundColor: 'transparent',
                    calendarBackground: 'transparent',
                    textSectionTitleColor: colors.textSecondary,
                    selectedDayBackgroundColor: colors.primary,
                    selectedDayTextColor: '#FFFFFF',
                    todayTextColor: colors.primary,
                    dayTextColor: colors.text,
                    textDisabledColor: isDark ? '#4B5563' : '#D1D5DB',
                    dotColor: colors.primary,
                    selectedDotColor: '#FFFFFF',
                    arrowColor: colors.primary,
                    monthTextColor: colors.text,
                    indicatorColor: colors.primary,
                    textDayFontFamily: 'Poppins_500Medium',
                    textMonthFontFamily: 'Poppins_600SemiBold',
                    textDayHeaderFontFamily: 'Poppins_500Medium',
                    textDayFontSize: 14,
                    textMonthFontSize: 16,
                    textDayHeaderFontSize: 12
                }}
                enableSwipeMonths={true}
                style={{
                    marginBottom: selectedDate ? 16 : 0
                }}
            />

            {/* 2. The Slot Grid (The Action) - Reveals on Date Selection */}
            {selectedDate && (
                <View style={[styles.slotGridContainer, { borderTopWidth: 1, borderTopColor: isDark ? '#374151' : '#F3F4F6', paddingTop: 16 }]}>
                    <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.textSecondary, fontSize: 13, marginBottom: 12 }}>
                        Available Slots for {new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                    </Text>

                    {availableSlots.length > 0 ? (
                        <View style={styles.slotGrid}>
                            {availableSlots.map((slot, index) => {
                                const isSelected = selectedSlot === slot;
                                return (
                                    <TouchableOpacity
                                        key={index}
                                        style={[
                                            styles.slotButton,
                                            {
                                                backgroundColor: isSelected ? (isDark ? 'rgba(124, 58, 237, 0.15)' : 'rgba(124, 58, 237, 0.1)') : (isDark ? '#374151' : '#F3F4F6'),
                                                borderColor: isSelected ? (colors.primary === '#7c3aed' ? '#FFD700' : colors.primary) : 'transparent', // Gold-ish border if primary is purple, or just primary
                                                borderWidth: isSelected ? 2 : 0,
                                                shadowColor: isSelected ? (colors.primary === '#7c3aed' ? '#FFD700' : colors.primary) : 'transparent',
                                                shadowOffset: { width: 0, height: 0 },
                                                shadowOpacity: isSelected ? 0.5 : 0,
                                                shadowRadius: 8,
                                                elevation: isSelected ? 5 : 0
                                            }
                                        ]}
                                        onPress={() => {
                                            setSelectedSlot(slot);
                                            // Update start time
                                            const [hours, minutes] = slot.split(':');
                                            const startDate = new Date(selectedDate);
                                            startDate.setHours(parseInt(hours), parseInt(minutes));
                                            setDate(startDate); // Update main date state with time

                                            // Set end time default duration (e.g. 4 hours)
                                            // Re-calculate end time logic here or rely on prev
                                            const endDate = new Date(startDate);
                                            endDate.setHours(startDate.getHours() + duration);
                                            setEndTime(endDate);
                                        }}
                                    >
                                        <Text style={{
                                            color: isSelected ? colors.primary : colors.text,
                                            fontFamily: isSelected ? 'Poppins_600SemiBold' : 'Poppins_500Medium',
                                            fontSize: 13
                                        }}>
                                            {formatTime12(slot)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    ) : (
                        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                            <Text style={{ color: colors.textSecondary, fontFamily: 'Poppins_400Regular', fontSize: 13 }}>
                                No available slots for this date.
                            </Text>
                        </View>
                    )}
                </View>
            )}
        </View>
    );

    const renderDurationControl = () => null; // Removed in favor of computed duration



    // --- SUB-SECTIONS ---

    const renderGallery = () => {
        if (!group.images || group.images.length === 0) return null;

        return (
            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Gallery</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryContainer}>
                    {group.images.map((img: string, i: number) => (
                        <Image
                            key={i}
                            source={{ uri: img }}
                            style={styles.galleryImage}
                        />
                    ))}
                </ScrollView>
            </View>
        );
    };

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
    const renderStudioSetup = () => {
        const amenities = group.amenities || [];
        const equipment: string[] = [];

        // Categorize amenities as equipment
        if (amenities.length > 0) {
            amenities.forEach((item: string) => {
                const lower = item.toLowerCase();
                if (lower.includes('mic') || lower.includes('drum') || lower.includes('guitar') ||
                    lower.includes('bass') || lower.includes('keyboard') || lower.includes('amp') ||
                    lower.includes('console') || lower.includes('interface')) {
                    equipment.push(item);
                }
            });
        }

        return (
            <View style={styles.tabContent}>
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Studio Amenities</Text>
                    <View style={styles.tagsContainer}>
                        {amenities.length > 0 ? amenities.map((tag: string, index: number) => (
                            <View key={`${tag}-${index}`} style={[styles.tag, {
                                borderColor: colors.primary,
                                backgroundColor: isDark ? 'rgba(124, 58, 237, 0.1)' : 'rgba(124, 58, 237, 0.05)'
                            }]}>
                                <Ionicons name="checkmark-circle" size={14} color={colors.primary} style={{ marginRight: 4 }} />
                                <Text style={{ color: colors.text, fontSize: 13, fontFamily: 'Poppins_500Medium' }}>{tag}</Text>
                            </View>
                        )) : (
                            <Text style={{ color: colors.textSecondary, fontStyle: 'italic' }}>No amenities listed for this studio.</Text>
                        )}
                    </View>
                </View>

                {equipment.length > 0 && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Available Equipment</Text>
                        <View style={{ gap: 12 }}>
                            {equipment.map((item: string, i: number) => (
                                <View key={i} style={styles.checkRow}>
                                    <View style={[styles.equipmentIcon, { backgroundColor: isDark ? 'rgba(124, 58, 237, 0.15)' : 'rgba(124, 58, 237, 0.1)' }]}>
                                        <Ionicons name="musical-notes" size={18} color={colors.primary} />
                                    </View>
                                    <Text style={{ color: colors.text, marginLeft: 12, fontFamily: 'Poppins_400Regular' }}>{item}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {group.description && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>About the Space</Text>
                        <Text style={{ color: colors.text, lineHeight: 24, fontFamily: 'Poppins_400Regular' }}>
                            {group.description}
                        </Text>
                    </View>
                )}
            </View>
        );
    };

    // Studio: Book Tab
    const renderStudioBook = () => {
        const availability = group.availability || [];
        const totalBookingsCost = bookings.reduce((sum, booking) => {
            // Use calculated pricing if available, otherwise fallback to simple calculation
            if (booking.pricing?.final_price) {
                return sum + booking.pricing.final_price;
            }
            const start = new Date(booking.startTime).getTime();
            const end = new Date(booking.endTime).getTime();
            let hours = (end - start) / (1000 * 60 * 60);
            if (hours < 0) hours += 24;
            return sum + (parseInt(displayRate.replace(/,/g, '')) * hours);
        }, 0);

        return (
            <View style={styles.tabContent}>
                {/* Status display for existing booking */}
                {hasExistingStudioBooking && (
                    <View style={[
                        styles.infoBox,
                        {
                            backgroundColor: existingStudioBookingStatus === 'cancelled' ? '#EF444420' :
                                existingStudioBookingStatus === 'confirmed' ? '#10B98120' :
                                    colors.primary + '20',
                            borderColor: existingStudioBookingStatus === 'cancelled' ? '#EF4444' :
                                existingStudioBookingStatus === 'confirmed' ? '#10B981' :
                                    colors.primary,
                            marginBottom: 16
                        }
                    ]}>
                        <Ionicons
                            name={existingStudioBookingStatus === 'cancelled' ? 'close-circle' :
                                existingStudioBookingStatus === 'confirmed' ? 'checkmark-circle' :
                                    'information-circle'}
                            size={20}
                            color={existingStudioBookingStatus === 'cancelled' ? '#EF4444' :
                                existingStudioBookingStatus === 'confirmed' ? '#10B981' :
                                    colors.primary}
                        />
                        <Text style={[styles.infoText, { color: colors.text }]}>
                            {existingStudioBookingStatus === 'cancelled'
                                ? 'Your booking request was declined by the studio owner.'
                                : existingStudioBookingStatus === 'confirmed'
                                    ? 'Your booking has been confirmed! Check your bookings page for details.'
                                    : 'You already have a pending booking for this studio. Please wait for the owner to respond before creating another booking.'}
                        </Text>
                    </View>
                )}

                {/* Bookings List */}
                {bookings.length > 0 && (
                    <View style={[styles.section, { marginBottom: 16 }]}>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Your Bookings ({bookings.length})</Text>
                        {bookings.map((booking, index) => {
                            const start = new Date(booking.startTime).getTime();
                            const end = new Date(booking.endTime).getTime();
                            let hours = (end - start) / (1000 * 60 * 60);
                            if (hours < 0) hours += 24;

                            // Use calculated pricing or fallback
                            const cost = booking.pricing?.final_price || (parseInt(displayRate.replace(/,/g, '')) * hours);
                            const hasModifiers = booking.pricing?.modifiers && Object.keys(booking.pricing.modifiers).length > 0;

                            return (
                                <View key={index} style={[styles.bookingCard, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB', borderColor: colors.border, marginBottom: 8 }]}>
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                            <Ionicons name="calendar" size={14} color={colors.primary} />
                                            <Text style={{ color: colors.text, fontFamily: 'Poppins_600SemiBold', marginLeft: 6, fontSize: 13 }}>
                                                {booking.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                            </Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
                                            <Text style={{ color: colors.textSecondary, marginLeft: 6, fontSize: 12 }}>
                                                {booking.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })} - {booking.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })} ({booking.pricing?.hours?.toFixed(1) || hours.toFixed(1)}h)
                                            </Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                            <Text style={{ color: colors.primary, fontFamily: 'Poppins_600SemiBold' }}>₱{cost.toLocaleString()}</Text>
                                            {hasModifiers && (
                                                <View style={{ marginLeft: 8, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.primary + '20', borderRadius: 4 }}>
                                                    <Text style={{ color: colors.primary, fontSize: 10 }}>Promo Applied</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                    <TouchableOpacity onPress={() => {
                                        const newBookings = [...bookings];
                                        newBookings.splice(index, 1);
                                        setBookings(newBookings);
                                    }}>
                                        <Ionicons name="trash-outline" size={20} color="#EF4444" />
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* Add Booking Section */}
                {!hasExistingStudioBooking && (showAddBooking || bookings.length === 0) ? (
                    <>
                        {renderBookingControls()}

                        <TouchableOpacity
                            style={[styles.secondaryBtn, { borderColor: colors.primary, backgroundColor: 'transparent', marginBottom: 16, opacity: isCheckingAvailability ? 0.6 : 1 }]}
                            disabled={!date || !endTime || isCheckingAvailability}
                            onPress={async () => {
                                if (date && endTime) {
                                    setIsCheckingAvailability(true);
                                    try {
                                        const bookingDate = date.toISOString().split('T')[0];
                                        const startTime = date.toTimeString().slice(0, 5);
                                        const endTime2 = endTime.toTimeString().slice(0, 5);

                                        // Check availability
                                        const { data: isAvailable, error: availError } = await supabase.rpc('is_slot_available', {
                                            p_studio_id: group.id,
                                            p_booking_date: bookingDate,
                                            p_start_time: startTime,
                                            p_end_time: endTime2,
                                            p_user_id: userId
                                        });

                                        if (availError) {
                                            console.error('Availability check error:', availError);
                                            alert('Failed to check availability. Please try again.');
                                            setIsCheckingAvailability(false);
                                            return;
                                        }

                                        if (!isAvailable) {
                                            alert('This time slot is not available. Please choose a different time.');
                                            setIsCheckingAvailability(false);
                                            return;
                                        }

                                        // Calculate accurate pricing
                                        const { data: pricing, error: pricingError } = await supabase.rpc('calculate_booking_price', {
                                            p_studio_id: group.id,
                                            p_booking_date: bookingDate,
                                            p_start_time: startTime,
                                            p_end_time: endTime2
                                        });

                                        if (pricingError || !pricing || pricing.length === 0) {
                                            console.error('Pricing error:', pricingError);
                                            alert('Failed to calculate price. Please try again.');
                                            setIsCheckingAvailability(false);
                                            return;
                                        }

                                        // Add to cart with pricing data
                                        setBookings([...bookings, {
                                            date: new Date(date),
                                            startTime: new Date(date),
                                            endTime: new Date(endTime),
                                            pricing: pricing[0]
                                        }]);
                                        setShowAddBooking(false);
                                        // Reset form
                                        setDate(null as any);
                                        setEndTime(null as any);
                                    } catch (e: any) {
                                        console.error('Error adding booking:', e);
                                        alert('An error occurred. Please try again.');
                                    } finally {
                                        setIsCheckingAvailability(false);
                                    }
                                }
                            }}
                        >
                            {isCheckingAvailability ? (
                                <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                                <>
                                    <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                                    <Text style={[styles.secondaryBtnText, { color: colors.primary, marginLeft: 8 }]}>
                                        {bookings.length > 0 ? 'Add to Cart' : 'Add Booking'}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </>
                ) : !hasExistingStudioBooking ? (
                    <TouchableOpacity
                        style={[styles.secondaryBtn, { borderColor: colors.primary, backgroundColor: 'transparent', marginBottom: 16 }]}
                        onPress={() => setShowAddBooking(true)}
                    >
                        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                        <Text style={[styles.secondaryBtnText, { color: colors.primary, marginLeft: 8 }]}>Add Another Date/Time</Text>
                    </TouchableOpacity>
                ) : null}

                {/* Notes */}
                <View style={styles.inputContainer}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>Notes (Optional)</Text>
                    <View style={[styles.inputWrapper, { backgroundColor: isDark ? '#374151' : '#F9FAFB', height: 80 }]}>
                        <TextInput
                            style={[styles.input, { color: colors.text, height: '100%' }]}
                            placeholder="Tell us about your sessions..."
                            placeholderTextColor={colors.textSecondary}
                            multiline
                            textAlignVertical="top"
                            value={bookingNotes}
                            onChangeText={setBookingNotes}
                        />
                    </View>
                </View>

                {/* Payment Summary */}
                {bookings.length > 0 && !hasExistingStudioBooking && (
                    <View style={[styles.paymentSummary, { backgroundColor: isDark ? '#1F2937' : '#F9FAFB' }]}>
                        <View style={styles.summaryRow}>
                            <Text style={{ color: colors.textSecondary }}>Rate</Text>
                            <Text style={{ color: colors.text }}>₱{displayRate} / hr</Text>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={{ color: colors.textSecondary }}>Total Sessions</Text>
                            <Text style={{ color: colors.text }}>{bookings.length}</Text>
                        </View>
                        <View style={[styles.divider, { marginVertical: 12 }]} />
                        <View style={styles.summaryRow}>
                            <Text style={{ color: colors.text, fontFamily: 'Poppins_600SemiBold' }}>Total</Text>
                            <Text style={{ color: colors.primary, fontFamily: 'Poppins_600SemiBold', fontSize: 18 }}>₱{totalBookingsCost.toLocaleString()}</Text>
                        </View>
                    </View>
                )}

                {!hasExistingStudioBooking && (
                    <TouchableOpacity
                        style={[styles.primaryBtn, { backgroundColor: bookings.length > 0 ? colors.primary : colors.border, opacity: loading ? 0.6 : 1 }]}
                        disabled={bookings.length === 0 || loading}
                        onPress={() => bookings.length > 0 && handleConfirm(
                            async () => {
                                if (!userId) {
                                    alert('Please sign in to book a studio');
                                    return;
                                }

                                try {
                                    setLoading(true);
                                    const results = [];
                                    const errors = [];

                                    console.log('🛒 Total bookings to create:', bookings.length);
                                    console.log('📋 Bookings array:', bookings);

                                    // Create each booking
                                    for (const booking of bookings) {
                                        const bookingDate = booking.date.toISOString().split('T')[0];
                                        const startTime = booking.startTime.toTimeString().slice(0, 5);
                                        const endTime = booking.endTime.toTimeString().slice(0, 5);

                                        console.log('📤 Creating booking:', {
                                            studio_id: group.id,
                                            user_id: userId,
                                            date: bookingDate,
                                            start_time: startTime,
                                            end_time: endTime,
                                            notes: bookingNotes
                                        });

                                        const { data, error } = await supabase.functions.invoke('manage-bookings', {
                                            body: {
                                                action: 'create',
                                                studio_id: group.id,
                                                user_id: userId,
                                                date: bookingDate,
                                                start_time: startTime,
                                                end_time: endTime,
                                                notes: bookingNotes
                                            }
                                        });

                                        console.log('📥 Booking response:', { data, error });

                                        if (error) {
                                            // Try to extract actual error message
                                            let errorMessage = error.message || 'Unknown error';

                                            // Check if error has context with response body
                                            if (error.context && typeof error.context === 'object') {
                                                try {
                                                    // Try to read response body
                                                    const response = error.context;
                                                    console.log('📥 Error response status:', response.status);
                                                    console.log('📥 Error response:', response);

                                                    // If it's a 400 error, the body might have details
                                                    if (response.status === 400 && data) {
                                                        errorMessage = data.error || data.message || errorMessage;
                                                        console.error('❌ Server error:', data);
                                                    }
                                                } catch (e) {
                                                    console.error('Failed to parse error:', e);
                                                }
                                            }

                                            errors.push({ booking, error: { message: errorMessage } });
                                            console.error('❌ Booking error:', errorMessage);
                                        } else {
                                            results.push(data);
                                            console.log('✅ Booking created successfully');
                                        }
                                    }

                                    setLoading(false);

                                    if (errors.length > 0 && results.length === 0) {
                                        // All failed
                                        const errorMsg = errors[0].error?.message || 'Failed to create bookings';
                                        alert(`Error: ${errorMsg}`);
                                    } else if (errors.length > 0) {
                                        // Partial success
                                        alert(`${results.length} booking(s) created successfully, but ${errors.length} failed. Please check the Bookings page.`);
                                        // Clear form and close
                                        setBookings([]);
                                        setBookingNotes('');
                                        setModalVisible(false);
                                        (ref as any)?.current?.dismiss();
                                    } else {
                                        // All success
                                        alert(`Successfully created ${results.length} booking(s)! The studio owner will review your request.`);
                                        // Clear form and close
                                        setBookings([]);
                                        setBookingNotes('');
                                        setModalVisible(false);
                                        (ref as any)?.current?.dismiss();

                                        // Navigate to bookings page
                                        setTimeout(() => {
                                            router.push('/bookings' as any);
                                        }, 100);
                                    }
                                } catch (e: any) {
                                    setLoading(false);
                                    console.error('Booking creation error:', e);
                                    alert('An unexpected error occurred. Please try again.');
                                }
                            },
                            'Confirm Bookings',
                            `Book ${bookings.length} session(s) at ${group.name}\nTotal: ₱${totalBookingsCost.toLocaleString()}\n\nThe studio owner will review and approve your booking request.`
                        )}
                    >
                        {loading ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                            <Text style={[styles.primaryBtnText, { color: bookings.length > 0 ? '#FFFFFF' : colors.textSecondary }]}>
                                {bookings.length > 0 ? `Confirm ${bookings.length} Booking${bookings.length > 1 ? 's' : ''}` : 'Add at least one booking'}
                            </Text>
                        )}
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    // Gig: Info Tab
    const renderGigInfo = () => {
        // Extract requirements data
        const requirements = group.requirements || {};
        const capacity = requirements.capacity || 'Not specified';
        const audioSetup = requirements.audio || requirements.sound_system || 'Standard PA';

        // Get tech specs from requirements or amenities
        const techSpecs = [];
        if (requirements.lighting) techSpecs.push(`Lighting: ${requirements.lighting}`);
        if (requirements.stage_size) techSpecs.push(`Stage Size: ${requirements.stage_size}`);
        if (requirements.backline) techSpecs.push(`Backline: ${requirements.backline}`);
        if (requirements.sound_check) techSpecs.push('Sound Check Available');
        if (requirements.green_room) techSpecs.push('Green Room Available');

        // If no specific requirements, use amenities or generic items
        if (techSpecs.length === 0 && group.amenities?.length > 0) {
            group.amenities.forEach((amenity: string) => techSpecs.push(amenity));
        }

        return (
            <View style={styles.tabContent}>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                    <View style={[styles.infoCard, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6', flex: 1 }]}>
                        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Capacity</Text>
                        <Text style={[styles.infoValue, { color: colors.text }]}>{capacity}</Text>
                    </View>
                    <View style={[styles.infoCard, { backgroundColor: isDark ? '#1F2937' : '#F3F4F6', flex: 1 }]}>
                        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Audio</Text>
                        <Text style={[styles.infoValue, { color: colors.text, fontSize: 13 }]} numberOfLines={2}>{audioSetup}</Text>
                    </View>
                </View>

                {requirements.experience_level && (
                    <View style={[styles.section, { marginTop: 16 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name="ribbon-outline" size={20} color={colors.primary} />
                            <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text, fontSize: 14 }}>
                                Experience Level: <Text style={{ color: colors.primary }}>{requirements.experience_level}</Text>
                            </Text>
                        </View>
                    </View>
                )}

                <View style={[styles.section, { marginTop: 24 }]}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Event Details</Text>
                    {group.event_date && (
                        <View style={styles.checkRow}>
                            <Ionicons name="calendar" size={20} color={colors.primary} />
                            <Text style={{ color: colors.text, marginLeft: 12 }}>
                                {new Date(group.event_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                            </Text>
                        </View>
                    )}
                    {group.location && (
                        <View style={styles.checkRow}>
                            <Ionicons name="location" size={20} color={colors.primary} />
                            <Text style={{ color: colors.text, marginLeft: 12 }}>{group.location}</Text>
                        </View>
                    )}
                </View>

                {techSpecs.length > 0 && (
                    <View style={[styles.section, { marginTop: 24 }]}>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Tech Specs & Amenities</Text>
                        {techSpecs.map((spec: string, i: number) => (
                            <View key={i} style={styles.checkRow}>
                                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                                <Text style={{ color: colors.text, marginLeft: 12 }}>{spec}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {techSpecs.length === 0 && !group.event_date && (
                    <View style={{ marginTop: 24 }}>
                        <Text style={{ color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center' }}>No additional specifications provided.</Text>
                    </View>
                )}
            </View>
        );
    };

    // Gig: Apply Tab
    const renderGigApply = () => {
        console.log('🎨 renderGigApply called');
        console.log('Current state:', { pitchMessage, videoUrl, isSubmittingApplication, userId, listingId });

        return (
            <View style={styles.tabContent}>
                {/* SPAM BLOCK WARNING */}
                {isBlocked && (
                    <View style={[styles.infoBox, { backgroundColor: '#EF444420', borderColor: '#EF4444', marginBottom: 24 }]}>
                        <Ionicons name="alert-circle" size={24} color="#EF4444" />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.infoText, { color: colors.text, fontFamily: 'Poppins_600SemiBold' }]}>
                                Action Restricted
                            </Text>
                            <Text style={[styles.infoText, { color: colors.text }]}>
                                {blockReason || 'You are temporarily blocked from applying to this organizer.'}
                            </Text>
                        </View>
                    </View>
                )}


                {/* Group Selection (if user has groups) */}
                {userGroups.length > 0 && !hasExistingApplication && (
                    <View style={styles.inputContainer}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Apply as</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                            <TouchableOpacity
                                style={[
                                    styles.groupSelectChip,
                                    {
                                        backgroundColor: selectedGroupId === null ? colors.primary : (isDark ? '#374151' : '#F3F4F6'),
                                        borderColor: selectedGroupId === null ? colors.primary : colors.border,
                                    }
                                ]}
                                onPress={() => setSelectedGroupId(null)}
                            >
                                <Ionicons name="person" size={16} color={selectedGroupId === null ? '#FFF' : colors.text} />
                                <Text style={{ color: selectedGroupId === null ? '#FFF' : colors.text, marginLeft: 8, fontFamily: 'Poppins_500Medium' }}>
                                    Individual
                                </Text>
                            </TouchableOpacity>
                            {userGroups.map((g) => (
                                <TouchableOpacity
                                    key={g.id}
                                    style={[
                                        styles.groupSelectChip,
                                        {
                                            backgroundColor: selectedGroupId === g.id ? colors.primary : (isDark ? '#374151' : '#F3F4F6'),
                                            borderColor: selectedGroupId === g.id ? colors.primary : colors.border,
                                            marginLeft: 8,
                                        }
                                    ]}
                                    onPress={() => setSelectedGroupId(g.id)}
                                >
                                    <Ionicons name="people" size={16} color={selectedGroupId === g.id ? '#FFF' : colors.text} />
                                    <Text style={{ color: selectedGroupId === g.id ? '#FFF' : colors.text, marginLeft: 8, fontFamily: 'Poppins_500Medium' }}>
                                        {g.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                <View style={styles.inputContainer}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>Pitch Message</Text>
                    <View style={[styles.inputWrapper, { backgroundColor: isDark ? '#374151' : '#F9FAFB', height: 100 }]}>
                        <TextInput
                            style={[styles.input, { color: colors.text, height: '100%' }]}
                            placeholder="Why are you a good fit for this gig?"
                            placeholderTextColor={colors.textSecondary}
                            multiline
                            textAlignVertical="top"
                            value={pitchMessage}
                            onChangeText={(text) => {
                                console.log('📝 Pitch message changed to:', text);
                                setPitchMessage(text);
                            }}
                        />
                    </View>
                </View>

                <VideoUploader
                    videoUrl={videoUrl}
                    onVideoChange={(url) => setVideoUrl(url || '')}
                    userId={userId || ''}
                    bucketName="documents"
                    folder="performance-videos"
                    maxSizeMB={50}
                />


                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
                    <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                    <Text style={{ color: colors.primary, marginLeft: 8, textDecorationLine: 'underline' }}>Review Terms & Conditions</Text>
                </View>

                {hasExistingApplication && (
                    <View style={[
                        styles.infoBox,
                        {
                            backgroundColor: existingApplicationStatus === 'rejected' ? '#EF444420' :
                                existingApplicationStatus === 'accepted' || existingApplicationStatus === 'approved' ? '#10B98120' :
                                    colors.primary + '20',
                            borderColor: existingApplicationStatus === 'rejected' ? '#EF4444' :
                                existingApplicationStatus === 'accepted' || existingApplicationStatus === 'approved' ? '#10B981' :
                                    colors.primary
                        }
                    ]}>
                        <Ionicons
                            name={existingApplicationStatus === 'rejected' ? 'close-circle' :
                                existingApplicationStatus === 'accepted' || existingApplicationStatus === 'approved' ? 'checkmark-circle' :
                                    'information-circle'}
                            size={20}
                            color={existingApplicationStatus === 'rejected' ? '#EF4444' :
                                existingApplicationStatus === 'accepted' || existingApplicationStatus === 'approved' ? '#10B981' :
                                    colors.primary}
                        />
                        <Text style={[styles.infoText, { color: colors.text }]}>
                            {existingApplicationStatus === 'rejected'
                                ? 'Your application has been declined.'
                                : existingApplicationStatus === 'accepted' || existingApplicationStatus === 'approved'
                                    ? 'Your application has been accepted! 🎉'
                                    : `You have already applied to this gig. Status: `}
                            {existingApplicationStatus !== 'rejected' && existingApplicationStatus !== 'accepted' && existingApplicationStatus !== 'approved' && (
                                <Text style={{ fontFamily: 'Poppins_600SemiBold' }}>{existingApplicationStatus}</Text>
                            )}
                        </Text>
                    </View>
                )}

                <TouchableOpacity
                    style={[
                        styles.primaryBtn,
                        { backgroundColor: colors.primary },
                        (isSubmittingApplication || !pitchMessage.trim() || hasExistingApplication) && { opacity: 0.5 }
                    ]}
                    onPress={() => {
                        console.log('🟡 SUBMIT APPLICATION BUTTON PRESSED');
                        console.log('pitchMessage:', pitchMessage);
                        console.log('pitchMessage.trim():', pitchMessage.trim());
                        console.log('isSubmittingApplication:', isSubmittingApplication);
                        console.log('hasExistingApplication:', hasExistingApplication);
                        console.log('userId:', userId);
                        console.log('listingId:', listingId);

                        if (hasExistingApplication) {
                            setAlertConfig({
                                type: 'warning',
                                title: 'Already Applied',
                                message: `You have already submitted an application for this gig. Status: ${existingApplicationStatus || 'pending'}.`
                            });
                            setAlertVisible(true);
                            return;
                        }

                        if (isBlocked) {
                            setAlertConfig({
                                type: 'error',
                                title: 'Restricted',
                                message: blockReason || 'You are blocked from applying.'
                            });
                            setAlertVisible(true);
                            return;
                        }

                        if (!pitchMessage.trim()) {
                            console.log('❌ Pitch message is empty, returning');
                            return;
                        }

                        console.log('✅ Validation passed, calling handleConfirm...');
                        handleConfirm(
                            handleSubmitApplication,
                            'Confirm Application',
                            'Are you sure you want to submit this application?'
                        );
                    }}
                    disabled={isSubmittingApplication || !pitchMessage.trim() || hasExistingApplication || isBlocked}
                >
                    {isSubmittingApplication ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.primaryBtnText}>
                            {hasExistingApplication
                                ? existingApplicationStatus === 'rejected'
                                    ? 'Application Declined'
                                    : existingApplicationStatus === 'accepted' || existingApplicationStatus === 'approved'
                                        ? 'Application Accepted'
                                        : 'Already Applied'
                                : 'Submit Application'}
                        </Text>
                    )}
                </TouchableOpacity>
            </View >
        );
    };

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
                            <Image source={{ uri: group.owner_avatar || null }} style={[styles.hostAvatar, { backgroundColor: colors.border }]} />
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
            {(!currentUserRole || currentUserRole === 'musician') && group.requirements?.audition && (
                <View style={[styles.section, (!currentUserRole || currentUserRole === 'venue-owner') && { marginTop: 32 }]}>
                    {currentUserRole === 'musician' && (
                        <>
                            <View style={[styles.auditionBanner, { borderColor: isDark ? '#065F46' : '#86EFAC' }]}>
                                <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.text }}>Active Audition: {group.requirements.audition_role || 'Musician'}</Text>
                                <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4 }}>{group.requirements.audition_desc || 'Open audition for this project.'}</Text>
                            </View>

                            <View style={{ marginTop: 16 }}>
                                <TouchableOpacity
                                    style={[styles.primaryBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary }]}
                                    onPress={() => handleConfirm(
                                        () => console.log('Applied for Audition'),
                                        'Apply for Audition',
                                        `Confirm your application for the ${group.requirements.audition_role || 'Musician'} position?`
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
        <>
            <BottomSheetModal
                ref={ref}
                index={0}
                snapPoints={snapPoints}
                backdropComponent={renderBackdrop}
                backgroundStyle={{ backgroundColor: colors.background }}
                handleIndicatorStyle={{ backgroundColor: isDark ? '#4B5563' : '#E5E7EB', width: 40 }}
                enablePanDownToClose={true}
            >
                {loading ? (
                    <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
                        <ActivityIndicator size="large" color={colors.primary} />
                    </View>
                ) : group ? (
                    <BottomSheetScrollView
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                        showsHorizontalScrollIndicator={false}
                    >
                        {/* Immersive Hero Image */}
                        <View style={styles.imageContainer}>
                            <Image
                                source={{ uri: (group.images && group.images[0]) || group.image || null }}
                                style={[styles.image, { backgroundColor: colors.border }]}
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
                                                        <Image source={{ uri: group.owner_avatar || undefined }} style={[styles.hostAvatar, { backgroundColor: colors.border }]} />
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
                    </BottomSheetScrollView>
                ) : null}
            </BottomSheetModal>

            <CustomAlert
                visible={alertVisible}
                type={alertConfig.type}
                title={alertConfig.title}
                message={alertConfig.message}
                buttons={[
                    {
                        text: 'OK',
                        style: 'default',
                        onPress: () => setAlertVisible(false)
                    }
                ]}
                onClose={() => setAlertVisible(false)}
            />

            <Modal
                visible={modalVisible}
                onClose={() => {
                    console.log('🔴 Modal closed without confirmation');
                    setModalVisible(false);
                }}
                onConfirm={() => {
                    console.log('🟢 Modal CONFIRMED - executing action');
                    console.log('confirmAction:', confirmAction);
                    setModalVisible(false);
                    try {
                        confirmAction();
                        console.log('✅ confirmAction executed successfully');
                    } catch (error) {
                        console.error('❌ Error executing confirmAction:', error);
                    }
                }}
                title={confirmTitle}
                message={confirmMessage}
                buttonText="Confirm"
            />
        </>
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
        top: moderateScale(16),
        left: scale(20),
        right: scale(20),
        flexDirection: 'row',
        justifyContent: 'space-between',
        zIndex: 10,
    },
    rightActions: {
        flexDirection: 'row',
        gap: scale(12),
    },
    roundBtn: {
        width: moderateScale(40),
        height: moderateScale(40),
        borderRadius: moderateScale(20),
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
        bottom: moderateScale(24),
        left: scale(24),
        right: scale(24),
    },
    heroTitle: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: height < 700 ? moderateScale(24) : moderateScale(28),
        color: '#FFF',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
    },
    heroLocation: {
        color: '#FFF',
        fontFamily: 'Poppins_400Regular',
        fontSize: moderateScale(14),
        marginLeft: scale(4),
    },
    statusRow: {
        flexDirection: 'row',
        gap: scale(8),
        marginBottom: moderateScale(8),
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
        paddingVertical: moderateScale(16),
    },
    tabText: {
        fontFamily: 'Poppins_500Medium',
        fontSize: moderateScale(14),
    },
    contentBody: {
        flex: 1,
        minHeight: verticalScale(500),
    },
    tabContent: {
        padding: height < 700 ? scale(16) : scale(24),
    },
    // Sections
    section: {
        marginBottom: height < 700 ? moderateScale(16) : moderateScale(24),
    },
    sectionTitle: {
        fontSize: height < 700 ? moderateScale(16) : moderateScale(18),
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: moderateScale(12),
    },
    description: {
        fontSize: moderateScale(14),
        lineHeight: moderateScale(22),
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
    dateTimeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        gap: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    dateIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dateTimeLabel: {
        fontSize: 11,
        textTransform: 'uppercase',
        fontFamily: 'Poppins_600SemiBold',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    dateTimeValue: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
    },
    timeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 16,
        borderWidth: 1,
        gap: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    timeIconContainer: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    timeLabel: {
        fontSize: 10,
        textTransform: 'uppercase',
        fontFamily: 'Poppins_600SemiBold',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    timeValue: {
        fontSize: 16,
        fontFamily: 'Poppins_700Bold',
    },
    durationBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    pickerContainer: {
        borderRadius: 12,
        overflow: 'hidden',
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
        marginBottom: moderateScale(16),
    },
    label: {
        fontFamily: 'Poppins_500Medium',
        marginBottom: moderateScale(8),
    },
    inputWrapper: {
        borderRadius: moderateScale(12),
        paddingHorizontal: scale(16),
        paddingVertical: moderateScale(12),
        justifyContent: 'center',
    },
    input: {
        fontFamily: 'Poppins_400Regular',
        fontSize: moderateScale(14),
        padding: 0,
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
        paddingVertical: moderateScale(16),
        borderRadius: moderateScale(16),
        alignItems: 'center',
    },
    primaryBtnText: {
        color: '#FFF',
        fontFamily: 'Poppins_600SemiBold',
        fontSize: moderateScale(16),
    },
    secondaryBtn: {
        paddingVertical: moderateScale(14),
        borderRadius: moderateScale(12),
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        borderWidth: 1,
    },
    secondaryBtnText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: moderateScale(14),
    },
    groupSelectChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
    },
    bookingCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    timeSlotChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
    },
    // Info Box (for warnings/notices)
    infoBox: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        gap: 12,
    },
    infoText: {
        flex: 1,
        fontFamily: 'Poppins_400Regular',
        fontSize: 13,
        lineHeight: 20,
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
    equipmentIcon: {
        width: 36,
        height: 36,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
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
        paddingHorizontal: scale(24),
        paddingTop: moderateScale(16),
        paddingBottom: moderateScale(32),
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
        fontSize: moderateScale(18),
    },
    bookBtn: {
        paddingHorizontal: scale(24),
        paddingVertical: moderateScale(12),
        borderRadius: moderateScale(12),
    },
    bookBtnText: {
        color: '#FFF',
        fontFamily: 'Poppins_600SemiBold',
        fontSize: moderateScale(15),
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
    },
    // Integrated Picker Styles
    integratedCard: {
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
        marginBottom: 16,
    },
    pickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        justifyContent: 'space-between',
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    rowContent: {
        flex: 1,
    },
    rowLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 2,
    },
    rowValue: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
    },
    timeContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    timeButton: {
        alignItems: 'center',
    },
    slotGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    slotButton: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        minWidth: 80,
        alignItems: 'center',
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    durationText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 13,
        marginLeft: 4,
    },
    bookingContainer: {
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
        padding: 16,
        marginBottom: 24
    },
    slotGridContainer: {
        borderTopWidth: 1,
        paddingTop: 16,
        marginTop: 8
    }
});

export default ListingDetailsSheet;
