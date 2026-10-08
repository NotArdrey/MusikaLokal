import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { prepareRealtimeAuth, supabase } from '../../lib/supabase';
import { createRealtimeChannelTopic } from '../utils/realtimeChannel';

export function useUnreadNotifications(userId: string | null | undefined, enabled = true) {
  const [unread, setUnread] = useState({ userId: '', count: 0 });
  const requestRef = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    if (!userId || !enabled) return;
    try {
      const { data, error } = await supabase.functions.invoke('manage-notifications', {
        body: { action: 'unread_count', userId },
      });
      if (!error && request === requestRef.current && typeof data?.count === 'number') {
        setUnread({ userId, count: data.count });
      }
    } catch {
      // Retain the last count during a failed refresh.
    }
  }, [enabled, userId]);

  useFocusEffect(useCallback(() => {
    if (!userId || !enabled) return;
    let disposed = false;
    const requests = requestRef;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
    });
    queueMicrotask(() => { if (!disposed) void refresh(); });
    const connect = async () => {
      if (!userId || !enabled || !(await prepareRealtimeAuth()) || disposed) return;
      channel = supabase.channel(createRealtimeChannelTopic(`unread-notifications:${userId}`))
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}`,
        }, () => { if (!disposed) void refresh(); })
        .subscribe(status => { if (!disposed && status === 'SUBSCRIBED') void refresh(); });
    };
    void connect();
    return () => {
      disposed = true;
      ++requests.current;
      appState.remove();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled, refresh, userId]));

  return { hasUnread: enabled && unread.userId === userId && unread.count > 0, refresh };
}
