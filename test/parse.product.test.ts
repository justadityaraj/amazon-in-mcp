import { test } from "node:test";
import assert from "node:assert/strict";

import { parseProduct } from "../src/parse.js";
import { fixture } from "./_fixtures.js";

// ---- against a real captured amazon.in product page ----

const real = parseProduct(fixture("product.html"), "B0FHHQQNZY");

test("parseProduct extracts the full detail record from real markup", () => {
  assert.equal(real.asin, "B0FHHQQNZY");
  assert.ok(real.title && real.title.length > 5, "title present");
  assert.equal(typeof real.price_inr, "number", "price selector resolved");
  assert.equal(typeof real.rating, "number", "rating selector resolved");
  assert.equal(typeof real.review_count, "number", "review-count selector resolved");
  assert.equal(real.in_stock, true);
  assert.ok(real.bullets.length > 0, "expected feature bullets");
  assert.ok(real.image, "expected a product image");
  assert.ok(real.price_history_url.includes("keepa.com"));
});

test("parseProduct tags the product URL with the affiliate id", () => {
  assert.ok(real.url.includes("tag=artech-21"));
});

test("parseProduct derives a discount when MRP is above price", () => {
  // The real fixture is a discounted listing.
  assert.ok(typeof real.mrp_inr === "number" && real.mrp_inr > real.price_inr!);
  assert.ok(
    typeof real.discount_percent === "number" && real.discount_percent! > 0
  );
});

// ---- targeted edge cases via minimal synthetic pages ----

function page(inner: string): string {
  return `<!doctype html><html><body>${inner}</body></html>`;
}

test("parseProduct marks 'currently unavailable' pages as out of stock", () => {
  const html = page(`
    <span id="productTitle">Discontinued Gadget</span>
    <div id="availability"><span>Currently unavailable.</span></div>`);
  const p = parseProduct(html, "B000000010");
  assert.equal(p.in_stock, false);
  assert.equal(p.price_inr, undefined);
  assert.match(p.availability ?? "", /unavailable/i);
});

test("parseProduct treats a priced page with no explicit availability as in stock", () => {
  const html = page(`
    <span id="productTitle">In Stock Thing</span>
    <div id="corePriceDisplay_desktop_feature_div">
      <span class="a-price"><span class="a-offscreen">₹2,499</span></span>
    </div>`);
  const p = parseProduct(html, "B000000011");
  assert.equal(p.price_inr, 2499);
  assert.equal(p.in_stock, true);
});

test("parseProduct computes discount_percent from MRP when no savings label exists", () => {
  const html = page(`
    <span id="productTitle">Sale Item</span>
    <div id="corePriceDisplay_desktop_feature_div">
      <span class="a-price"><span class="a-offscreen">₹500</span></span>
      <span class="a-price a-text-price"><span class="a-offscreen">₹1,000</span></span>
    </div>`);
  const p = parseProduct(html, "B000000012");
  assert.equal(p.price_inr, 500);
  assert.equal(p.mrp_inr, 1000);
  assert.equal(p.discount_percent, 50);
});

test("parseProduct prefers an explicit savings label over a computed discount", () => {
  const html = page(`
    <span id="productTitle">Labelled Discount</span>
    <div id="corePriceDisplay_desktop_feature_div">
      <span class="a-price"><span class="a-offscreen">₹600</span></span>
      <span class="a-price a-text-price"><span class="a-offscreen">₹1,000</span></span>
      <span class="savingsPercentage">-45%</span>
    </div>`);
  const p = parseProduct(html, "B000000013");
  // Computed would be 40%; the explicit label (45%) must win.
  assert.equal(p.discount_percent, 45);
});

test("parseProduct omits MRP when it equals the selling price", () => {
  const html = page(`
    <span id="productTitle">No Real Discount</span>
    <div id="corePriceDisplay_desktop_feature_div">
      <span class="a-price"><span class="a-offscreen">₹1,000</span></span>
      <span class="a-price a-text-price"><span class="a-offscreen">₹1,000</span></span>
    </div>`);
  const p = parseProduct(html, "B000000014");
  assert.equal(p.price_inr, 1000);
  assert.equal(p.mrp_inr, undefined);
  assert.equal(p.discount_percent, undefined);
});

test("parseProduct falls back to 'Unknown product' when no title is present", () => {
  const p = parseProduct(page("<div>no title here</div>"), "B000000015");
  assert.equal(p.title, "Unknown product");
});

test("parseProduct keeps normal feature bullets but drops over-long ones", () => {
  const longBullet = "x".repeat(500); // exceeds MAX_BULLET_LENGTH (400)
  const html = page(`
    <span id="productTitle">Bulleted Item</span>
    <div id="feature-bullets"><ul>
      <li><span class="a-list-item">Compact and lightweight</span></li>
      <li><span class="a-list-item">${longBullet}</span></li>
      <li><span class="a-list-item">Two-year warranty</span></li>
    </ul></div>`);
  const p = parseProduct(html, "B000000016");
  assert.deepEqual(p.bullets, ["Compact and lightweight", "Two-year warranty"]);
});
