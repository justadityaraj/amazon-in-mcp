import { test } from "node:test";
import assert from "node:assert/strict";

import { rankResults } from "../src/rank.js";
import type { SearchResultItem } from "../src/types.js";

function item(partial: Partial<SearchResultItem>): SearchResultItem {
  return {
    asin: partial.asin ?? "B000000000",
    title: partial.title ?? "Item",
    url: "https://www.amazon.in/dp/B000000000",
    price_history_url: "https://keepa.com/#!product/12-B000000000",
    ...partial,
  };
}

test("rankResults picks the cheapest in-stock listing, ignoring out-of-stock ones", () => {
  const items = [
    item({ asin: "A000000001", price_inr: 500, rating: 3.5, review_count: 20, in_stock: true }),
    item({ asin: "B000000002", price_inr: 1500, rating: 4.8, review_count: 5000, in_stock: true }),
    // Cheapest overall but OUT OF STOCK — must be ignored.
    item({ asin: "C000000003", price_inr: 200, rating: 5, review_count: 100, in_stock: false }),
    // In stock but priced high — should not become cheapest.
    item({ asin: "D000000004", price_inr: 5000, rating: 5, review_count: 2, in_stock: true }),
  ];
  const { cheapest_in_stock } = rankResults(items);
  assert.equal(cheapest_in_stock?.asin, "A000000001");
});

test("rankResults best_value ignores items below the minimum review threshold", () => {
  const items = [
    item({ asin: "A000000001", price_inr: 500, rating: 3.5, review_count: 20, in_stock: true }),
    item({ asin: "B000000002", price_inr: 1500, rating: 4.8, review_count: 5000, in_stock: true }),
    // rating 5 but only 2 reviews (< MIN_REVIEWS_FOR_BEST_VALUE) — excluded.
    item({ asin: "D000000004", price_inr: 5000, rating: 5, review_count: 2, in_stock: true }),
  ];
  const { best_value } = rankResults(items);
  // Of the two eligible items, B has the higher rating×log(reviews)/√price score.
  assert.equal(best_value?.asin, "B000000002");
});

test("rankResults returns nothing when no listing is in stock", () => {
  const items = [
    item({ asin: "A000000001", price_inr: 500, rating: 4, review_count: 50, in_stock: false }),
    item({ asin: "B000000002", price_inr: 900, rating: 4, review_count: 50, in_stock: false }),
  ];
  assert.deepEqual(rankResults(items), {});
});

test("rankResults excludes items missing a rating or review count from best_value", () => {
  const items = [
    // Cheapest, in stock, but has NO rating/reviews — eligible for cheapest, not best_value.
    item({ asin: "A000000001", price_inr: 300, in_stock: true }),
    item({ asin: "B000000002", price_inr: 1500, rating: 4.6, review_count: 800, in_stock: true }),
  ];
  const ranked = rankResults(items);
  assert.equal(ranked.cheapest_in_stock?.asin, "A000000001");
  // A has no rating data, so the only best_value candidate is B.
  assert.equal(ranked.best_value?.asin, "B000000002");
});

test("rankResults yields a cheapest pick but no best_value when reviews are too sparse", () => {
  const items = [
    item({ asin: "A000000001", price_inr: 500, rating: 4.9, review_count: 3, in_stock: true }),
    item({ asin: "B000000002", price_inr: 900, rating: 4.9, review_count: 1, in_stock: true }),
  ];
  const ranked = rankResults(items);
  assert.equal(ranked.cheapest_in_stock?.asin, "A000000001");
  assert.equal(ranked.best_value, undefined);
});
