import { ProxyAgent } from "undici";
import {
  BOT_CHECK_MARKERS,
  BOT_CHECK_SCAN_BYTES,
  CACHE_MAX_ENTRIES,
  CACHE_TTL_MS,
  DEFAULT_HEADERS,
  MAX_RETRIES,
  PROXY_URL,
  REQUEST_TIMEOUT_MS,
  RETRY_BASE_DELAY_MS,
  USER_AGENTS,
} from "./constants.js";
import { TtlCache } from "./cache.js";

// Successful HTML responses only, keyed by URL. Errors/bot-checks are never cached.
const htmlCache = new TtlCache<string>({
  ttlMs: CACHE_TTL_MS,
  maxEntries: CACHE_MAX_ENTRIES,
});

/** Drop every cached page. Exposed for tests and long-running callers. */
export function clearHtmlCache(): void {
  htmlCache.clear();
}

// Lazily-built proxy dispatcher — one per process, only when AMAZON_IN_PROXY is set.
let proxyDispatcher: ProxyAgent | undefined;
let proxyResolved = false;
function getDispatcher(): ProxyAgent | undefined {
  if (!PROXY_URL) return undefined;
  if (!proxyResolved) {
    proxyResolved = true;
    try {
      proxyDispatcher = new ProxyAgent(PROXY_URL);
    } catch (err) {
      // Intentionally omit the error detail: a malformed proxy URL can echo the
      // raw AMAZON_IN_PROXY value (including any embedded credentials) back in
      // err.message. Keep the log generic.
      console.error(
        "[amazon-in-mcp] AMAZON_IN_PROXY is not a valid proxy URL; continuing without a proxy."
      );
      proxyDispatcher = undefined;
    }
  }
  return proxyDispatcher;
}

export class BotBlockedError extends Error {
  constructor(message = "Amazon served a bot-check page") {
    super(message);
    this.name = "BotBlockedError";
  }
}

export class FetchFailedError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "FetchFailedError";
  }
}

function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]!;
}

function looksLikeBotCheck(html: string): boolean {
  if (!html) return true;
  const head = html.slice(0, BOT_CHECK_SCAN_BYTES);
  return BOT_CHECK_MARKERS.some((marker) => head.includes(marker));
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch an Amazon.in URL with UA rotation, timeout, and bot-check retry.
 * Throws BotBlockedError if every retry is blocked.
 */
export async function fetchHtml(url: string): Promise<string> {
  const cached = htmlCache.get(url);
  if (cached !== undefined) return cached;

  let lastError: Error | undefined;
  const dispatcher = getDispatcher();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const init: RequestInit = {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          ...DEFAULT_HEADERS,
          "User-Agent": pickUserAgent(),
        },
      };
      // `dispatcher` is a Node/undici runtime extension; the undici vs undici-types
      // definitions don't line up, so set it through an unknown-typed view.
      if (dispatcher) (init as { dispatcher?: unknown }).dispatcher = dispatcher;
      const res = await fetch(url, init);

      // 403 = fingerprint mismatch (often clears with UA rotation)
      // 429 / 503 = throttled (clears with backoff)
      // Other 4xx (404, etc.) = genuinely bad request — fail fast
      const isRetryableStatus =
        res.status === 403 || res.status === 429 || res.status === 503;

      if (isRetryableStatus) {
        lastError = new FetchFailedError(
          `Amazon returned ${res.status} (retrying)`,
          res.status
        );
      } else if (!res.ok) {
        if (res.status >= 400 && res.status < 500) {
          throw new FetchFailedError(
            `Amazon returned ${res.status} ${res.statusText}`,
            res.status
          );
        }
        lastError = new FetchFailedError(
          `Amazon returned ${res.status}`,
          res.status
        );
      } else {
        const html = await res.text();
        if (looksLikeBotCheck(html)) {
          lastError = new BotBlockedError();
        } else {
          htmlCache.set(url, html);
          return html;
        }
      }
    } catch (err) {
      if (err instanceof FetchFailedError && err.status && err.status < 500) {
        throw err;
      }
      lastError =
        err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < MAX_RETRIES - 1) {
      const jitter = Math.random() * 400;
      await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt) + jitter);
    }
  }

  throw lastError ?? new FetchFailedError("Failed to fetch after retries");
}
// by Aditya Raj Singh — https://adityarajsingh.com/
