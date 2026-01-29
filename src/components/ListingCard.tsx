import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface ListingCardProps {
    item: any;
    onPress: (item: any) => void;
    onInvite?: (item: any) => void;
    variant?: 'horizontal' | 'vertical';
    style?: any;
}

const ListingCard: React.FC<ListingCardProps> = ({ item, onPress, onInvite, variant = 'horizontal', style }) => {
    const { colors, isDark } = useTheme();
    const { userRole } = useAuth();
    const { width } = useWindowDimensions();
    const [isLiked, setIsLiked] = useState(false);

    // Check if current user can invite (venue-owner or studio-owner viewing a musician/Group)
    const canInvite = (userRole === 'venue-owner' || userRole === 'studio-owner') && item.type === 'Group';

    // Determine "Subtitle" (Location or Genre)
    let subtitle = item.location || item.address;
    if (item.type === 'Group' && item.genre) {
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

    const cardWidth = variant === 'horizontal' ? Math.min(width * 0.8, 300) : '100%'; // Increased from 0.7/280 to 0.8/300
    const imageHeight = variant === 'horizontal' ? 180 : 240;

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

    // Robust Image Logic
    const getInitialImage = () => {
        const uri = item.images?.[0] || item.image;
        if (uri && typeof uri === 'string' && uri.length > 0) {
            return { uri };
        }
        return undefined;
    };

    const [imageSource, setImageSource] = useState(getInitialImage());

    const handleImageError = () => {
        // Fallback to a reliable placeholder or local asset if available
        setImageSource(undefined);
    };

    return (
        <Pressable
            onPress={() => onPress(item)}
            style={({ pressed }) => [
                styles.card,
                { width: cardWidth, backgroundColor: isDark ? '#1F2937' : '#FFFFFF' },
                style,
                { transform: [{ scale: pressed ? 0.99 : 1 }] }
            ]}
        >
            {/* Image Section */}
            <View style={[styles.imageContainer, { height: imageHeight }]}>
                <Image
                    source={imageSource}
                    style={styles.image}
                    resizeMode="cover"
                    onError={handleImageError}
                />

                {/* Top Actions: Rating & Share/Heart */}
                <View style={[styles.topActions]}>
                    {item.rating > 0 && (item.review_count || 0) > 0 ? (
                        <View style={styles.ratingBadge}>
                            <Ionicons name="star" size={12} color="#FBBF24" />
                            <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
                        </View>
                    ) : (
                        <View style={[styles.ratingBadge, { backgroundColor: 'rgba(148, 163, 184, 0.9)' }]}>
                            <Text style={styles.ratingText}>No ratings yet</Text>
                        </View>
                    )}

                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        {canInvite && onInvite && (
                            <TouchableOpacity
                                style={[styles.iconBtn, styles.inviteBtn]}
                                onPress={() => onInvite(item)}
                            >
                                <Ionicons name="mail-outline" size={18} color="#FFF" />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.iconBtn} onPress={handleShare}>
                            <Ionicons name="share-outline" size={20} color="#000" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconBtn} onPress={toggleLike}>
                            <Ionicons name={isLiked ? "heart" : "heart-outline"} size={20} color={isLiked ? "#EF4444" : "#000"} />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            {/* Info Section (Below Image) */}
            <View style={styles.info}>
                <View style={{ marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                        {/* Type Badge (Mini) */}
                        <Text style={[styles.typeMini, { color: colors.primary }]}>{item.type || 'Artist'}</Text>
                    </View>

                    <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                        {item.type === 'Gig' && item.event_date 
                            ? `${new Date(item.event_date).toLocaleDateString()} • ${subtitle}` 
                            : subtitle}
                    </Text>
                </View>

                {item.experience_level && (
                    <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                        <View style={{
                            backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF',
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: 4,
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(59, 130, 246, 0.4)' : '#DBEAFE'
                        }}>
                            <Text style={{
                                fontSize: 10,
                                color: isDark ? '#60A5FA' : '#2563EB',
                                fontFamily: 'Poppins_500Medium'
                            }}>
                                {item.experience_level}
                            </Text>
                        </View>
                    </View>
                )}

                {/* Contract Badge for Studios and Gigs */}
                {item.contract_url && (item.type === 'Studio' || item.type === 'Gig') && (
                    <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                        <View style={{
                            backgroundColor: isDark ? 'rgba(139, 92, 246, 0.2)' : '#F5F3FF',
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            borderRadius: 4,
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(139, 92, 246, 0.4)' : '#DDD6FE',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                        }}>
                            <Ionicons name="document-text" size={10} color={isDark ? '#A78BFA' : '#7C3AED'} />
                            <Text style={{
                                fontSize: 10,
                                color: isDark ? '#A78BFA' : '#7C3AED',
                                fontFamily: 'Poppins_500Medium'
                            }}>
                                Contract Available
                            </Text>
                        </View>
                    </View>
                )}

                <View style={styles.priceRow}>
                    <Text style={[styles.price, { color: colors.text }]}>{priceLabel}</Text>

                    {/* Completion Rate Badge */}
                    {(item.type === 'Studio' && item.completion_rate !== undefined) && (
                        <View style={styles.completionBadge}>
                            <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                            <Text style={styles.completionText}>{item.completion_rate}% Completion</Text>
                        </View>
                    )}

                    {item.review_count > 0 && (
                        <Text style={styles.reviewCount}>({item.review_count} reviews)</Text>
                    )}
                </View>
            </View>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    card: {
        marginBottom: 20,
        marginRight: 16,
        borderRadius: 20,
        overflow: 'hidden',
        // Subtle shadow directly on card container now
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)'
    },
    imageContainer: {
        width: '100%',
        backgroundColor: '#f0f0f0',
        position: 'relative',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    topActions: {
        position: 'absolute',
        top: 12,
        left: 12,
        right: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    ratingBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
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
    },
    info: {
        padding: 12,
        gap: 8,
    },
    title: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 16,
        flex: 1,
        marginRight: 8,
    },
    typeMini: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    subtitle: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 13,
    },
    priceRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 6
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
    completionBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    completionText: {
        fontSize: 10,
        fontFamily: 'Poppins_600SemiBold',
        color: '#10B981',
    },
    inviteBtn: {
        backgroundColor: '#7C3AED',
    }
});

export default ListingCard;
