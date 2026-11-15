import {
  CLOSE_CALL_GAP,
  CONFIDENCE_Z,
  FALLBACK_PRIOR_MEAN,
  FALLBACK_PRIOR_STRENGTH,
  MAX_PRIOR_STRENGTH,
  MIN_BETWEEN_LISTING_VARIANCE,
  MIN_LISTINGS_FOR_PAGE_PRIOR,
  MIN_PRIOR_STRENGTH,
  MIN_REVIEWS_TO_MERGE_VARIANTS,
  MIN_TITLE_OVERLAP_TO_MERGE,
  PRICE_OUTLIER_RATIO,
  STAR_RATING_SD,
  STARS_TRADED_PER_PRICE_DOUBLING,
} from "./constants.js";
import type { RankedPicks, SearchResultItem } from "./types.js";

export type PriceSensitivity = keyof typeof STARS_TRADED_PER_PRICE_DOUBLING;

type Rated = SearchResultItem & { rating: number; review_count: number };
type Ranked = Rated & { price_inr: number; trusted_rating: number };

function isRated(it: SearchResultItem): it is Rated {
  return typeof it.rating === "number" && typeof it.review_count === "number" && it.review_count > 0;
}

function isRanked(it: SearchResultItem): it is Ranked {
  return (
    it.in_stock === true &&
    typeof it.price_inr === "number" &&
    it.price_inr > 0 &&
    typeof it.trusted_rating === "number" &&
    !it.price_outlier &&
    isRated(it)
  );
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function lowerMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function pagePrior(rated: Rated[]): { mean: number; strength: number } {
  if (rated.length < MIN_LISTINGS_FOR_PAGE_PRIOR) {
    return { mean: FALLBACK_PRIOR_MEAN, strength: FALLBACK_PRIOR_STRENGTH };
  }
  const ratings = rated.map((it) => it.rating);
  const average = mean(ratings);
  const observedSpread = mean(ratings.map((r) => (r - average) ** 2));
  const samplingNoise = mean(rated.map((it) => STAR_RATING_SD ** 2 / it.review_count));
  const trueSpread = Math.max(observedSpread - samplingNoise, MIN_BETWEEN_LISTING_VARIANCE);
  return {
    mean: median(ratings),
    strength: clamp(STAR_RATING_SD ** 2 / trueSpread, MIN_PRIOR_STRENGTH, MAX_PRIOR_STRENGTH),
  };
}

function isPriceOutlier(price: number | undefined, typicalPrice: number | undefined): boolean {
  if (price === undefined || typicalPrice === undefined) return false;
  return price > typicalPrice * PRICE_OUTLIER_RATIO || price < typicalPrice / PRICE_OUTLIER_RATIO;
}

export function scoreItems(items: SearchResultItem[]): SearchResultItem[] {
  const prior = pagePrior(items.filter(isRated));
  const prices = items.flatMap((it) => (typeof it.price_inr === "number" ? [it.price_inr] : []));
  // ponytail: a price ratio against the page median is a crude relevance check; a 25x premium product on a cheap page will be dropped, the LLM client is the real judge.
  const typicalPrice = prices.length >= MIN_LISTINGS_FOR_PAGE_PRIOR ? median(prices) : undefined;
  return items.map((input) => {
    const it = isPriceOutlier(input.price_inr, typicalPrice) ? { ...input, price_outlier: true as const } : input;
    if (!isRated(it)) return it;
    const weight = it.review_count + prior.strength;
    const blended = (it.review_count * it.rating + prior.strength * prior.mean) / weight;
    const trusted = blended - (CONFIDENCE_Z * STAR_RATING_SD) / Math.sqrt(weight);
    return { ...it, trusted_rating: Math.round(trusted * 100) / 100 };
  });
}

function preferredVariant(a: SearchResultItem, b: SearchResultItem): SearchResultItem {
  if (Boolean(a.in_stock) !== Boolean(b.in_stock)) return a.in_stock ? a : b;
  if (Boolean(a.sponsored) !== Boolean(b.sponsored)) return a.sponsored ? b : a;
  return (b.price_inr ?? Infinity) < (a.price_inr ?? Infinity) ? b : a;
}

function titleWords(title: string): Set<string> {
  return new Set(title.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

function sameProductFamily(a: SearchResultItem, b: SearchResultItem): boolean {
  if (a.asin === b.asin) return true;
  const wordsA = titleWords(a.title);
  const wordsB = titleWords(b.title);
  const shared = [...wordsA].filter((word) => wordsB.has(word)).length;
  const union = wordsA.size + wordsB.size - shared;
  return union > 0 && shared / union >= MIN_TITLE_OVERLAP_TO_MERGE;
}

export function dedupeVariants(items: SearchResultItem[]): SearchResultItem[] {
  const kept: SearchResultItem[] = [];
  const slotsByKey = new Map<string, number[]>();
  for (const it of items) {
    if (!isRated(it) || it.review_count < MIN_REVIEWS_TO_MERGE_VARIANTS) {
      kept.push(it);
      continue;
    }
    const key = `${it.rating}|${it.review_count}`;
    const slots = slotsByKey.get(key) ?? [];
    const slot = slots.find((s) => sameProductFamily(kept[s]!, it));
    if (slot === undefined) {
      slotsByKey.set(key, [...slots, kept.length]);
      kept.push(it);
    } else {
      kept[slot] = preferredVariant(kept[slot]!, it);
    }
  }
  return kept;
}

function frontierOf(eligible: Ranked[]): Ranked[] {
  const byPrice = [...eligible].sort(
    (a, b) => a.price_inr - b.price_inr || b.trusted_rating - a.trusted_rating
  );
  const frontier: Ranked[] = [];
  for (const it of byPrice) {
    const last = frontier[frontier.length - 1];
    if (!last || it.trusted_rating > last.trusted_rating) frontier.push(it);
  }
  return frontier;
}

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function describe(it: Ranked): string {
  return `${inr(it.price_inr)}, ${it.rating.toFixed(1)}★ from ${it.review_count.toLocaleString("en-IN")} reviews (trusted ${it.trusted_rating.toFixed(2)})`;
}

function versus(it: Ranked, best: Ranked): string {
  if (it.asin === best.asin) return "Same listing as best_value.";
  const priceGap = it.price_inr - best.price_inr;
  const ratingGap = it.trusted_rating - best.trusted_rating;
  const direction = priceGap < 0 ? "cheaper" : "more expensive";
  const sign = ratingGap >= 0 ? "+" : "-";
  return `${inr(Math.abs(priceGap))} ${direction} than best_value, trusted rating ${sign}${Math.abs(ratingGap).toFixed(2)}.`;
}

export function rankResults(
  items: SearchResultItem[],
  sensitivity: PriceSensitivity = "medium"
): RankedPicks {
  const scored = scoreItems(items);
  const inStock = scored.filter(
    (it) => it.in_stock && typeof it.price_inr === "number" && !it.price_outlier
  );
  if (!inStock.length) return {};

  const picks: RankedPicks = {
    cheapest_in_stock: [...inStock].sort((a, b) => a.price_inr! - b.price_inr!)[0],
  };
  const eligible = scored.filter(isRanked);
  if (!eligible.length) return picks;

  const starsPerDoubling = STARS_TRADED_PER_PRICE_DOUBLING[sensitivity];
  const value = (it: Ranked) => it.trusted_rating - starsPerDoubling * Math.log2(it.price_inr);
  const [best, runnerUp] = [...eligible].sort((a, b) => value(b) - value(a)) as [Ranked, Ranked?];
  const frontier = frontierOf(eligible);
  const typical = lowerMedian(eligible.map((it) => it.trusted_rating)) - CLOSE_CALL_GAP;
  const priorWeight = pagePrior(items.filter(isRated)).strength;
  const isDecent = (it: Ranked) => it.trusted_rating >= typical;
  const budget = [...eligible]
    .sort((a, b) => a.price_inr - b.price_inr)
    .find((it) => isDecent(it) && it.review_count >= priorWeight);
  const top = frontier[frontier.length - 1]!;

  Object.assign(picks, { best_value: best, top_rated: top, frontier });
  picks.why = {
    best_value: `Best balance of trusted rating and price at ${sensitivity} price sensitivity: ${describe(best)}.`,
    top_rated: `Highest trusted rating on the page: ${describe(top)}. ${versus(top, best)}`,
  };
  if (budget) {
    picks.budget_pick = budget;
    picks.why.budget_pick = `Cheapest listing about as good as a typical result here or better, with enough reviews to back it: ${describe(budget)}. ${versus(budget, best)}`;
  }

  if (runnerUp && value(best) - value(runnerUp) < CLOSE_CALL_GAP) {
    picks.close_call = true;
    picks.runner_up = runnerUp;
    picks.why.runner_up = `Close call with best_value: ${describe(runnerUp)}. ${versus(runnerUp, best)} Compare features before choosing.`;
  }
  return picks;
}
// by Aditya Raj Singh — https://adityarajsingh.com/
