import { test } from "node:test";
import assert from "node:assert/strict";

import { dedupeVariants, rankResults, scoreItems } from "../src/rank.js";
import type { SearchResultItem } from "../src/types.js";

function item(partial: Partial<SearchResultItem>): SearchResultItem {
  return {
    asin: partial.asin ?? "B000000000",
    title: partial.title ?? "Item",
    url: "https://www.amazon.in/dp/B000000000",
    price_history_url: "https://keepa.com/#!product/12-B000000000",
    in_stock: true,
    ...partial,
  };
}

function trustedOf(items: SearchResultItem[], asin: string): number {
  const found = scoreItems(items).find((it) => it.asin === asin);
  assert.ok(found?.trusted_rating !== undefined, `${asin} has no trusted_rating`);
  return found.trusted_rating;
}

const PENCILS = [
  item({ asin: "A000000001", price_inr: 1000, rating: 4.9, review_count: 10 }),
  item({ asin: "B000000002", price_inr: 1000, rating: 4.4, review_count: 100 }),
  item({ asin: "C000000003", price_inr: 200, rating: 4.8, review_count: 20 }),
];

const MOUSE_PAGE_2026_11_15 = [
  item({ asin: "B0FF4XBM5N", price_inr: 229, rating: 3.7, review_count: 4339 }),
  item({ asin: "B0GHYBDYW5", price_inr: 229, rating: 3.7, review_count: 4339 }),
  item({ asin: "B0CQRNWJM2", price_inr: 429, rating: 4.0, review_count: 10061 }),
  item({ asin: "B0B296NTFV", price_inr: 299, rating: 4.0, review_count: 17143 }),
  item({ asin: "B0DXNTYWHV", price_inr: 385, rating: 3.9, review_count: 847 }),
  item({ asin: "B0HHZHXXR4", price_inr: 399, rating: 4.0, review_count: 34 }),
  item({ asin: "B0DGGWC9BV", price_inr: 248, rating: 4.0, review_count: 1419 }),
  item({ asin: "B07JPX9CR7", price_inr: 519, rating: 4.2, review_count: 17031 }),
  item({ asin: "B0FDQ9M1SD", price_inr: 499, rating: 4.5, review_count: 3587 }),
  item({ asin: "B0BG8LZNYL", price_inr: 629, rating: 4.3, review_count: 10512 }),
  item({ asin: "B0GHY1645B", price_inr: 229, rating: 3.7, review_count: 4339 }),
  item({ asin: "B0F88GT83S", price_inr: 349, rating: 3.4, review_count: 897 }),
  item({ asin: "B01J0XWYKQ", price_inr: 595, rating: 4.3, review_count: 79341 }),
  item({ asin: "B0GDTK3VR6", price_inr: 407, rating: 4.0, review_count: 10061 }),
  item({ asin: "B0CP9MQ3W9", price_inr: 599, rating: 4.4, review_count: 9789 }),
  item({ asin: "B0DR2PBF8J", price_inr: 274, rating: 4.0, review_count: 432 }),
];

test("a 4.4 rating from 100 reviews is trusted more than a 4.9 from 10 reviews", () => {
  assert.ok(trustedOf(PENCILS, "B000000002") > trustedOf(PENCILS, "A000000001"));
});

test("the same rating is trusted more when it has more reviews", () => {
  const items = [
    item({ asin: "FEW0000001", price_inr: 100, rating: 4.5, review_count: 15 }),
    item({ asin: "MANY000002", price_inr: 100, rating: 4.5, review_count: 1500 }),
  ];
  assert.ok(trustedOf(items, "MANY000002") > trustedOf(items, "FEW0000001"));
});

test("listings without a rating or review count get no trusted rating", () => {
  const scored = scoreItems([item({ asin: "NORATING01", price_inr: 100 })]);
  assert.equal(scored[0]?.trusted_rating, undefined);
});

test("a large page pulls a thinly reviewed rating toward that page's typical rating", () => {
  const typical = Array.from({ length: 9 }, (_, i) =>
    item({ asin: `TYPICAL00${i}`, price_inr: 500, rating: 4.0, review_count: 300 + i * 50 })
  );
  const outlier = item({ asin: "OUTLIER001", price_inr: 500, rating: 5.0, review_count: 3 });
  assert.ok(trustedOf([...typical, outlier], "OUTLIER001") < 4.3);
});

