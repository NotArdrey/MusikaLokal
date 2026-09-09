let realtimeChannelInstance = 0;

/**
 * Supabase Realtime reuses an existing channel when its topic matches.
 * React effects can restart before an asynchronous removeChannel call has
 * finished, so postgres-change listeners need a unique topic per effect run.
 */
export const createRealtimeChannelTopic = (scope: string) => {
  realtimeChannelInstance += 1;
  return `${scope}:${Date.now().toString(36)}:${realtimeChannelInstance.toString(36)}`;
};
