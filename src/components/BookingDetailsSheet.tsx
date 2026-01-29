import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import React, { forwardRef, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';

const { width, height } = Dimensions.get('window');

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

interface BookingDetailsSheetProps {
    booking: any;
    onCancel?: (bookingId: string) => void;
    onConfirm?: (bookingId: string) => void;
}

const BookingDetailsSheet = forwardRef<BottomSheetModal, BookingDetailsSheetProps>(
    ({ booking, onCancel, onConfirm }, ref) => {
        const { colors, isDark } = useTheme();
        const [loading, setLoading] = useState(false);
        const [studioDetails, setStudioDetails] = useState<any>(null);

        const snapPoints = useMemo(() => ['85%'], []);

        useEffect(() => {
            if (booking?.studio_id) {
                console.log('BookingDetailsSheet - Booking data:', {
                    start_time: booking.start_time,
                    end_time: booking.end_time,
                    date: booking.date,
                    raw_date: booking.raw_date
                });
                fetchStudioDetails();
            }
        }, [booking]);

        const fetchStudioDetails = async () => {
            if (!booking?.studio_id) return;

            try {
                setLoading(true);
                const { data, error } = await supabase
                    .from('studios')
                    .select('*, owner:profiles!owner_id(full_name, avatar_url)')
                    .eq('id', booking.studio_id)
                    .single();

                if (error) throw error;
                setStudioDetails(data);
            } catch (e) {
                console.log('Error fetching studio details:', e);
            } finally {
                setLoading(false);
            }
        };

        const getStatusColor = (status: string) => {
            switch (status?.toLowerCase()) {
                case 'confirmed': return '#10B981';
                case 'accepted': return '#10B981';  // Gig application accepted
                case 'pending': return '#F59E0B';
                case 'cancelled': return '#EF4444';
                case 'rejected': return '#EF4444';  // Gig application rejected
                case 'completed': return '#6366F1';
                default: return colors.textSecondary;
            }
        };

        const getStatusIcon = (status: string) => {
            switch (status?.toLowerCase()) {
                case 'confirmed': return 'checkmark-circle';
                case 'accepted': return 'checkmark-circle';  // Gig application accepted
                case 'pending': return 'time-outline';
                case 'cancelled': return 'close-circle';
                case 'rejected': return 'close-circle';  // Gig application rejected
                case 'completed': return 'checkmark-done-circle';
                default: return 'information-circle';
            }
        };

        const formatTime = (time?: string) => {
            if (!time) return '';
            try {
                // Handle ISO string
                if (time.includes('T')) {
                    return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                }

                // Handle both "HH:MM:SS" and "HH:MM" formats
                const timeParts = time.split(':');
                const hours = parseInt(timeParts[0]);
                const minutes = parseInt(timeParts[1] || '0');

                if (isNaN(hours) || isNaN(minutes)) return time;

                const period = hours >= 12 ? 'PM' : 'AM';
                const displayHours = hours % 12 || 12;
                return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
            } catch (e) {
                console.log('Error formatting time:', time, e);
                return time;
            }
        };

        if (!booking) return null;

        const isStudio = booking.type_id === 'studio_booking' || !!booking.studio_id;
        const isGig = booking.type_id === 'gig_application' || !!booking.gig_id;

        return (
            <BottomSheetModal
                ref={ref}
                index={0}
                snapPoints={snapPoints}
                backgroundStyle={{ backgroundColor: colors.background }}
                handleIndicatorStyle={{ backgroundColor: isDark ? '#4B5563' : '#E5E7EB' }}
            >
                <BottomSheetScrollView style={{ flex: 1 }}>
                    <View style={styles.container}>
                        {/* Header */}
                        <View style={styles.header}>
                            <View style={styles.headerTop}>
                                <Text style={[styles.title, { color: colors.text }]}>
                                    {isGig ? 'Application Details' : 'Booking Details'}
                                </Text>
                                <TouchableOpacity
                                    onPress={() => (ref as any)?.current?.dismiss()}
                                    style={[styles.closeBtn, { backgroundColor: isDark ? '#374151' : '#F3F4F6' }]}
                                >
                                    <Ionicons name="close" size={24} color={colors.text} />
                                </TouchableOpacity>
                            </View>

                            {/* Status Badge */}
                            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) + '20' }]}>
                                <Ionicons name={getStatusIcon(booking.status) as any} size={18} color={getStatusColor(booking.status)} />
                                <Text style={[styles.statusText, { color: getStatusColor(booking.status) }]}>
                                    {booking.status?.toUpperCase()}
                                </Text>
                            </View>
                        </View>

                        {loading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color={colors.primary} />
                            </View>
                        ) : (
                            <>
                                {/* Info Card (Studio or Gig) */}
                                {(studioDetails || isGig) && (
                                    <View style={[styles.card, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]}>
                                        <Image
                                            source={{ uri: studioDetails?.images?.[0] || booking.image || 'https://via.placeholder.com/400x200' }}
                                            style={styles.studioImage}
                                        />
                                        <View style={styles.studioInfo}>
                                            <Text style={[styles.studioName, { color: colors.text }]}>
                                                {studioDetails?.name || booking.name}
                                            </Text>

                                            {/* Studio Owner Info - Only for Studio */}
                                            {isStudio && studioDetails?.owner && (
                                                <View style={styles.ownerRow}>
                                                    <Image
                                                        source={{ uri: studioDetails.owner?.avatar_url || 'https://via.placeholder.com/40' }}
                                                        style={styles.ownerAvatar}
                                                    />
                                                    <Text style={[styles.ownerName, { color: colors.textSecondary }]}>
                                                        {studioDetails.owner?.full_name || 'Studio Owner'}
                                                    </Text>
                                                </View>
                                            )}

                                            {/* Applicant Info - Only for Gig Application */}
                                            {isGig && booking.customer_name && (
                                                <View style={styles.ownerRow}>
                                                    <Image
                                                        source={{ uri: booking.customer_avatar || 'https://via.placeholder.com/40' }}
                                                        style={styles.ownerAvatar}
                                                    />
                                                    <Text style={[styles.ownerName, { color: colors.textSecondary }]}>
                                                        Applied by <Text style={{ fontFamily: 'Poppins_600SemiBold', color: colors.primary }}>{booking.customer_name}</Text>
                                                    </Text>
                                                </View>
                                            )}

                                            {/* Location - Show for Studio (fetched) or Gig (passed) */}
                                            {(studioDetails?.address || booking.location) && (
                                                <View style={styles.locationRow}>
                                                    <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
                                                    <Text style={[styles.locationText, { color: colors.textSecondary }]}>
                                                        {studioDetails?.address || booking.location}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                )}

                                {isGig && (booking.pitch_message || booking.video_url) && (
                                    <View style={[styles.card, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]}>
                                        <View style={styles.cardHeader}>
                                            <Ionicons name="document-text-outline" size={24} color={colors.primary} />
                                            <Text style={[styles.cardTitle, { color: colors.text }]}>Application</Text>
                                        </View>

                                        {booking.pitch_message && (
                                            <View style={styles.detailItem}>
                                                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Pitch / Message</Text>
                                                <Text style={[styles.notesText, { color: colors.text }]}>{booking.pitch_message}</Text>
                                            </View>
                                        )}

                                        {booking.video_url && (
                                            <View style={[styles.detailItem, { marginTop: moderateScale(12) }]}>
                                                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Video / Demo</Text>
                                                <Text style={[styles.detailValue, { color: colors.primary, textDecorationLine: 'underline' }]} onPress={() => { /* Handle link open */ }}>
                                                    {booking.video_url}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                )}

                                {/* Session Details Card */}
                                <View style={[styles.card, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]}>
                                    <View style={styles.cardHeader}>
                                        <Ionicons name="calendar-outline" size={24} color={colors.primary} />
                                        <Text style={[styles.cardTitle, { color: colors.text }]}>
                                            {isGig ? 'Event Details' : 'Session Details'}
                                        </Text>
                                    </View>

                                    <View style={styles.detailsGrid}>
                                        <View style={styles.detailItem}>
                                            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Date</Text>
                                            <Text style={[styles.detailValue, { color: colors.text }]}>
                                                {booking.raw_date && (booking.raw_date.includes('T') || !isNaN(Date.parse(booking.raw_date))) ? new Date(booking.raw_date).toLocaleDateString('en-US', {
                                                    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
                                                }) : booking.date?.includes('•') ? booking.date.split('•')[0] : booking.date}
                                            </Text>
                                        </View>

                                        <View style={styles.detailItem}>
                                            <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Time</Text>
                                            <Text style={[styles.detailValue, { color: colors.text }]}>
                                                {formatTime(booking.start_time || (booking.date?.includes('•') ? booking.date.split('•')[1]?.trim() : ''))}
                                                {booking.end_time ? ` - ${formatTime(booking.end_time)}` : ''}
                                            </Text>
                                        </View>

                                        {booking.duration_hours && (
                                            <View style={styles.detailItem}>
                                                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Duration</Text>
                                                <Text style={[styles.detailValue, { color: colors.text }]}>
                                                    {booking.duration_hours} hours
                                                </Text>
                                            </View>
                                        )}
                                    </View>

                                    {booking.notes && (
                                        <View style={[styles.notesSection, { backgroundColor: isDark ? '#374151' : '#F9FAFB' }]}>
                                            <Text style={[styles.notesLabel, { color: colors.textSecondary }]}>Notes</Text>
                                            <Text style={[styles.notesText, { color: colors.text }]}>{booking.notes}</Text>
                                        </View>
                                    )}
                                </View>

                                {/* Pricing Card */}
                                {booking.total_cost && (
                                    <View style={[styles.card, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]}>
                                        <View style={styles.cardHeader}>
                                            <Ionicons name="wallet-outline" size={24} color={colors.primary} />
                                            <Text style={[styles.cardTitle, { color: colors.text }]}>Pricing</Text>
                                        </View>

                                        <View style={styles.pricingRow}>
                                            <Text style={[styles.pricingLabel, { color: colors.textSecondary }]}>
                                                Rate ({booking.duration_hours || '4'} hrs)
                                            </Text>
                                            <Text style={[styles.pricingValue, { color: colors.text }]}>
                                                ₱{booking.total_cost?.toLocaleString()}
                                            </Text>
                                        </View>

                                        <View style={[styles.divider, { backgroundColor: colors.border }]} />

                                        <View style={styles.pricingRow}>
                                            <Text style={[styles.totalLabel, { color: colors.text }]}>Total Amount</Text>
                                            <Text style={[styles.totalValue, { color: colors.primary }]}>
                                                ₱{booking.total_cost?.toLocaleString()}
                                            </Text>
                                        </View>
                                    </View>
                                )}

                                {/* Action Buttons */}
                                <View style={styles.actions}>
                                    {booking.status === 'pending' && onConfirm && (
                                        <TouchableOpacity
                                            style={[styles.actionBtn, styles.confirmBtn]}
                                            onPress={() => {
                                                onConfirm(booking.id);
                                                (ref as any)?.current?.dismiss();
                                            }}
                                        >
                                            <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                                            <Text style={styles.actionBtnText}>
                                                {isGig ? 'Accept Application' : 'Confirm Booking'}
                                            </Text>
                                        </TouchableOpacity>
                                    )}

                                    {booking.status === 'completed' && (
                                        <TouchableOpacity
                                            style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                                            onPress={() => {
                                                router.push('/submit_review' as any);
                                                (ref as any)?.current?.dismiss();
                                            }}
                                        >
                                            <Ionicons name="star-outline" size={20} color="#FFFFFF" />
                                            <Text style={styles.actionBtnText}>Leave Review</Text>
                                        </TouchableOpacity>
                                    )}

                                    {(booking.status === 'confirmed' || booking.status === 'pending' || booking.status === 'accepted') && onCancel && (
                                        <TouchableOpacity
                                            style={[styles.actionBtn, styles.cancelBtn, { borderColor: colors.border }]}
                                            onPress={() => {
                                                onCancel(booking.id);
                                                (ref as any)?.current?.dismiss();
                                            }}
                                        >
                                            <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
                                            <Text style={[styles.cancelBtnText]}>
                                                {isGig ? 'Decline Application' : 'Cancel Booking'}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </>
                        )}
                    </View>
                </BottomSheetScrollView>
            </BottomSheetModal>
        );
    }
);

const styles = StyleSheet.create({
    container: {
        padding: height < 700 ? scale(16) : scale(24),
    },
    header: {
        marginBottom: height < 700 ? moderateScale(16) : moderateScale(24),
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: height < 700 ? moderateScale(12) : moderateScale(16),
    },
    title: {
        fontSize: height < 700 ? moderateScale(20) : moderateScale(24),
        fontFamily: 'Poppins_700Bold',
    },
    closeBtn: {
        width: moderateScale(40),
        height: moderateScale(40),
        borderRadius: moderateScale(20),
        justifyContent: 'center',
        alignItems: 'center',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: scale(8),
        paddingHorizontal: scale(16),
        paddingVertical: moderateScale(10),
        borderRadius: moderateScale(12),
        alignSelf: 'flex-start',
    },
    statusText: {
        fontSize: moderateScale(14),
        fontFamily: 'Poppins_600SemiBold',
    },
    loadingContainer: {
        paddingVertical: verticalScale(60),
        alignItems: 'center',
    },
    card: {
        borderRadius: moderateScale(16),
        padding: height < 700 ? moderateScale(12) : moderateScale(16),
        marginBottom: height < 700 ? moderateScale(12) : moderateScale(16),
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    studioImage: {
        width: '100%',
        height: height < 700 ? verticalScale(140) : verticalScale(180),
        borderRadius: moderateScale(12),
        marginBottom: height < 700 ? moderateScale(12) : moderateScale(16),
    },
    studioInfo: {
        gap: moderateScale(12),
    },
    studioName: {
        fontSize: height < 700 ? moderateScale(18) : moderateScale(20),
        fontFamily: 'Poppins_600SemiBold',
    },
    ownerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: scale(8),
    },
    ownerAvatar: {
        width: moderateScale(32),
        height: moderateScale(32),
        borderRadius: moderateScale(16),
    },
    ownerName: {
        fontSize: moderateScale(14),
        fontFamily: 'Poppins_500Medium',
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: scale(6),
    },
    locationText: {
        fontSize: moderateScale(13),
        fontFamily: 'Poppins_400Regular',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: scale(12),
        marginBottom: moderateScale(16),
    },
    cardTitle: {
        fontSize: moderateScale(18),
        fontFamily: 'Poppins_600SemiBold',
    },
    detailsGrid: {
        gap: moderateScale(16),
    },
    detailItem: {
        gap: moderateScale(4),
    },
    detailLabel: {
        fontSize: moderateScale(12),
        fontFamily: 'Poppins_500Medium',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    detailValue: {
        fontSize: moderateScale(16),
        fontFamily: 'Poppins_600SemiBold',
    },
    notesSection: {
        marginTop: moderateScale(16),
        padding: moderateScale(12),
        borderRadius: moderateScale(8),
    },
    notesLabel: {
        fontSize: moderateScale(12),
        fontFamily: 'Poppins_500Medium',
        textTransform: 'uppercase',
        marginBottom: moderateScale(4),
    },
    notesText: {
        fontSize: moderateScale(14),
        fontFamily: 'Poppins_400Regular',
        lineHeight: moderateScale(20),
    },
    pricingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: moderateScale(12),
    },
    pricingLabel: {
        fontSize: moderateScale(14),
        fontFamily: 'Poppins_400Regular',
    },
    pricingValue: {
        fontSize: moderateScale(14),
        fontFamily: 'Poppins_500Medium',
    },
    divider: {
        height: 1,
        marginVertical: moderateScale(8),
    },
    totalLabel: {
        fontSize: moderateScale(16),
        fontFamily: 'Poppins_600SemiBold',
    },
    totalValue: {
        fontSize: moderateScale(20),
        fontFamily: 'Poppins_700Bold',
    },
    actions: {
        gap: moderateScale(12),
        marginTop: moderateScale(8),
        marginBottom: moderateScale(24),
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: scale(8),
        paddingVertical: moderateScale(16),
        borderRadius: moderateScale(12),
    },
    confirmBtn: {
        backgroundColor: '#10B981',
    },
    cancelBtn: {
        backgroundColor: 'transparent',
        borderWidth: 1.5,
    },
    viewStudioBtn: {
        backgroundColor: 'transparent',
        borderWidth: 1.5,
    },
    actionBtnText: {
        color: '#FFFFFF',
        fontSize: moderateScale(16),
        fontFamily: 'Poppins_600SemiBold',
    },
    cancelBtnText: {
        color: '#EF4444',
        fontSize: moderateScale(16),
        fontFamily: 'Poppins_600SemiBold',
    },
    viewStudioBtnText: {
        fontSize: moderateScale(16),
        fontFamily: 'Poppins_600SemiBold',
    },
});

export default BookingDetailsSheet;
