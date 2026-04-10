import { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getScreenCacheKey, readScreenCache, writeScreenCache } from '../utils/screenCache';

const createUuidV4 = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const randomValue = (Math.random() * 16) | 0;
        const uuidValue = char === 'x' ? randomValue : (randomValue & 0x3) | 0x8;
        return uuidValue.toString(16);
    });

export interface MessageReaction {
    id: string;
    message_id: string;
    user_id: string;
    emoji: string;
    created_at: string;
    user?: {
        id: string;
        full_name: string;
        avatar_url: string | null;
    };
}

export interface Message {
    id: string;
    conversation_id: string;
    sender_id: string;
    content: string;
    message_type: 'text' | 'image' | 'file' | 'system';
    attachment_url: string | null;
    read_at: string | null;
    created_at: string;
    sender?: {
        id: string;
        full_name: string;
        avatar_url: string | null;
    };
    reactions?: MessageReaction[];
}

export interface ConversationParticipant {
    id: string;
    user_id: string;
    role: 'owner' | 'admin' | 'member';
    joined_at: string;
    last_read_at: string | null;
    is_muted: boolean;
    profile?: {
        id: string;
        full_name: string;
        avatar_url: string | null;
    };
}

export interface Conversation {
    id: string;
    created_at: string;
    updated_at: string;
    studio_booking_id: string | null;
    gig_application_id: string | null;
    gig_id: string | null;
    group_id: string | null;
    studio_id: string | null;
    // Group chat fields
    is_group: boolean;
    group_name: string | null;
    group_avatar_url: string | null;
    // For 1-on-1 chats
    other_participant?: {
        id: string;
        full_name: string;
        avatar_url: string | null;
    };
    // For group chats
    participants?: ConversationParticipant[];
    participant_count?: number;
    last_message?: Message | null;
    unread_count?: number;
}

type SenderProfile = NonNullable<Message['sender']>;

const CONVERSATIONS_CACHE_TTL_MS = 45_000;
const CHAT_MESSAGES_CACHE_TTL_MS = 60_000;
const senderProfileCache = new Map<string, SenderProfile>();

const primeSenderProfileCache = (messages: Message[] | null | undefined) => {
    (messages || []).forEach((message) => {
        if (message.sender?.id) {
            senderProfileCache.set(message.sender.id, message.sender);
        }
    });
};

const cacheSenderProfile = (profile: SenderProfile | null | undefined) => {
    if (!profile?.id) return;
    senderProfileCache.set(profile.id, profile);
};

const toTimestamp = (value: string | null | undefined) => {
    if (!value) return 0;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
};

const sortMessagesChronologically = (messages: Message[]) => {
    return [...messages].sort((left, right) => {
        return toTimestamp(left.created_at) - toTimestamp(right.created_at);
    });
};

const upsertMessage = (messages: Message[], nextMessage: Message) => {
    const existingIndex = messages.findIndex((message) => message.id === nextMessage.id);

    if (existingIndex < 0) {
        return sortMessagesChronologically([...messages, nextMessage]);
    }

    const nextMessages = [...messages];
    const existingMessage = nextMessages[existingIndex];
    nextMessages[existingIndex] = {
        ...existingMessage,
        ...nextMessage,
        sender: nextMessage.sender || existingMessage.sender,
        reactions: nextMessage.reactions || existingMessage.reactions,
    };

    return sortMessagesChronologically(nextMessages);
};

const buildConversationListCacheKey = (currentUserId: string) => {
    return getScreenCacheKey('chat-conversations', { currentUserId });
};

const buildConversationMessagesCacheKey = (conversationId: string) => {
    return getScreenCacheKey('chat-messages', { conversationId });
};

