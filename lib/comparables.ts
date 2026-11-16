// The category comparables behind the radar's value model.
//
// A protocol's implied value starts from what its own category's live protocols
// actually trade at: the median market-cap-to-TVL ratio of the live protocols in
// its category. A thin category (fewer than three live comparables) falls back to
// the global median, and a category with three or more is shrunk toward the global
// median, so one thin or wild category cannot set a protocol's value on its own.
// The multiple is clamped to [0.05, 1.00]: no category's trading history, however
// rich, may value a launch at more than its own TVL, and no category may value it
// at less than five cents on the dollar of TVL. Medians, not means: the live
// ratios run from 0.006 to 400, and a mean would let one outlier set the price.
//
// Everything here is computed from the snapshot at run time. No protocol name is
// ever looked up, and no multiple is written in by hand.

import type { SnapshotProtocol } from './model.ts';

/** How many live comparables a category needs before its own median counts. */
export const SHRINK_MIN_N = 3;
/** The weight the global median carries when a category's median is shrunk. */
export const SHRINK_K = 3;
/** The multiple never leaves this range. */
export const MULTIPLE_MIN = 0.05;
export const MULTIPLE_MAX = 1.0;

/** One category's comparable: its live median, how many live protocols back it, and the multiple it gives. */
export interface CategoryComparable {
  category: string;
  /** Median mcap/TVL of the category's live protocols, or null when it has none. */
  median: number | null;
  /** How many live protocols with a market cap the category carries. */
  n: number;
  /** The multiple a protocol of this category is scored with: shrunk, then clamped. */
  multiple: number;
}

/** The whole comparable table: the global median and one entry per category that has a live protocol. */
export interface Comparables {
  /** Median mcap/TVL across every live protocol with a market cap. */
  globalMedian: number;
  /** How many live protocols with a market cap the snapshot carries. */
  globalN: number;
  byCategory: Record<string, CategoryComparable>;
}

/** The median of a non-empty list: the middle value, or the mean of the two middles. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n % 2 === 1) return sorted[(n - 1) / 2]!;
  return (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

/** A protocol is a live comparable when it trades and its market cap is on record. */
export function isLiveComparable(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.tvl_usd > 0;
}

/** The multiple one category's protocols are scored with, from its live median and the global median. */
export function multipleFor(medianValue: number | null, n: number, globalMedian: number): number {
  let multiple: number;
  if (medianValue !== null && n >= SHRINK_MIN_N) {
    multiple = (n * medianValue + SHRINK_K * globalMedian) / (n + SHRINK_K);
  } else {
    multiple = globalMedian;
  }
  return Math.min(MULTIPLE_MAX, Math.max(MULTIPLE_MIN, multiple));
}

/** The comparable table of a snapshot: one pass over its protocols, nothing else. */
export function buildComparables(protocols: SnapshotProtocol[]): Comparables {
  const live = protocols.filter(isLiveComparable);
  const globalMedian = median(live.map((p) => p.mcap_usd! / p.tvl_usd));
  const byCategoryRatios = new Map<string, number[]>();
  for (const p of live) {
    const list = byCategoryRatios.get(p.category ?? 'Other');
    if (list === undefined) byCategoryRatios.set(p.category ?? 'Other', [p.mcap_usd! / p.tvl_usd]);
    else list.push(p.mcap_usd! / p.tvl_usd);
  }
  const byCategory: Record<string, CategoryComparable> = {};
  for (const [category, ratios] of [...byCategoryRatios.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    const med = median(ratios);
    byCategory[category] = { category, median: med, n: ratios.length, multiple: multipleFor(med, ratios.length, globalMedian) };
  }
  return { globalMedian, globalN: live.length, byCategory };
}

/** The multiple a protocol of `category` is scored with under `comparables`. */
export function multipleOf(category: string | null, comparables: Comparables): number {
  const entry = category === null ? undefined : comparables.byCategory[category];
  if (entry === undefined) return Math.min(MULTIPLE_MAX, Math.max(MULTIPLE_MIN, comparables.globalMedian));
  return entry.multiple;
}
