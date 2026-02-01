import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface ListingCardProps {
    item: any;
    onPress: (item: any) => void;
    onInvite?: (item: any) => void;
    variant?: 'horizontal' | 'vertical';
    style?: any;
    hasGroups?: boolean;
}

const ListingCard: React.FC<ListingCardProps> = ({ item, onPress, onInvite, variant = 'horizontal', style, hasGroups }) => {
    const { colors, isDark } = useTheme();
    const { userRole } = useAuth(); // To avoid showing warning to owners
    const { width } = useWindowDimensions();
    const [isLiked, setIsLiked] = useState(false);
    const [pageIndex, setPageIndex] = useState(0);

    // Check if current user can invite (ONLY venue-owner viewing a musician/Group)
    const canInvite = userRole === 'venue-owner' && (item.type === 'Group' || item.type === 'Artist');

    // Group Warning Logic
    const showGroupWarning = item.type === 'Gig' &&
        item.requirements?.musician_type === 'group' &&
        hasGroups === false &&
        userRole === 'musician';

    // Determine "Subtitle" (Location or Genre)
    let subtitle = item.location || item.address;
    if ((item.type === 'Group' || item.type === 'Artist') && item.genre) {
        subtitle = item.genre;
    }

    // Determine "Price/Rate" Label
    let priceLabel = '';
    // Prioritize explicit rate fields
    if (item.hourly_rate && item.hourly_rate !== '0') {
        priceLabel = `₱${parseInt(item.hourly_rate).toLocaleString()} / hr`;
    } else if (item.budget && item.budget !== '0') {
        priceLabel = `₱${parseInt(item.budget).toLocaleString()}`;
    } else if (item.rate && item.rate !== '0') {
        if (typeof item.rate === 'string' && item.rate.includes('/')) {
            priceLabel = `₱${item.rate}`;
        } else {
            priceLabel = `₱${parseInt(item.rate).toLocaleString()}`;
        }
    } else {
        priceLabel = 'Inquire for rates'; // Fallback
    }

    // Shared actions
    const handleShare = async () => {
        try {
            await Share.share({
                message: `Check out ${item.name} on MusikaLokal!`,
            });
        } catch (error) {
            console.log('Error sharing:', error);
        }
    };

    const toggleLike = () => {
        setIsLiked(!isLiked);
    };

    const handleInviteAction = (e: any) => {
        e.stopPropagation();
        onInvite?.(item);
    };

    // Robust Image Logic
    const getImages = () => {
        if (item.images && Array.isArray(item.images) && item.images.length > 0) {
            // Filter out empty strings
            return item.images.filter((img: any) => typeof img === 'string' && img.length > 0);
        }
        if (item.image && typeof item.image === 'string' && item.image.length > 0) {
            return [item.image];
        }
        return [];
    };

    const images = getImages();
    const hasMultipleImages = images.length > 1;

    // --- RENDER VARIANTS ---

    // 1. IMMERSIVE HORIZONTAL CARD (For Home Screen)
    if (variant === 'horizontal') {
        const cardWidth = Math.min(width * 0.8, 300);
        const cardHeight = 320; // Taller for immersive feel

        return (
            <Pressable
                onPress={() => onPress(item)}
                style={({ pressed }) => [
                    styles.card,
                    {
                        width: cardWidth,
                        height: cardHeight,
                        transform: [{ scale: pressed ? 0.98 : 1 }]
                    },
                    style,
                ]}
            >
                <View style={[styles.cardContent, { flex: 1, backgroundColor: isDark ? '#374151' : '#E5E7EB' }]}>
                    {/* Full Background Image / Slideshow */}
                    {hasMultipleImages ? (
                        <View style={StyleSheet.absoluteFillObject}>
                            <PagerView
                                style={StyleSheet.absoluteFillObject}
                                initialPage={0}
                                onPageSelected={(e) => setPageIndex(e.nativeEvent.position)}
                            >
                                {images.map((img: string, index: number) => (
                                    <View key={index} style={styles.pagerPage}>
                                        <Image
                                            source={{ uri: img }}
                                            style={StyleSheet.absoluteFillObject}
                                            resizeMode="cover"
                                        />
                                    </View>
                                ))}
                            </PagerView>
                        </View>
                    ) : (
                        <Image
                            source={images.length > 0 ? { uri: images[0] } : undefined}
                            style={StyleSheet.absoluteFillObject}
                            resizeMode="cover"
                        />
                    )}

                    {/* Gradient Overlay */}
                    <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.85)']}
                        style={StyleSheet.absoluteFillObject}
                        start={{ x: 0.5, y: 0.3 }}
                        end={{ x: 0.5, y: 1 }}
                        pointerEvents="none" // Allow touches to pass through
                    />

                    {/* Top Row: Floating Badges */}
                    <View style={styles.immersiveTopRow}>
                        {/* Rating Glass Badge */}
                        <View style={styles.glassBadge}>
                            <Ionicons name="star" size={12} color="#FCD34D" />
                            <Text style={styles.glassBadgeText}>
                                {item.rating > 0 ? item.rating.toFixed(1) : 'New'}
                            </Text>
                        </View>

                        {/* Group Required Warning Badge (Horizontal) */}
                        {showGroupWarning && (
                            <View style={[styles.glassBadge, { backgroundColor: '#EF4444', marginLeft: 8 }]}>
                                <Ionicons name="people" size={12} color="#FFF" />
                                <Text style={styles.glassBadgeText}>Group Req.</Text>
                            </View>
                        )}

                        <View style={{ flex: 1 }} />

                        {/* Invite Button Glass */}
                        {canInvite && (
                            <TouchableOpacity style={[styles.glassIconBtn, { marginRight: 8, backgroundColor: colors.primary }]} onPress={handleInviteAction}>
                                <Ionicons name="mail" size={18} color="#FFF" />
                            </TouchableOpacity>
                        )}

                        {/* Like Button Glass */}
                        <TouchableOpacity style={styles.glassIconBtn} onPress={toggleLike}>
                            <Ionicons name={isLiked ? "heart" : "heart-outline"} size={20} color={isLiked ? "#EF4444" : "#FFF"} />
                        </TouchableOpacity>
                    </View>

                    {/* Pagination Dots */}
                    {hasMultipleImages && (
                        <View style={styles.paginationContainer}>
                            {images.map((_: any, i: number) => (
                                <View
                                    key={i}
                                    style={[
                                        styles.paginationDot,
                                        { backgroundColor: i === pageIndex ? '#FFF' : 'rgba(255,255,255,0.5)' }
                                    ]}
                                />
                            ))}
                        </View>
                    )}

                    {/* Bottom Content Area */}
                    <View style={styles.immersiveBottomContent}>
                        {/* Type Badge */}
                        <View style={styles.tagBadge}>
                            <Text style={styles.tagText}>{item.type || (item.hourly_rate ? 'Studio' : 'Artist')}</Text>
                        </View>

                        <Text style={styles.immersiveTitle} numberOfLines={2}>{item.name}</Text>

                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, opacity: 0.9 }}>
                            <Ionicons name="location" size={12} color="#FFF" style={{ marginRight: 4 }} />
                            <Text style={styles.immersiveSubtitle} numberOfLines={1}>{subtitle}</Text>
                        </View>

                        {/* Instruments Display for Studios/Venues */}
                        {item.instruments && Array.isArray(item.instruments) && item.instruments.length > 0 && (
                            <View style={styles.instrumentsRow}>
                                {item.instruments.slice(0, 4).map((inst: { name: string, image: string }, idx: number) => (
                                    <Image
                                        key={inst.name + idx}
                                        source={{ uri: inst.image }}
                                        style={styles.instrumentBadge}
                                    />
                                ))}
                                {item.instruments.length > 4 && (
                                    <View style={styles.moreInstrumentsBadge}>
                                        <Text style={styles.moreInstrumentsText}>+{item.instruments.length - 4}</Text>
                                    </View>
                                )}
                            </View>
                        )}

                        <Text style={styles.immersivePrice}>{priceLabel}</Text>
                    </View>
                </View>
            </Pressable>
        );
    }

    // 2. STANDARD VERTICAL CARD (For Search / Lists)
    // Legacy Layout: Image Top, White Info Box Bottom
    const imageHeight = 180;

    return (
        <Pressable
            onPress={() => onPress(item)}
            style={({ pressed }) => [
                styles.card,
                { width: '100%', backgroundColor: isDark ? '#1F2937' : '#FFFFFF' },
                style,
                { transform: [{ scale: pressed ? 0.99 : 1 }] }
            ]}
        >
            <View style={[styles.cardContent, { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }]}>
                {/* Image Section */}
                <View style={[styles.imageContainer, { height: imageHeight }]}>
                    {hasMultipleImages ? (
                        <View style={{ flex: 1 }}>
                            <PagerView
                                style={{ flex: 1 }}
                                initialPage={0}
                                onPageSelected={(e) => setPageIndex(e.nativeEvent.position)}
                            >
                                {images.map((img: string, index: number) => (
                                    <View key={index} style={styles.pagerPage}>
                                        <Image
                                            source={{ uri: img }}
                                            style={styles.image}
                                            resizeMode="cover"
                                        />
                                    </View>
                                ))}
                            </PagerView>
                            {/* Pagination Dots for Vertical Card */}
                            <View style={[styles.paginationContainer, { bottom: 10 }]}>
                                {images.map((_: any, i: number) => (
                                    <View
                                        key={i}
                                        style={[
                                            styles.paginationDot,
                                            { backgroundColor: i === pageIndex ? '#FFF' : 'rgba(255,255,255,0.5)' }
                                        ]}
                                    />
                                ))}
                            </View>
                        </View>
                    ) : (
                        <Image
                            source={images.length > 0 ? { uri: images[0] } : undefined}
                            style={styles.image}
                            resizeMode="cover"
                        />
                    )}

                    {/* Modern Overlay Badge */}
                    <View style={styles.typeOverlayBadge}>
                        <Text style={styles.typeOverlayText}>{item.type || (item.hourly_rate ? 'Studio' : 'Artist')}</Text>
                    </View>

                    {/* Group Required Warning Badge (Vertical) */}
                    {showGroupWarning && (
                        <View style={[styles.typeOverlayBadge, { top: 40, backgroundColor: '#EF4444' }]}>
                            <Text style={styles.typeOverlayText}>Group Required</Text>
                        </View>
                    )}

                    {/* Top Actions for Standard Card */}
                    <View style={[styles.topActions]}>
                        <View style={{ flex: 1 }} />

                        {/* Rating moved to right or kept at top? Keeping original rating logic but ensuring zIndex */}
                        {item.rating > 0 && (item.review_count || 0) > 0 ? (
                            <View style={[styles.ratingBadge, { marginRight: 'auto' }]}>
                                <Ionicons name="star" size={12} color="#FBBF24" />
                                <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
                            </View>
                        ) : (
                            <View style={[styles.ratingBadge, { backgroundColor: 'rgba(148, 163, 184, 0.9)', marginRight: 'auto' }]}>
                                <Text style={styles.ratingText}>No ratings yet</Text>
                            </View>
                        )}

                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {/* Invite Button Vertical */}
                            {canInvite && (
                                <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.primary }]} onPress={handleInviteAction}>
                                    <Ionicons name="mail" size={20} color="#FFF" />
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity style={styles.iconBtn} onPress={toggleLike}>
                                <Ionicons name={isLiked ? "heart" : "heart-outline"} size={20} color={isLiked ? "#EF4444" : "#000"} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {/* Info Section */}
                <View style={styles.info}>
                    <View>
                        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Ionicons name="location-outline" size={12} color={colors.textSecondary} />
                            <Text style={[styles.subtitle, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>{subtitle}</Text>
                        </View>
                    </View>

                    <View style={[styles.priceRow, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                        <Text style={[styles.price, { color: colors.primary }]}>{priceLabel}</Text>
                        <View style={{ flex: 1 }} />
                        {item.review_count > 0 && (
                            <Text style={styles.reviewCount}>({item.review_count} reviews)</Text>
                        )}
                    </View>

                    {/* Instruments Display for Studios/Venues */}
                    {item.instruments && Array.isArray(item.instruments) && item.instruments.length > 0 && (
                        <View style={[styles.instrumentsRowVertical, { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
                            {item.instruments.slice(0, 4).map((inst: { name: string, image: string }, idx: number) => (
                                <Image
                                    key={inst.name + idx}
                                    source={{ uri: inst.image }}
                                    style={styles.instrumentBadgeSmall}
                                />
                            ))}
                            {item.instruments.length > 4 && (
                                <View style={styles.moreInstrumentsBadgeSmall}>
                                    <Text style={styles.moreInstrumentsTextSmall}>+{item.instruments.length - 4}</Text>
                                </View>
                            )}
                        </View>
                    )}
                </View>
            </View>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    card: {
        marginBottom: 20,
        marginRight: 0,
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
        // Modern Shadow
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 }, // Slightly softer
        shadowOpacity: 0.1, // Reduced opacity
        shadowRadius: 10,
        elevation: 4, // Reduced elevation for Android
    },
    cardContent: {
        // flex: 1 removed to allow auto-height for vertical cards
        borderRadius: 24, // Matches card
        overflow: 'hidden', // Clips content
        position: 'relative',
    },
    // --- Immersive Styles ---
    immersiveTopRow: {
        position: 'absolute',
        top: 16,
        left: 16,
        right: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        zIndex: 10,
        alignItems: 'center', // Fix vertical alignment
    },
    immersiveBottomContent: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 20,
        justifyContent: 'flex-end',
    },
    immersiveTitle: {
        fontFamily: 'Poppins_700Bold',
        fontSize: 20,
        color: '#FFF',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 6,
        marginBottom: 4,
    },
    immersiveSubtitle: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 13,
        color: 'rgba(255,255,255,0.95)',
    },
    immersivePrice: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 16,
        color: '#FFF',
        marginTop: 4,
    },
    glassBadge: {
        backgroundColor: '#111827', // Solid heavy dark
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        // No border
        // No opacity
    },
    glassBadgeText: {
        color: '#FFF',
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 11,
    },
    glassIconBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#111827', // Solid heavy dark for button too
        alignItems: 'center',
        justifyContent: 'center',
        // Removed border
    },
    tagBadge: {
        alignSelf: 'flex-start',
        backgroundColor: '#7C3AED', // Solid Purple
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        marginBottom: 8,
    },
    tagText: {
        color: '#FFF',
        fontSize: 10,
        fontFamily: 'Poppins_600SemiBold',
        textTransform: 'uppercase',
    },

    // --- Standard Styles ---
    imageContainer: {
        width: '100%',
        backgroundColor: '#f3f4f6',
        position: 'relative',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    pagerPage: {
        width: '100%',
        height: '100%',
    },
    paginationContainer: {
        position: 'absolute',
        bottom: 80, // Above content
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
        zIndex: 20,
    },
    paginationDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.5)',
    },
    topActions: {
        position: 'absolute',
        top: 12,
        left: 12,
        right: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        zIndex: 10,
        gap: 12, // Added gap to separate rating and heart
    },
    ratingBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 2,
    },
    ratingText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 12,
        color: '#1F2937',
    },
    iconBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    info: {
        padding: 16, // Increased padding
        gap: 4, // Tighter gap
    },
    title: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 16,
        marginRight: 8,
    },
    typeMini: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        textAlign: 'right',
        opacity: 0.7,
    },
    subtitle: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 13,
        marginTop: 2,
    },
    priceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 10, // More separation for price
        paddingTop: 10,
        borderTopWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)', // Subtle separator
    },
    price: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 15,
    },
    reviewCount: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 12,
        color: '#9CA3AF',
    },
    inviteBtn: {
        backgroundColor: '#7C3AED',
    },
    // Modern Type Badge (Overlay)
    typeOverlayBadge: {
        position: 'absolute',
        top: 12,
        left: 12,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.6)', // Dark translucent
        zIndex: 11,
    },
    typeOverlayText: {
        color: 'white',
        fontSize: 10,
        fontFamily: 'Poppins_600SemiBold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    // Instruments styles for horizontal (immersive) cards
    instrumentsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 4,
    },
    instrumentBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.8)',
    },
    moreInstrumentsBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    moreInstrumentsText: {
        color: '#FFF',
        fontSize: 10,
        fontFamily: 'Poppins_600SemiBold',
    },
    // Instruments styles for vertical cards
    instrumentsRowVertical: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 10,
        marginTop: 10,
        borderTopWidth: 1,
        gap: 6,
    },
    instrumentBadgeSmall: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: 'rgba(0,0,0,0.1)',
    },
    moreInstrumentsBadgeSmall: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#E5E7EB',
        alignItems: 'center',
        justifyContent: 'center',
    },
    moreInstrumentsTextSmall: {
        color: '#6B7280',
        fontSize: 9,
        fontFamily: 'Poppins_600SemiBold',
    },
});

export default ListingCard;
