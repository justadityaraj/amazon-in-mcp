import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSearch } from "../src/parse.js";
import { fixture } from "./_fixtures.js";

// ---- against a real captured amazon.in search page ----

const realResults = parseSearch(fixture("search-results.html"));

test("parseSearch extracts every search-result card from a real page", () => {
  // The fixture holds 6 real result cards.
  assert.equal(realResults.length, 6);
});

test("parseSearch always sets the structural fields on every card", () => {
  // These are set unconditionally by the parser; if a selector drifts, they break.
  for (const item of realResults) {
    assert.match(item.asin, /^[A-Z0-9]{10}$/, "asin should be a 10-char ASIN");
    assert.ok(item.title && item.title.length > 0, "title should be non-empty");
    assert.ok(item.url.startsWith("https://www.amazon.in/"), "url absolute");
    assert.equal(typeof item.in_stock, "boolean");
    assert.ok(item.price_history_url.includes("keepa.com"));
  }
});

test("parseSearch extracts price and rating data from real markup", () => {
  // Optional fields, asserted on the first (known-complete) real listing so the
  // test verifies the price/rating selectors without coupling to every card.
  const first = realResults[0]!;
  assert.equal(typeof first.price_inr, "number");
  assert.equal(typeof first.rating, "number");
  assert.equal(typeof first.review_count, "number");
});

test("parseSearch tags result URLs with the affiliate id", () => {
  for (const item of realResults) {
    assert.ok(
      item.url.includes("tag=artech-21"),
      `expected affiliate tag on ${item.url}`
    );
  }
});

test("parseSearch flags sponsored listings", () => {
  // The captured page contains sponsored cards.
  assert.ok(
    realResults.some((it) => it.sponsored === true),
    "expected at least one sponsored listing"
  );
});

test("parseSearch sets sponsored true only for cards labelled Sponsored", () => {
  const sponsored = card(`
    <span class="puis-sponsored-label-text">Sponsored</span>
    <h2><a href="/dp/B000000006"><span>Ad Listing</span></a></h2>
    <span class="a-price"><span class="a-offscreen">₹1,499</span></span>`, "B000000006");
  const organic = card(`
    <h2><a href="/dp/B000000007"><span>Organic Listing</span></a></h2>
    <span class="a-price"><span class="a-offscreen">₹1,499</span></span>`, "B000000007");
  assert.equal(parseSearch(sponsored)[0]!.sponsored, true);
  assert.equal(parseSearch(organic)[0]!.sponsored, false);
});

test("parseSearch detects Prime eligibility from the prime badge", () => {
  const withPrime = card(`
    <h2><a href="/dp/B000000008"><span>Prime Item</span></a></h2>
    <span class="a-price"><span class="a-offscreen">₹1,499</span></span>
    <i aria-label="Amazon Prime" class="a-icon-prime"></i>`, "B000000008");
  const noPrime = card(`
    <h2><a href="/dp/B000000009"><span>No Prime</span></a></h2>
    <span class="a-price"><span class="a-offscreen">₹1,499</span></span>`, "B000000009");
  assert.equal(parseSearch(withPrime)[0]!.prime, true);
  assert.equal(parseSearch(noPrime)[0]!.prime, false);
});

// ---- targeted edge cases via minimal synthetic cards ----

function card(inner: string, asin = "B000000001"): string {
  return `<!doctype html><html><body><div class="s-main-slot">
    <div data-component-type="s-search-result" data-asin="${asin}">${inner}</div>
  </div></body></html>`;
}

test("parseSearch marks a card with no price and 'currently unavailable' as out of stock", () => {
  const html = card(`
    <h2><a href="/dp/B000000002"><span>Out Of Stock Item</span></a></h2>
    <span>Currently unavailable</span>`, "B000000002");
  const [item] = parseSearch(html);
  assert.equal(item!.in_stock, false);
  assert.equal(item!.price_inr, undefined);
});

test("parseSearch omits MRP when it is not above the selling price", () => {
  const equalMrp = card(`
    <h2><a href="/dp/B000000003"><span>No Discount</span></a></h2>
    <span class="a-price"><span class="a-offscreen">₹1,000</span></span>
    <span class="a-price a-text-price"><span class="a-offscreen">₹1,000</span></span>`,
    "B000000003");
  const [item] = parseSearch(equalMrp);
  assert.equal(item!.price_inr, 1000);
  assert.equal(item!.mrp_inr, undefined);
});

test("parseSearch keeps MRP when it is strictly above the selling price", () => {
  const html = card(`
    <h2><a href="/dp/B000000004"><span>On Sale</span></a></h2>
    <span class="a-price"><span class="a-offscreen">₹1,299</span></span>
    <span class="a-price a-text-price"><span class="a-offscreen">₹2,499</span></span>`,
    "B000000004");
  const [item] = parseSearch(html);
  assert.equal(item!.price_inr, 1299);
  assert.equal(item!.mrp_inr, 2499);
});

test("parseSearch strips tracking params then re-tags the URL", () => {
  const html = card(`
    <h2><a href="/dp/B000000005/ref=sr_1_1?keywords=speaker&qid=123"><span>X</span></a></h2>
    <span class="a-price"><span class="a-offscreen">₹999</span></span>`,
    "B000000005");
  const [item] = parseSearch(html);
  assert.equal(
    item!.url,
    "https://www.amazon.in/dp/B000000005/ref=sr_1_1?tag=artech-21"
  );
});

test("parseSearch skips cards whose data-asin is not a valid ASIN", () => {
  const html = `<!doctype html><html><body><div class="s-main-slot">
    <div data-component-type="s-search-result" data-asin="123">
      <h2><a href="/dp/123"><span>Bad ASIN</span></a></h2>
    </div>
    <div data-component-type="s-search-result" data-asin="">
      <h2><a href="/dp/x"><span>Empty ASIN</span></a></h2>
    </div>
  </div></body></html>`;
  assert.deepEqual(parseSearch(html), []);
});

test("parseSearch returns an empty array when the page has no result cards", () => {
  // A bot-check / empty page must not throw — it yields zero items.
  assert.deepEqual(parseSearch("<html><body>nothing here</body></html>"), []);
});
