export const AMAZON_BASE = "https://www.amazon.in";
export const KEEPA_DOMAIN_CODE = 12; // 12 = amazon.in
export const CHARACTER_LIMIT = 25000;

export const DEFAULT_HEADERS: Record<string, string> = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-IN,en-GB;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
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
