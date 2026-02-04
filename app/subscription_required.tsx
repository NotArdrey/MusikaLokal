import { Ionicons } from '@expo/vector-icons';
import * as ExpoLinking from 'expo-linking';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Linking,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';

const { width } = Dimensions.get('window');

interface SubscriptionPlan {
    id: string;
    name: string;
    description: string;
    price: number;
    features: string[];
    duration_days: number;
}

export default function SubscriptionRequiredScreen() {
    const { colors, isDark } = useTheme();
    const { userId, userRole, checkSubscription } = useAuth();
    const insets = useSafeAreaInsets();

    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [subscribing, setSubscribing] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

    useEffect(() => {
        fetchPlans();
    }, []);

    const fetchPlans = async () => {
        try {
            const { data, error } = await supabase
                .from('subscription_plans')
                .select('*')
                .order('price', { ascending: true });

            if (error) throw error;

            setPlans(data.map(plan => ({
                ...plan,
                features: plan.features || []
            })));
        } catch (error) {
            console.error('Error fetching plans:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubscribe = async (planId: string) => {
        if (!userId) {
            Alert.alert('Error', 'Please log in to subscribe');
            return;
        }

        setSelectedPlan(planId);
        setSubscribing(true);

        try {
            const plan = plans.find(p => p.id === planId);
            if (!plan) throw new Error('Plan not found');

            // Generate environment-aware redirect URLs (works with Expo Go and production)
            const redirectUrl = ExpoLinking.createURL('payment-result', {
                queryParams: { status: 'success', type: 'subscription', plan_id: planId },
            });
            const cancelRedirectUrl = ExpoLinking.createURL('payment-result', {
                queryParams: { status: 'cancelled', type: 'subscription' },
            });

            // Call edge function to create subscription checkout
            const { data, error } = await supabase.functions.invoke('paymongo', {
                body: {
                    action: 'create_subscription_checkout',
                    user_id: userId,
                    plan_id: planId,
                    amount: plan.price,
                    plan_name: plan.name,
                    redirect_url: redirectUrl,
                    cancel_redirect_url: cancelRedirectUrl,
                },
            });

            if (error) throw error;

            if (data?.checkout_url) {
                // Open PayMongo checkout
                const canOpen = await Linking.canOpenURL(data.checkout_url);
                if (canOpen) {
                    await Linking.openURL(data.checkout_url);
                } else {
                    Alert.alert('Error', 'Unable to open payment page. Please try again.');
                }
            } else {
                throw new Error('No checkout URL returned');
            }
        } catch (error: any) {
            console.error('Subscription error:', error);
            Alert.alert('Error', error.message || 'Failed to start subscription. Please try again.');
        } finally {
            setSubscribing(false);
            setSelectedPlan(null);
        }
    };

    const handleLogout = async () => {
        Alert.alert(
            'Log Out',
            'Are you sure you want to log out?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Log Out',
                    style: 'destructive',
                    onPress: async () => {
                        await supabase.auth.signOut();
                        router.replace('/');
                    },
                },
            ]
        );
    };

    const handleRefresh = async () => {
        setLoading(true);
        if (checkSubscription) {
            await checkSubscription();
        }
        await fetchPlans();
        setLoading(false);
    };

    const getPlanColor = (index: number) => {
        const planColors = ['#3B82F6', '#8B5CF6', '#F59E0B'];
        return planColors[index] || colors.primary;
    };

    const getPlanIcon = (name: string) => {
        if (name.toLowerCase().includes('basic')) return 'rocket-outline';
        if (name.toLowerCase().includes('pro')) return 'star-outline';
        if (name.toLowerCase().includes('premium')) return 'diamond-outline';
        return 'card-outline';
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                <View style={styles.headerContent}>
                    <View style={styles.logoContainer}>
                        <Ionicons name="musical-notes" size={32} color={colors.primary} />
                        <Text style={[styles.logoText, { color: colors.text }]}>MusikaLokal</Text>
                    </View>
                    <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                        <Ionicons name="log-out-outline" size={24} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Hero Section */}
                <View style={styles.heroSection}>
                    <View style={[styles.iconContainer, { backgroundColor: colors.primary + '20' }]}>
                        <Ionicons name="lock-closed" size={48} color={colors.primary} />
                    </View>
                    <Text style={[styles.heroTitle, { color: colors.text }]}>
                        Subscription Required
                    </Text>
                    <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                        As a {userRole === 'studio-owner' ? 'Studio Owner' : 'Venue Owner'}, you need an active subscription to access MusikaLokal and manage your listings.
                    </Text>
                </View>

                {/* Benefits Section */}
                <View style={[styles.benefitsSection, { backgroundColor: isDark ? colors.card : '#F0F9FF' }]}>
                    <Text style={[styles.benefitsTitle, { color: colors.text }]}>
                        What You'll Get
                    </Text>
                    <View style={styles.benefitsList}>
                        {[
                            { icon: 'business-outline', text: 'List and manage your studios/venues' },
                            { icon: 'calendar-outline', text: 'Accept bookings from musicians' },
                            { icon: 'wallet-outline', text: 'Receive payments directly' },
                            { icon: 'analytics-outline', text: 'View analytics and insights' },
                            { icon: 'notifications-outline', text: 'Instant booking notifications' },
                            { icon: 'star-outline', text: 'Priority customer support' },
                        ].map((benefit, index) => (
                            <View key={index} style={styles.benefitItem}>
                                <View style={[styles.benefitIcon, { backgroundColor: colors.primary + '20' }]}>
                                    <Ionicons name={benefit.icon as any} size={18} color={colors.primary} />
                                </View>
                                <Text style={[styles.benefitText, { color: colors.text }]}>
                                    {benefit.text}
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Plans Section */}
                <View style={styles.plansSection}>
                    <Text style={[styles.plansTitle, { color: colors.text }]}>
                        Choose Your Plan
                    </Text>
                    <Text style={[styles.plansSubtitle, { color: colors.textSecondary }]}>
                        Select a plan that fits your needs
                    </Text>

                    {loading ? (
                        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
                    ) : (
                        <View style={styles.plansList}>
                            {plans.map((plan, index) => {
                                const planColor = getPlanColor(index);
                                const isPopular = index === 1; // Pro plan is popular

                                return (
                                    <View
                                        key={plan.id}
                                        style={[
                                            styles.planCard,
                                            {
                                                backgroundColor: colors.card,
                                                borderColor: isPopular ? planColor : colors.border,
                                                borderWidth: isPopular ? 2 : 1,
                                                transform: [{ scale: isPopular ? 1.02 : 1 }]
                                            }
                                        ]}
                                    >
                                        {isPopular && (
                                            <View style={[styles.popularBadge, { backgroundColor: planColor }]}>
                                                <Text style={styles.popularText}>MOST POPULAR</Text>
                                            </View>
                                        )}

                                        <View style={styles.planHeader}>
                                            <View style={[styles.planIconContainer, { backgroundColor: planColor + '20' }]}>
                                                <Ionicons
                                                    name={getPlanIcon(plan.name) as any}
                                                    size={24}
                                                    color={planColor}
                                                />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.planName, { color: colors.text }]}>
                                                    {plan.name}
                                                </Text>
                                                <Text style={[styles.planDescription, { color: colors.textSecondary }]}>
                                                    {plan.description}
                                                </Text>
                                            </View>
                                        </View>

                                        <View style={styles.priceContainer}>
                                            {/* <Text style={[styles.currency, { color: colors.textSecondary }]}>₱</Text> */}
                                            <Text style={[styles.price, { color: colors.text }]}>
                                                ₱{plan.price.toLocaleString()}
                                            </Text>
                                            <Text style={[styles.period, { color: colors.textSecondary }]}>
                                                /{plan.duration_days} days
                                            </Text>
                                        </View>

                                        <View style={styles.separator} />

                                        <View style={styles.featuresContainer}>
                                            {plan.features.map((feature, fIndex) => (
                                                <View key={fIndex} style={styles.featureRow}>
                                                    <Ionicons name="checkmark-circle" size={18} color={planColor} />
                                                    <Text style={[styles.featureText, { color: colors.text }]}>
                                                        {feature}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>

                                        <TouchableOpacity
                                            style={[
                                                styles.subscribeButton,
                                                {
                                                    backgroundColor: planColor,
                                                    shadowColor: planColor,
                                                    shadowOffset: { width: 0, height: 4 },
                                                    shadowOpacity: 0.3,
                                                    shadowRadius: 8,
                                                    elevation: 5
                                                },
                                                subscribing && selectedPlan === plan.id && styles.buttonDisabled
                                            ]}
                                            onPress={() => handleSubscribe(plan.id)}
                                            disabled={subscribing}
                                        >
                                            {subscribing && selectedPlan === plan.id ? (
                                                <ActivityIndicator size="small" color="white" />
                                            ) : (
                                                <>
                                                    <Text style={styles.subscribeButtonText}>
                                                        Subscribe Now
                                                    </Text>
                                                    <Ionicons name="arrow-forward" size={18} color="white" />
                                                </>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </View>

                {/* Refresh Button */}
                <TouchableOpacity
                    style={[styles.refreshButton, { borderColor: colors.border }]}
                    onPress={handleRefresh}
                >
                    <Ionicons name="refresh" size={20} color={colors.primary} />
                    <Text style={[styles.refreshText, { color: colors.primary }]}>
                        Already subscribed? Tap to refresh
                    </Text>
                </TouchableOpacity>

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                        Secure payment powered by PayMongo
                    </Text>
                    <View style={styles.paymentMethods}>
                        <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>
                            GCash • Maya • Credit/Debit Card • GrabPay
                        </Text>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 20,
        paddingBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.05)',
    },
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    logoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    logoText: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
    },
    logoutButton: {
        padding: 8,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    heroSection: {
        alignItems: 'center',
        paddingHorizontal: 30,
        paddingTop: 40,
        paddingBottom: 30,
    },
    iconContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    heroTitle: {
        fontSize: 26,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
        marginBottom: 12,
    },
    heroSubtitle: {
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 22,
    },
    benefitsSection: {
        marginHorizontal: 20,
        borderRadius: 16,
        padding: 20,
        marginBottom: 30,
    },
    benefitsTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 16,
    },
    benefitsList: {
        gap: 12,
    },
    benefitItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    benefitIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    benefitText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        flex: 1,
    },
    plansSection: {
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    plansTitle: {
        fontSize: 22,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
        marginBottom: 8,
    },
    plansSubtitle: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        marginBottom: 24,
    },
    loader: {
        marginTop: 40,
    },
    plansList: {
        gap: 16,
    },
    planCard: {
        borderRadius: 20,
        padding: 20,
        overflow: 'hidden',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 3,
        marginBottom: 10,
    },
    popularBadge: {
        position: 'absolute',
        top: 0,
        right: 0,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderBottomLeftRadius: 16,
        zIndex: 10,
    },
    popularText: {
        color: 'white',
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
    },
    planHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 16,
        gap: 12,
    },
    planIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    planName: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 4,
    },
    planDescription: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 18,
    },
    priceContainer: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 16,
    },
    currency: {
        fontSize: 18,
        fontFamily: 'Poppins_500Medium',
    },
    price: {
        fontSize: 28,
        fontFamily: 'Poppins_700Bold',
    },
    period: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        marginLeft: 4,
    },
    separator: {
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.05)',
        marginBottom: 16,
    },
    featuresContainer: {
        gap: 12,
        marginBottom: 20,
    },
    featureRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    featureText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
        flex: 1,
    },
    subscribeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 14,
        gap: 8,
    },
    subscribeButtonText: {
        color: 'white',
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    refreshButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginHorizontal: 20,
        paddingVertical: 14,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 24,
    },
    refreshText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
    },
    footer: {
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    footerText: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginBottom: 8,
    },
    paymentMethods: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    paymentLabel: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
    },
});
