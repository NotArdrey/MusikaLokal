import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEFAULT_AVATAR } from '../constants/Images';
import { useTheme } from '../context/ThemeContext';
import { Conversation, useConversations } from '../hooks/useChat';
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
    const insets = useSafeAreaInsets();
    const { conversations, loading, refetch } = useConversations(currentUserId);
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

    const renderConversation = ({ item }: { item: Conversation }) => {
        const isGroup = item.is_group;
        const otherUser = item.other_participant;
        const lastMessage = item.last_message;
        const hasUnread = (item.unread_count || 0) > 0;

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
            <TouchableOpacity activeOpacity={1}
                style={styles.conversationItem}
                onPress={() => onSelectConversation(item)}
                activeOpacity={1}
            >
                <View style={styles.avatarContainer}>
                    {isGroup ? (
                        <View style={[styles.groupAvatar, { backgroundColor: colors.primary }]}>
                            {displayAvatar ? (
                                <Image source={{ uri: displayAvatar }} style={styles.avatar} />
                            ) : (
                                <Ionicons name="people" size={24} color="#FFF" />
                            )}
                        </View>
                    ) : (
                        displayAvatar ? (
                            <Image source={{ uri: displayAvatar }} style={styles.avatar} />
                        ) : (
                            <Image source={DEFAULT_AVATAR} style={styles.avatar} />
                        )
                    )}
                    {hasUnread && (
                        <View style={[styles.unreadDot, { backgroundColor: colors.primary, borderColor: isDark ? colors.background : '#FFFFFF' }]} />
                    )}
                </View>
                <View style={styles.conversationContent}>
                    <View style={styles.conversationHeader}>
                        <View style={styles.nameContainer}>
                            {isGroup && (
                                <Ionicons
                                    name="people"
                                    size={13}
                                    color={colors.textSecondary}
                                    style={{ marginRight: 4 }}
                                />
                            )}
                            <Text
                                style={[
                                    styles.conversationName,
                                    {
                                        color: colors.text,
                                        fontWeight: hasUnread ? '700' : '500',
                                    },
                                ]}
                                numberOfLines={1}
                            >
                                {displayName || 'Chat'}
                            </Text>
                        </View>
                        <View style={styles.timeAndBadgeRow}>
                            <Text style={[
                                styles.conversationTime,
                                { color: hasUnread ? colors.primary : colors.textSecondary },
                            ]}>
                                {lastMessage ? formatTime(lastMessage.created_at) : ''}
                            </Text>
                            {hasUnread && (
                                <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                                    <Text style={styles.unreadCount}>
                                        {(item.unread_count || 0) > 99 ? '99+' : item.unread_count}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>
                    <Text
                        style={[
                            styles.lastMessage,
                            {
                                color: hasUnread ? colors.text : colors.textSecondary,
                                fontWeight: hasUnread ? '500' : '400',
                            },
                        ]}
                        numberOfLines={1}
                    >
                        {getPreviewText()}
                    </Text>
                    {isGroup && (
                        <Text style={[styles.memberCount, { color: colors.textSecondary }]}>
                            {item.participant_count || 0} members
                        </Text>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View
                style={[
                    styles.header,
                    {
                        backgroundColor: colors.background,
                        paddingTop: (insets.top || 16) + 12,
                    },
                ]}
            >
                <View style={styles.headerTopRow}>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Messages</Text>
                    <TouchableOpacity activeOpacity={1}
                        style={[styles.composeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]}
                        onPress={() => setShowNewMessageModal(true)}
                    >
                        <Ionicons name="create-outline" size={22} color={colors.primary} />
                    </TouchableOpacity>
                </View>

                {/* Search Bar */}
                <TouchableOpacity activeOpacity={1}
                    style={styles.searchContainer}
                    onPress={() => setShowNewMessageModal(true)}
                    activeOpacity={1}
                >
                    <View style={[styles.searchBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
                        <Ionicons name="search" size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
                        <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Search or start a new chat</Text>
                    </View>
                </TouchableOpacity>
            </View>

            {/* Content */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : conversations.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="chatbubbles-outline" size={64} color={colors.textSecondary} />
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                        No conversations yet
                    </Text>
                    <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                        Start a conversation by messaging someone from their profile
                    </Text>
                    <TouchableOpacity activeOpacity={1}
                        style={[styles.newMessageButton, { backgroundColor: colors.primary }]}
                        onPress={() => setShowNewMessageModal(true)}
                    >
                        <Ionicons name="create" size={20} color="#FFF" />
                        <Text style={styles.newMessageButtonText}>New Message</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={conversations}
                    keyExtractor={(item) => item.id}
                    renderItem={renderConversation}
                    contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom, 24) + 80 }]}
                    refreshing={loading}
                    onRefresh={refetch}
                    ItemSeparatorComponent={() => (
                        <View style={[styles.separator, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]} />
                    )}
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
    header: {
        paddingHorizontal: 20,
        paddingBottom: 10,
        borderBottomWidth: 0,
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    headerTitle: {
        fontSize: 26,
        fontWeight: '800',
    },
    composeBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    searchContainer: {
        marginBottom: 6,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 42,
        borderRadius: 21,
        paddingHorizontal: 16,
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
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        marginTop: 16,
    },
    emptySubtext: {
        fontSize: 14,
        marginTop: 8,
        textAlign: 'center',
        paddingHorizontal: 32,
    },
    list: {
        paddingVertical: 8,
    },
    conversationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    avatarContainer: {
        position: 'relative',
    },
    avatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
    },
    avatarPlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    groupAvatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
    },
    unreadDot: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 3,
        borderColor: '#FFF', // Should match background, assumed white/black. 
    },
    conversationContent: {
        flex: 1,
        marginLeft: 12,
    },
    conversationHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 3,
    },
    nameContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 8,
    },
    conversationName: {
        fontSize: 15,
        flex: 1,
    },
    timeAndBadgeRow: {
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 4,
    },
    conversationTime: {
        fontSize: 11,
        fontWeight: '500',
    },
    conversationPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    lastMessage: {
        fontSize: 13,
        flex: 1,
    },
    memberCount: {
        fontSize: 12,
        marginTop: 2,
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
        height: 1,
        marginLeft: 80,
    },
    newMessageButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 24,
        marginTop: 20,
        gap: 8,
    },
    newMessageButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default ConversationsList;
