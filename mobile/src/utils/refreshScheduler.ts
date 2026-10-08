/** Batch change events and allow at most one refresh at a time. */
export function createRefreshScheduler(refresh: () => Promise<unknown>, delayMs = 300) {
  let disposed = false;
  let inFlight = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (disposed) return;
    pending = true;
    if (timer || inFlight) return;
    timer = setTimeout(() => { timer = null; void run(); }, delayMs);
  };
  const run = async () => {
    if (disposed) return;
    if (inFlight) { pending = true; return; }
    inFlight = true;
    pending = false;
    try { await refresh(); }
    catch { /* Keep the last result until the next refresh. */ }
    finally {
      inFlight = false;
      if (pending) schedule();
    }
  };
  return {
    run, schedule,
    cancel() {
      disposed = true;
      pending = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
