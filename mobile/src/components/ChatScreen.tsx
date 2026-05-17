import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    FlatList,
    Image,
    Keyboard,
    type KeyboardEvent,
    KeyboardAvoidingView,
    LayoutAnimation,
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
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useBottomOverlayVisibility } from '../context/BottomOverlayContext';
import { useTheme } from '../context/ThemeContext';
import { emitToast } from '../events/toastBus';
import {
    ConversationParticipant,
    Message,
    isConversationMuted,
    setConversationMute,
    useChat,
    useGroupParticipants,
} from '../hooks/useChat';
import { resolveSupabaseMediaUrl } from '../utils/supabaseMedia';
import BottomModal from './BottomModal';
import CustomAlert, { AlertType } from './CustomAlert';
import InAppMediaViewer, { isInAppMediaUrl } from './InAppMediaViewer';
import { normalizeVisibleInput } from './modal';
import ProfileAvatar from './ProfileAvatar';
import ReportModal from './ReportModal';

// Available reaction emojis
const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

const ANDROID_KEYBOARD_ANIMATION_MS = 220;
const SEND_SCROLL_DELAY_MS = 16;
const SEND_LAYOUT_ANIMATION_MS = 180;
const SEND_CONTROL_PRESS_SCALE = 0.9;

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
    isMuted?: boolean;
    mutedUntil?: string | null;
    onMuteChange?: (isMuted: boolean, mutedUntil: string | null) => void;
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
    isMuted = false,
    mutedUntil = null,
    onMuteChange,
    onBack,
}) => {
    const { colors, isDark } = useTheme();
    const { isGuest } = useAuth();
    const insets = useSafeAreaInsets();
    useBottomOverlayVisibility(true, 'ChatConversationDetail');
    const { messages, loading, sendMessage, retryMessage, markAsRead, addReaction, removeReaction } = useChat(conversationId, currentUserId);
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
    const [chatMuted, setChatMuted] = useState(isMuted);
    const [chatMutedUntil, setChatMutedUntil] = useState<string | null>(mutedUntil);
    const [updatingMute, setUpdatingMute] = useState(false);
    const [otherUserOnline, setOtherUserOnline] = useState(false);
    const [otherUserLastSeen, setOtherUserLastSeen] = useState<Date | null>(null);
    const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
    const [keyboardAvoidingResetKey, setKeyboardAvoidingResetKey] = useState(0);
    const [mediaViewerUrl, setMediaViewerUrl] = useState<string | null>(null);
    const [mediaViewerTitle, setMediaViewerTitle] = useState('Media');
    const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const latestScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sendControlScale = useRef(new Animated.Value(1)).current;
    const normalizedText = React.useMemo(() => normalizeVisibleInput(text), [text]);
    const hasMessageText = normalizedText.length > 0;

    const showAlert = (type: AlertType, title: string, message: string, buttons?: any[]) => {
        setAlertConfig({ type, title, message, buttons });
        setAlertVisible(true);
    };

    useEffect(() => {
        setChatMuted(isMuted);
        setChatMutedUntil(mutedUntil);
    }, [isMuted, mutedUntil]);

    const triggerSendFeedback = () => {
        if (Platform.OS === 'web') return;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    };

    const triggerSendErrorFeedback = () => {
        if (Platform.OS === 'web') return;
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    };

    const animateSendControl = () => {
        sendControlScale.stopAnimation();
        sendControlScale.setValue(SEND_CONTROL_PRESS_SCALE);
        Animated.spring(sendControlScale, {
            toValue: 1,
            friction: 5,
            tension: 130,
            useNativeDriver: true,
        }).start();
    };

    const smoothNextSendLayout = () => {
        if (Platform.OS === 'web') return;

        LayoutAnimation.configureNext({
            duration: SEND_LAYOUT_ANIMATION_MS,
            create: {
                type: LayoutAnimation.Types.easeInEaseOut,
                property: LayoutAnimation.Properties.opacity,
            },
            update: {
                type: LayoutAnimation.Types.easeInEaseOut,
            },
            delete: {
                type: LayoutAnimation.Types.easeInEaseOut,
                property: LayoutAnimation.Properties.opacity,
            },
        });
    };

    const handleTextChange = (nextText: string) => {
        const nextHasMessageText = normalizeVisibleInput(nextText).length > 0;
        if (hasMessageText !== nextHasMessageText) {
            smoothNextSendLayout();
        }
        setText(nextText);
    };

    // Real-time presence tracking for 1-on-1 chats (global user presence)
    useEffect(() => {
        if (isGroupChat || !otherUser?.id) return;

        const channelName = `presence:user:${otherUser.id}`;
        const channel = supabase.channel(channelName);
        presenceChannelRef.current = channel;

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState<{ user_id: string }>();
                const isOnline = Object.values(state).some((presences) =>
                    presences.some((p) => p.user_id === otherUser.id)
                );
                setOtherUserOnline(isOnline);
            })
            .on('presence', { event: 'join' }, ({ newPresences }) => {
                if (newPresences.some((p: any) => p.user_id === otherUser.id)) {
                    setOtherUserOnline(true);
                }
            })
            .on('presence', { event: 'leave' }, ({ leftPresences }) => {
                if (leftPresences.some((p: any) => p.user_id === otherUser.id)) {
                    setOtherUserOnline(false);
                    setOtherUserLastSeen(new Date());
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            presenceChannelRef.current = null;
        };
    }, [isGroupChat, otherUser?.id]);

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

    const effectiveMuted = isConversationMuted({
        is_muted: chatMuted,
        muted_until: chatMutedUntil,
    });

    const handleToggleMute = async () => {
        if (updatingMute) return;

        const nextMuted = !effectiveMuted;
        setUpdatingMute(true);

        try {
            const muteState = await setConversationMute(conversationId, nextMuted);
            setChatMuted(muteState.is_muted);
            setChatMutedUntil(muteState.muted_until);
            onMuteChange?.(muteState.is_muted, muteState.muted_until);
            setShowOptions(false);
            emitToast({
                dedupeKey: `conversation-mute:${conversationId}:${nextMuted}`,
                title: nextMuted ? 'Chat muted' : 'Chat unmuted',
                message: nextMuted
                    ? 'New messages stay in your list without pop-up alerts.'
                    : 'New messages can show pop-up alerts again.',
                type: 'info',
                source: 'chat-mute',
            });
        } catch (e: any) {
            showAlert('error', 'Mute Failed', e?.message || 'Could not update this chat.');
        } finally {
            setUpdatingMute(false);
        }
    };

    const handleOpenReport = () => {
        setShowOptions(false);
        if (isGuest) {
            return;
        }
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

    const reversedMessages = React.useMemo(() => [...messages].reverse(), [messages]);
    const resolvedOtherUserAvatar = resolveSupabaseMediaUrl(otherUser?.avatar_url);
    const resolvedGroupAvatar = resolveSupabaseMediaUrl(groupAvatar);

    // Mark messages as read when viewing
    useEffect(() => {
        markAsRead();
    }, [messages.length, markAsRead]);

    const animateKeyboardLayoutChange = (event: KeyboardEvent) => {
        if (Platform.OS === 'android') {
            LayoutAnimation.configureNext({
                duration: ANDROID_KEYBOARD_ANIMATION_MS,
                update: {
                    type: LayoutAnimation.Types.easeInEaseOut,
                },
            });
            return;
        }

        try {
            Keyboard.scheduleLayoutAnimation(event);
        } catch {
            LayoutAnimation.configureNext({
                duration: event.duration || ANDROID_KEYBOARD_ANIMATION_MS,
                update: {
                    type: LayoutAnimation.Types.easeInEaseOut,
                },
            });
        }
    };

    // Keep the composer moving with the keyboard while the inverted list stays anchored.
    useEffect(() => {
        const keyboardShowEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const keyboardHideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSub = Keyboard.addListener(keyboardShowEvent, (event) => {
            animateKeyboardLayoutChange(event);
            setIsKeyboardVisible(true);
        });

        const hideSub = Keyboard.addListener(keyboardHideEvent, (event) => {
            animateKeyboardLayoutChange(event);
            setIsKeyboardVisible(false);
            if (Platform.OS === 'android') {
                setKeyboardAvoidingResetKey((currentKey) => currentKey + 1);
            }
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    useEffect(() => {
        return () => {
            if (latestScrollTimerRef.current) {
                clearTimeout(latestScrollTimerRef.current);
            }
        };
    }, []);

    const scrollToLatestMessage = () => {
        if (latestScrollTimerRef.current) {
            clearTimeout(latestScrollTimerRef.current);
        }

        latestScrollTimerRef.current = setTimeout(() => {
            latestScrollTimerRef.current = null;
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        }, SEND_SCROLL_DELAY_MS);
    };

    const handleSend = () => {
        const messageText = normalizedText;
        if (!messageText) return;
        smoothNextSendLayout();
        animateSendControl();
        setText('');
        triggerSendFeedback();
        void sendMessage(messageText).then(({ error }) => {
            if (error) {
                triggerSendErrorFeedback();
            }
        });
        scrollToLatestMessage();
    };

    const handleQuickLike = () => {
        smoothNextSendLayout();
        animateSendControl();
        triggerSendFeedback();
        void sendMessage('👍').then(({ error }) => {
            if (error) {
                triggerSendErrorFeedback();
            }
        });
        scrollToLatestMessage();
    };

    const handleRetryMessage = (message: Message) => {
        if (message.sender_id !== currentUserId || message.local_status !== 'failed') return;
        smoothNextSendLayout();
        animateSendControl();
        triggerSendFeedback();
        void retryMessage(message.id).then(({ error }) => {
            if (error) {
                triggerSendErrorFeedback();
            }
        });
        scrollToLatestMessage();
    };

    const handleLongPress = (messageId: string) => {
        setSelectedMessageId(messageId);
        setShowReactionPicker(true);
    };

    const openAttachment = (url: string | null | undefined, title = 'Attachment') => {
        const normalizedUrl = String(url || '').trim();
        if (!normalizedUrl) return;

        if (isInAppMediaUrl(normalizedUrl)) {
            setMediaViewerTitle(title);
            setMediaViewerUrl(normalizedUrl);
            return;
        }

        void Linking.openURL(normalizedUrl).catch(() => {
            showAlert('error', 'Unable to Open', 'We could not open this attachment.');
        });
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

    // Index of the last message I sent that has been seen (read_at set) — Messenger-style
    const lastSeenMessageIndex = React.useMemo(() => {
        if (isGroupChat) return -1;
        return reversedMessages.findIndex(m => m.sender_id === currentUserId && m.read_at);
    }, [reversedMessages, currentUserId, isGroupChat]);

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

    const getMessageFooterText = (message: Message) => {
        if (message.local_status === 'failed') return 'Tap to retry';
        if (message.local_status === 'sending') return 'Sending';
        return formatTime(message.created_at);
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
        
        // Since reversedMessages holds newest at index 0,
        // message ABOVE visually is index + 1 (older chronologically).
        // message BELOW visually is index - 1 (newer chronologically).
        const olderMessage = index < reversedMessages.length - 1 ? reversedMessages[index + 1] : null;
        const newerMessage = index > 0 ? reversedMessages[index - 1] : null;

        // Show date header if it's the oldest message or the date changes from the older message
        const showDate = !olderMessage ||
            formatDate(olderMessage.created_at) !== formatDate(item.created_at);

        // For group chats, check if we should show sender name (if older message is from someone else or day changed)
        const showSenderName = isGroupChat && !isMe && (
            !olderMessage ||
            olderMessage.sender_id !== item.sender_id ||
            showDate
        );

        // Tail: last message in a run (newer message is from a different sender or date changes)
        const isLastInRun = !newerMessage ||
            newerMessage.sender_id !== item.sender_id ||
            formatDate(newerMessage.created_at) !== formatDate(item.created_at);

        // Get sender info from message or participant map
        const senderProfile = item.sender || participantMap.get(item.sender_id);
        const senderAvatarUrl = resolveSupabaseMediaUrl(senderProfile?.avatar_url);

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
                    { marginBottom: isLastInRun ? 8 : 2 },
                ]}>
                    {!isMe && (
                        <ProfileAvatar
                            uri={senderAvatarUrl}
                            style={styles.avatar}
                            backgroundColor={isDark ? '#374151' : '#E5E7EB'}
                            iconColor={colors.textSecondary}
                        />
                    )}
                    <View style={styles.messageContent}>
                        {showSenderName && senderProfile && (
                            <Text style={[styles.senderName, { color: colors.primary }]}>
                                {senderProfile.full_name}
                            </Text>
                        )}
                        <Pressable
                            onPress={isMe && item.local_status === 'failed' ? () => handleRetryMessage(item) : undefined}
                            onLongPress={() => handleLongPress(item.id)}
                            delayLongPress={300}
                        >
                            <View style={[
                                styles.messageBubble,
                                isMe
                                    ? [styles.myMessage, { backgroundColor: colors.primary }, !isLastInRun && { borderBottomRightRadius: 18 }]
                                    : [styles.theirMessage, { backgroundColor: isDark ? '#374151' : '#E5E7EB' }, !isLastInRun && { borderBottomLeftRadius: 18 }],
                                item.message_type === 'image' && styles.imageBubble,
                                item.local_status === 'sending' && styles.pendingMessage,
                                item.local_status === 'failed' && styles.failedMessage,
                            ]}>
                                {/* Image message */}
                                {item.message_type === 'image' && item.attachment_url && (
                                    <TouchableOpacity
                                        activeOpacity={1}
                                        onPress={() => openAttachment(item.attachment_url, 'Image')}
                                    >
                                        <Image
                                            source={{ uri: item.attachment_url }}
                                            style={styles.messageImage}
                                            resizeMode="cover"
                                        />
                                    </TouchableOpacity>
                                )}
                                {/* File message */}
                                {item.message_type === 'file' && item.attachment_url && (
                                    <TouchableOpacity
                                        style={[styles.fileBubble, { borderColor: isMe ? 'rgba(255,255,255,0.3)' : colors.border }]}
                                        onPress={() => openAttachment(item.attachment_url, 'Attachment')}
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
                                        {getMessageFooterText(item)}
                                    </Text>
                                    {isMe && (
                                        <Ionicons
                                            name={
                                                item.local_status === 'failed'
                                                    ? 'alert-circle'
                                                    : item.local_status === 'sending'
                                                        ? 'time-outline'
                                                        : index === lastSeenMessageIndex
                                                            ? 'checkmark-done'
                                                            : 'checkmark'
                                            }
                                            size={14}
                                            color={
                                                item.local_status === 'failed'
                                                    ? '#FCA5A5'
                                                    : item.local_status === 'sending'
                                                        ? 'rgba(255,255,255,0.55)'
                                                        : item.message_type === 'image'
                                                    ? '#FFF'
                                                    : index === lastSeenMessageIndex
                                                        ? '#93C5FD'
                                                        : 'rgba(255,255,255,0.55)'
                                            }
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
                {/* Messenger-style seen indicator — avatar floats right below the last seen message */}
                {isMe && index === lastSeenMessageIndex && otherUser && (
                    <View style={styles.seenContainer}>
                        <ProfileAvatar
                            uri={resolvedOtherUserAvatar}
                            style={[styles.seenAvatar, { borderColor: colors.background }]}
                            iconSize={9}
                            backgroundColor={isDark ? '#374151' : '#E5E7EB'}
                            iconColor={colors.textSecondary}
                        />
                    </View>
                )}
            </>
        );
    };

    const formatLastSeen = (date: Date | null) => {
        if (!date) return 'Offline';
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
        if (seconds < 60) return 'Last seen just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `Last seen ${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `Last seen ${hours}h ago`;
        return `Last seen ${Math.floor(hours / 24)}d ago`;
    };

    // Get display info based on chat type
    const displayName = isGroupChat ? groupName : otherUser?.full_name;
    const displayAvatar = isGroupChat ? resolvedGroupAvatar : resolvedOtherUserAvatar;
    const baseDisplaySubtitle = isGroupChat
        ? `${participants.length} member${participants.length !== 1 ? 's' : ''}`
        : otherUserOnline
            ? 'Active now'
            : otherUserLastSeen
                ? formatLastSeen(otherUserLastSeen)
                : null;
    const displaySubtitle = effectiveMuted
        ? baseDisplaySubtitle
            ? `Muted - ${baseDisplaySubtitle}`
            : 'Muted'
        : baseDisplaySubtitle;
    const reportTargetName = isGroupChat ? (groupName || 'this group') : (otherUser?.full_name || 'this user');
    const reportTitle = isGroupChat ? 'Report Group' : 'Report User';
    const keyboardAvoidingBehavior = Platform.OS === 'ios' ? 'padding' : 'height';
    const composerBottomPadding = Platform.OS === 'ios'
        ? (isKeyboardVisible ? 16 : Math.max(insets.bottom, 8) + 4)
        : (isKeyboardVisible ? 12 : 8);
    const composerSafeAreaEdges: Edge[] = Platform.OS === 'android' && !isKeyboardVisible ? ['bottom'] : [];
    const chatContent = (
        <>
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : messages.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <View style={[styles.emptyIconWrap, { backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.1)' }]}>
                        <Ionicons name="chatbubble-ellipses-outline" size={36} color={colors.primary} />
                    </View>
                    <Text style={[styles.emptyText, { color: colors.text }]}>
                        No messages yet
                    </Text>
                    <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                        Say hi to kick things off! 👋
                    </Text>
                </View>
            ) : (
                <FlatList
                    ref={flatListRef}
                    data={reversedMessages}
                    keyExtractor={(item) => item.id}
                    renderItem={renderMessage}
                    contentContainerStyle={styles.messagesList}
                    initialNumToRender={18}
                    maxToRenderPerBatch={24}
                    windowSize={10}
                    removeClippedSubviews={Platform.OS === 'android'}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                    inverted={true}
                />
            )}

            <SafeAreaView
                edges={composerSafeAreaEdges}
                style={[
                    styles.inputSafeArea,
                    {
                        backgroundColor: colors.background,
                        borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
                        borderTopWidth: StyleSheet.hairlineWidth,
                    },
                ]}
            >
                <View style={[
                    styles.inputContainer,
                    {
                        backgroundColor: colors.background,
                        paddingBottom: composerBottomPadding,
                    },
                ]}>
                    <TouchableOpacity
                        style={[styles.inputAction, uploading && styles.inputActionDisabled]}
                        onPress={() => setShowAttachmentPicker(true)}
                        disabled={uploading}
                        activeOpacity={uploading ? 1 : 0.78}
                    >
                        {uploading ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                            <Ionicons name="add-circle" size={30} color={colors.primary} />
                        )}
                    </TouchableOpacity>

                    <View style={[
                        styles.textInputWrapper,
                        { backgroundColor: isDark ? '#2C2F3A' : '#F0F2F5' }
                    ]}>
                        <TextInput
                            style={[styles.input, { color: colors.text }]}
                            value={text}
                            onChangeText={handleTextChange}
                            placeholder="Message…"
                            placeholderTextColor={colors.textSecondary}
                            multiline
                            maxLength={1000}
                        />
                    </View>

                    <Animated.View style={[styles.sendControlWrap, { transform: [{ scale: sendControlScale }] }]}>
                        {hasMessageText ? (
                            <TouchableOpacity
                                onPress={handleSend}
                                disabled={!hasMessageText}
                                style={[styles.sendButton, { backgroundColor: colors.primary }]}
                                activeOpacity={!hasMessageText ? 1 : 0.78}
                            >
                                <Ionicons name="send" size={19} color="#FFF" style={{ marginLeft: 2 }} />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.thumbsUpButton}
                                onPress={handleQuickLike}
                                activeOpacity={0.82}
                                accessibilityRole="button"
                                accessibilityLabel="Send quick like"
                            >
                                <LinearGradient
                                    colors={[colors.primary, '#5865F2']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.thumbsUpGradient}
                                >
                                    <Ionicons name="thumbs-up" size={18} color="#FFF" />
                                </LinearGradient>
                            </TouchableOpacity>
                        )}
                    </Animated.View>
                </View>
            </SafeAreaView>
        </>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={[
                styles.header,
                {
                    backgroundColor: colors.background,
                    borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                    paddingTop: (insets.top || 16) + 6,
                },
            ]}>
                {onBack && (
                    <TouchableOpacity
                        onPress={onBack}
                        style={styles.backButton}
                        hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
                        activeOpacity={1}
                    >
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
                                <ProfileAvatar
                                    uri={displayAvatar}
                                    style={styles.headerAvatar}
                                    iconName="people"
                                    iconSize={22}
                                    backgroundColor={colors.primary}
                                    iconColor="#FFF"
                                />
                            </View>
                        ) : (
                            <ProfileAvatar
                                uri={displayAvatar}
                                style={styles.headerAvatar}
                                backgroundColor={isDark ? '#374151' : '#E5E7EB'}
                                iconColor={colors.textSecondary}
                            />
                        )}
                        {!isGroupChat && otherUserOnline && (
                            <View style={[styles.onlineDot, { borderColor: colors.background }]} />
                        )}
                    </View>
                    <View style={styles.headerInfo}>
                        <Text style={[styles.headerName, { color: colors.text }]} numberOfLines={1}>
                            {displayName || 'Chat'}
                        </Text>
                        {displaySubtitle !== null && (
                            <Text style={[
                                styles.headerStatus,
                                { color: !effectiveMuted && !isGroupChat && otherUserOnline ? '#10B981' : colors.textSecondary },
                            ]}>
                                {displaySubtitle}
                            </Text>
                        )}
                    </View>
                </TouchableOpacity>
                <View style={styles.headerActions}>
                    <TouchableOpacity
                        style={[styles.headerActionBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}
                        onPress={() => setShowOptions(true)}
                        activeOpacity={1}
                    >
                        <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Options Bottom Sheet */}
            <BottomModal
                visible={showOptions}
                overlayLabel="ChatOptionsSheet"
                onClose={() => setShowOptions(false)}
                backdropColor="rgba(0,0,0,0.45)"
                closeOnBackdropPress
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
                            onPress={handleToggleMute}
                            disabled={updatingMute}
                            accessibilityRole="button"
                            accessibilityLabel={effectiveMuted ? 'Unmute notifications' : 'Mute notifications'}
                        >
                            <View style={[styles.optionIconWrap, { backgroundColor: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.1)' }]}>
                                <Ionicons
                                    name={effectiveMuted ? 'notifications-outline' : 'notifications-off-outline'}
                                    size={20}
                                    color={colors.primary}
                                />
                            </View>
                            <Text style={[styles.optionLabel, { color: colors.text }]}>
                                {effectiveMuted ? 'Unmute Notifications' : 'Mute Notifications'}
                            </Text>
                            {updatingMute ? (
                                <ActivityIndicator size="small" color={colors.primary} />
                            ) : (
                                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                            )}
                        </TouchableOpacity>
                        {!isGuest && (
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
                        )}
                        <TouchableOpacity activeOpacity={1}
                            style={styles.optionCancelBtn}
                            onPress={() => setShowOptions(false)}
                        >
                            <Text style={[styles.optionCancelText, { color: colors.textSecondary }]}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
            </BottomModal>

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
                key={Platform.OS === 'android' ? keyboardAvoidingResetKey : 'ios'}
                behavior={keyboardAvoidingBehavior}
                style={styles.messagesContainer}
            >
                {chatContent}
            </KeyboardAvoidingView>

            {/* Reaction Picker Modal */}
            <Modal
                visible={showReactionPicker}
                transparent
                animationType="fade"
                onRequestClose={() => setShowReactionPicker(false)}
            >
                <Pressable
                    style={[styles.modalOverlay, styles.dimOverlay]}
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
            <BottomModal
                visible={showAttachmentPicker}
                overlayLabel="ChatAttachmentSheet"
                onClose={() => setShowAttachmentPicker(false)}
                backdropColor="rgba(0,0,0,0.45)"
                closeOnBackdropPress
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
            </BottomModal>

            <InAppMediaViewer
                visible={!!mediaViewerUrl}
                uri={mediaViewerUrl}
                title={mediaViewerTitle}
                onClose={() => setMediaViewerUrl(null)}
            />

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
        padding: 40,
    },
    emptyIconWrap: {
        width: 72,
        height: 72,
        borderRadius: 36,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
    },
    messagesList: {
        paddingHorizontal: 12,
        paddingTop: 12,
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
        marginBottom: 4,
        maxWidth: '82%',
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
        borderRadius: 18,
        maxWidth: '100%',
    },
    pendingMessage: {
        opacity: 0.72,
    },
    failedMessage: {
        backgroundColor: '#DC2626',
    },
    myMessage: {
        backgroundColor: '#0084FF',
        borderBottomRightRadius: 4,
    },
    theirMessage: {
        backgroundColor: '#E4E6EB',
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
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingTop: 8,
        gap: 6,
    },
    inputSafeArea: {
        backgroundColor: '#FFFFFF',
    },
    inputAction: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    inputActionDisabled: {
        opacity: 0.7,
    },
    textInputWrapper: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 22,
        paddingHorizontal: 14,
        paddingVertical: 0,
        minHeight: 44,
    },
    input: {
        flex: 1,
        fontSize: 15,
        minHeight: 44,
        maxHeight: 120,
        paddingTop: Platform.OS === 'android' ? 0 : 11,
        paddingBottom: Platform.OS === 'android' ? 0 : 11,
        lineHeight: 20,
        textAlignVertical: 'center',
        includeFontPadding: false,
    },
    sendButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 0,
    },
    sendControlWrap: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    thumbsUpButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#5865F2',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.24,
        shadowRadius: 8,
        elevation: 4,
    },
    thumbsUpGradient: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.26)',
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
    // Messenger-style seen indicator styles
    seenContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 2,
        marginRight: 4,
        marginBottom: 6,
    },
    seenAvatar: {
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 1.5,
    },
    // Reaction picker modal styles
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dimOverlay: {
        backgroundColor: 'rgba(0,0,0,0.45)',
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
        justifyContent: 'center',
        paddingVertical: 14,
    },
    optionCancelText: {
        fontSize: 15,
        fontWeight: '600',
    },
    // Attachment picker styles
    attachmentPicker: {
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
