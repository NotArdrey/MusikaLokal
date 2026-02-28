import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Linking,
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
import CustomAlert, { AlertType } from './CustomAlert';
import ReportModal from './ReportModal';

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
    groupId?: string | null;
    groupName?: string;
    groupAvatar?: string | null;
    onBack?: () => void;
}

const ChatScreen: React.FC<ChatScreenProps> = ({
    conversationId,
    currentUserId,
    otherUser,
    isGroupChat = false,
    groupId,
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
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState<{
        type: AlertType;
        title: string;
        message: string;
        buttons?: any[];
    }>({
        type: 'info',
        title: '',
        message: '',
    });
    const [showReportModal, setShowReportModal] = useState(false);
    const [showOptions, setShowOptions] = useState(false);

    const showAlert = (type: AlertType, title: string, message: string, buttons?: any[]) => {
        setAlertConfig({ type, title, message, buttons });
        setAlertVisible(true);
    };

    const openOtherUserProfile = () => {
        if (isGroupChat || !otherUser?.id) return;
        if (otherUser.id === currentUserId) return;

        router.push({
            pathname: '/profile',
            params: { userId: otherUser.id },
        } as any);
    };

    const submitChatReport = async (reason: string) => {
        const reportType = isGroupChat ? 'group' : 'profile';
        const reportTargetId = isGroupChat ? groupId : otherUser?.id;

        if (!reportTargetId) {
            showAlert('error', 'Unable to Report', 'Missing report target.');
            return;
        }

        try {
            const { error } = await supabase.functions.invoke('manage-details', {
                body: {
                    action: 'report',
                    type: reportType,
                    id: reportTargetId,
                    userId: currentUserId,
                    reason,
                    details: null,
                },
            });

            if (error) throw error;
            // ReportModal shows its own built-in success screen
        } catch (e: any) {
            showAlert('error', 'Report Failed', e?.message || 'Failed to submit report.');
        }
    };

    const handleOpenReport = () => {
        setShowOptions(false);
        if (isGroupChat && !groupId) {
            showAlert('error', 'Unable to Report', 'Group information is missing.');
            return;
        }
        if (!isGroupChat && !otherUser?.id) {
            showAlert('error', 'Unable to Report', 'User information is missing.');
            return;
        }
        setShowReportModal(true);
    };

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

    // Pick and send a file/document (5 MB limit)
    const handlePickFile = async () => {
        setShowAttachmentPicker(false);

        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: true,
            });

            if (result.canceled || !result.assets || result.assets.length === 0) return;

            const asset = result.assets[0];

            // 5 MB size limit
            const MAX_SIZE = 5 * 1024 * 1024;
            if (asset.size && asset.size > MAX_SIZE) {
                showAlert('warning', 'File Too Large', 'Please select a file smaller than 5 MB.');
                return;
            }

            setUploading(true);
            const fileExt = asset.name.split('.').pop()?.toLowerCase() || 'bin';
            const fileName = `chat/${conversationId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

            // Upload to Supabase storage
            const response = await fetch(asset.uri);
            const arrayBuffer = await response.arrayBuffer();

            const { error } = await supabase.storage
                .from('chat-attachments')
                .upload(fileName, arrayBuffer, {
                    contentType: asset.mimeType || 'application/octet-stream',
                    upsert: false,
                });

            if (error) {
                console.error('Upload error:', error);
                showAlert('error', 'Upload Failed', error.message);
                setUploading(false);
                return;
            }

            // Get public URL
            const { data: urlData } = supabase.storage
                .from('chat-attachments')
                .getPublicUrl(fileName);

            // Send as file message
            await sendMessage(`📄 ${asset.name}`, 'file', urlData.publicUrl);
            setUploading(false);
        } catch (err: any) {
            console.error('Error picking/uploading file:', err);
            showAlert('error', 'Error', 'Failed to upload file');
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
                        <View style={[styles.dateLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]} />
                        <View style={[styles.datePill, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
                            <Text style={[styles.dateText, { color: colors.textSecondary }]}>
                                {formatDate(item.created_at)}
                            </Text>
                        </View>
                        <View style={[styles.dateLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]} />
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
                                {/* File message */}
                                {item.message_type === 'file' && item.attachment_url && (
                                    <TouchableOpacity activeOpacity={1}
                                        style={[styles.fileBubble, { borderColor: isMe ? 'rgba(255,255,255,0.3)' : colors.border }]}
                                        onPress={() => Linking.openURL(item.attachment_url!)}
                                        activeOpacity={1}
                                    >
                                        <Ionicons name="document-attach" size={28} color={isMe ? '#FFF' : colors.primary} />
                                        <View style={{ flex: 1, marginLeft: 8 }}>
                                            <Text style={[styles.fileName, { color: isMe ? '#FFF' : colors.text }]} numberOfLines={2}>
                                                {item.content.replace('📄 ', '')}
                                            </Text>
                                            <Text style={[styles.fileSubtext, { color: isMe ? 'rgba(255,255,255,0.7)' : colors.textSecondary }]}>
                                                Tap to open
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                )}
                                {/* Text content - hide default text for image/file messages */}
                                {item.message_type !== 'image' && item.message_type !== 'file' && (
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
        ? `${participants.length} member${participants.length !== 1 ? 's' : ''}`
        : null;
    const reportTargetName = isGroupChat ? (groupName || 'this group') : (otherUser?.full_name || 'this user');
    const reportTitle = isGroupChat ? 'Report Group' : 'Report User';

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[
                styles.header,
                {
                    backgroundColor: colors.background,
                    borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                    paddingTop: (insets.top || 16) + 8,
                },
            ]}>
                {onBack && (
                    <TouchableOpacity activeOpacity={1} onPress={onBack} style={styles.backButton} hitSlop={8}>
                        <Ionicons name="chevron-back" size={26} color={colors.text} />
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    onPress={openOtherUserProfile}
                    disabled={isGroupChat || !otherUser?.id || otherUser.id === currentUserId}
                    activeOpacity={1}
                    style={styles.headerMainTouchable}
                >
                    {/* Avatar with online indicator */}
                    <View style={styles.headerAvatarWrap}>
                        {isGroupChat ? (
                            <View style={[styles.groupAvatarContainer, { backgroundColor: colors.primary }]}>
                                {displayAvatar ? (
                                    <Image source={{ uri: displayAvatar }} style={styles.headerAvatar} />
                                ) : (
                                    <Ionicons name="people" size={22} color="#FFF" />
                                )}
                            </View>
                        ) : (
                            displayAvatar ? (
                                <Image source={{ uri: displayAvatar }} style={styles.headerAvatar} />
                            ) : (
                                <View style={[styles.headerAvatar, styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                                    <Ionicons name="person" size={20} color="#FFF" />
                                </View>
                            )
                        )}
                        {!isGroupChat && (
                            <View style={styles.onlineDot} />
                        )}
                    </View>
                    <View style={styles.headerInfo}>
                        <Text style={[styles.headerName, { color: colors.text }]} numberOfLines={1}>
                            {displayName || 'Chat'}
                        </Text>
                        <Text style={[styles.headerStatus, { color: '#10B981' }]}>
                            {displaySubtitle ?? 'Active now'}
                        </Text>
                    </View>
                </TouchableOpacity>
                <View style={styles.headerActions}>
                    <TouchableOpacity activeOpacity={1}
                        style={[styles.headerActionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                        onPress={() => setShowOptions(true)}
                    >
                        <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Options Bottom Sheet */}
            <Modal
                visible={showOptions}
                transparent
                animationType="slide"
                onRequestClose={() => setShowOptions(false)}
            >
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setShowOptions(false)}
                >
                    <View style={[styles.optionsSheet, { backgroundColor: isDark ? '#1E2530' : '#FFFFFF' }]}>
                        <View style={styles.attachmentPickerHandle} />
                        <Text style={[styles.optionsSheetTitle, { color: colors.text }]}>
                            {displayName || 'Options'}
                        </Text>
                        {!isGroupChat && otherUser?.id !== currentUserId && (
                        <TouchableOpacity activeOpacity={1}
                            style={[styles.optionRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                            onPress={() => {
                                setShowOptions(false);
                                openOtherUserProfile();
                            }}
                        >
                            <View style={[styles.optionIconWrap, { backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.1)' }]}>
                                <Ionicons name="person" size={20} color={colors.primary} />
                            </View>
                            <Text style={[styles.optionLabel, { color: colors.text }]}>View Profile</Text>
                            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                        )}
                        <TouchableOpacity activeOpacity={1}
                            style={[styles.optionRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                            onPress={handleOpenReport}
                        >
                            <View style={[styles.optionIconWrap, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
                                <Ionicons name="flag" size={20} color="#EF4444" />
                            </View>
                            <Text style={[styles.optionLabel, { color: '#EF4444' }]}>Report</Text>
                            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity activeOpacity={1}
                            style={styles.optionCancelBtn}
                            onPress={() => setShowOptions(false)}
                        >
                            <Text style={[styles.optionCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>

            {/* Report Modal */}
            <ReportModal
                visible={showReportModal}
                onClose={() => setShowReportModal(false)}
                onSubmit={async (reason) => { await submitChatReport(reason); }}
                targetName={reportTargetName}
                title={reportTitle}
            />

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
                        borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                        paddingBottom: Math.max(insets.bottom, 10) + 8,
                        borderTopWidth: 1,
                    },
                ]}>
                    {/* Media actions – collapse to single add when typing */}
                    {text.trim().length === 0 ? (
                        <View style={styles.inputLeftActions}>
                            <TouchableOpacity activeOpacity={1} style={styles.inputAction} onPress={() => setShowAttachmentPicker(true)}>
                                <Ionicons name="add-circle" size={28} color={colors.primary} />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity activeOpacity={1} style={styles.inputAction} onPress={() => setShowAttachmentPicker(true)}>
                            <Ionicons name="add-circle" size={28} color={colors.primary} />
                        </TouchableOpacity>
                    )}

                    <View style={[
                        styles.textInputWrapper,
                        { backgroundColor: isDark ? '#2C2F3A' : '#F0F2F5' }
                    ]}>
                        <TextInput
                            style={[styles.input, { color: colors.text }]}
                            value={text}
                            onChangeText={setText}
                            placeholder="Aa"
                            placeholderTextColor={colors.textSecondary}
                            multiline
                            maxLength={1000}
                        />

                    </View>

                    {text.trim().length > 0 ? (
                        <TouchableOpacity activeOpacity={1}
                            onPress={handleSend}
                            disabled={!text.trim() || sending}
                            style={[styles.sendButton, { backgroundColor: colors.primary }]}
                        >
                            {sending ? (
                                <ActivityIndicator size="small" color="#FFF" />
                            ) : (
                                <Ionicons name="send" size={20} color="#FFF" />
                            )}
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity activeOpacity={1} style={styles.thumbsUpButton} onPress={() => sendMessage('👍')}>
                            <Ionicons name="thumbs-up" size={27} color={colors.primary} />
                        </TouchableOpacity>
                    )}
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
                            <TouchableOpacity activeOpacity={1}
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
                            <TouchableOpacity activeOpacity={1}
                                style={styles.attachmentOption}
                                onPress={handlePickFile}
                            >
                                <View style={[styles.attachmentOptionIcon, { backgroundColor: '#3B82F6' }]}>
                                    <Ionicons name="document-attach" size={28} color="#FFF" />
                                </View>
                                <Text style={[styles.attachmentOptionText, { color: colors.text }]}>
                                    Files
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Pressable>
            </Modal>

            <CustomAlert
                visible={alertVisible}
                type={alertConfig.type}
                title={alertConfig.title}
                message={alertConfig.message}
                buttons={alertConfig.buttons}
                onClose={() => setAlertVisible(false)}
            />
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
        paddingHorizontal: 12,
        paddingBottom: 10,
        borderBottomWidth: 1,
        gap: 4,
    },
    backButton: {
        padding: 4,
    },
    headerMainTouchable: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    headerAvatarWrap: {
        position: 'relative',
    },
    headerAvatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
    },
    groupAvatarContainer: {
        width: 42,
        height: 42,
        borderRadius: 21,
        justifyContent: 'center',
        alignItems: 'center',
    },
    onlineDot: {
        position: 'absolute',
        bottom: 1,
        right: 1,
        width: 11,
        height: 11,
        borderRadius: 6,
        backgroundColor: '#10B981',
        borderWidth: 2,
        borderColor: '#FFFFFF',
    },
    headerInfo: {
        flex: 1,
        marginLeft: 10,
    },
    headerName: {
        fontSize: 16,
        fontWeight: '700',
    },
    headerStatus: {
        fontSize: 12,
        fontWeight: '500',
    },
    headerActionBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 6,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
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
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 16,
        paddingHorizontal: 16,
        gap: 10,
    },
    dateLine: {
        flex: 1,
        height: 1,
    },
    datePill: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
    },
    dateText: {
        fontSize: 11,
        fontWeight: '600',
        letterSpacing: 0.3,
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
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        maxWidth: '100%',
    },
    myMessage: {
        backgroundColor: '#0084FF', // Classic Messenger Blue fallback if primary not set
    },
    theirMessage: {
        backgroundColor: '#E4E6EB', // Classic Gray
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
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingTop: 8,
        borderTopWidth: 0, // Removed border for cleaner look
    },
    inputLeftActions: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 8,
    },
    inputAction: {
        padding: 4,
    },
    textInputWrapper: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 4,
        minHeight: 36,
    },
    input: {
        flex: 1,
        fontSize: 15,
        maxHeight: 100,
        paddingVertical: 4,
    },
    sendButton: {
        marginLeft: 8,
        width: 38,
        height: 38,
        borderRadius: 19,
        justifyContent: 'center',
        alignItems: 'center',
    },
    thumbsUpButton: {
        marginLeft: 8,
        padding: 4,
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
    fileBubble: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 4,
        borderWidth: 1,
        borderRadius: 10,
        maxWidth: 220,
    },
    fileName: {
        fontSize: 13,
        fontWeight: '500',
    },
    fileSubtext: {
        fontSize: 11,
        marginTop: 2,
    },
    // Options bottom sheet
    optionsSheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 16,
        paddingBottom: 32,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 16,
    },
    optionsSheetTitle: {
        fontSize: 16,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 16,
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        gap: 14,
    },
    optionIconWrap: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    optionLabel: {
        fontSize: 15,
        fontWeight: '500',
        flex: 1,
    },
    optionCancelBtn: {
        marginTop: 12,
        alignItems: 'center',
        paddingVertical: 14,
    },
    optionCancelText: {
        fontSize: 15,
        fontWeight: '600',
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
