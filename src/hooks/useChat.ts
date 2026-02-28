import { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

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

            // Create new 1-on-1 conversation
            const { data: newConversation, error: createError } = await supabase
                .from('conversations')
                .insert({
                    is_group: false,
                    studio_booking_id: options?.studioBookingId || null,
                    gig_application_id: options?.gigApplicationId || null,
                    gig_id: options?.gigId || null,
                    group_id: options?.groupId || null,
                    studio_id: options?.studioId || null,
                })
                .select()
                .single();

            if (createError) throw createError;

            const { error: participantsError } = await supabase
                .from('conversation_participants')
                .upsert([
                    {
                        conversation_id: newConversation.id,
                        user_id: currentUserId,
                        role: 'member',
                    },
                    {
                        conversation_id: newConversation.id,
                        user_id: otherUserId,
                        role: 'member',
                    },
                ], { onConflict: 'conversation_id,user_id' });

            if (participantsError) throw participantsError;

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

    const fetchConversations = useCallback(async () => {
        if (!currentUserId) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
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
                return;
            }

            const { data: rawConversations, error: conversationsError } = await supabase
                    .from('conversations')
                    .select('*')
                    .in('id', conversationIds)
                    .order('updated_at', { ascending: false });

            if (conversationsError) throw conversationsError;

            const { data: displayRows, error: displayError } = await supabase
                .from('conversations_display_projection')
                .select('id, group_name, group_avatar_url')
                .in('id', conversationIds);

            if (displayError) throw displayError;

            const { data: allParticipants, error: participantsError } = await supabase
                .from('conversation_participants')
                .select(`
                    *,
                    profile:profiles!conversation_participants_user_id_fkey(id, full_name, avatar_url)
                `)
                .in('conversation_id', conversationIds);

            if (participantsError) throw participantsError;

            const displayByConversationId = new Map(
                (displayRows || []).map((row: any) => [row.id, row])
            );
            const participantsByConversationId = new Map<string, any[]>();
            for (const participant of allParticipants || []) {
                const current = participantsByConversationId.get(participant.conversation_id) || [];
                current.push(participant);
                participantsByConversationId.set(participant.conversation_id, current);
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
            const processedDirectConversations = await Promise.all(
                (directConversations || []).map(async (conv: any) => {
                    const conversationParticipants = participantsByConversationId.get(conv.id) || [];
                    const otherParticipant = conversationParticipants.find((participant) => participant.user_id !== currentUserId)?.profile;

                    // Get last message
                    const { data: lastMessage } = await supabase
                        .from('messages')
                        .select('*')
                        .eq('conversation_id', conv.id)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    // Get unread count
                    const { count: unreadCount } = await supabase
                        .from('messages')
                        .select('*', { count: 'exact', head: true })
                        .eq('conversation_id', conv.id)
                        .neq('sender_id', currentUserId)
                        .is('read_at', null);

                    return {
                        ...conv,
                        is_group: false,
                        other_participant: otherParticipant,
                        last_message: lastMessage,
                        unread_count: unreadCount || 0,
                    };
                })
            );

            // Process group conversations
            const processedGroupConversations = await Promise.all(
                groupConversations.map(async (conv: any) => {
                    const participants = participantsByConversationId.get(conv.id) || [];

                    // Get last message
                    const { data: lastMessage } = await supabase
                        .from('messages')
                        .select(`
                            *,
                            sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url)
                        `)
                        .eq('conversation_id', conv.id)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    // Get unread count
                    const { count: unreadCount } = await supabase
                        .from('messages')
                        .select('*', { count: 'exact', head: true })
                        .eq('conversation_id', conv.id)
                        .neq('sender_id', currentUserId)
                        .is('read_at', null);

                    return {
                        ...conv,
                        is_group: true,
                        participants: participants || [],
                        participant_count: participants?.length || 0,
                        last_message: lastMessage,
                        unread_count: unreadCount || 0,
                    };
                })
            );

            // Combine and sort by updated_at
            const allConversations = [
                ...processedDirectConversations,
                ...processedGroupConversations,
            ].sort((a, b) =>
                new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
            );

            setConversations(allConversations);
        } catch (err: any) {
            console.error('Error fetching conversations:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [currentUserId]);

    useEffect(() => {
        fetchConversations();
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

                        // If conversation exists in our list
                        if (conversationIndex >= 0) {
                            const updatedConversations = [...prevConversations];
                            const conversation = { ...updatedConversations[conversationIndex] };

                            // Check if message is relevant (not blocked, etc. - simplistic check for now)

                            // Fetch sender profile if needed for group chat preview
                            // For now, we'll optimistically update without full profile and let UI handle graceful fallback
                            // or fetch asynchronously. 

                            conversation.last_message = newMessage;
                            conversation.updated_at = newMessage.created_at;

                            if (newMessage.sender_id !== currentUserId) {
                                conversation.unread_count = (conversation.unread_count || 0) + 1;
                            }

                            // Remove from old position and add to top
                            updatedConversations.splice(conversationIndex, 1);
                            updatedConversations.unshift(conversation);

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

    // Fetch initial messages
    useEffect(() => {
        if (!conversationId) {
            setLoading(false);
            return;
        }

        const fetchMessages = async () => {
            try {
                setLoading(true);
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
                setMessages(data || []);
            } catch (err: any) {
                console.error('Error fetching messages:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchMessages();
    }, [conversationId]);

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
                    // Fetch sender info for the new message
                    const { data: sender } = await supabase
                        .from('profiles')
                        .select('id, full_name, avatar_url')
                        .eq('id', payload.new.sender_id)
                        .single();

                    const newMessage: Message = {
                        ...payload.new as Message,
                        sender: sender || undefined,
                    };

                    setMessages((prev) => [...prev, newMessage]);

                    // Mark as read if not sent by current user
                    if (payload.new.sender_id !== currentUserId) {
                        supabase
                            .from('messages')
                            .update({ read_at: new Date().toISOString() })
                            .eq('id', payload.new.id)
                            .then();
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [conversationId, currentUserId]);

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

        await supabase
            .from('messages')
            .update({ read_at: new Date().toISOString() })
            .eq('conversation_id', conversationId)
            .neq('sender_id', currentUserId)
            .is('read_at', null);
    }, [conversationId, currentUserId]);

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
