import { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

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
}

export interface Conversation {
    id: string;
    participant_1: string;
    participant_2: string;
    created_at: string;
    updated_at: string;
    studio_booking_id: string | null;
    gig_application_id: string | null;
    gig_id: string | null;
    group_id: string | null;
    studio_id: string | null;
    other_participant?: {
        id: string;
        full_name: string;
        avatar_url: string | null;
    };
    last_message?: Message | null;
    unread_count?: number;
}

// Hook to get or create a conversation
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

            // Sort participant IDs to ensure consistency
            const [p1, p2] = [currentUserId, otherUserId].sort();

            // Try to find existing conversation
            const { data: existing, error: fetchError } = await supabase
                .from('conversations')
                .select('*')
                .or(`and(participant_1.eq.${p1},participant_2.eq.${p2}),and(participant_1.eq.${p2},participant_2.eq.${p1})`)
                .maybeSingle();

            if (fetchError && fetchError.code !== 'PGRST116') {
                throw fetchError;
            }

            if (existing) {
                setConversation(existing);
                return existing;
            }

            // Create new conversation
            const { data: newConversation, error: createError } = await supabase
                .from('conversations')
                .insert({
                    participant_1: p1,
                    participant_2: p2,
                    studio_booking_id: options?.studioBookingId || null,
                    gig_application_id: options?.gigApplicationId || null,
                    gig_id: options?.gigId || null,
                    group_id: options?.groupId || null,
                    studio_id: options?.studioId || null,
                })
                .select()
                .single();

            if (createError) throw createError;

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

// Hook to get all conversations for current user
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

            const { data, error: fetchError } = await supabase
                .from('conversations')
                .select(`
                    *,
                    participant_1_profile:profiles!conversations_participant_1_fkey(id, full_name, avatar_url),
                    participant_2_profile:profiles!conversations_participant_2_fkey(id, full_name, avatar_url)
                `)
                .or(`participant_1.eq.${currentUserId},participant_2.eq.${currentUserId}`)
                .order('updated_at', { ascending: false });

            if (fetchError) throw fetchError;

            // Process to add other_participant and fetch last message
            const processedConversations = await Promise.all(
                (data || []).map(async (conv: any) => {
                    const otherParticipant = conv.participant_1 === currentUserId
                        ? conv.participant_2_profile
                        : conv.participant_1_profile;

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
                        other_participant: otherParticipant,
                        last_message: lastMessage,
                        unread_count: unreadCount || 0,
                    };
                })
            );

            setConversations(processedConversations);
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
                        sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url)
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

    return { messages, loading, sending, error, sendMessage, markAsRead };
}

// Helper to get total unread count
export async function getUnreadMessageCount(userId: string): Promise<number> {
    try {
        // Get all conversations for user
        const { data: conversations } = await supabase
            .from('conversations')
            .select('id')
            .or(`participant_1.eq.${userId},participant_2.eq.${userId}`);

        if (!conversations || conversations.length === 0) return 0;

        const conversationIds = conversations.map(c => c.id);

        // Count unread messages
        const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .in('conversation_id', conversationIds)
            .neq('sender_id', userId)
            .is('read_at', null);

        return count || 0;
    } catch (error) {
        console.error('Error getting unread count:', error);
        return 0;
    }
}
