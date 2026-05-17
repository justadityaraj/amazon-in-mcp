import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import {
  AFFILIATE_TAG,
  AMAZON_BASE,
  KEEPA_DOMAIN_CODE,
  MAX_BULLET_LENGTH,
} from "./constants.js";
import type { ProductDetail, SearchResultItem } from "./types.js";

// Convenience alias — cheerio's element selection type.
type Sel = cheerio.Cheerio<any>;

const ASIN_REGEX = /^[A-Z0-9]{10}$/;
const ASIN_FROM_URL_REGEX = /\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i;
const AMAZON_HOST_REGEX = /^https?:\/\/(?:[a-z0-9-]+\.)?amazon\.(?:in|com)/i;

// ---------- URL helpers ----------

export function keepaUrl(asin: string): string {
  return `https://keepa.com/#!product/${KEEPA_DOMAIN_CODE}-${asin}`;
}

/**
 * Append the configured Amazon Associates tag to an amazon.in URL.
 * Only tags amazon.in / amazon.com hosts to avoid polluting non-Amazon URLs.
 * Returns the URL unchanged if no tag is configured or input is malformed.
 */
export function withAffiliateTag(url: string): string {
  if (!AFFILIATE_TAG) return url;
  if (!AMAZON_HOST_REGEX.test(url)) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("tag", AFFILIATE_TAG);
    return parsed.toString();
  } catch {
    return url;
  }
}

export function extractAsinFromUrl(input: string): string | undefined {
  if (ASIN_REGEX.test(input)) return input;
  const match = input.match(ASIN_FROM_URL_REGEX);
  return match?.[1]?.toUpperCase();
}

function absoluteUrl(href: string | undefined): string | undefined {
  if (!href) return undefined;
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `${AMAZON_BASE}${href}`;
  return undefined;
}

// ---------- text parsing primitives ----------

