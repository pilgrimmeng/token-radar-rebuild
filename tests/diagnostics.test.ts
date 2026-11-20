import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { calibrationDiagnostic } from '../lib/diagnostics.ts';
import { fitComparables, impliedValue, parseSnapshot, tradedComparables } from '../lib/model.ts';

const snapshot = parseSnapshot(readFileSync(process.env.RADAR_SNAPSHOT!, 'utf8'));

test('each held-out prediction fits strictly on the other unique tokens', () => {
  const result = calibrationDiagnostic(snapshot);
  const comparables = tradedComparables(snapshot);
  assert.equal(result.predictions.length, comparables.length);
  for (const prediction of result.predictions) {
    const heldOut = comparables.find(row => row.slug === prediction.slug)!;
    const training = comparables.filter(row => row.gecko_id !== heldOut.gecko_id);
    assert.equal(prediction.training_count, training.length);
    assert.equal(prediction.predicted_usd,
      impliedValue(heldOut, snapshot.as_of, fitComparables(training, snapshot.as_of)).implied);
    assert.ok(Number.isFinite(prediction.absolute_log_error));
    assert.ok(Number.isFinite(prediction.baseline_absolute_log_error));
  }
  assert.deepEqual(calibrationDiagnostic({ ...snapshot, protocols: [...snapshot.protocols].reverse() }), result);
  assert.ok(result.categories.every(group => group.count >= 5));
});

test('an altered held-out cap cannot change its own fitted prediction', () => {
  const original = calibrationDiagnostic(snapshot);
  const token = tradedComparables(snapshot)[0]!;
  const altered = {
    ...snapshot,
    protocols: snapshot.protocols.map(row => row.gecko_id === token.gecko_id
      ? { ...row, mcap_usd: row.mcap_usd === null ? null : row.mcap_usd * 10 } : row),
  };
  const after = calibrationDiagnostic(altered);
  assert.equal(after.predictions.find(row => row.slug === token.slug)!.predicted_usd,
    original.predictions.find(row => row.slug === token.slug)!.predicted_usd);
});
