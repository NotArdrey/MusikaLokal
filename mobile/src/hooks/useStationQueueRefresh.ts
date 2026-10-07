import {useEffect, useId, useRef} from 'react';
import {AppState} from 'react-native';
import {supabase} from '../../lib/supabase';

export function useStationQueueRefresh(stationId: string | null, onSnapshot: (station: any) => void) {
  const instanceId = useId();
  const callbackRef = useRef(onSnapshot);
  useEffect(() => {callbackRef.current = onSnapshot;}, [onSnapshot]);
  useEffect(() => {
    if (!stationId) return;
    let disposed = false;
    let inFlight = false;
    let queued = false;
    const refresh = async () => {
      if (disposed) return;
      if (inFlight) {queued = true; return;}
      inFlight = true;
      try {
        do {
          queued = false;
          const {data, error} = await supabase.functions.invoke('manage-playlists', {
            body: {action: 'get_station_details', station_id: stationId},
          });
          if (disposed) return;
          if (data?.error === 'Station not found' || error?.context?.status === 404) {
            callbackRef.current({id: stationId, __queueUnavailable: true});
          } else if (error || data?.error) {
            console.warn('Station queue refresh failed', error?.message || data?.error);
          } else if (data?.data) {
            callbackRef.current(data.data);
          }
        } while (queued && !disposed);
      } catch (error) {
        if (!disposed) console.warn('Station queue refresh failed', error);
      } finally {inFlight = false;}
    };
    const channel = supabase.channel(`station-queue:${stationId}:${instanceId}`)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'stations', filter: `id=eq.${stationId}`}, () => void refresh())
      .subscribe((status: string) => {if (status === 'SUBSCRIBED') void refresh();});
    const appState = AppState.addEventListener('change', state => {if (state === 'active') void refresh();});
    const timer = setInterval(() => void refresh(), 15_000);
    void refresh();
    return () => {
      disposed = true;
      clearInterval(timer);
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [instanceId, stationId]);
}
