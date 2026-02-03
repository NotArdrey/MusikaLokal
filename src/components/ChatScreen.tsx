import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { ConversationParticipant, Message, useChat, useGroupParticipants } from '../hooks/useChat';

interface ChatScreenProps {
    conversationId: string;
    currentUserId: string;
    // For 1-on-1 chats
    otherUser?: {
        id: string;
        full_name: string;
        avatar_url: string | null;
    };
    // For group chats
    isGroupChat?: boolean;
    groupName?: string;
    groupAvatar?: string | null;
    onBack?: () => void;
}

const ChatScreen: React.FC<ChatScreenProps> = ({
    conversationId,
    currentUserId,
    otherUser,
    isGroupChat = false,
    groupName,
    groupAvatar,
    onBack,
}) => {
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const { messages, loading, sending, sendMessage, markAsRead } = useChat(conversationId, currentUserId);
    const { participants } = useGroupParticipants(isGroupChat ? conversationId : null);
    const [text, setText] = useState('');
    const flatListRef = useRef<FlatList>(null);

    // Create a map of user IDs to their profile info for quick lookup in group chats
    const participantMap = React.useMemo(() => {
        const map = new Map<string, ConversationParticipant['profile']>();
        participants.forEach(p => {
            if (p.profile) {
                map.set(p.user_id, p.profile);
            }
        });
        return map;
    }, [participants]);

    // Mark messages as read when viewing
    useEffect(() => {
        markAsRead();
    }, [messages.length, markAsRead]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (messages.length > 0) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [messages.length]);

    const handleSend = async () => {
        if (!text.trim() || sending) return;
        const messageText = text.trim();
        setText('');
        await sendMessage(messageText);
    };

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    };

    const renderMessage = ({ item, index }: { item: Message; index: number }) => {
        const isMe = item.sender_id === currentUserId;
        const showDate = index === 0 ||
            formatDate(messages[index - 1].created_at) !== formatDate(item.created_at);
        
        // For group chats, check if we should show sender name
        const prevMessage = index > 0 ? messages[index - 1] : null;
        const showSenderName = isGroupChat && !isMe && (
            index === 0 || 
            prevMessage?.sender_id !== item.sender_id ||
            showDate
        );

        // Get sender info from message or participant map
        const senderProfile = item.sender || participantMap.get(item.sender_id);

        return (
            <>
                {showDate && (
                    <View style={styles.dateContainer}>
                        <Text style={[styles.dateText, { color: colors.textSecondary }]}>
                            {formatDate(item.created_at)}
                        </Text>
                    </View>
                )}
                <View style={[
                    styles.messageRow,
                    isMe ? styles.messageRowRight : styles.messageRowLeft,
                ]}>
                    {!isMe && (
                        <Image
                            source={
                                senderProfile?.avatar_url
                                    ? { uri: senderProfile.avatar_url }
                                    : require('../../assets/images/avatar-placeholder.png')
                            }
                            style={styles.avatar}
                        />
                    )}
                    <View style={styles.messageContent}>
                        {showSenderName && senderProfile && (
                            <Text style={[styles.senderName, { color: colors.primary }]}>
                                {senderProfile.full_name}
                            </Text>
                        )}
                        <View style={[
                            styles.messageBubble,
                            isMe
                                ? [styles.myMessage, { backgroundColor: colors.primary }]
                                : [styles.theirMessage, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }],
                        ]}>
                            <Text style={[
                                styles.messageText,
                                { color: isMe ? '#FFF' : colors.text },
                            ]}>
                                {item.content}
                            </Text>
                            <View style={styles.messageFooter}>
                                <Text style={[
                                    styles.messageTime,
                                    { color: isMe ? 'rgba(255,255,255,0.7)' : colors.textSecondary },
                                ]}>
                                    {formatTime(item.created_at)}
                                </Text>
                                {isMe && item.read_at && (
                                    <Ionicons
                                        name="checkmark-done"
                                        size={14}
                                        color="rgba(255,255,255,0.7)"
                                        style={{ marginLeft: 4 }}
                                    />
                                )}
                            </View>
                        </View>
                    </View>
                </View>
            </>
        );
    };

    // Get display info based on chat type
    const displayName = isGroupChat ? groupName : otherUser?.full_name;
    const displayAvatar = isGroupChat ? groupAvatar : otherUser?.avatar_url;
    const displaySubtitle = isGroupChat 
        ? `${participants.length} members` 
        : 'Online';

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[
                styles.header,
                {
                    backgroundColor: colors.background,
                    borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    paddingTop: insets.top || 16,
                },
            ]}>
                {onBack && (
                    <TouchableOpacity onPress={onBack} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </TouchableOpacity>
                )}
                {isGroupChat ? (
                    <View style={[styles.groupAvatarContainer, { backgroundColor: colors.primary }]}>
                        {displayAvatar ? (
                            <Image source={{ uri: displayAvatar }} style={styles.headerAvatar} />
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
                        style={styles.headerAvatar}
                    />
                )}
                <View style={styles.headerInfo}>
                    <Text style={[styles.headerName, { color: colors.text }]}>
                        {displayName || 'Chat'}
                    </Text>
                    <Text style={[styles.headerStatus, { color: colors.textSecondary }]}>
                        {displaySubtitle}
                    </Text>
                </View>
                <TouchableOpacity style={styles.headerAction}>
                    <Ionicons name="ellipsis-vertical" size={20} color={colors.text} />
                </TouchableOpacity>
            </View>

            {/* Messages */}
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.messagesContainer}
                keyboardVerticalOffset={0}
            >
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={colors.primary} />
                    </View>
                ) : messages.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="chatbubbles-outline" size={64} color={colors.textSecondary} />
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                            No messages yet
                        </Text>
                        <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                            Say hi to start the conversation!
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        keyExtractor={(item) => item.id}
                        renderItem={renderMessage}
                        contentContainerStyle={styles.messagesList}
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
                    />
                )}

                {/* Input */}
                <View style={[
                    styles.inputContainer,
                    {
                        backgroundColor: colors.background,
                        borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                        paddingBottom: insets.bottom || 16,
                    },
                ]}>
                    <TouchableOpacity style={styles.attachButton}>
                        <Ionicons name="attach" size={24} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TextInput
                        style={[
                            styles.input,
                            {
                                backgroundColor: isDark ? '#374151' : '#F3F4F6',
                                color: colors.text,
                            },
                        ]}
                        value={text}
                        onChangeText={setText}
                        placeholder="Type a message..."
                        placeholderTextColor={colors.textSecondary}
                        multiline
                        maxLength={1000}
                    />
                    <TouchableOpacity
                        onPress={handleSend}
                        disabled={!text.trim() || sending}
                        style={[
                            styles.sendButton,
                            {
                                backgroundColor: text.trim() ? colors.primary : colors.textSecondary,
                                opacity: sending ? 0.5 : 1,
                            },
                        ]}
                    >
                        {sending ? (
                            <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                            <Ionicons name="send" size={18} color="#FFF" />
                        )}
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
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
    headerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    groupAvatarContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerInfo: {
        flex: 1,
        marginLeft: 12,
    },
    headerName: {
        fontSize: 16,
        fontWeight: '600',
    },
    headerStatus: {
        fontSize: 12,
    },
    headerAction: {
        padding: 8,
    },
    messagesContainer: {
        flex: 1,
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
    },
    messagesList: {
        padding: 16,
        paddingBottom: 8,
    },
    dateContainer: {
        alignItems: 'center',
        marginVertical: 16,
    },
    dateText: {
        fontSize: 12,
        fontWeight: '500',
    },
    messageRow: {
        flexDirection: 'row',
        marginBottom: 8,
        maxWidth: '80%',
    },
    messageRowLeft: {
        alignSelf: 'flex-start',
    },
    messageRowRight: {
        alignSelf: 'flex-end',
    },
    avatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
        marginRight: 8,
    },
    messageContent: {
        flexShrink: 1,
    },
    senderName: {
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 2,
        marginLeft: 4,
    },
    messageBubble: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 18,
        maxWidth: '100%',
    },
    myMessage: {
        borderBottomRightRadius: 4,
    },
    theirMessage: {
        borderBottomLeftRadius: 4,
    },
    messageText: {
        fontSize: 15,
        lineHeight: 20,
    },
    messageFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 4,
    },
    messageTime: {
        fontSize: 11,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingTop: 12,
        borderTopWidth: 1,
    },
    attachButton: {
        padding: 8,
        marginBottom: 4,
    },
    input: {
        flex: 1,
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 15,
        maxHeight: 100,
        marginHorizontal: 8,
    },
    sendButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 4,
    },
});

export default ChatScreen;
