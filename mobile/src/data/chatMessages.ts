import { supabase } from '../../lib/supabase';

export const CHAT_MESSAGE_PAGE_SIZE = 50;
export type ChatMessageCursor = { id: string; created_at: string };

export async function fetchChatMessagesPage<T extends ChatMessageCursor>(
  conversationId: string,
  before?: ChatMessageCursor | null,
  signal?: AbortSignal,
) {
  let query = supabase.from('messages').select(`
    *, sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url),
    reactions:message_reactions(id, user_id, emoji, created_at,
      user:profiles!message_reactions_user_id_fkey(id, full_name, avatar_url))
  `).eq('conversation_id', conversationId);
  if (before) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(before.id) ||
        !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(before.created_at)) {
      throw new Error('Unable to load this message page. Reopen the conversation and retry.');
    }
    query = query.or(`created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`);
  }
  query = query.order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(CHAT_MESSAGE_PAGE_SIZE + 1);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data || []) as T[];
  const messages = rows.slice(0, CHAT_MESSAGE_PAGE_SIZE).reverse();
  return { messages, hasMore: rows.length > CHAT_MESSAGE_PAGE_SIZE, oldest: messages[0] || null };
}
