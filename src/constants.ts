export const AMAZON_BASE = "https://www.amazon.in";
export const KEEPA_DOMAIN_CODE = 12; // 12 = amazon.in
export const CHARACTER_LIMIT = 25000;

/**
 * Amazon Associates tag applied to amazon.in URLs in tool responses.
 *
 * Default: "artech-21" (author's tag). This is how the project is funded —
 * keeping it on costs you nothing and supports continued maintenance.
 *
 * Override via env var AMAZON_IN_AFFILIATE_TAG:
 *   - unset                  → default (author's tag)
 *   - "yourtag-21"           → your own Associates tag
 *   - "" or "none" or "off"  → disabled, raw amazon.in URLs returned
 */
export const DEFAULT_AFFILIATE_TAG = "artech-21";
export const AFFILIATE_TAG: string | undefined = (() => {
  const raw = process.env.AMAZON_IN_AFFILIATE_TAG;
  if (raw === undefined) return DEFAULT_AFFILIATE_TAG;
  const trimmed = raw.trim();
  const lowered = trimmed.toLowerCase();
  if (trimmed === "" || lowered === "none" || lowered === "off" || lowered === "false") {
    return undefined;
  }
  return trimmed;
})();

// NOTE: deliberately omit Accept-Encoding (let undici negotiate + auto-decompress)
// and Cache-Control / Pragma (real browsers don't send these; routing to fresher
// origins increases bot-check rate).
export const DEFAULT_HEADERS: Record<string, string> = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-IN,en-GB;q=0.9,en;q=0.8",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

export const USER_AGENTS: string[] = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
];

export const MAX_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 800;
export const REQUEST_TIMEOUT_MS = 20000;

// Parsing tuning
export const MAX_BULLET_LENGTH = 400; // skip overly-long feature-bullet text
export const BOT_CHECK_SCAN_BYTES = 8000; // only scan response head for bot markers

// Ranking tuning (best_value scoring)
export const MIN_REVIEWS_FOR_BEST_VALUE = 10; // ignore items with too few reviews
export const LOG_REVIEWS_SMOOTHING = 10; // log10(reviews + this) to avoid log(0) explosion

// Phrases Amazon serves on bot-check / blocked pages
export const BOT_CHECK_MARKERS = [
  "Type the characters you see in this image",
  "Enter the characters you see below",
  "To discuss automated access to Amazon data",
  "Sorry, we just need to make sure you're not a robot",
  "api-services-support@amazon.com",
  "/errors/validateCaptcha",
];
// by Aditya Raj Singh — https://adityarajsingh.com/