test("cheapest_in_stock is the lowest price in stock, ignoring out-of-stock listings", () => {
  const items = [
    item({ asin: "A000000001", price_inr: 500, rating: 3.5, review_count: 20 }),
    item({ asin: "B000000002", price_inr: 1500, rating: 4.8, review_count: 5000 }),
    item({ asin: "C000000003", price_inr: 200, rating: 5, review_count: 100, in_stock: false }),
  ];
  assert.equal(rankResults(items).cheapest_in_stock?.asin, "A000000001");
});

test("best_value picks the cheap well-rated pencil over the pricier ones", () => {
  assert.equal(rankResults(PENCILS).best_value?.asin, "C000000003");
});

test("at the same price, best_value prefers the rating backed by more reviews", () => {
  const sameprice = PENCILS.filter((it) => it.asin !== "C000000003");
  assert.equal(rankResults(sameprice).best_value?.asin, "B000000002");
});

test("the frontier drops listings that are both pricier and worse, cheapest first", () => {
  const items = [
    item({ asin: "CHEAP00001", price_inr: 100, rating: 4.0, review_count: 500 }),
    item({ asin: "DOMINATED1", price_inr: 300, rating: 3.8, review_count: 500 }),
    item({ asin: "BETTER0001", price_inr: 400, rating: 4.5, review_count: 500 }),
  ];
  const frontier = rankResults(items).frontier?.map((it) => it.asin);
  assert.deepEqual(frontier, ["CHEAP00001", "BETTER0001"]);
});

test("top_rated is the highest trusted rating whatever it costs", () => {
  const items = [
    item({ asin: "CHEAP00001", price_inr: 100, rating: 4.1, review_count: 900 }),
    item({ asin: "MIDDLE0001", price_inr: 300, rating: 4.3, review_count: 900 }),
    item({ asin: "PREMIUM001", price_inr: 2000, rating: 4.7, review_count: 900 }),
  ];
  assert.equal(rankResults(items).top_rated?.asin, "PREMIUM001");
});

test("budget_pick is the cheapest listing at least as good as a typical one, not junk", () => {
  const items = [
    item({ asin: "JUNK000001", price_inr: 50, rating: 3.2, review_count: 900 }),
    item({ asin: "DECENT0001", price_inr: 120, rating: 4.2, review_count: 900 }),
    item({ asin: "GOOD000001", price_inr: 300, rating: 4.4, review_count: 900 }),
    item({ asin: "GREAT00001", price_inr: 900, rating: 4.6, review_count: 900 }),
  ];
  assert.equal(rankResults(items).budget_pick?.asin, "DECENT0001");
});

test("price_sensitivity moves best_value between the cheaper and the better monitor", () => {
  const monitors = [
    item({ asin: "ACERKA2700", price_inr: 9598, rating: 4.4, review_count: 1150 }),
    item({ asin: "DELLS27250", price_inr: 14999, rating: 4.5, review_count: 760 }),
    item({ asin: "OLDTV00001", price_inr: 9365, rating: 3.9, review_count: 244 }),
    item({ asin: "FOURK00001", price_inr: 32449, rating: 4.4, review_count: 716 }),
  ];
  assert.equal(rankResults(monitors, "high").best_value?.asin, "ACERKA2700");
  assert.equal(rankResults(monitors, "low").best_value?.asin, "DELLS27250");
});

test("a near tie for best_value is flagged as a close call with the runner-up", () => {
  const items = [
    item({ asin: "TWIN000001", price_inr: 500, rating: 4.3, review_count: 2000 }),
    item({ asin: "TWIN000002", price_inr: 505, rating: 4.3, review_count: 2100 }),
  ];
  const ranked = rankResults(items);
  assert.equal(ranked.close_call, true);
  assert.ok(ranked.runner_up);
});

test("a clear winner is not flagged as a close call", () => {
  const ranked = rankResults(MOUSE_PAGE_2026_11_15);
  assert.equal(ranked.close_call, undefined);
  assert.equal(ranked.runner_up, undefined);
});

