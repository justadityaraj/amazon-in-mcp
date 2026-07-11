import { test } from "node:test";
import assert from "node:assert/strict";

import { TtlCache } from "../src/cache.js";

/** A hand-cranked clock so TTL expiry is deterministic. */
function fakeClock(start = 1000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

test("TtlCache returns a stored value within its TTL", () => {
  const clock = fakeClock();
  const cache = new TtlCache<string>({ ttlMs: 100, maxEntries: 10, now: clock.now });
  cache.set("k", "v");
  clock.advance(99);
  assert.equal(cache.get("k"), "v");
});

test("TtlCache expires a value once the TTL elapses", () => {
  const clock = fakeClock();
  const cache = new TtlCache<string>({ ttlMs: 100, maxEntries: 10, now: clock.now });
  cache.set("k", "v");
  clock.advance(100); // expiresAt is now() + ttl, and get uses <= now
  assert.equal(cache.get("k"), undefined);
  assert.equal(cache.size, 0, "an expired entry is evicted on read");
});

test("TtlCache evicts the oldest entry past its capacity", () => {
  const cache = new TtlCache<number>({ ttlMs: 10_000, maxEntries: 2 });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3); // should push out "a"
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.get("c"), 3);
  assert.equal(cache.size, 2);
});

test("TtlCache treats a read as a recency bump for LRU eviction", () => {
  const cache = new TtlCache<number>({ ttlMs: 10_000, maxEntries: 2 });
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.get("a"), 1); // "a" is now most-recently-used
  cache.set("c", 3); // should evict "b", the least-recently-used
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("c"), 3);
});

test("TtlCache is disabled when ttl is 0", () => {
  const cache = new TtlCache<string>({ ttlMs: 0, maxEntries: 10 });
  assert.equal(cache.enabled, false);
  cache.set("k", "v");
  assert.equal(cache.get("k"), undefined);
  assert.equal(cache.size, 0);
});

test("TtlCache is disabled when maxEntries is 0", () => {
  const cache = new TtlCache<string>({ ttlMs: 1000, maxEntries: 0 });
  assert.equal(cache.enabled, false);
  cache.set("k", "v");
  assert.equal(cache.get("k"), undefined);
});

test("TtlCache.clear removes everything", () => {
  const cache = new TtlCache<number>({ ttlMs: 10_000, maxEntries: 10 });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.get("a"), undefined);
});

test("TtlCache.set on an existing key refreshes value and TTL", () => {
  const clock = fakeClock();
  const cache = new TtlCache<string>({ ttlMs: 100, maxEntries: 10, now: clock.now });
  cache.set("k", "v1");
  clock.advance(50);
  cache.set("k", "v2"); // resets expiry to now()+100
  clock.advance(80); // 130 since first set, but only 80 since the refresh
  assert.equal(cache.get("k"), "v2");
  assert.equal(cache.size, 1);
});
