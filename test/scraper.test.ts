import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

import { fetchHtml, BotBlockedError, FetchFailedError } from "../src/scraper.js";
import { MAX_RETRIES } from "../src/constants.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
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
