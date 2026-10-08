/** Disposable records, evicted after expiry or when the cache is full. */
export class BoundedCache<K, V> {
  private entries = new Map<K, { value: V; expiresAt: number }>();

  constructor(private readonly maxEntries: number, private readonly ttlMs: number) {}

  private prune() {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }

  get size() {
    this.prune();
    return this.entries.size;
  }

  get(key: K): V | undefined {
    this.prune();
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V) {
    this.prune();
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
    return this;
  }

  delete(key: K) { return this.entries.delete(key); }
  has(key: K) { this.prune(); return this.entries.has(key); }
  clear() { this.entries.clear(); }
  keys() { this.prune(); return this.entries.keys(); }
  *values() {
    this.prune();
    for (const entry of this.entries.values()) yield entry.value;
  }
}
