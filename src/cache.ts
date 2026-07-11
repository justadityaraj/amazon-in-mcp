/**
 * Tiny in-memory TTL + LRU cache.
 *
 * Used to memoise fetched amazon.in HTML for a short window so repeated
 * lookups (common inside an agent loop) don't re-hit Amazon — which both
 * speeds things up and lowers the bot-check rate.
 *
 * The clock is injectable so expiry is deterministic under test.
 */

export interface TtlCacheOptions {
  /** Entry lifetime in ms. <= 0 disables the cache entirely (every get misses). */
  ttlMs: number;
  /** Hard cap on stored entries; oldest are evicted first. <= 0 disables the cache. */
  maxEntries: number;
  /** Clock source, defaults to Date.now. Override in tests. */
  now?: () => number;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class TtlCache<V> {
  private readonly store = new Map<string, Entry<V>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(opts: TtlCacheOptions) {
    this.ttlMs = opts.ttlMs;
    this.maxEntries = opts.maxEntries;
    this.now = opts.now ?? Date.now;
  }

  /** True when the cache actually stores anything (both TTL and capacity positive). */
  get enabled(): boolean {
    return this.ttlMs > 0 && this.maxEntries > 0;
  }

  get size(): number {
    return this.store.size;
  }

  get(key: string): V | undefined {
    if (!this.enabled) return undefined;
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Re-insert to mark as most-recently-used (Map preserves insertion order).
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V): void {
    if (!this.enabled) return;
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
    // Evict oldest entries until within capacity.
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  clear(): void {
    this.store.clear();
  }
}
// by Aditya Raj Singh — https://adityarajsingh.com/
