import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { supabase } from '../lib/supabase';
import ChatScreen from '../src/components/ChatScreen';
import ConversationsList from '../src/components/ConversationsList';
import GuestSignInGate from '../src/components/GuestSignInGate';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import { Conversation, isConversationMuted, useConversation, useGroupConversation } from '../src/hooks/useChat';

export default function ChatPage() {
    const { colors } = useTheme();
    const { loading: authLoading, userId, isGuest } = useAuth();
    const { width } = useWindowDimensions();
    const isDesktopMessengerLayout = Platform.OS === 'web' && width >= 900;
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
        // Group chat params
        isGroupChat?: string;
        groupChatId?: string;
    }>();

    const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
    const [otherUser, setOtherUser] = useState<{ id: string; full_name: string; avatar_url: string | null } | null>(null);
    const [isGroupChat, setIsGroupChat] = useState(false);
    const [loading, setLoading] = useState(true);

    const withCurrentParticipantState = useCallback(async (conversation: Conversation): Promise<Conversation> => {
        if (!userId) return conversation;

        const { data: currentParticipant } = await supabase
            .from('conversation_participants')
            .select('*')
            .eq('conversation_id', conversation.id)
            .eq('user_id', userId)
            .maybeSingle();

        return {
            ...conversation,
            current_participant: currentParticipant || conversation.current_participant || null,
            is_muted: isConversationMuted(currentParticipant || conversation),
            muted_until: currentParticipant?.muted_until ?? conversation.muted_until ?? null,
        };
    }, [userId]);

    const { getOrCreateConversation } = useConversation(
        params.recipientId || null,
        userId || null
    );

    const { getOrCreateGroupConversation } = useGroupConversation(
        params.groupChatId || null,
        userId || null
    );

    useEffect(() => {
        const initializeChat = async () => {
            setLoading(true);

            // If opening a group chat
            if (params.isGroupChat === 'true' && params.groupChatId && userId) {
                const conversation = await getOrCreateGroupConversation();
                
                if (conversation) {
                    setSelectedConversation(await withCurrentParticipantState(conversation));
                    setIsGroupChat(true);
                }
            }
            // If we have a recipientId, get or create 1-on-1 conversation
            else if (params.recipientId && userId) {
                const conversation = await getOrCreateConversation({
                    gigId: params.gigId,
                    groupId: params.groupId,
                    studioId: params.studioId,
                    studioBookingId: params.studioBookingId,
                    gigApplicationId: params.gigApplicationId,
                });

                if (conversation) {
                    setSelectedConversation(await withCurrentParticipantState(conversation));
                    setIsGroupChat(false);

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
                    const { data: display } = await supabase
                        .from('conversations_display_projection')
                        .select('group_name, group_avatar_url')
                        .eq('id', conversation.id)
                        .maybeSingle();

                    const mergedConversation = {
                        ...conversation,
                        group_name: display?.group_name || null,
                        group_avatar_url: display?.group_avatar_url || null,
                    };

                    setSelectedConversation(await withCurrentParticipantState(mergedConversation));
                    setIsGroupChat(conversation.is_group || false);

                    // For 1-on-1 chats, get other user
                    if (!conversation.is_group) {
                        const { data: participants } = await supabase
                            .from('conversation_participants')
                            .select(`
                                user_id,
                                profile:profiles!conversation_participants_user_id_fkey(id, full_name, avatar_url)
                            `)
                            .eq('conversation_id', conversation.id);

                        const otherParticipant = (participants || []).find((p: any) => p.user_id !== userId)?.profile;
                        const normalizedOtherUser = Array.isArray(otherParticipant)
                            ? otherParticipant[0]
                            : otherParticipant;

                        if (normalizedOtherUser) {
                            setOtherUser({
                                id: normalizedOtherUser.id,
                                full_name: normalizedOtherUser.full_name,
                                avatar_url: normalizedOtherUser.avatar_url ?? null,
                            });
                        }
                    }
                }
            }

            setLoading(false);
        };

        initializeChat();
    }, [
        params.recipientId,
        params.conversationId,
        params.groupChatId,
        params.isGroupChat,
        userId,
        getOrCreateConversation,
        getOrCreateGroupConversation,
        withCurrentParticipantState,
    ]);

    const handleSelectConversation = async (conversation: Conversation) => {
        setSelectedConversation(conversation);
        setIsGroupChat(conversation.is_group || false);
        if (!conversation.is_group) {
            setOtherUser(conversation.other_participant || null);
        }
    };

    const handleMuteChange = (muted: boolean, mutedUntil: string | null) => {
        setSelectedConversation((conversation) => {
            if (!conversation) return conversation;

            return {
                ...conversation,
                is_muted: muted,
                muted_until: mutedUntil,
                current_participant: conversation.current_participant
                    ? {
                        ...conversation.current_participant,
                        is_muted: muted,
                        muted_until: mutedUntil,
                    }
                    : conversation.current_participant,
            };
        });
    };

    const handleBack = () => {
        if (selectedConversation && !params.recipientId && !params.conversationId && !params.groupChatId) {
            // Go back to conversations list
            setSelectedConversation(null);
            setOtherUser(null);
            setIsGroupChat(false);
        } else {
            // Go back to previous screen
            router.back();
        }
    };

    if (loading || authLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (isGuest || !userId) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.background }}>
                <GuestSignInGate message="Sign in to view your messages." />
            </View>
        );
    }

    if (isDesktopMessengerLayout && userId) {
        const renderSelectedChat = () => {
            if (!selectedConversation) {
                return (
                    <View style={[styles.emptyChatPane, { backgroundColor: colors.background }]}>
                        <View style={[styles.emptyBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            <Text style={[styles.emptyChatTitle, { color: colors.text }]}>Select a conversation</Text>
                            <Text style={[styles.emptyChatText, { color: colors.textSecondary }]}>
                                Choose a message from the list or start a new chat.
                            </Text>
                        </View>
                    </View>
                );
            }

            if (isGroupChat || selectedConversation.is_group) {
                return (
                    <ChatScreen
                        conversationId={selectedConversation.id}
                        currentUserId={userId}
                        isGroupChat={true}
                        groupId={selectedConversation.group_id || params.groupChatId || null}
                        groupName={selectedConversation.group_name || 'Group Chat'}
                        groupAvatar={selectedConversation.group_avatar_url}
                        isMuted={isConversationMuted(selectedConversation)}
                        mutedUntil={selectedConversation.muted_until ?? null}
                        onMuteChange={handleMuteChange}
                    />
                );
            }

            if (otherUser) {
                return (
                    <ChatScreen
                        conversationId={selectedConversation.id}
                        currentUserId={userId}
                        otherUser={otherUser}
                        isGroupChat={false}
                        isMuted={isConversationMuted(selectedConversation)}
                        mutedUntil={selectedConversation.muted_until ?? null}
                        onMuteChange={handleMuteChange}
                    />
                );
            }

            return (
                <View style={[styles.emptyChatPane, { backgroundColor: colors.background }]}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            );
        };

        return (
            <View style={[styles.desktopShell, { backgroundColor: colors.background }]}>
                <View style={[styles.desktopSidebar, { backgroundColor: colors.background, borderRightColor: colors.border }]}>
                    <ConversationsList
                        currentUserId={userId}
                        onSelectConversation={handleSelectConversation}
                        onNewConversation={() => router.push('/feed')}
                        selectedConversationId={selectedConversation?.id ?? null}
                    />
                </View>
                <View style={styles.desktopChatPane}>
                    {renderSelectedChat()}
                </View>
            </View>
        );
    }

    // If we have a selected conversation, show the chat
    if (selectedConversation && userId) {
        // For group chats
        if (isGroupChat || selectedConversation.is_group) {
            return (
                <ChatScreen
                    conversationId={selectedConversation.id}
                    currentUserId={userId}
                    isGroupChat={true}
                    groupId={selectedConversation.group_id || params.groupChatId || null}
                    groupName={selectedConversation.group_name || 'Group Chat'}
                    groupAvatar={selectedConversation.group_avatar_url}
                    isMuted={isConversationMuted(selectedConversation)}
                    mutedUntil={selectedConversation.muted_until ?? null}
                    onMuteChange={handleMuteChange}
                    onBack={handleBack}
                />
            );
        }
        
        // For 1-on-1 chats
        if (otherUser) {
            return (
                <ChatScreen
                    conversationId={selectedConversation.id}
                    currentUserId={userId}
                    otherUser={otherUser}
                    isGroupChat={false}
                    isMuted={isConversationMuted(selectedConversation)}
                    mutedUntil={selectedConversation.muted_until ?? null}
                    onMuteChange={handleMuteChange}
                    onBack={handleBack}
                />
            );
        }
    }

    // Otherwise, show the conversations list
    if (userId) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.background }}>
                <ConversationsList
                    currentUserId={userId}
                    onSelectConversation={handleSelectConversation}
                    onNewConversation={() => router.push('/feed')}
                />
            </View>
        );
    }

    return null;
}

const styles = StyleSheet.create({
    desktopShell: {
        flex: 1,
        flexDirection: 'row',
        minHeight: 0,
    },
    desktopSidebar: {
        width: 380,
        maxWidth: 420,
        borderRightWidth: StyleSheet.hairlineWidth,
    },
    desktopChatPane: {
        flex: 1,
        minWidth: 0,
    },
    emptyChatPane: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
    },
    emptyBubble: {
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 18,
        paddingHorizontal: 32,
        paddingVertical: 28,
        maxWidth: 360,
    },
    emptyChatTitle: {
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 8,
    },
    emptyChatText: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },
});

