import { fitComparables, impliedValue, MODEL, tradedComparables, type Snapshot } from './model.ts';

interface Prediction {
  slug: string;
  category: string | null;
  observed_usd: number;
  predicted_usd: number;
  baseline_usd: number;
  fixed_adjusted_usd: number;
  fixed_adjusted_absolute_log_error: number;
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
    rationale: 'Retained for the radar ranking because it includes bounded growth and listing-age adjustments. The paired coefficient diagnostic holds growth and listing-age adjustments identical. The fixed coefficient has lower held-out median error on this snapshot; the fitted estimate is retained as the existing ranking scenario.',
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
    fixed_adjusted_median_absolute_log_error: median(rows.map(row => row.fixed_adjusted_absolute_log_error)),
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
    // 与拟合模型共用同一个留出代币及增长、收录时长调整，只固定估值系数。
    const fixedAdjusted = impliedValue(heldOut, snapshot.as_of, MODEL).implied;
    const observed = heldOut.mcap_usd!;
    return {
      slug: heldOut.slug,
      category: heldOut.category,
      observed_usd: observed,
      predicted_usd: predicted,
      baseline_usd: baseline,
      fixed_adjusted_usd: fixedAdjusted,
      fixed_adjusted_absolute_log_error: Math.abs(Math.log(fixedAdjusted / observed)),
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
    coefficient_comparison: {
      fixed_coefficient: MODEL.base_multiple,
      adjustment_policy: 'Identical bounded growth and listing-age adjustments in both models.',
      evaluation: 'The same held-out tokens and natural-log dollar errors; fitted coefficients use the other tokens only.',
    },
    overall: summarize(predictions),
    categories,
    predictions,
  };
}