// Hook to get or create a conversation (1-on-1)
export function useConversation(otherUserId: string | null, currentUserId: string | null) {
    const [conversation, setConversation] = useState<Conversation | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const getOrCreateConversation = useCallback(async (
        options?: {
            studioBookingId?: string;
            gigApplicationId?: string;
            gigId?: string;
            groupId?: string;
            studioId?: string;
        }
    ) => {
        if (!otherUserId || !currentUserId) {
            setLoading(false);
            return null;
        }

        try {
            setLoading(true);
            setError(null);

            const { data: currentUserParticipations, error: currentPartError } = await supabase
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', currentUserId);

            if (currentPartError) throw currentPartError;

            const candidateIds = currentUserParticipations?.map((p) => p.conversation_id) || [];

            if (candidateIds.length > 0) {
                const { data: participantPairs, error: pairError } = await supabase
                    .from('conversation_participants')
                    .select('conversation_id, user_id')
                    .in('conversation_id', candidateIds)
                    .in('user_id', [currentUserId, otherUserId]);

                if (pairError) throw pairError;

                const userSets = new Map<string, Set<string>>();
                for (const pair of participantPairs || []) {
                    const set = userSets.get(pair.conversation_id) || new Set<string>();
                    set.add(pair.user_id);
                    userSets.set(pair.conversation_id, set);
                }

                const matchedConversationIds = Array.from(userSets.entries())
                    .filter(([, users]) => users.has(currentUserId) && users.has(otherUserId))
                    .map(([conversationId]) => conversationId);

                if (matchedConversationIds.length > 0) {
                    const { data: existingConversations, error: existingError } = await supabase
                        .from('conversations')
                        .select('*')
                        .eq('is_group', false)
                        .in('id', matchedConversationIds)
                        .order('updated_at', { ascending: false })
                        .limit(1);

                    if (existingError) throw existingError;

                    const existing = existingConversations?.[0];
                    if (existing) {
                        setConversation(existing);
                        return existing;
                    }
                }
            }

            const newConversationId = createUuidV4();

            const { error: createError } = await supabase
                .from('conversations')
                .insert({
                    id: newConversationId,
                    is_group: false,
                    studio_booking_id: options?.studioBookingId || null,
                    gig_application_id: options?.gigApplicationId || null,
                    gig_id: options?.gigId || null,
                    group_id: options?.groupId || null,
                    studio_id: options?.studioId || null,
                })
                ;

            if (createError) throw createError;

            const { error: creatorParticipantError } = await supabase
                .from('conversation_participants')
                .upsert({
                    conversation_id: newConversationId,
                    user_id: currentUserId,
                    role: 'owner',
                }, { onConflict: 'conversation_id,user_id' });

            if (creatorParticipantError) throw creatorParticipantError;

            const { error: recipientParticipantError } = await supabase
                .from('conversation_participants')
                .upsert({
                    conversation_id: newConversationId,
                    user_id: otherUserId,
                    role: 'member',
                }, { onConflict: 'conversation_id,user_id' });

            if (recipientParticipantError) throw recipientParticipantError;

            const { data: newConversation, error: fetchCreatedError } = await supabase
                .from('conversations')
                .select('*')
                .eq('id', newConversationId)
                .single();

            if (fetchCreatedError) throw fetchCreatedError;

            setConversation(newConversation);
            return newConversation;
        } catch (err: any) {
            console.error('Error getting/creating conversation:', err);
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    }, [otherUserId, currentUserId]);

    return { conversation, loading, error, getOrCreateConversation };
}

// Hook to get or create a GROUP conversation (all members can chat)
export function useGroupConversation(groupId: string | null, currentUserId: string | null) {
    const [conversation, setConversation] = useState<Conversation | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const getOrCreateGroupConversation = useCallback(async () => {
        if (!groupId || !currentUserId) {
            setLoading(false);
            return null;
        }

        try {
            setLoading(true);
            setError(null);

            // Try to find existing group conversation
            const { data: existing, error: fetchError } = await supabase
                .from('conversations')
                .select('*')
                .eq('group_id', groupId)
                .eq('is_group', true)
                .maybeSingle();

            if (fetchError && fetchError.code !== 'PGRST116') {
                throw fetchError;
            }

            if (existing) {
                const { data: existingDisplay } = await supabase
                    .from('conversations_display_projection')
                    .select('group_name, group_avatar_url')
                    .eq('id', existing.id)
                    .maybeSingle();

                const existingWithDisplay = {
                    ...existing,
                    group_name: existingDisplay?.group_name || null,
                    group_avatar_url: existingDisplay?.group_avatar_url || null,
                };

                setConversation(existingWithDisplay);
                return existingWithDisplay;
            }

            // Create group conversation using the database function
            const { data: result, error: rpcError } = await supabase
                .rpc('create_group_conversation', {
                    p_group_id: groupId,
                    p_creator_id: currentUserId,
                });

            if (rpcError) throw rpcError;

            // Fetch the created conversation
            const { data: newConversation, error: getError } = await supabase
                .from('conversations')
                .select('*')
                .eq('id', result)
                .single();

            if (getError) throw getError;

            const { data: newConversationDisplay } = await supabase
                .from('conversations_display_projection')
                .select('group_name, group_avatar_url')
                .eq('id', newConversation.id)
                .maybeSingle();

            const newConversationWithDisplay = {
                ...newConversation,
                group_name: newConversationDisplay?.group_name || null,
                group_avatar_url: newConversationDisplay?.group_avatar_url || null,
            };

            setConversation(newConversationWithDisplay);
            return newConversationWithDisplay;
        } catch (err: any) {
            console.error('Error getting/creating group conversation:', err);
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    }, [groupId, currentUserId]);

    return { conversation, loading, error, getOrCreateGroupConversation };
}

// Hook to get all conversations for current user (both 1-on-1 and group)
export function useConversations(currentUserId: string | null) {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchConversations = useCallback(async (options?: { silent?: boolean }) => {
        if (!currentUserId) {
            setLoading(false);
            return;
        }

        const cacheKey = buildConversationListCacheKey(currentUserId);

        try {
            if (!options?.silent) {
                setLoading(true);
            }
            setError(null);

            // Fetch conversations where user is a participant
            const { data: participations, error: partError } = await supabase
                .from('conversation_participants')
                .select('conversation_id')
                .eq('user_id', currentUserId);

            if (partError) throw partError;

            const conversationIds = participations?.map((p) => p.conversation_id) || [];
            if (conversationIds.length === 0) {
                setConversations([]);
                await writeScreenCache(cacheKey, []);
                return;
            }

            const [
                conversationsResponse,
                displayResponse,
                participantsResponse,
                unreadResponse,
            ] = await Promise.all([
                supabase
                    .from('conversations')
                    .select('*')
                    .in('id', conversationIds)
                    .order('updated_at', { ascending: false }),
                supabase
                    .from('conversations_display_projection')
                    .select('id, group_name, group_avatar_url')
                    .in('id', conversationIds),
                supabase
                    .from('conversation_participants')
                    .select(`
                        *,
                        profile:profiles!conversation_participants_user_id_fkey(id, full_name, avatar_url)
                    `)
                    .in('conversation_id', conversationIds),
                supabase
                    .from('messages')
                    .select('conversation_id, read_at')
                    .in('conversation_id', conversationIds)
                    .neq('sender_id', currentUserId)
                    .is('read_at', null),
            ]);

            if (conversationsResponse.error) throw conversationsResponse.error;
            if (displayResponse.error) throw displayResponse.error;
            if (participantsResponse.error) throw participantsResponse.error;
            if (unreadResponse.error) throw unreadResponse.error;

            const rawConversations = conversationsResponse.data || [];
            const displayRows = displayResponse.data || [];
            const allParticipants = participantsResponse.data || [];
            const unreadRows = unreadResponse.data || [];

            const oldestConversationActivity = rawConversations.reduce<string | null>((oldest, conversation: any) => {
                const candidate = String(conversation.updated_at || conversation.created_at || '').trim();
                if (!candidate) return oldest;
                if (!oldest || toTimestamp(candidate) < toTimestamp(oldest)) {
                    return candidate;
                }
                return oldest;
            }, null);

            const latestMessageByConversationId = new Map<string, Message>();

            if (oldestConversationActivity) {
                const { data: recentMessages, error: recentMessagesError } = await supabase
                    .from('messages')
                    .select(`
                        *,
                        sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url)
                    `)
                    .in('conversation_id', conversationIds)
                    .gte('created_at', oldestConversationActivity)
                    .order('created_at', { ascending: false });

                if (recentMessagesError) throw recentMessagesError;

                (recentMessages || []).forEach((message: Message) => {
                    if (!latestMessageByConversationId.has(message.conversation_id)) {
                        latestMessageByConversationId.set(message.conversation_id, message);
                        cacheSenderProfile(message.sender);
                    }
                });
            }

            const missingLatestMessageConversationIds = conversationIds.filter((conversationId) => {
                return !latestMessageByConversationId.has(conversationId);
            });

            if (missingLatestMessageConversationIds.length > 0) {
                const missingLatestMessages = await Promise.all(
                    missingLatestMessageConversationIds.map(async (conversationId) => {
                        const { data: message, error: messageError } = await supabase
                            .from('messages')
                            .select(`
                                *,
                                sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url)
                            `)
                            .eq('conversation_id', conversationId)
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .maybeSingle();

                        if (messageError) throw messageError;
                        return message;
                    }),
                );

                missingLatestMessages.forEach((message) => {
                    if (!message) return;
                    latestMessageByConversationId.set(message.conversation_id, message);
                    cacheSenderProfile(message.sender);
                });
            }

            const displayByConversationId = new Map(
                (displayRows || []).map((row: any) => [row.id, row])
            );
            const participantsByConversationId = new Map<string, any[]>();
            for (const participant of allParticipants || []) {
                const current = participantsByConversationId.get(participant.conversation_id) || [];
                current.push(participant);
                participantsByConversationId.set(participant.conversation_id, current);

                const profile = Array.isArray(participant.profile)
                    ? participant.profile[0]
                    : participant.profile;
                cacheSenderProfile(profile || null);
            }

            const unreadCountByConversationId = new Map<string, number>();
            for (const unreadRow of unreadRows || []) {
                const nextCount = (unreadCountByConversationId.get(unreadRow.conversation_id) || 0) + 1;
                unreadCountByConversationId.set(unreadRow.conversation_id, nextCount);
            }

            const conversationsWithDisplay = (rawConversations || []).map((conversation: any) => {
                const display = displayByConversationId.get(conversation.id);
                return {
                    ...conversation,
                    group_name: display?.group_name || null,
                    group_avatar_url: display?.group_avatar_url || null,
                };
            });

            const directConversations = conversationsWithDisplay.filter((c: any) => !c.is_group);
            const groupConversations = conversationsWithDisplay.filter((c: any) => c.is_group);

            // Process 1-on-1 conversations
            const processedDirectConversations = (directConversations || []).map((conv: any) => {
                const conversationParticipants = participantsByConversationId.get(conv.id) || [];
                const otherParticipant = conversationParticipants.find((participant) => participant.user_id !== currentUserId)?.profile;

                return {
                    ...conv,
                    is_group: false,
                    other_participant: otherParticipant,
                    last_message: latestMessageByConversationId.get(conv.id) || null,
                    unread_count: unreadCountByConversationId.get(conv.id) || 0,
                };
            });

            // Process group conversations
            const processedGroupConversations = groupConversations.map((conv: any) => {
                const participants = participantsByConversationId.get(conv.id) || [];

                return {
                    ...conv,
                    is_group: true,
                    participants: participants || [],
                    participant_count: participants?.length || 0,
                    last_message: latestMessageByConversationId.get(conv.id) || null,
                    unread_count: unreadCountByConversationId.get(conv.id) || 0,
                };
            });

            // Combine and sort by updated_at
            const allConversations = [
                ...processedDirectConversations,
                ...processedGroupConversations,
            ].sort((a, b) =>
                new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
            );

            setConversations(allConversations);
            await writeScreenCache(cacheKey, allConversations);
        } catch (err: any) {
            console.error('Error fetching conversations:', err);
            setError(err.message);
        } finally {
            if (!options?.silent) {
                setLoading(false);
            }
        }
    }, [currentUserId]);

    useEffect(() => {
        if (!currentUserId) {
            setConversations([]);
            setLoading(false);
            return;
        }

        let cancelled = false;

        void (async () => {
            const cacheKey = buildConversationListCacheKey(currentUserId);
            const cachedConversations = await readScreenCache<Conversation[]>(
                cacheKey,
                CONVERSATIONS_CACHE_TTL_MS,
            );

            if (cancelled) {
                return;
            }

            if (cachedConversations) {
                setConversations(cachedConversations);
                setLoading(false);
            }

            await fetchConversations({ silent: Boolean(cachedConversations) });
        })();

        return () => {
            cancelled = true;
        };
    }, [fetchConversations]);

    // REALTIME SUBSCRIPTION FOR CONVERSATION LIST
    useEffect(() => {
        if (!currentUserId) return;

        console.log('Setting up realtime subscription for conversation list...');

        const channel = supabase
            .channel('conversation_list_updates')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                },
                async (payload) => {
                    const newMessage = payload.new as Message;

                    // Check if this message belongs to any of our conversations
                    setConversations(prevConversations => {
                        const conversationIndex = prevConversations.findIndex(c => c.id === newMessage.conversation_id);
                        const cacheKey = currentUserId
                            ? buildConversationListCacheKey(currentUserId)
                            : null;

                        // If conversation exists in our list
                        if (conversationIndex >= 0) {
                            const updatedConversations = [...prevConversations];
                            const conversation = { ...updatedConversations[conversationIndex] };

                            // Check if message is relevant (not blocked, etc. - simplistic check for now)

                            // Fetch sender profile if needed for group chat preview
                            // For now, we'll optimistically update without full profile and let UI handle graceful fallback
                            // or fetch asynchronously. 

                            const sender = senderProfileCache.get(newMessage.sender_id);
                            conversation.last_message = {
                                ...newMessage,
                                sender,
                            };
                            conversation.updated_at = newMessage.created_at;

                            if (newMessage.sender_id !== currentUserId) {
                                conversation.unread_count = (conversation.unread_count || 0) + 1;
                            }

                            // Remove from old position and add to top
                            updatedConversations.splice(conversationIndex, 1);
                            updatedConversations.unshift(conversation);

                            if (cacheKey) {
                                void writeScreenCache(cacheKey, updatedConversations);
                            }

                            return updatedConversations;
                        } else {
                            // New conversation? Or one we didn't have loaded?
                            // Safest to refetch or fetch just this conversation
                            // Determining if I'm a participant in this new message's conversation is hard without fetching.
                            // So we'll trigger a refetch of the list to be safe and accurate.
                            // Debounce this? For now, direct call.
                            fetchConversations();
                            return prevConversations;
                        }
                    });
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'messages',
                },
                async (payload) => {
                    const updatedMessage = payload.new as Message;

                    setConversations(prevConversations => {
                        const conversationIndex = prevConversations.findIndex(
                            (conversation) => conversation.id === updatedMessage.conversation_id
                        );
                        const cacheKey = currentUserId
                            ? buildConversationListCacheKey(currentUserId)
                            : null;

                        if (conversationIndex < 0) {
                            return prevConversations;
                        }

                        const updatedConversations = [...prevConversations];
                        const conversation = { ...updatedConversations[conversationIndex] };

                        if (conversation.last_message?.id === updatedMessage.id) {
                            conversation.last_message = {
                                ...conversation.last_message,
                                ...updatedMessage,
                            };
                        }

                        if (updatedMessage.sender_id !== currentUserId && updatedMessage.read_at) {
                            conversation.unread_count = Math.max(0, (conversation.unread_count || 0) - 1);
                        }

                        updatedConversations[conversationIndex] = conversation;

                        if (cacheKey) {
                            void writeScreenCache(cacheKey, updatedConversations);
                        }
                        return updatedConversations;
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentUserId, fetchConversations]);

    return { conversations, loading, error, refetch: fetchConversations };
}

// Hook for chat messages in a conversation
export function useChat(conversationId: string | null, currentUserId: string | null) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messageCacheKey = conversationId
        ? buildConversationMessagesCacheKey(conversationId)
        : null;

    // Fetch initial messages
    useEffect(() => {
        if (!conversationId) {
            setMessages([]);
            setLoading(false);
            return;
        }

        let cancelled = false;

        const fetchMessages = async (options?: { silent?: boolean }) => {
            try {
                if (!options?.silent) {
                    setLoading(true);
                }
                const { data, error: fetchError } = await supabase
                    .from('messages')
                    .select(`
                        *,
                        sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url),
                        reactions:message_reactions(
                            id,
                            user_id,
                            emoji,
                            created_at,
                            user:profiles!message_reactions_user_id_fkey(id, full_name, avatar_url)
                        )
                    `)
                    .eq('conversation_id', conversationId)
                    .order('created_at', { ascending: true });

                if (fetchError) throw fetchError;
                if (cancelled) return;

                const nextMessages = sortMessagesChronologically(data || []);
                primeSenderProfileCache(nextMessages);
                setMessages(nextMessages);

                if (messageCacheKey) {
                    await writeScreenCache(messageCacheKey, nextMessages);
                }
            } catch (err: any) {
                console.error('Error fetching messages:', err);
                setError(err.message);
            } finally {
                if (!options?.silent && !cancelled) {
                    setLoading(false);
                }
            }
        };

        void (async () => {
            const cachedMessages = messageCacheKey
                ? await readScreenCache<Message[]>(messageCacheKey, CHAT_MESSAGES_CACHE_TTL_MS)
                : null;

            if (cancelled) {
                return;
            }

            if (cachedMessages) {
                const nextMessages = sortMessagesChronologically(cachedMessages);
                primeSenderProfileCache(nextMessages);
                setMessages(nextMessages);
                setLoading(false);
            }

            await fetchMessages({ silent: Boolean(cachedMessages) });
        })();

        return () => {
            cancelled = true;
        };
    }, [conversationId, messageCacheKey]);

    // Subscribe to realtime updates
    useEffect(() => {
        if (!conversationId) return;

        const channel: RealtimeChannel = supabase
            .channel(`messages:${conversationId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `conversation_id=eq.${conversationId}`,
                },
                async (payload) => {
                    let sender = senderProfileCache.get(payload.new.sender_id);

                    if (!sender) {
                        const { data: fetchedSender } = await supabase
                            .from('profiles')
                            .select('id, full_name, avatar_url')
                            .eq('id', payload.new.sender_id)
                            .single();

                        sender = fetchedSender || undefined;
                        cacheSenderProfile(sender || null);
                    }

                    const newMessage: Message = {
                        ...payload.new as Message,
                        sender: sender || undefined,
                    };

                    setMessages((prev) => {
                        const nextMessages = upsertMessage(prev, newMessage);

                        if (messageCacheKey) {
                            void writeScreenCache(messageCacheKey, nextMessages);
                        }

                        return nextMessages;
                    });
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'messages',
                    filter: `conversation_id=eq.${conversationId}`,
                },
                (payload) => {
                    const updatedMessage = payload.new as Message;

                    setMessages((prev) => {
                        const nextMessages = upsertMessage(prev, updatedMessage);

                        if (messageCacheKey) {
                            void writeScreenCache(messageCacheKey, nextMessages);
                        }

                        return nextMessages;
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [conversationId, currentUserId, messageCacheKey]);

    // Send message function
    const sendMessage = useCallback(async (
        content: string,
        messageType: 'text' | 'image' | 'file' = 'text',
        attachmentUrl?: string
    ) => {
        if (!conversationId || !currentUserId || !content.trim()) {
            return { error: 'Missing required data' };
        }

        try {
            setSending(true);
            const { error: sendError } = await supabase.from('messages').insert({
                conversation_id: conversationId,
                sender_id: currentUserId,
                content: content.trim(),
                message_type: messageType,
                attachment_url: attachmentUrl || null,
            });

            if (sendError) throw sendError;

            // Touch the conversation updated_at for sorting
            const { error: updateError } = await supabase
                .from('conversations')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', conversationId);

            if (updateError) {
                console.warn('Failed to update conversation timestamp:', updateError);
                // Non-fatal, proceed
            }

            return { error: null };
        } catch (err: any) {
            console.error('Error sending message:', err);
            return { error: err.message };
        } finally {
            setSending(false);
        }
    }, [conversationId, currentUserId]);

    // Mark messages as read
    const markAsRead = useCallback(async () => {
        if (!conversationId || !currentUserId) return;

        const hasUnreadIncomingMessages = messages.some((message) => {
            return message.sender_id !== currentUserId && !message.read_at;
        });

        if (!hasUnreadIncomingMessages) {
            return;
        }

        const readAt = new Date().toISOString();

        const { error: markReadError } = await supabase
            .from('messages')
            .update({ read_at })
            .eq('conversation_id', conversationId)
            .neq('sender_id', currentUserId)
            .is('read_at', null);

        if (markReadError) {
            return;
        }

        setMessages((prev) => {
            const nextMessages = prev.map((message) => {
                if (message.sender_id === currentUserId || message.read_at) {
                    return message;
                }

                return {
                    ...message,
                    read_at: readAt,
                };
            });

            if (messageCacheKey) {
                void writeScreenCache(messageCacheKey, nextMessages);
            }

            return nextMessages;
        });
    }, [conversationId, currentUserId, messageCacheKey, messages]);

    // Add or update reaction to a message
    const addReaction = useCallback(async (messageId: string, emoji: string) => {
        if (!currentUserId) return { error: 'Not authenticated' };

        try {
            // Upsert - insert or update if exists
            const { error: upsertError } = await supabase
                .from('message_reactions')
                .upsert({
                    message_id: messageId,
                    user_id: currentUserId,
                    emoji,
                }, {
                    onConflict: 'message_id,user_id'
                });

            if (upsertError) throw upsertError;

            // Update local state
            setMessages(prev => prev.map(msg => {
                if (msg.id === messageId) {
                    const existingReactions = msg.reactions || [];
                    const existingIndex = existingReactions.findIndex(r => r.user_id === currentUserId);
                    let newReactions: MessageReaction[];

                    if (existingIndex >= 0) {
                        // Update existing reaction
                        newReactions = [...existingReactions];
                        newReactions[existingIndex] = { ...newReactions[existingIndex], emoji };
                    } else {
                        // Add new reaction
                        newReactions = [...existingReactions, {
                            id: 'temp-' + Date.now(),
                            message_id: messageId,
                            user_id: currentUserId,
                            emoji,
                            created_at: new Date().toISOString(),
                        }];
                    }
                    return { ...msg, reactions: newReactions };
                }
                return msg;
            }));

            return { error: null };
        } catch (err: any) {
            console.error('Error adding reaction:', err);
            return { error: err.message };
        }
    }, [currentUserId]);

    // Remove reaction from a message
    const removeReaction = useCallback(async (messageId: string) => {
        if (!currentUserId) return { error: 'Not authenticated' };

        try {
            const { error: deleteError } = await supabase
                .from('message_reactions')
                .delete()
                .eq('message_id', messageId)
                .eq('user_id', currentUserId);

            if (deleteError) throw deleteError;

            // Update local state
            setMessages(prev => prev.map(msg => {
                if (msg.id === messageId) {
                    return {
                        ...msg,
                        reactions: (msg.reactions || []).filter(r => r.user_id !== currentUserId)
                    };
                }
                return msg;
            }));

            return { error: null };
        } catch (err: any) {
            console.error('Error removing reaction:', err);
            return { error: err.message };
        }
    }, [currentUserId]);

    return { messages, loading, sending, error, sendMessage, markAsRead, addReaction, removeReaction };
}

// Helper to get total unread count (includes both 1-on-1 and group chats)
export async function getUnreadMessageCount(userId: string): Promise<number> {
    try {
        const { data: participations } = await supabase
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);

        const allConversationIds = [...new Set((participations || []).map((p) => p.conversation_id))];

        if (allConversationIds.length === 0) return 0;

        // Count unread messages
        const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .in('conversation_id', allConversationIds)
            .neq('sender_id', userId)
            .is('read_at', null);

        return count || 0;
    } catch (error) {
        console.error('Error getting unread count:', error);
        return 0;
    }
}

// Hook to get participants of a group conversation
export function useGroupParticipants(conversationId: string | null) {
    const [participants, setParticipants] = useState<ConversationParticipant[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!conversationId) {
            setLoading(false);
            return;
        }

        const fetchParticipants = async () => {
            try {
                setLoading(true);
                const { data, error: fetchError } = await supabase
                    .from('conversation_participants')
                    .select(`
                        *,
                        profile:profiles!conversation_participants_user_id_fkey(id, full_name, avatar_url)
                    `)
                    .eq('conversation_id', conversationId)
                    .order('role', { ascending: true });

                if (fetchError) throw fetchError;
                setParticipants(data || []);
            } catch (err: any) {
                console.error('Error fetching participants:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchParticipants();
    }, [conversationId]);

    return { participants, loading, error };
}
