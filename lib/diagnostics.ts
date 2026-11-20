import { fitComparables, impliedValue, MODEL, tradedComparables, type Snapshot } from './model.ts';

interface Prediction {
  slug: string;
  category: string | null;
  observed_usd: number;
  predicted_usd: number;
  baseline_usd: number;
  absolute_log_error: number;
  baseline_absolute_log_error: number;
  training_count: number;
}

export function fixedTvlEstimate(tvlUsd: number): number {
  return Math.max(1, Math.round(tvlUsd * MODEL.base_multiple));
}

export const valuationComparison = {
  primary: {
    label: 'Fitted growth-and-age model',
    rationale: 'Retained for the radar ranking because it includes bounded growth and listing-age adjustments. The holdout compares the complete fitted model with a TVL-only reference; it cannot isolate the effect of fitting the scale.',
  },
  reference: {
    label: 'Fixed 0.25× TVL reference',
    formula: 'One quarter of snapshot TVL, rounded to dollars with a minimum of one dollar.',
  },
};

/** Median absolute natural-log error is insensitive to the units used for valuation. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function summarize(rows: Prediction[]) {
  return {
    count: rows.length,
    median_absolute_log_error: median(rows.map(row => row.absolute_log_error)),
    baseline_median_absolute_log_error: median(rows.map(row => row.baseline_absolute_log_error)),
  };
}

/**
 * Leave one unique token out, fitting only the remaining token observations.
 * The fixed 0.25 TVL baseline uses no fitted parameter or observed held-out cap.
 */
export function calibrationDiagnostic(snapshot: Snapshot) {
  const comparables = tradedComparables(snapshot);
  if (comparables.length < 11) {
    return { method: 'leave-one-token-out', status: 'insufficient comparables', predictions: [], overall: null, categories: [] };
  }
  const predictions: Prediction[] = comparables.map((heldOut, index) => {
    const training = comparables.filter((_, trainingIndex) => trainingIndex !== index);
    const fitted = fitComparables(training, snapshot.as_of);
    const predicted = impliedValue(heldOut, snapshot.as_of, fitted).implied;
    const baseline = fixedTvlEstimate(heldOut.tvl_usd);
    const observed = heldOut.mcap_usd!;
    return {
      slug: heldOut.slug,
      category: heldOut.category,
      observed_usd: observed,
      predicted_usd: predicted,
      baseline_usd: baseline,
      absolute_log_error: Math.abs(Math.log(predicted / observed)),
      baseline_absolute_log_error: Math.abs(Math.log(baseline / observed)),
      training_count: training.length,
    };
  });
  const categories = [...new Set(predictions.map(row => row.category))]
    .filter((category): category is string => category !== null)
    .sort()
    .map(category => ({ category, ...summarize(predictions.filter(row => row.category === category)) }))
    .filter(group => group.count >= 5);
  return {
    method: 'leave-one-token-out',
    status: 'evaluated',
    baseline: '0.25 times TVL, without growth or age adjustment',
    overall: summarize(predictions),
    categories,
    predictions,
  };
}
