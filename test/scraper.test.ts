import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  fetchHtml,
  BotBlockedError,
  FetchFailedError,
  clearHtmlCache,
} from "../src/scraper.js";
import { MAX_RETRIES } from "../src/constants.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  // Each test asserts on network-call counts, so start every case cache-cold.
  clearHtmlCache();
});

/** Build a minimal Response-like object for the parts fetchHtml reads. */
function fakeResponse(opts: {
  status: number;
  body?: string;
  statusText?: string;
}): Response {
  const { status, body = "", statusText = "" } = opts;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => body,
  } as unknown as Response;
}

const GOOD_HTML =
  "<html><body><div data-component-type='s-search-result'>ok</div></body></html>";
const BOT_HTML =
  "<html><body>Enter the characters you see below to continue</body></html>";

test("fetchHtml returns the HTML body on a clean 200 response", async () => {
  globalThis.fetch = async () => fakeResponse({ status: 200, body: GOOD_HTML });
  const html = await fetchHtml("https://www.amazon.in/s?k=x");
  assert.equal(html, GOOD_HTML);
});

test("fetchHtml retries a 403 then succeeds (fingerprint mismatch path)", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return calls === 1
      ? fakeResponse({ status: 403 })
      : fakeResponse({ status: 200, body: GOOD_HTML });
  };
  const html = await fetchHtml("https://www.amazon.in/s?k=x");
  assert.equal(html, GOOD_HTML);
  assert.equal(calls, 2);
});

test("fetchHtml fails fast on a non-retryable 4xx (e.g. 404)", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return fakeResponse({ status: 404, statusText: "Not Found" });
  };
  await assert.rejects(
    () => fetchHtml("https://www.amazon.in/dp/B0BADASIN00"),
    (err: unknown) => err instanceof FetchFailedError && err.status === 404
  );
  assert.equal(calls, 1, "404 must not be retried");
});

test("fetchHtml throws BotBlockedError after exhausting all retries on bot-check pages", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return fakeResponse({ status: 200, body: BOT_HTML });
  };
  await assert.rejects(
    () => fetchHtml("https://www.amazon.in/s?k=x"),
    (err: unknown) => err instanceof BotBlockedError
  );
  assert.equal(calls, MAX_RETRIES, "every retry should be attempted before giving up");
});

test("fetchHtml treats an empty 200 body as a bot-check and retries", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return calls < MAX_RETRIES
      ? fakeResponse({ status: 200, body: "" })
      : fakeResponse({ status: 200, body: GOOD_HTML });
  };
  const html = await fetchHtml("https://www.amazon.in/s?k=x");
  assert.equal(html, GOOD_HTML);
  assert.equal(calls, MAX_RETRIES);
});

test("fetchHtml retries a 5xx server error then succeeds", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return calls === 1
      ? fakeResponse({ status: 503, statusText: "Service Unavailable" })
      : fakeResponse({ status: 200, body: GOOD_HTML });
  };
  const html = await fetchHtml("https://www.amazon.in/s?k=x");
  assert.equal(html, GOOD_HTML);
  assert.equal(calls, 2);
});

test("fetchHtml recovers when a bot-check page clears on retry", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return calls === 1
      ? fakeResponse({ status: 200, body: BOT_HTML })
      : fakeResponse({ status: 200, body: GOOD_HTML });
  };
  const html = await fetchHtml("https://www.amazon.in/s?k=x");
  assert.equal(html, GOOD_HTML);
});

test("fetchHtml serves a repeat request from cache without a second network call", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return fakeResponse({ status: 200, body: GOOD_HTML });
  };
  const url = "https://www.amazon.in/s?k=cache-hit-case";
  const first = await fetchHtml(url);
  const second = await fetchHtml(url);
  assert.equal(first, GOOD_HTML);
  assert.equal(second, GOOD_HTML);
  assert.equal(calls, 1, "second call should be served from cache");
});

test("fetchHtml caches per-URL, so a different URL still hits the network", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return fakeResponse({ status: 200, body: GOOD_HTML });
  };
  await fetchHtml("https://www.amazon.in/s?k=alpha");
  await fetchHtml("https://www.amazon.in/s?k=beta");
  assert.equal(calls, 2, "distinct URLs must not share a cache entry");
});

test("clearHtmlCache forces the next request back to the network", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return fakeResponse({ status: 200, body: GOOD_HTML });
  };
  const url = "https://www.amazon.in/s?k=clearable";
  await fetchHtml(url);
  clearHtmlCache();
  await fetchHtml(url);
  assert.equal(calls, 2, "cleared cache should not serve the second call");
});

test("fetchHtml never caches a bot-blocked result", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return fakeResponse({ status: 200, body: BOT_HTML });
  };
  const url = "https://www.amazon.in/s?k=bot-not-cached";
  await assert.rejects(() => fetchHtml(url), (e) => e instanceof BotBlockedError);
  const afterFirst = calls;
  await assert.rejects(() => fetchHtml(url), (e) => e instanceof BotBlockedError);
  assert.ok(calls > afterFirst, "a bot-check must not be served from cache");
});
