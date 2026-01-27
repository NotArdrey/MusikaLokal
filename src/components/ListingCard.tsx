import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface ListingCardProps {
    item: any;
    onPress: (item: any) => void;
    variant?: 'horizontal' | 'vertical';
    style?: any;
}

const ListingCard: React.FC<ListingCardProps> = ({ item, onPress, variant = 'horizontal', style }) => {
    const { colors, isDark } = useTheme();
    const { width } = useWindowDimensions();
    const [isLiked, setIsLiked] = useState(false);

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

    const cardWidth = variant === 'horizontal' ? width * 0.7 : '100%';
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
                    source={{ uri: item.images?.[0] || item.image || 'https://via.placeholder.com/400x300?text=No+Image' }}
                    style={styles.image}
                    resizeMode="cover"
                />

                {/* Top Actions: Rating & Share/Heart */}
                <View style={[styles.topActions]}>
                    {item.rating > 0 ? (
                        <View style={styles.ratingBadge}>
                            <Ionicons name="star" size={12} color="#FBBF24" />
                            <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
                        </View>
                    ) : <View />}

                    <View style={{ flexDirection: 'row', gap: 8 }}>
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
                        {subtitle}
                    </Text>
                </View>

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
        borderRadius: 16,
        overflow: 'hidden',
        // Subtle shadow directly on card container now
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
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
    }
});

export default ListingCard;
