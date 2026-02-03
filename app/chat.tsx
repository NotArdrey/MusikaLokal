import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { supabase } from '../lib/supabase';
import ChatScreen from '../src/components/ChatScreen';
import ConversationsList from '../src/components/ConversationsList';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import { Conversation, useConversation } from '../src/hooks/useChat';

export default function ChatPage() {
    const { colors } = useTheme();
    const { userId } = useAuth();
    const params = useLocalSearchParams<{
        recipientId?: string;
        conversationId?: string;
        recipientName?: string;
        recipientAvatar?: string;
        // Context params
        gigId?: string;
        groupId?: string;
        studioId?: string;
        studioBookingId?: string;
        gigApplicationId?: string;
    }>();

    const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
    const [otherUser, setOtherUser] = useState<{ id: string; full_name: string; avatar_url: string | null } | null>(null);
    const [loading, setLoading] = useState(true);

    const { getOrCreateConversation } = useConversation(
        params.recipientId || null,
        userId || null
    );

    useEffect(() => {
        const initializeChat = async () => {
            setLoading(true);

            // If we have a recipientId, get or create conversation
            if (params.recipientId && userId) {
                const conversation = await getOrCreateConversation({
                    gigId: params.gigId,
                    groupId: params.groupId,
                    studioId: params.studioId,
                    studioBookingId: params.studioBookingId,
                    gigApplicationId: params.gigApplicationId,
                });

                if (conversation) {
                    setSelectedConversation(conversation);

                    // Set other user info
                    if (params.recipientName) {
                        setOtherUser({
                            id: params.recipientId,
                            full_name: params.recipientName,
                            avatar_url: params.recipientAvatar || null,
                        });
                    } else {
                        // Fetch recipient info
                        const { data } = await supabase
                            .from('profiles')
                            .select('id, full_name, avatar_url')
                            .eq('id', params.recipientId)
                            .single();

                        if (data) {
                            setOtherUser(data);
                        }
                    }
                }
            }
            // If we have a conversationId, load that conversation
            else if (params.conversationId && userId) {
                const { data: conversation } = await supabase
                    .from('conversations')
                    .select('*')
                    .eq('id', params.conversationId)
                    .single();

                if (conversation) {
                    setSelectedConversation(conversation);

                    // Get other user
                    const otherParticipantId = conversation.participant_1 === userId
                        ? conversation.participant_2
                        : conversation.participant_1;

                    const { data } = await supabase
                        .from('profiles')
                        .select('id, full_name, avatar_url')
                        .eq('id', otherParticipantId)
                        .single();

                    if (data) {
                        setOtherUser(data);
                    }
                }
            }

            setLoading(false);
        };

        initializeChat();
    }, [params.recipientId, params.conversationId, userId]);

    const handleSelectConversation = async (conversation: Conversation) => {
        setSelectedConversation(conversation);
        setOtherUser(conversation.other_participant || null);
    };

    const handleBack = () => {
        if (selectedConversation && !params.recipientId && !params.conversationId) {
            // Go back to conversations list
            setSelectedConversation(null);
            setOtherUser(null);
        } else {
            // Go back to previous screen
            router.back();
        }
    };

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    // If we have a selected conversation, show the chat
    if (selectedConversation && otherUser && userId) {
        return (
            <ChatScreen
                conversationId={selectedConversation.id}
                currentUserId={userId}
                otherUser={otherUser}
                onBack={handleBack}
            />
        );
    }

    // Otherwise, show the conversations list
    if (userId) {
        return (
            <ConversationsList
                currentUserId={userId}
                onSelectConversation={handleSelectConversation}
                onBack={() => router.back()}
            />
        );
    }

    return null;
}
