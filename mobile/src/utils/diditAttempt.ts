export type DiditCheckState = 'checking' | 'pending' | 'error' | 'finished';

// One request at a time, including checks requested by a callback or the user.
export function createDiditAttemptMonitor<T>({
  read, classify, onResult, onState, isCurrent,
  delay = 2500, schedule = setTimeout, unschedule = clearTimeout,
}: {
  read: () => Promise<T>;
  classify: (result: T) => 'pending' | 'approved' | 'review' | 'failed';
  onResult: (result: T) => Promise<void> | void;
  onState: (state: DiditCheckState) => void;
  isCurrent: () => boolean;
  delay?: number;
  schedule?: typeof setTimeout;
  unschedule?: typeof clearTimeout;
}) {
  let stopped = false;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request: Promise<void> | undefined;
  const active = () => !stopped && isCurrent();
  const check = (): Promise<void> => {
    if (!active() || finished) return Promise.resolve();
    if (request) return request;
    if (timer) unschedule(timer);
    timer = undefined;
    onState('checking');
    request = (async () => {
      try {
        const result = await read();
        if (!active()) return;
        if (classify(result) === 'pending') {
          onState('pending');
        } else {
          finished = true;
          onState('finished');
          await onResult(result);
        }
      } catch {
        if (active()) onState('error');
      } finally {
        request = undefined;
        if (active() && !finished) timer = schedule(() => { void check(); }, delay);
      }
    })();
    return request;
  };
  return {
    check,
    retry() {
      if (!request) finished = false;
      return check();
    },
    stop() {
      stopped = true;
      if (timer) unschedule(timer);
    },
  };
}
