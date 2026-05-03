export type ToastType = "success" | "error" | "warning" | "info";

export type ToastPayload = {
  id?: string;
  dedupeKey?: string;
  title?: string;
  message: string;
  type?: ToastType;
  duration?: number;
  source?: string;
};

export type ToastEvent = {
  id: string;
  title?: string;
  message: string;
  type: ToastType;
  duration?: number;
  source?: string;
  createdAt: number;
};

type ToastListener = (event: ToastEvent) => void;

const RECENT_DEDUPE_TTL_MS = 45_000;
const RECENT_DEDUPE_LIMIT = 160;
const QUEUED_TOAST_LIMIT = 8;

const isToastType = (value: unknown): value is ToastType => {
  return value === "success" || value === "error" || value === "warning" || value === "info";
};

const createToastId = () => {
  const randomSegment = Math.random().toString(36).slice(2, 10);
  return `toast-${Date.now()}-${randomSegment}`;
};

class ToastBus {
  private listeners = new Set<ToastListener>();
  private queuedEvents: ToastEvent[] = [];
  private recentKeys = new Map<string, number>();

  emit = (payload: ToastPayload) => {
    const message = payload.message?.trim();
    if (!message) {
      return false;
    }

    const type = isToastType(payload.type) ? payload.type : "info";
    const title = payload.title?.trim() || undefined;
    const now = Date.now();
    const dedupeKey = payload.dedupeKey?.trim() || payload.id?.trim() || "";

    this.pruneRecentKeys(now);

    if (dedupeKey) {
      const recentAt = this.recentKeys.get(dedupeKey);
      if (recentAt && now - recentAt < RECENT_DEDUPE_TTL_MS) {
        return false;
      }

      this.recentKeys.set(dedupeKey, now);
      this.trimRecentKeys();
    }

    const event: ToastEvent = {
      id: payload.id?.trim() || createToastId(),
      title,
      message,
      type,
      duration: payload.duration,
      source: payload.source,
      createdAt: now,
    };

    if (this.listeners.size === 0) {
      this.queuedEvents.push(event);
      if (this.queuedEvents.length > QUEUED_TOAST_LIMIT) {
        this.queuedEvents = this.queuedEvents.slice(-QUEUED_TOAST_LIMIT);
      }
      return true;
    }

    this.listeners.forEach((listener) => listener(event));
    return true;
  };

  subscribe = (listener: ToastListener) => {
    this.listeners.add(listener);

    if (this.queuedEvents.length > 0) {
      const queuedEvents = this.queuedEvents;
      this.queuedEvents = [];
      queuedEvents.forEach((event) => listener(event));
    }

    return () => {
      this.listeners.delete(listener);
    };
  };

  clearDedupe = () => {
    this.recentKeys.clear();
  };

  private pruneRecentKeys(now: number) {
    this.recentKeys.forEach((createdAt, key) => {
      if (now - createdAt >= RECENT_DEDUPE_TTL_MS) {
        this.recentKeys.delete(key);
      }
    });
  }

  private trimRecentKeys() {
    while (this.recentKeys.size > RECENT_DEDUPE_LIMIT) {
      const oldestKey = this.recentKeys.keys().next().value;
      if (!oldestKey) {
        return;
      }
      this.recentKeys.delete(oldestKey);
    }
  }
}

export const toastBus = new ToastBus();
export const emitToast = toastBus.emit;
