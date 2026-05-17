import {
  BOT_CHECK_MARKERS,
  BOT_CHECK_SCAN_BYTES,
  DEFAULT_HEADERS,
  MAX_RETRIES,
  REQUEST_TIMEOUT_MS,
  RETRY_BASE_DELAY_MS,
  USER_AGENTS,
} from "./constants.js";

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
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          ...DEFAULT_HEADERS,
          "User-Agent": pickUserAgent(),
        },
      });

      if (res.status === 503 || res.status === 429) {
        lastError = new FetchFailedError(
          `Amazon returned ${res.status} (throttled)`,
          res.status
        );
      } else if (!res.ok) {
        // 4xx other than 429 are not worth retrying with a different UA
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
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