function parseNumber(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const cleaned = text.replace(/[^0-9.]/g, "");
  if (!cleaned) return undefined;
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

function parseRating(text: string | undefined): number | undefined {
  if (!text) return undefined;
  // Accept "4.3 out of 5 stars" or "4,3 out of 5 stars"
  const match = text.match(/([0-9]+[.,][0-9]+)/);
  if (!match) return undefined;
  const num = parseFloat(match[1]!.replace(",", "."));
  return Number.isFinite(num) ? num : undefined;
}

function parseReviewCount(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const cleaned = text.replace(/[^0-9]/g, "");
  if (!cleaned) return undefined;
  const num = parseInt(cleaned, 10);
  return Number.isFinite(num) ? num : undefined;
}

function firstText(selection: Sel): string | undefined {
  const text = selection.first().text().trim();
  return text || undefined;
}

// ---------- search-page helpers ----------

function extractSearchTitleAndUrl(
  card: Sel,
  asin: string
): { title: string; url: string } | undefined {
  const linkEl = card.find("h2 a").first();
  const title =
    firstText(card.find("h2 span")) ||
    firstText(card.find("h2 a span")) ||
    firstText(linkEl);
  if (!title) return undefined;

  const url = absoluteUrl(linkEl.attr("href")) || `${AMAZON_BASE}/dp/${asin}`;
  return { title, url };
}

function extractSearchPrices(card: Sel): {
  priceText?: string;
  priceInr?: number;
  mrpInr?: number;
} {
  const priceText =
    firstText(card.find(".a-price").first().find(".a-offscreen")) ||
    firstText(card.find("span.a-price-whole"));
  const mrpText = firstText(
    card.find("span.a-price.a-text-price").first().find(".a-offscreen")
  );
  const result: { priceText?: string; priceInr?: number; mrpInr?: number } = {};
  if (priceText) result.priceText = priceText;
  const priceInr = parseNumber(priceText);
  if (typeof priceInr === "number") result.priceInr = priceInr;
  const mrpInr = parseNumber(mrpText);
  if (typeof mrpInr === "number") result.mrpInr = mrpInr;
  return result;
}

function extractSearchRating(card: Sel): {
  rating?: number;
  reviewCount?: number;
} {
  // Amazon.in renders ratings via i.a-icon-star-mini (new) or i.a-icon-star-small (legacy).
  // The review count lives on a sibling <a> whose aria-label ends with " ratings" / " rating".
  const ratingText =
    firstText(card.find('i[class*="a-icon-star"] span.a-icon-alt')) ||
    card.find('a[aria-label*="out of 5 stars"]').first().attr("aria-label");

  const reviewLink = card
    .find('a[aria-label$=" ratings"], a[aria-label$=" rating"]')
    .first();
  const reviewText =
    reviewLink.attr("aria-label") ||
    firstText(reviewLink) ||
    firstText(card.find('span[aria-label$=" ratings"]'));

  const result: { rating?: number; reviewCount?: number } = {};
  const rating = parseRating(ratingText);
  if (typeof rating === "number") result.rating = rating;
  const reviewCount = parseReviewCount(reviewText);
  if (typeof reviewCount === "number") result.reviewCount = reviewCount;
  return result;
}

function buildSearchItem(card: Sel, asin: string): SearchResultItem | undefined {
  const head = extractSearchTitleAndUrl(card, asin);
  if (!head) return undefined;

  const prices = extractSearchPrices(card);
  const ratings = extractSearchRating(card);

  const image = card.find("img.s-image").attr("src");
  const sponsored = card.text().includes("Sponsored");
  const prime =
    card.find('i[aria-label="Amazon Prime"]').length > 0 ||
    card.find(".s-prime").length > 0;
  const delivery =
    firstText(card.find(".s-align-children-center").last()) ||
    firstText(card.find('[data-cy="delivery-recipe"]'));

  // In-stock heuristic: a price is displayed AND no "currently unavailable" text.
  const in_stock =
    typeof prices.priceInr === "number" &&
    !/currently unavailable/i.test(card.text());

  // Strip tracking params from URL before re-tagging.
  const cleanUrl = head.url.split("?")[0]!;

  const item: SearchResultItem = {
    asin,
    title: head.title,
    url: withAffiliateTag(cleanUrl),
    price_history_url: keepaUrl(asin),
    sponsored,
    prime,
    in_stock,
  };
  if (image) item.image = image;
  if (prices.priceText) item.price_display = prices.priceText;
  if (typeof prices.priceInr === "number") item.price_inr = prices.priceInr;
  if (typeof prices.mrpInr === "number") item.mrp_inr = prices.mrpInr;
  if (typeof ratings.rating === "number") item.rating = ratings.rating;
  if (typeof ratings.reviewCount === "number") item.review_count = ratings.reviewCount;
  if (delivery) item.delivery = delivery;
  return item;
}

export function parseSearch(html: string): SearchResultItem[] {
  const $: CheerioAPI = cheerio.load(html);
  const items: SearchResultItem[] = [];

  $('div[data-component-type="s-search-result"]').each((_, el) => {
    const card = $(el);
    const asin = (card.attr("data-asin") || "").trim();
    if (!asin || !ASIN_REGEX.test(asin)) return;

    const item = buildSearchItem(card, asin);
    if (item) items.push(item);
  });

  return items;
}

// ---------- product-page helpers ----------

function extractProductImage($: CheerioAPI): string | undefined {
  const landing = $("#landingImage");
  return (
    landing.attr("data-old-hires") ||
    landing.attr("src") ||
    $("#imgBlkFront").attr("src") ||
    $("#main-image-container img").first().attr("src")
  );
}

function extractProductPrices($: CheerioAPI): {
  priceText?: string;
  priceInr?: number;
  mrpInr?: number;
  discountPercent?: number;
} {
  const priceText =
    firstText($("#corePriceDisplay_desktop_feature_div .a-price .a-offscreen")) ||
    firstText($("#corePrice_feature_div .a-price .a-offscreen")) ||
    firstText($(".priceToPay .a-offscreen")) ||
    firstText($("#priceblock_ourprice")) ||
    firstText($("#priceblock_dealprice")) ||
    firstText($("span.a-price .a-offscreen").first());
  const mrpText =
    firstText($(".basisPrice .a-offscreen")) ||
    firstText($("#corePriceDisplay_desktop_feature_div .a-text-price .a-offscreen")) ||
    firstText($("span.a-price.a-text-price .a-offscreen").first());

  const priceInr = parseNumber(priceText);
  const mrpInr = parseNumber(mrpText);

  let discountPercent: number | undefined;
  const discText =
    firstText($(".savingsPercentage")) ||
    firstText($('span[class*="savingsPercentage"]'));
  if (discText) {
    const match = discText.match(/(\d+)/);
    if (match) discountPercent = parseInt(match[1]!, 10);
  } else if (
    typeof priceInr === "number" &&
    typeof mrpInr === "number" &&
    mrpInr > priceInr
  ) {
    discountPercent = Math.round(((mrpInr - priceInr) / mrpInr) * 100);
  }

  const result: {
    priceText?: string;
    priceInr?: number;
    mrpInr?: number;
    discountPercent?: number;
  } = {};
  if (priceText) result.priceText = priceText;
  if (typeof priceInr === "number") result.priceInr = priceInr;
  if (typeof mrpInr === "number") result.mrpInr = mrpInr;
  if (typeof discountPercent === "number") result.discountPercent = discountPercent;
  return result;
}

function extractAvailability(
  $: CheerioAPI,
  hasPrice: boolean
): { availability?: string; inStock: boolean } {
  const availability =
    firstText($("#availability span")) ||
    firstText($("#availability")) ||
    firstText($("#outOfStock"));
  const availLower = (availability || "").toLowerCase();
  const inStockTextual = /in stock|usually dispatched|only \d+ left|order soon/i.test(
    availability || ""
  );
  const outOfStock = /unavailable|out of stock|currently unavailable/i.test(availLower);
  const inStock = inStockTextual || (!outOfStock && hasPrice);
  return availability ? { availability, inStock } : { inStock };
}

function extractProductRating($: CheerioAPI): {
  rating?: number;
  reviewCount?: number;
} {
  const ratingText =
    $("#acrPopover").attr("title") ||
    firstText($('span[data-hook="rating-out-of-text"]')) ||
    firstText($("i.a-icon-star .a-icon-alt"));
  const reviewText = firstText($("#acrCustomerReviewText"));

  const result: { rating?: number; reviewCount?: number } = {};
  const rating = parseRating(ratingText);
  if (typeof rating === "number") result.rating = rating;
  const reviewCount = parseReviewCount(reviewText);
  if (typeof reviewCount === "number") result.reviewCount = reviewCount;
  return result;
}

function extractBullets($: CheerioAPI): string[] {
  const bullets: string[] = [];
  $("#feature-bullets ul li span.a-list-item").each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, " ");
    if (text && text.length < MAX_BULLET_LENGTH) bullets.push(text);
  });
  return bullets;
}

