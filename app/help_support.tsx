import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { LayoutAnimation, Linking, Platform, ScrollView, Text, TouchableOpacity, UIManager, View } from 'react-native';
import Header from '../src/components/header';
import Navbar from '../src/components/navbar';
import { useTheme } from '../src/context/ThemeContext';

if (
    Platform.OS === 'android' &&
    UIManager.setLayoutAnimationEnabledExperimental
) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HelpSupportScreen() {
    const { colors, isDark } = useTheme();
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
        <View className="flex-1" style={{ backgroundColor: colors.background }}>
            <Header title="Help & Support" />

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

                {/* Contact Support Section */}
                <View className="p-6 mb-2">
                    <Text className="text-lg font-bold mb-4" style={{ fontFamily: 'Poppins_700Bold', color: colors.text }}>Contact Us</Text>
                    <View className="flex-row gap-4">
                        <TouchableOpacity
                            className="flex-1 p-4 rounded-xl items-center justify-center border"
                            style={{ backgroundColor: colors.card, borderColor: colors.border }}
                            onPress={() => Linking.openURL('mailto:support@musikalokal.com')}
                        >
                            <Ionicons name="mail-outline" size={28} color={colors.primary} />
                            <Text className="mt-2 font-medium" style={{ color: colors.text }}>Email</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            className="flex-1 p-4 rounded-xl items-center justify-center border"
                            style={{ backgroundColor: colors.card, borderColor: colors.border }}
                            onPress={() => Linking.openURL('tel:+1234567890')}
                        >
                            <Ionicons name="call-outline" size={28} color={colors.primary} />
                            <Text className="mt-2 font-medium" style={{ color: colors.text }}>Phone</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* FAQs */}
                <View className="px-6">
                    <Text className="text-lg font-bold mb-4" style={{ fontFamily: 'Poppins_700Bold', color: colors.text }}>Frequently Asked Questions</Text>

                    {FAQS.map((faq, index) => {
                        const isExpanded = expandedId === faq.id;
                        return (
                            <View key={faq.id} className="mb-3">
                                <TouchableOpacity
                                    onPress={() => toggleExpand(faq.id)}
                                    className="flex-row justify-between items-center p-4 rounded-xl border"
                                    style={{
                                        backgroundColor: colors.card,
                                        borderColor: colors.border,
                                        borderBottomLeftRadius: isExpanded ? 0 : 12,
                                        borderBottomRightRadius: isExpanded ? 0 : 12
                                    }}
                                >
                                    <Text className="flex-1 font-medium mr-2" style={{ fontFamily: 'Poppins_500Medium', color: colors.text }}>{faq.question}</Text>
                                    <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
                                </TouchableOpacity>

                                {isExpanded && (
                                    <View
                                        className="p-4 rounded-b-xl border-x border-b"
                                        style={{ backgroundColor: isDark ? 'rgba(30, 41, 59, 0.5)' : '#F9FAFB', borderColor: colors.border }}
                                    >
                                        <Text style={{ fontFamily: 'Poppins_400Regular', color: colors.textSecondary, lineHeight: 20 }}>{faq.answer}</Text>
                                    </View>
                                )}
                            </View>
                        );
                    })}
                </View>

                {/* Links */}
                <View className="px-6 mt-8">
                    <TouchableOpacity className="py-3 border-b border-gray-100 dark:border-gray-800">
                        <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.primary }}>Terms of Service</Text>
                    </TouchableOpacity>
                    <TouchableOpacity className="py-3">
                        <Text style={{ fontFamily: 'Poppins_500Medium', color: colors.primary }}>Privacy Policy</Text>
                    </TouchableOpacity>
                </View>

            </ScrollView>

            <View className="absolute bottom-0 left-0 right-0">
                <Navbar />
            </View>
        </View>
    );
}
