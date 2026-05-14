import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { emitToast } from '../events/toastBus';
import { useBottomBarClearance } from '../hooks/useBottomBarClearance';
import { Conversation, isConversationMuted, useConversations } from '../hooks/useChat';
import Header from './header';
import ProfileAvatar from './ProfileAvatar';
import UserSearchModal from './UserSearchModal';

interface ConversationsListProps {
    currentUserId: string;
    onSelectConversation: (conversation: Conversation) => void;
    onNewConversation?: () => void;
}

const ConversationsList: React.FC<ConversationsListProps> = ({
    currentUserId,
    onSelectConversation,
    onNewConversation,
}) => {
    const { colors, isDark } = useTheme();
    const { contentBottomPadding } = useBottomBarClearance();
    const { conversations, loading, refetch, toggleConversationMute } = useConversations(currentUserId);
    const [showNewMessageModal, setShowNewMessageModal] = useState(false);

    const handleSelectUserForNewMessage = (user: { id: string; full_name: string; avatar_url: string | null }) => {
        setShowNewMessageModal(false);
        // Navigate to chat with this user
        router.push({
            pathname: '/chat',
            params: {
                recipientId: user.id,
                recipientName: user.full_name,
                recipientAvatar: user.avatar_url || '',
            },
        });
    };

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days === 0) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (days === 1) {
            return 'Yesterday';
        } else if (days < 7) {
            return date.toLocaleDateString([], { weekday: 'short' });
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    };

    const handleToggleMute = async (conversation: Conversation) => {
        const nextMuted = !isConversationMuted(conversation);

        try {
            await toggleConversationMute(conversation.id, nextMuted);
            emitToast({
                dedupeKey: `conversation-mute:${conversation.id}:${nextMuted}`,
                title: nextMuted ? 'Chat muted' : 'Chat unmuted',
                message: nextMuted
                    ? 'New messages stay in your list without pop-up alerts.'
                    : 'New messages can show pop-up alerts again.',
                type: 'info',
                source: 'chat-mute',
            });
        } catch (err: any) {
            emitToast({
                dedupeKey: `conversation-mute-error:${conversation.id}`,
                title: 'Mute failed',
                message: err?.message || 'Could not update this chat.',
                type: 'error',
                source: 'chat-mute',
            });
        }
    };

    const renderConversation = ({ item }: { item: Conversation }) => {
        const isGroup = item.is_group;
        const otherUser = item.other_participant;
        const lastMessage = item.last_message;
        const muted = isConversationMuted(item);
        const hasUnread = (item.unread_count || 0) > 0;
        const isLastMessageFromMe = !!lastMessage && lastMessage.sender_id === currentUserId;
        const isLastMessageSeen = !isGroup && isLastMessageFromMe && !!lastMessage?.read_at;
        const showOutgoingStatus = !hasUnread && isLastMessageFromMe;

        // Determine display info based on chat type
        const displayName = isGroup
            ? item.group_name
            : otherUser?.full_name;
        const displayAvatar = isGroup
            ? item.group_avatar_url
            : otherUser?.avatar_url;

        // For group chats, show sender name in preview
        const getPreviewText = () => {
            if (!lastMessage) return 'No messages yet';

            if (lastMessage.sender_id === currentUserId) {
                return `You: ${lastMessage.content}`;
            }

            if (isGroup && lastMessage.sender) {
                const firstName = lastMessage.sender.full_name?.split(' ')[0] || 'Someone';
                return `${firstName}: ${lastMessage.content}`;
            }

            return lastMessage.content;
        };

        return (
            <TouchableOpacity
                style={[
                    styles.conversationItem,
                    hasUnread && { backgroundColor: isDark ? 'rgba(99,102,241,0.06)' : 'rgba(99,102,241,0.04)' },
                ]}
                onPress={() => onSelectConversation(item)}
                onLongPress={() => {
                    void handleToggleMute(item);
                }}
                delayLongPress={260}
                accessibilityRole="button"
                accessibilityLabel={`${displayName || 'Chat'}${muted ? ', muted' : ''}`}
                accessibilityHint="Open chat. Long press to mute or unmute notifications."
                activeOpacity={1}
            >
                {/* Avatar */}
                <View style={styles.avatarContainer}>
                    {isGroup ? (
                        <View style={[styles.groupAvatar, { backgroundColor: colors.primary }]}>
                            <ProfileAvatar
                                uri={displayAvatar}
                                style={styles.avatar}
                                iconName="people"
                                iconSize={26}
                                backgroundColor={colors.primary}
                                iconColor="#FFF"
                            />
                        </View>
                    ) : (
                        <ProfileAvatar
                            uri={displayAvatar}
                            style={styles.avatar}
                            backgroundColor={isDark ? '#374151' : '#E5E7EB'}
                            iconColor={colors.textSecondary}
                        />
                    )}
                    {hasUnread && (
                        <View style={styles.unreadDot} />
                    )}
                </View>

                {/* Content */}
                <View style={styles.conversationContent}>
                    {/* Name + Time row */}
                    <View style={styles.conversationHeader}>
                        <View style={styles.nameContainer}>
                            {isGroup && (
                                <Ionicons name="people" size={12} color={colors.textSecondary} style={{ marginRight: 4, marginTop: 1 }} />
                            )}
                            <Text
                                style={[styles.conversationName, { color: colors.text, fontWeight: hasUnread ? '700' : '600' }]}
                                numberOfLines={1}
                            >
                                {displayName || 'Chat'}
                            </Text>
                            {muted && (
                                <Ionicons
                                    name="notifications-off-outline"
                                    size={14}
                                    color={colors.textSecondary}
                                    style={styles.mutedIcon}
                                />
                            )}
                        </View>
                        <Text style={[styles.conversationTime, { color: hasUnread ? colors.primary : colors.textSecondary, fontWeight: hasUnread ? '700' : '400' }]}>
                            {lastMessage ? formatTime(lastMessage.created_at) : ''}
                        </Text>
                    </View>

                    {/* Preview + badge row */}
                    <View style={styles.previewRow}>
                        <Text
                            style={[
                                styles.lastMessage,
                                { color: hasUnread ? colors.text : colors.textSecondary, fontWeight: hasUnread ? '500' : '400' },
                            ]}
                            numberOfLines={1}
                        >
                            {getPreviewText()}
                        </Text>
                        {hasUnread ? (
                            <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                                <Text style={styles.unreadCount}>
                                    {(item.unread_count || 0) > 99 ? '99+' : item.unread_count}
                                </Text>
                            </View>
                        ) : showOutgoingStatus ? (
                            <View style={styles.outgoingStatusRow}>
                                {isLastMessageSeen && otherUser?.avatar_url ? (
                                    <ProfileAvatar
                                        uri={otherUser.avatar_url}
                                        style={styles.seenAvatarIndicator}
                                        iconSize={8}
                                        backgroundColor={isDark ? '#374151' : '#E5E7EB'}
                                        iconColor={colors.textSecondary}
                                    />
                                ) : isLastMessageSeen ? (
                                    <Ionicons name="checkmark-done" size={15} color={colors.primary} />
                                ) : (
                                    <Ionicons name="checkmark" size={15} color={colors.textSecondary} />
                                )}
                            </View>
                        ) : null}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <View
                style={[
                    styles.topSection,
                    {
                        backgroundColor: colors.background,
                        borderBottomColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
                    },
                ]}
            >
                <Header
                    title="Messages"
                    rightIconName="create-outline"
                    rightIconOnPress={() => setShowNewMessageModal(true)}
                />
                <View style={styles.searchBarContainer}>
                    <TouchableOpacity
                        style={[styles.searchBar, { backgroundColor: isDark ? '#374151' : '#F3F4F6' }]}
                        onPress={() => setShowNewMessageModal(true)}
                        activeOpacity={1}
                    >
                        <Ionicons name="search" size={20} color={colors.textSecondary} />
                        <Text style={[styles.searchBarText, { color: colors.textSecondary }]} numberOfLines={1}>
                            Search or start new chat...
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Content */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : conversations.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <View style={[styles.emptyIconWrap, { backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.1)' }]}>
                        <Ionicons name="chatbubbles-outline" size={40} color={colors.primary} />
                    </View>
                    <Text style={[styles.emptyText, { color: colors.text }]}>
                        No conversations yet
                    </Text>
                    <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                        Message musicians, studios, or venue owners directly from their profiles
                    </Text>
                    <TouchableOpacity
                        style={[styles.newMessageButton, { backgroundColor: colors.primary }]}
                        onPress={() => setShowNewMessageModal(true)}
                        activeOpacity={1}
                    >
                        <Ionicons name="create" size={18} color="#FFF" />
                        <Text style={styles.newMessageButtonText}>New Message</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={conversations}
                    keyExtractor={(item) => item.id}
                    renderItem={renderConversation}
                    contentContainerStyle={[styles.list, { paddingBottom: contentBottomPadding }]}
                    initialNumToRender={14}
                    maxToRenderPerBatch={20}
                    windowSize={10}
                    removeClippedSubviews={Platform.OS === 'android'}
                    refreshing={loading}
                    onRefresh={refetch}
                    ItemSeparatorComponent={() => (
                        <View style={[styles.separator, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]} />
                    )}
                    showsVerticalScrollIndicator={false}
                />
            )}

            {/* New Message Modal */}
            <UserSearchModal
                visible={showNewMessageModal}
                onClose={() => setShowNewMessageModal(false)}
                onSelectUser={handleSelectUserForNewMessage}
                currentUserId={currentUserId}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    topSection: {
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    searchBarContainer: {
        paddingHorizontal: 20,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        height: 48,
        borderRadius: 16,
        paddingHorizontal: 16,
        marginBottom: 2,
    },
    searchBarText: {
        flex: 1,
        fontSize: 15,
        fontFamily: 'Poppins_500Medium',
        lineHeight: 20,
        includeFontPadding: false,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    emptyIconWrap: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyText: {
        fontSize: 19,
        fontWeight: '700',
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 24,
    },
    list: {
        paddingTop: 6,
    },
    conversationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    avatarContainer: {
        position: 'relative',
        marginRight: 12,
    },
    avatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
    },
    groupAvatar: {
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    unreadDot: {
        position: 'absolute',
        bottom: 1,
        right: 1,
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: '#EF4444',
        borderWidth: 2,
        borderColor: '#FFFFFF',
    },
    conversationContent: {
        flex: 1,
        gap: 3,
    },
    conversationHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    nameContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 8,
    },
    conversationName: {
        fontSize: 15.5,
        flex: 1,
    },
    mutedIcon: {
        marginLeft: 6,
    },
    conversationTime: {
        fontSize: 12,
    },
    previewRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    lastMessage: {
        fontSize: 13.5,
        flex: 1,
        marginRight: 8,
    },
    outgoingStatusRow: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    seenAvatarIndicator: {
        width: 16,
        height: 16,
        borderRadius: 8,
    },
    unreadBadge: {
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 5,
    },
    unreadCount: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '700',
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        marginLeft: 84,
    },
    newMessageButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 13,
        borderRadius: 24,
        marginTop: 24,
        gap: 8,
    },
    newMessageButtonText: {
        color: '#FFF',
        fontSize: 15,
        fontWeight: '600',
    },
});

export default ConversationsList;
