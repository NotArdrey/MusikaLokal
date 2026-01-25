import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
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

    // Determine "Subtitle" (Location or Genre)
    let subtitle = item.location || item.address;
    if (item.type === 'Group' && item.genre) {
        subtitle = item.genre;
    }

    // Determine "Price/Rate" Label
    let priceLabel = '';
    if (item.rate) {
        priceLabel = `₱${item.rate}`;
    } else if (item.hourly_rate) {
        priceLabel = `₱${item.hourly_rate} / hr`;
    } else if (item.budget) {
        priceLabel = `Budget: ₱${item.budget}`;
    } else {
        priceLabel = 'Inquire for rates'; // Fallback
    }

    if (typeof item.rate === 'string' && item.rate.includes('/')) {
        priceLabel = `₱${item.rate}`;
    }

    const cardWidth = variant === 'horizontal' ? width * 0.6 : '100%';
    const imageHeight = variant === 'horizontal' ? 220 : 260; // Slightly taller for vertical

    return (
        <Pressable
            onPress={() => onPress(item)}
            style={({ pressed }) => [
                styles.card,
                { width: cardWidth },
                style,
                { transform: [{ scale: pressed ? 0.98 : 1 }] }
            ]}
        >
            <View style={[styles.imageContainer, { height: imageHeight }]}>
                <Image
                    source={{ uri: item.images?.[0] || item.image || 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&fit=crop' }}
                    style={styles.image}
                    resizeMode="cover"
                />

                <BlurView intensity={30} tint="light" style={styles.ratingBadge}>
                    <Ionicons name="star" size={10} color="#000" />
                    <Text style={styles.ratingText}>{item.rating?.toFixed(1) || '4.9'}</Text>
                </BlurView>

                <TouchableOpacity style={styles.heartIcon}>
                    <Ionicons name="heart-outline" size={20} color="#FFF" />
                </TouchableOpacity>
            </View>

            <View style={styles.info}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                </View>

                {/* Subtitle: Location or Genre */}
                <Text style={[styles.location, { color: colors.textSecondary }]} numberOfLines={1}>
                    {item.type === 'Group' ? '' : <Ionicons name="location-outline" size={12} color={colors.textSecondary} />} {subtitle}
                </Text>

                {/* Price / Budget / Rate */}
                <Text style={[styles.price, { color: colors.text }]}>
                    {priceLabel}
                </Text>
            </View>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    card: {
        marginBottom: 16,
        marginRight: 16, // Default right margin for horizontal lists, can be overridden
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 3,
    },
    imageContainer: {
        borderRadius: 20,
        overflow: 'hidden',
        position: 'relative',
        marginBottom: 12,
        backgroundColor: '#f0f0f0',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    ratingBadge: {
        position: 'absolute',
        top: 12,
        left: 12,
        overflow: 'hidden',
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    ratingText: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 11,
        color: '#000',
    },
    heartIcon: {
        position: 'absolute',
        top: 12,
        right: 12,
        padding: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
    },
    info: {
        paddingHorizontal: 4,
        gap: 2,
    },
    title: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 15,
        letterSpacing: -0.2,
        marginBottom: 0,
    },
    location: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 12,
    },
    price: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 14,
        marginTop: 2,
    },
});

export default ListingCard;
