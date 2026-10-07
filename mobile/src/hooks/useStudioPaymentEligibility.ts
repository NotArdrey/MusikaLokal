import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { prepareRealtimeAuth, supabase } from '../../lib/supabase';
import { createRealtimeChannelTopic } from '../utils/realtimeChannel';

export function useStudioPaymentEligibility(userId: string | null | undefined) {
  const [snapshot, setSnapshot] = useState<{ userId: string; bookings: any[] }>({ userId: '', bookings: [] });
  const requests = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++requests.current;
    if (!userId) return;
    try {
      const { data, error } = await supabase.rpc('get_studio_payment_eligibility');
      if (!error && request === requests.current && Array.isArray(data?.bookings)) {
        setSnapshot({ userId, bookings: data.bookings });
      }
    } catch {
      // The database still enforces eligibility when a refresh is unavailable.
    }
  }, [userId]);

  useEffect(() => {
    let disposed = false;
    const activeRequests = requests;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
    });
    queueMicrotask(() => { if (!disposed) void refresh(); });
    const connect = async () => {
      if (!userId || !(await prepareRealtimeAuth()) || disposed) return;
      channel = supabase.channel(createRealtimeChannelTopic(`studio-payment-eligibility:${userId}`))
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'studio_bookings', filter: `user_id=eq.${userId}`,
        }, () => { if (!disposed) void refresh(); })
        .subscribe(status => { if (!disposed && status === 'SUBSCRIBED') void refresh(); });
    };
    void connect();
    return () => {
      disposed = true;
      ++activeRequests.current;
      appState.remove();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  const bookings = snapshot.userId === userId ? snapshot.bookings : [];
  return { bookings, hasOutstanding: bookings.length > 0, refresh };
}
