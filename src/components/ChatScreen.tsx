import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../context/ThemeContext';
import { ConversationParticipant, Message, useChat, useGroupParticipants } from '../hooks/useChat';

// Available reaction emojis
const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

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
    const { messages, loading, sending, sendMessage, markAsRead, addReaction, removeReaction } = useChat(conversationId, currentUserId);
    const { participants } = useGroupParticipants(isGroupChat ? conversationId : null);
    const [text, setText] = useState('');
    const flatListRef = useRef<FlatList>(null);
    const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const [showAttachmentPicker, setShowAttachmentPicker] = useState(false);
    const [uploading, setUploading] = useState(false);

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

    const handleLongPress = (messageId: string) => {
        setSelectedMessageId(messageId);
        setShowReactionPicker(true);
    };

    const handleSelectReaction = async (emoji: string) => {
        if (selectedMessageId) {
            const message = messages.find(m => m.id === selectedMessageId);
            const existingReaction = message?.reactions?.find(r => r.user_id === currentUserId);
            
            if (existingReaction?.emoji === emoji) {
                // Same emoji - remove it
                await removeReaction(selectedMessageId);
            } else {
                // Different or new emoji - add/update
                await addReaction(selectedMessageId, emoji);
            }
        }
        setShowReactionPicker(false);
        setSelectedMessageId(null);
    };

    // Check if the last message was read by the other user (for 1-on-1 chats)
    const getSeenStatus = () => {
        if (isGroupChat) return null;
        const myMessages = messages.filter(m => m.sender_id === currentUserId);
        if (myMessages.length === 0) return null;
        const lastMyMessage = myMessages[myMessages.length - 1];
        return lastMyMessage.read_at ? otherUser : null;
    };

    const seenByUser = getSeenStatus();

    // Pick and send image
    const handlePickImage = async () => {
        setShowAttachmentPicker(false);
        
        try {
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permissionResult.granted) {
                Alert.alert('Permission needed', 'Please allow access to your photos.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: 'images',
                allowsMultipleSelection: false,
                quality: 0.8,
            });

            if (result.canceled || !result.assets || result.assets.length === 0) return;

            setUploading(true);
            const asset = result.assets[0];
            const fileExt = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
            const fileName = `chat/${conversationId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

            // Upload to Supabase storage
            const response = await fetch(asset.uri);
            const arrayBuffer = await response.arrayBuffer();

            const { data, error } = await supabase.storage
                .from('chat-attachments')
                .upload(fileName, arrayBuffer, {
                    contentType: `image/${fileExt}`,
                    upsert: false
                });

            if (error) {
                console.error('Upload error:', error);
                Alert.alert('Upload Failed', error.message);
                setUploading(false);
                return;
            }

            // Get public URL
            const { data: urlData } = supabase.storage
                .from('chat-attachments')
                .getPublicUrl(fileName);

            // Send as image message
            await sendMessage('📷 Image', 'image', urlData.publicUrl);
            setUploading(false);
        } catch (err: any) {
            console.error('Error picking/uploading image:', err);
            Alert.alert('Error', 'Failed to upload image');
            setUploading(false);
        }
    };

    // Take photo with camera
    const handleTakePhoto = async () => {
        setShowAttachmentPicker(false);
        
        try {
            const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
            if (!permissionResult.granted) {
                Alert.alert('Permission needed', 'Please allow access to your camera.');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: 'images',
                quality: 0.8,
            });

            if (result.canceled || !result.assets || result.assets.length === 0) return;

            setUploading(true);
            const asset = result.assets[0];
            const fileExt = 'jpg';
            const fileName = `chat/${conversationId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

            // Upload to Supabase storage
            const response = await fetch(asset.uri);
            const arrayBuffer = await response.arrayBuffer();

            const { data, error } = await supabase.storage
                .from('chat-attachments')
                .upload(fileName, arrayBuffer, {
                    contentType: 'image/jpeg',
                    upsert: false
                });

            if (error) {
                console.error('Upload error:', error);
                Alert.alert('Upload Failed', error.message);
                setUploading(false);
                return;
            }

            // Get public URL
            const { data: urlData } = supabase.storage
                .from('chat-attachments')
                .getPublicUrl(fileName);

            // Send as image message
            await sendMessage('📷 Photo', 'image', urlData.publicUrl);
            setUploading(false);
        } catch (err: any) {
            console.error('Error taking/uploading photo:', err);
            Alert.alert('Error', 'Failed to upload photo');
            setUploading(false);
        }
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
                        senderProfile?.avatar_url ? (
                            <Image
                                source={{ uri: senderProfile.avatar_url }}
                                style={styles.avatar}
                            />
                        ) : (
                            <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                                <Ionicons name="person" size={20} color="#FFF" />
                            </View>
                        )
                    )}
                    <View style={styles.messageContent}>
                        {showSenderName && senderProfile && (
                            <Text style={[styles.senderName, { color: colors.primary }]}>
                                {senderProfile.full_name}
                            </Text>
                        )}
                        <Pressable
                            onLongPress={() => handleLongPress(item.id)}
                            delayLongPress={300}
                        >
                            <View style={[
                                styles.messageBubble,
                                isMe
                                    ? [styles.myMessage, { backgroundColor: colors.primary }]
                                    : [styles.theirMessage, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }],
                                item.message_type === 'image' && styles.imageBubble,
                            ]}>
                                {/* Image message */}
                                {item.message_type === 'image' && item.attachment_url && (
                                    <Image
                                        source={{ uri: item.attachment_url }}
                                        style={styles.messageImage}
                                        resizeMode="cover"
                                    />
                                )}
                                {/* Text content - hide default text for image messages */}
                                {item.message_type !== 'image' && (
                                    <Text style={[
                                        styles.messageText,
                                        { color: isMe ? '#FFF' : colors.text },
                                    ]}>
                                        {item.content}
                                    </Text>
                                )}
                                <View style={[
                                    styles.messageFooter,
                                    item.message_type === 'image' && styles.imageFooter,
                                ]}>
                                    <Text style={[
                                        styles.messageTime,
                                        { color: isMe ? 'rgba(255,255,255,0.7)' : colors.textSecondary },
                                        item.message_type === 'image' && { color: '#FFF', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 2 },
                                    ]}>
                                        {formatTime(item.created_at)}
                                    </Text>
                                    {isMe && item.read_at && (
                                        <Ionicons
                                            name="checkmark-done"
                                            size={14}
                                            color={item.message_type === 'image' ? '#FFF' : 'rgba(255,255,255,0.7)'}
                                            style={{ marginLeft: 4 }}
                                        />
                                    )}
                                </View>
                            </View>
                        </Pressable>
                        {/* Reactions display */}
                        {item.reactions && item.reactions.length > 0 && (
                            <View style={[
                                styles.reactionsContainer,
                                isMe ? styles.reactionsRight : styles.reactionsLeft,
                            ]}>
                                {/* Group reactions by emoji */}
                                {Object.entries(
                                    item.reactions.reduce((acc, r) => {
                                        acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                                        return acc;
                                    }, {} as Record<string, number>)
                                ).map(([emoji, count]) => (
                                    <View 
                                        key={emoji} 
                                        style={[
                                            styles.reactionBadge,
                                            { backgroundColor: isDark ? '#374151' : '#E5E7EB' }
                                        ]}
                                    >
                                        <Text style={styles.reactionEmoji}>{emoji}</Text>
                                        {count > 1 && (
                                            <Text style={[styles.reactionCount, { color: colors.textSecondary }]}>
                                                {count}
                                            </Text>
                                        )}
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                </View>
                {/* Seen indicator - show after last message sent by me */}
                {isMe && index === messages.length - 1 && seenByUser && (
                    <View style={styles.seenContainer}>
                        {seenByUser.avatar_url ? (
                            <Image source={{ uri: seenByUser.avatar_url }} style={styles.seenAvatar} />
                        ) : (
                            <View style={[styles.seenAvatar, styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                                <Ionicons name="person" size={8} color="#FFF" />
                            </View>
                        )}
                        <Text style={[styles.seenText, { color: colors.textSecondary }]}>Seen</Text>
                    </View>
                )}
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
                    paddingTop: (insets.top || 16) + 12,
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
                    displayAvatar ? (
                        <Image
                            source={{ uri: displayAvatar }}
                            style={styles.headerAvatar}
                        />
                    ) : (
                        <View style={[styles.headerAvatar, styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                            <Ionicons name="person" size={20} color="#FFF" />
                        </View>
                    )
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
                        // Add extra padding for devices with notches/home indicators
                        // Use at least 24px even if insets.bottom is 0
                        paddingBottom: Math.max(insets.bottom, 24) + 8,
                    },
                ]}>
                    <TouchableOpacity 
                        style={styles.attachButton}
                        onPress={() => setShowAttachmentPicker(true)}
                        disabled={uploading}
                    >
                        {uploading ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                            <Ionicons name="add-circle" size={28} color={colors.primary} />
                        )}
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

            {/* Reaction Picker Modal */}
            <Modal
                visible={showReactionPicker}
                transparent
                animationType="fade"
                onRequestClose={() => setShowReactionPicker(false)}
            >
                <Pressable 
                    style={styles.modalOverlay}
                    onPress={() => setShowReactionPicker(false)}
                >
                    <View style={[
                        styles.reactionPicker,
                        { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }
                    ]}>
                        {REACTION_EMOJIS.map((emoji) => (
                            <TouchableOpacity
                                key={emoji}
                                style={styles.reactionOption}
                                onPress={() => handleSelectReaction(emoji)}
                            >
                                <Text style={styles.reactionOptionEmoji}>{emoji}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </Pressable>
            </Modal>

            {/* Attachment Picker Modal */}
            <Modal
                visible={showAttachmentPicker}
                transparent
                animationType="slide"
                onRequestClose={() => setShowAttachmentPicker(false)}
            >
                <Pressable 
                    style={styles.modalOverlay}
                    onPress={() => setShowAttachmentPicker(false)}
                >
                    <View style={[
                        styles.attachmentPicker,
                        { backgroundColor: isDark ? '#1F2937' : '#FFFFFF' }
                    ]}>
                        <View style={styles.attachmentPickerHandle} />
                        <Text style={[styles.attachmentPickerTitle, { color: colors.text }]}>
                            Share
                        </Text>
                        <View style={styles.attachmentOptions}>
                            <TouchableOpacity 
                                style={styles.attachmentOption}
                                onPress={handlePickImage}
                            >
                                <View style={[styles.attachmentOptionIcon, { backgroundColor: '#8B5CF6' }]}>
                                    <Ionicons name="images" size={28} color="#FFF" />
                                </View>
                                <Text style={[styles.attachmentOptionText, { color: colors.text }]}>
                                    Gallery
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={styles.attachmentOption}
                                onPress={handleTakePhoto}
                            >
                                <View style={[styles.attachmentOptionIcon, { backgroundColor: '#EC4899' }]}>
                                    <Ionicons name="camera" size={28} color="#FFF" />
                                </View>
                                <Text style={[styles.attachmentOptionText, { color: colors.text }]}>
                                    Camera
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Pressable>
            </Modal>
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
    avatarPlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
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
    // Reaction styles
    reactionsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 4,
        gap: 4,
    },
    reactionsLeft: {
        justifyContent: 'flex-start',
    },
    reactionsRight: {
        justifyContent: 'flex-end',
    },
    reactionBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 12,
    },
    reactionEmoji: {
        fontSize: 14,
    },
    reactionCount: {
        fontSize: 11,
        marginLeft: 2,
    },
    // Seen indicator styles
    seenContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 4,
        marginRight: 4,
        marginBottom: 8,
    },
    seenAvatar: {
        width: 14,
        height: 14,
        borderRadius: 7,
        marginRight: 4,
    },
    seenText: {
        fontSize: 11,
    },
    // Reaction picker modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    reactionPicker: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 28,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 5,
    },
    reactionOption: {
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    reactionOptionEmoji: {
        fontSize: 28,
    },
    // Image message styles
    imageBubble: {
        padding: 4,
        overflow: 'hidden',
    },
    messageImage: {
        width: 200,
        height: 200,
        borderRadius: 14,
    },
    imageFooter: {
        position: 'absolute',
        bottom: 8,
        right: 8,
        backgroundColor: 'rgba(0,0,0,0.4)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    // Attachment picker styles
    attachmentPicker: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 40,
        paddingHorizontal: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 10,
    },
    attachmentPickerHandle: {
        width: 40,
        height: 4,
        backgroundColor: '#9CA3AF',
        borderRadius: 2,
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 16,
    },
    attachmentPickerTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 20,
        textAlign: 'center',
    },
    attachmentOptions: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 32,
    },
    attachmentOption: {
        alignItems: 'center',
    },
    attachmentOptionIcon: {
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    attachmentOptionText: {
        fontSize: 12,
        fontWeight: '500',
    },
});

export default ChatScreen;
