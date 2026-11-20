import { fitComparables, impliedValue, tradedComparables, type Snapshot, type SnapshotProtocol } from './model.ts';

const REFITS = 200;
const SEED = 0x6a09e667;
const MIN_STRATUM_SIZE = 4;
const TOP_COUNT = 20;

interface Draw {
  rank: number;
  value: number;
}

interface Percentiles {
  p05: number;
  median: number;
  p95: number;
}

/** Discrete empirical quantiles keep ranks and integer-dollar estimates in their observed units. */
function orderedPercentiles(values: number[]): Percentiles {
  const ordered = values.sort((a, b) => a - b);
  const pick = (p: number) => ordered[Math.max(0, Math.ceil(p * ordered.length) - 1)]!;
  return { p05: pick(0.05), median: pick(0.50), p95: pick(0.95) };
}

/** Deterministic 32-bit generator for reproducible sensitivity analysis. */
function randomDraw() {
  let state = SEED;
  return (size: number) => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return Math.floor((state / 0x1_0000_0000) * size);
  };
}

function categoryStrata(comparables: readonly SnapshotProtocol[]) {
  const buckets = new Map<string | null, SnapshotProtocol[]>();
  for (const row of comparables) {
    const bucket = buckets.get(row.category);
    if (bucket) bucket.push(row);
    else buckets.set(row.category, [row]);
  }

  // Keep well-supported categories at their observed sizes. A shared pool allows
  // uncertainty among small or unlabelled categories without singleton strata.
  const strata: SnapshotProtocol[][] = [];
  const sparse: SnapshotProtocol[] = [];
  for (const [category, bucket] of buckets) {
    if (category !== null && bucket.length >= MIN_STRATUM_SIZE) strata.push(bucket);
    else sparse.push(...bucket);
  }
  if (sparse.length) strata.push(sparse);
  return { strata, sparseCount: sparse.length };
}

/** Refit the existing model on stratified samples while holding the ranked universe fixed. */
export function measureRefitSensitivity(snapshot: Snapshot, candidateSlugs: readonly string[]) {
  const records = new Map(snapshot.protocols.map(row => [row.slug, row]));
  const candidates = candidateSlugs.map(slug => {
    const row = records.get(slug);
    if (!row) throw new Error(`Missing stability candidate: ${slug}`);
    return row;
  });

  const comparables = tradedComparables(snapshot);
  const { strata, sparseCount } = categoryStrata(comparables);
  const pick = randomDraw();
  const draws = new Map(candidates.map(row => [row.slug, [] as Draw[]]));

  for (let i = 0; i < REFITS; i++) {
    const sample = strata.flatMap(group => group.map(() => group[pick(group.length)]!));
    const model = fitComparables(sample, snapshot.as_of);
    const scored = candidates.map(row => ({
      slug: row.slug,
      value: impliedValue(row, snapshot.as_of, model).implied,
    }));
    scored.sort((a, b) => b.value - a.value || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    scored.forEach((row, rank) => draws.get(row.slug)!.push({ rank: rank + 1, value: row.value }));
  }

  return {
    refits: REFITS,
    seed: SEED,
    comparable_count: comparables.length,
    category_strata_sizes: strata.map(group => group.length),
    pooled_comparable_count: sparseCount,
    top_count: TOP_COUNT,
    rows: new Map([...draws].map(([slug, samples]) => [slug, {
      rank: orderedPercentiles(samples.map(draw => draw.rank)),
      value_usd: orderedPercentiles(samples.map(draw => draw.value)),
      top_count_hits: samples.filter(draw => draw.rank <= TOP_COUNT).length,
    }])),
  };
}