test("every pick comes with a reason", () => {
  const ranked = rankResults(MOUSE_PAGE_2026_11_15);
  assert.match(ranked.why?.best_value ?? "", /₹499/);
  assert.ok(ranked.why?.budget_pick);
  assert.ok(ranked.why?.top_rated);
});

test("on the live mouse page, best_value is the 4.5★ mouse, not the cheapest 3.7★ one", () => {
  assert.equal(rankResults(MOUSE_PAGE_2026_11_15).best_value?.asin, "B0FDQ9M1SD");
});

test("rankResults returns nothing when no listing is in stock", () => {
  const items = [
    item({ asin: "A000000001", price_inr: 500, rating: 4, review_count: 50, in_stock: false }),
  ];
  assert.deepEqual(rankResults(items), {});
});

test("dedupeVariants keeps one colour variant, the cheapest, in the first one's place", () => {
  const items = [
    item({ asin: "BLACK00001", price_inr: 249, rating: 3.7, review_count: 4339 }),
    item({ asin: "OTHER00001", price_inr: 300, rating: 4.1, review_count: 800 }),
    item({ asin: "BLUE000001", price_inr: 229, rating: 3.7, review_count: 4339 }),
  ];
  assert.deepEqual(dedupeVariants(items).map((it) => it.asin), ["BLUE000001", "OTHER00001"]);
});

test("dedupeVariants never swaps an in-stock variant for a cheaper out-of-stock one", () => {
  const items = [
    item({ asin: "INSTOCK001", price_inr: 249, rating: 3.7, review_count: 4339 }),
    item({ asin: "GONE000001", price_inr: 199, rating: 3.7, review_count: 4339, in_stock: false }),
  ];
  assert.deepEqual(dedupeVariants(items).map((it) => it.asin), ["INSTOCK001"]);
});

test("dedupeVariants keeps the organic copy when the same listing also appears as an ad", () => {
  const items = [
    item({ asin: "DELLS27250", price_inr: 14999, rating: 4.5, review_count: 760, sponsored: true }),
    item({ asin: "DELLS27250", price_inr: 14999, rating: 4.5, review_count: 760, sponsored: false }),
  ];
  assert.deepEqual(dedupeVariants(items).map((it) => it.sponsored), [false]);
});

test("picks skip a listing priced far above the page, like an Apple Pencil in a pencil search", () => {
  const pencils = Array.from({ length: 8 }, (_, i) =>
    item({ asin: `PENCIL000${i}`, price_inr: 60 + i * 15, rating: 4.3, review_count: 500 + i * 100 })
  );
  const applePencil = item({ asin: "APPLEPEN01", price_inr: 7349, rating: 4.5, review_count: 8152 });
  const ranked = rankResults([...pencils, applePencil]);
  assert.notEqual(ranked.top_rated?.asin, "APPLEPEN01");
  assert.equal(scoreItems([...pencils, applePencil]).find((it) => it.asin === "APPLEPEN01")?.price_outlier, true);
});

test("a premium listing well inside the page's price range is not an outlier", () => {
  const headphones = Array.from({ length: 8 }, (_, i) =>
    item({ asin: `HEADPHONE${i}`, price_inr: 800 + i * 400, rating: 4.1, review_count: 2000 })
  );
  const premium = item({ asin: "PREMIUMXM5", price_inr: 29990, rating: 4.6, review_count: 3000 });
  assert.equal(rankResults([...headphones, premium]).top_rated?.asin, "PREMIUMXM5");
});

test("cheapest_in_stock carries its trusted rating", () => {
  assert.equal(typeof rankResults(MOUSE_PAGE_2026_11_15).cheapest_in_stock?.trusted_rating, "number");
});

test("reasons show ratings with one decimal", () => {
  assert.match(rankResults(MOUSE_PAGE_2026_11_15).why?.budget_pick ?? "", /4\.0★/);
});

test("dedupeVariants leaves thinly reviewed listings alone even when their numbers match", () => {
  const items = [
    item({ asin: "NEW0000001", price_inr: 100, rating: 5, review_count: 1 }),
    item({ asin: "NEW0000002", price_inr: 120, rating: 5, review_count: 1 }),
  ];
  assert.equal(dedupeVariants(items).length, 2);
});
