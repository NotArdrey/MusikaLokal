import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { Conversation, useConversations } from '../hooks/useChat';

interface ConversationsListProps {
    currentUserId: string;
    onSelectConversation: (conversation: Conversation) => void;
    onBack?: () => void;
}

const ConversationsList: React.FC<ConversationsListProps> = ({
    currentUserId,
    onSelectConversation,
    onBack,
}) => {
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const { conversations, loading, refetch } = useConversations(currentUserId);

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
            <TouchableOpacity
                style={[
                    styles.conversationItem,
                    {
                        backgroundColor: hasUnread
                            ? isDark ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.05)'
                            : 'transparent',
                    },
                ]}
                onPress={() => onSelectConversation(item)}
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
                        <Image
                            source={
                                displayAvatar
                                    ? { uri: displayAvatar }
                                    : require('../../assets/images/avatar-placeholder.png')
                            }
                            style={styles.avatar}
                        />
                    )}
                    {hasUnread && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
                </View>
                <View style={styles.conversationContent}>
                    <View style={styles.conversationHeader}>
                        <View style={styles.nameContainer}>
                            {isGroup && (
                                <Ionicons 
                                    name="people" 
                                    size={14} 
                                    color={colors.textSecondary} 
                                    style={{ marginRight: 4 }}
                                />
                            )}
                            <Text
                                style={[
                                    styles.conversationName,
                                    { color: colors.text, fontWeight: hasUnread ? '700' : '600' },
                                ]}
                                numberOfLines={1}
                            >
                                {displayName || 'Chat'}
                            </Text>
                        </View>
                        <Text style={[styles.conversationTime, { color: colors.textSecondary }]}>
                            {lastMessage ? formatTime(lastMessage.created_at) : ''}
                        </Text>
                    </View>
                    <View style={styles.conversationPreview}>
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
                        {hasUnread && (
                            <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                                <Text style={styles.unreadCount}>
                                    {item.unread_count! > 99 ? '99+' : item.unread_count}
                                </Text>
                            </View>
                        )}
                    </View>
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
                        borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                        paddingTop: insets.top || 16,
                    },
                ]}
            >
                {onBack && (
                    <TouchableOpacity onPress={onBack} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </TouchableOpacity>
                )}
                <Text style={[styles.headerTitle, { color: colors.text }]}>Messages</Text>
                <TouchableOpacity style={styles.headerAction}>
                    <Ionicons name="create-outline" size={24} color={colors.primary} />
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
                </View>
            ) : (
                <FlatList
                    data={conversations}
                    keyExtractor={(item) => item.id}
                    renderItem={renderConversation}
                    contentContainerStyle={styles.list}
                    refreshing={loading}
                    onRefresh={refetch}
                    ItemSeparatorComponent={() => (
                        <View style={[styles.separator, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]} />
                    )}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
    },
    backButton: {
        marginRight: 12,
    },
    headerTitle: {
        flex: 1,
        fontSize: 20,
        fontWeight: '700',
    },
    headerAction: {
        padding: 8,
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
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    avatarContainer: {
        position: 'relative',
    },
    avatar: {
        width: 52,
        height: 52,
        borderRadius: 26,
    },
    groupAvatar: {
        width: 52,
        height: 52,
        borderRadius: 26,
        justifyContent: 'center',
        alignItems: 'center',
    },
    unreadDot: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 2,
        borderColor: '#FFF',
    },
    conversationContent: {
        flex: 1,
        marginLeft: 12,
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
        fontSize: 16,
        flex: 1,
    },
    conversationTime: {
        fontSize: 12,
    },
    conversationPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    lastMessage: {
        fontSize: 14,
        flex: 1,
        marginRight: 8,
    },
    memberCount: {
        fontSize: 11,
        marginTop: 2,
    },
    unreadBadge: {
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 6,
    },
    unreadCount: {
        color: '#FFF',
        fontSize: 11,
        fontWeight: '600',
    },
    separator: {
        height: 1,
        marginLeft: 80,
    },
});

export default ConversationsList;