function extractSellerInfo($: CheerioAPI): {
  brand?: string;
  seller?: string;
  delivery?: string;
} {
  const brand =
    firstText($("#bylineInfo")) ||
    firstText($("tr.po-brand .a-span9 span"));
  const seller =
    firstText($("#sellerProfileTriggerId")) ||
    firstText($("#merchant-info"));
  const delivery =
    firstText($("#deliveryBlockMessage .a-text-bold")) ||
    firstText($("#mir-layout-DELIVERY_BLOCK"));
  const result: { brand?: string; seller?: string; delivery?: string } = {};
  if (brand) result.brand = brand;
  if (seller) result.seller = seller;
  if (delivery) result.delivery = delivery;
  return result;
}

export function parseProduct(html: string, asin: string): ProductDetail {
  const $: CheerioAPI = cheerio.load(html);

  const title =
    firstText($("#productTitle")) ||
    firstText($("h1#title span")) ||
    "Unknown product";

  const prices = extractProductPrices($);
  const ratings = extractProductRating($);
  const stock = extractAvailability($, typeof prices.priceInr === "number");
  const sellerInfo = extractSellerInfo($);

  const detail: ProductDetail = {
    asin,
    title,
    url: withAffiliateTag(`${AMAZON_BASE}/dp/${asin}`),
    in_stock: stock.inStock,
    bullets: extractBullets($),
    price_history_url: keepaUrl(asin),
  };

  const image = extractProductImage($);
  if (image) detail.image = image;
  if (prices.priceText) detail.price_display = prices.priceText;
  if (typeof prices.priceInr === "number") detail.price_inr = prices.priceInr;
  if (typeof prices.mrpInr === "number") detail.mrp_inr = prices.mrpInr;
  if (typeof prices.discountPercent === "number") detail.discount_percent = prices.discountPercent;
  if (typeof ratings.rating === "number") detail.rating = ratings.rating;
  if (typeof ratings.reviewCount === "number") detail.review_count = ratings.reviewCount;
  if (stock.availability) detail.availability = stock.availability;
  if (sellerInfo.brand) detail.brand = sellerInfo.brand;
  if (sellerInfo.seller) detail.seller = sellerInfo.seller;
  if (sellerInfo.delivery) detail.delivery = sellerInfo.delivery;

  return detail;
}
// by Aditya Raj Singh — https://adityarajsingh.com/
