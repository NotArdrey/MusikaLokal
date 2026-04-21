import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { LayoutAnimation, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, UIManager, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useBottomBarClearance } from '../src/hooks/useBottomBarClearance';
import { useTheme } from '../src/context/ThemeContext';

const isFabricEnabled = Boolean((globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager);

if (
    Platform.OS === 'android' &&
    !isFabricEnabled &&
    UIManager.setLayoutAnimationEnabledExperimental
) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HelpSupportScreen() {
    const { colors, isDark } = useTheme();
    const { contentBottomPadding } = useBottomBarClearance(24);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    const toggleExpand = (id: number) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedId(expandedId === id ? null : id);
    };

    const FAQS = [
        {
            id: 1,
            question: "How do I book a studio?",
            answer: "Navigate to the 'Studios' tab from the home screen, select a studio you like, choose your date and time, and click 'Book Now'."
        },
        {
            id: 2,
            question: "Can I cancel a booking?",
            answer: "Yes, you can cancel a booking from the 'Bookings' tab. Please note that cancellation policies vary by studio/host."
        },
        {
            id: 3,
            question: "How do I get paid for gigs?",
            answer: "Payments are processed securely through the app. Once a gig is completed and confirmed by the organizer, funds are transferred to your in-app wallet."
        },
        {
            id: 4,
            question: "Is there a service fee?",
            answer: "MusikaLokal charges a small service fee of 5% on confirmed bookings to maintain the platform and support our team."
        }
    ];

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Header title="Help & Support" />

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: contentBottomPadding },
                ]}
            >

                {/* Contact Support Section */}
                <View style={styles.contactSection}>
                    <Text style={[styles.contactTitle, { color: colors.text }]}>Contact Us</Text>
                    <View style={styles.contactButtons}>
                        <TouchableOpacity activeOpacity={1}
                            style={[styles.contactButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                            onPress={() => Linking.openURL('mailto:support@musikalokal.com')}
                        >
                            <Ionicons name="mail-outline" size={28} color={colors.primary} />
                            <Text style={[styles.contactButtonText, { color: colors.text }]}>Email</Text>
                        </TouchableOpacity>
                        <TouchableOpacity activeOpacity={1}
                            style={[styles.contactButton, { backgroundColor: colors.card, borderColor: colors.border }]}
                            onPress={() => Linking.openURL('tel:+1234567890')}
                        >
                            <Ionicons name="call-outline" size={28} color={colors.primary} />
                            <Text style={[styles.contactButtonText, { color: colors.text }]}>Phone</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* FAQs */}
                <View style={styles.faqSection}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Frequently Asked Questions</Text>

                    {FAQS.map((faq, index) => {
                        const isExpanded = expandedId === faq.id;
                        return (
                            <View key={faq.id} style={styles.faqItem}>
                                <TouchableOpacity activeOpacity={1}
                                    onPress={() => toggleExpand(faq.id)}
                                    style={[
                                        styles.faqHeader,
                                        {
                                            backgroundColor: colors.card,
                                            borderColor: colors.border,
                                            borderBottomLeftRadius: isExpanded ? 0 : 12,
                                            borderBottomRightRadius: isExpanded ? 0 : 12
                                        }
                                    ]}
                                >
                                    <Text style={[styles.faqQuestion, { color: colors.text }]}>{faq.question}</Text>
                                    <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
                                </TouchableOpacity>

                                {isExpanded && (
                                    <View
                                        style={[
                                            styles.faqContent,
                                            { backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : '#F9FAFB', borderColor: colors.border }
                                        ]}
                                    >
                                        <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, lineHeight: 20 }}>{faq.answer}</Text>
                                    </View>
                                )}
                            </View>
                        );
                    })}
                </View>

                {/* Links */}
                <View style={styles.linksSection}>
                    <TouchableOpacity activeOpacity={1} style={[styles.linkItem, { borderColor: isDark ? '#1F2937' : '#F3F4F6' }]}>
                        <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.primary }}>Terms of Service</Text>
                    </TouchableOpacity>
                    <TouchableOpacity activeOpacity={1} style={styles.linkItemLast}>
                        <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.primary }}>Privacy Policy</Text>
                    </TouchableOpacity>
                </View>

            </ScrollView>

            <View style={styles.navbarContainer}>
                <Navbar />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 24,
    },
    contactSection: {
        padding: 24,
        marginBottom: 8,
    },
    contactTitle: {
        fontSize: 18, // text-lg
        fontWeight: 'bold',
        marginBottom: 16,
        fontFamily: 'Poppins_700Bold',
    },
    contactButtons: {
        flexDirection: 'row',
        gap: 16,
    },
    contactButton: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    contactButtonText: {
        marginTop: 8,
        fontWeight: '500', // font-medium
    },
    faqSection: {
        paddingHorizontal: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
        fontFamily: 'Poppins_700Bold',
    },
    faqItem: {
        marginBottom: 12,
    },
    faqHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
    },
    faqQuestion: {
        flex: 1,
        fontWeight: '500',
        marginRight: 8,
        fontFamily: 'Poppins_500Medium',
    },
    faqContent: {
        padding: 16,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
    },
    linksSection: {
        paddingHorizontal: 24,
        marginTop: 32,
    },
    linkItem: {
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    linkItemLast: {
        paddingVertical: 12,
    },
    navbarContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },
});
