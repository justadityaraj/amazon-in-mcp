import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { AMAZON_BASE, KEEPA_DOMAIN_CODE } from "./constants.js";
import type { ProductDetail, SearchResultItem } from "./types.js";

export function keepaUrl(asin: string): string {
  return `https://keepa.com/#!product/${KEEPA_DOMAIN_CODE}-${asin}`;
}

export function extractAsinFromUrl(input: string): string | undefined {
  // Accept either a plain ASIN, an amazon.in URL, or any URL containing /dp/<ASIN>
  if (/^[A-Z0-9]{10}$/.test(input)) return input;
  const m = input.match(/\/(?:dp|gp\/product|product)\/([A-Z0-9]{10})/i);
  return m?.[1]?.toUpperCase();
}

function parseNumber(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const cleaned = text.replace(/[^0-9.]/g, "");
  if (!cleaned) return undefined;
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

function parseRating(text: string | undefined): number | undefined {
  if (!text) return undefined;
  // "4.3 out of 5 stars" or "4,3 out of 5 stars"
  const m = text.match(/([0-9]+[.,][0-9]+)/);
  if (!m) return undefined;
  const n = parseFloat(m[1]!.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function parseReviewCount(text: string | undefined): number | undefined {
  if (!text) return undefined;
  // "1,234 ratings" or "(1,234)"
  const cleaned = text.replace(/[^0-9]/g, "");
  if (!cleaned) return undefined;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : undefined;
}

function absUrl(href: string | undefined): string | undefined {
  if (!href) return undefined;
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `${AMAZON_BASE}${href}`;
  return undefined;
}

function firstText($el: cheerio.Cheerio<any>): string | undefined {
  const t = $el.first().text().trim();
  return t || undefined;
}

export function parseSearch(html: string): SearchResultItem[] {
  const $: CheerioAPI = cheerio.load(html);
  const items: SearchResultItem[] = [];

  $('div[data-component-type="s-search-result"]').each((_, el) => {
    const card = $(el);
    const asin = (card.attr("data-asin") || "").trim();
    if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) return;

    // Title + link
    const linkEl = card.find("h2 a").first();
    const title =
      firstText(card.find("h2 span")) ||
      firstText(card.find("h2 a span")) ||
      firstText(linkEl);
    if (!title) return;

    const href = linkEl.attr("href");
    const url = absUrl(href) || `${AMAZON_BASE}/dp/${asin}`;

    // Image
    const image = card.find("img.s-image").attr("src");

    // Price (current)
    const priceText =
      firstText(card.find(".a-price").first().find(".a-offscreen")) ||
      firstText(card.find("span.a-price-whole"));
    const price_inr = parseNumber(priceText);

    // MRP / list price (strike-through)
    const mrpText = firstText(
      card.find("span.a-price.a-text-price").first().find(".a-offscreen")
    );
    const mrp_inr = parseNumber(mrpText);

    // Rating + reviews
    // Amazon.in renders ratings via i.a-icon-star-mini (new) or i.a-icon-star-small (legacy).
    // The review count lives on a sibling <a> whose aria-label ends with " ratings" / " rating".
    const ratingText =
      firstText(card.find('i[class*="a-icon-star"] span.a-icon-alt')) ||
      card.find('a[aria-label*="out of 5 stars"]').first().attr("aria-label");
    const rating = parseRating(ratingText);

    const reviewLink = card
      .find('a[aria-label$=" ratings"], a[aria-label$=" rating"]')
      .first();
    const reviewText =
      reviewLink.attr("aria-label") ||
      firstText(reviewLink) ||
      firstText(card.find('span[aria-label$=" ratings"]'));
    const review_count = parseReviewCount(reviewText);

    // Sponsored
    const sponsored = card.text().includes("Sponsored");

    // Prime
    const prime = card.find('i[aria-label="Amazon Prime"]').length > 0
      || card.find(".s-prime").length > 0;

    // Delivery
    const delivery = firstText(card.find(".s-align-children-center").last())
      || firstText(card.find('[data-cy="delivery-recipe"]'));

    // In stock heuristic: if a price is displayed, assume in stock
    const in_stock = typeof price_inr === "number"
      && !/currently unavailable/i.test(card.text());

    const item: SearchResultItem = {
      asin,
      title,
      url: url.split("?")[0]!, // strip tracking params
      price_history_url: keepaUrl(asin),
      sponsored,
      prime,
      in_stock,
    };
    if (image) item.image = image;
    if (priceText) item.price_display = priceText;
    if (typeof price_inr === "number") item.price_inr = price_inr;
    if (typeof mrp_inr === "number") item.mrp_inr = mrp_inr;
    if (typeof rating === "number") item.rating = rating;
    if (typeof review_count === "number") item.review_count = review_count;
    if (delivery) item.delivery = delivery;

    items.push(item);
  });

  return items;
}

export function parseProduct(html: string, asin: string): ProductDetail {
  const $: CheerioAPI = cheerio.load(html);

  const title = firstText($("#productTitle")) || firstText($("h1#title span")) || "Unknown product";

  // Image
  const landing = $("#landingImage");
  const image =
    landing.attr("data-old-hires") ||
    landing.attr("src") ||
    $("#imgBlkFront").attr("src") ||
    $("#main-image-container img").first().attr("src");

  // Price (current paying price)
  const priceText =
    firstText($("#corePriceDisplay_desktop_feature_div .a-price .a-offscreen")) ||
    firstText($("#corePrice_feature_div .a-price .a-offscreen")) ||
    firstText($(".priceToPay .a-offscreen")) ||
    firstText($("#priceblock_ourprice")) ||
    firstText($("#priceblock_dealprice")) ||
    firstText($("span.a-price .a-offscreen").first());
  const price_inr = parseNumber(priceText);

  // MRP / list price
  const mrpText =
    firstText($(".basisPrice .a-offscreen")) ||
    firstText($("#corePriceDisplay_desktop_feature_div .a-text-price .a-offscreen")) ||
    firstText($("span.a-price.a-text-price .a-offscreen").first());
  const mrp_inr = parseNumber(mrpText);

  // Discount %
  let discount_percent: number | undefined;
  const discText =
    firstText($(".savingsPercentage")) ||
    firstText($('span[class*="savingsPercentage"]'));
  if (discText) {
    const m = discText.match(/(\d+)/);
    if (m) discount_percent = parseInt(m[1]!, 10);
  } else if (typeof price_inr === "number" && typeof mrp_inr === "number" && mrp_inr > price_inr) {
    discount_percent = Math.round(((mrp_inr - price_inr) / mrp_inr) * 100);
  }

  // Availability
  const availability =
    firstText($("#availability span")) ||
    firstText($("#availability")) ||
    firstText($("#outOfStock"));
  const availLower = (availability || "").toLowerCase();
  const inStockTextual = /in stock|usually dispatched|only \d+ left|order soon/i.test(availability || "");
  const outOfStock = /unavailable|out of stock|currently unavailable/i.test(availLower);
  const in_stock = inStockTextual || (!outOfStock && typeof price_inr === "number");

  // Rating
  const ratingText =
    $("#acrPopover").attr("title") ||
    firstText($('span[data-hook="rating-out-of-text"]')) ||
    firstText($("i.a-icon-star .a-icon-alt"));
  const rating = parseRating(ratingText);

  // Review count
  const reviewText = firstText($("#acrCustomerReviewText"));
  const review_count = parseReviewCount(reviewText);

  // Bullets
  const bullets: string[] = [];
  $("#feature-bullets ul li span.a-list-item").each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, " ");
    if (text && text.length < 400) bullets.push(text);
  });

  // Brand
  const brand =
    firstText($("#bylineInfo")) ||
    firstText($('tr.po-brand .a-span9 span'));

  // Seller
  const seller =
    firstText($("#sellerProfileTriggerId")) ||
    firstText($("#merchant-info"));

  // Delivery
  const delivery =
    firstText($("#deliveryBlockMessage .a-text-bold")) ||
    firstText($("#mir-layout-DELIVERY_BLOCK"));

  const detail: ProductDetail = {
    asin,
    title,
    url: `${AMAZON_BASE}/dp/${asin}`,
    in_stock,
    bullets,
    price_history_url: keepaUrl(asin),
  };
  if (image) detail.image = image;
  if (priceText) detail.price_display = priceText;
  if (typeof price_inr === "number") detail.price_inr = price_inr;
  if (typeof mrp_inr === "number") detail.mrp_inr = mrp_inr;
  if (typeof discount_percent === "number") detail.discount_percent = discount_percent;
  if (typeof rating === "number") detail.rating = rating;
  if (typeof review_count === "number") detail.review_count = review_count;
  if (availability) detail.availability = availability;
  if (brand) detail.brand = brand;
  if (seller) detail.seller = seller;
  if (delivery) detail.delivery = delivery;

  return detail;
}
// by Aditya Raj Singh — https://adityarajsingh.com/
