import {
  LOG_REVIEWS_SMOOTHING,
  MIN_REVIEWS_FOR_BEST_VALUE,
} from "./constants.js";
import type { SearchResultItem } from "./types.js";

/**
 * Pick two convenience listings out of a result set:
 *  - cheapest_in_stock: lowest price among listings that show stock
 *  - best_value: rating × log10(reviews + smoothing) / sqrt(price),
 *    restricted to listings with at least MIN_REVIEWS_FOR_BEST_VALUE reviews
 *    so a single 5-star review can't top the list.
 */
export function rankResults(items: SearchResultItem[]): {
  cheapest_in_stock?: SearchResultItem;
  best_value?: SearchResultItem;
} {
  const inStock = items.filter(
    (it) => it.in_stock && typeof it.price_inr === "number"
  );
  if (!inStock.length) return {};

  const cheapest_in_stock = [...inStock].sort(
    (a, b) => (a.price_inr ?? Infinity) - (b.price_inr ?? Infinity)
  )[0];

  const scored = inStock
    .filter(
      (it) =>
        typeof it.rating === "number" &&
        typeof it.review_count === "number" &&
        (it.review_count ?? 0) >= MIN_REVIEWS_FOR_BEST_VALUE
    )
    .map((it) => ({
      it,
      score:
        (it.rating! * Math.log10(it.review_count! + LOG_REVIEWS_SMOOTHING)) /
        Math.sqrt(it.price_inr!),
    }))
    .sort((a, b) => b.score - a.score);

  const result: ReturnType<typeof rankResults> = {};
  if (cheapest_in_stock) result.cheapest_in_stock = cheapest_in_stock;
  if (scored.length) result.best_value = scored[0]!.it;
  return result;
}
