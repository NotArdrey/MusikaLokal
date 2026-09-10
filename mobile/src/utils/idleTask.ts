export type IdleTask = {
  cancel: () => void;
};

/**
 * Runs non-urgent JS work when React Native's event loop is idle.
 * The returned handle keeps focus-effect cleanup cancellable.
 */
export const runAfterUIIdle = (callback: () => void, timeout = 650): IdleTask => {
  let cancelled = false;
  const idleCallbackId = requestIdleCallback(() => {
    if (!cancelled) {
      callback();
    }
  }, { timeout });

  return {
    cancel: () => {
      cancelled = true;
      cancelIdleCallback(idleCallbackId);
    },
  };
};
