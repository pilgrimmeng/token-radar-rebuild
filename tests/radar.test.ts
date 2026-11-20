import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildRadar, calibrateModel, impliedValue, MODEL, parseSnapshot } from '../lib/model.ts';
import { measureRefitSensitivity } from '../lib/stability.ts';
import { productResearch } from '../lib/evidence.ts';

const path = process.env.RADAR_SNAPSHOT;
assert.ok(path, 'Set RADAR_SNAPSHOT to the official snapshot.json');
const snapshot = parseSnapshot(readFileSync(path, 'utf8'));

test('frozen input produces the same calibration and rank regardless of input order', () => {
  const reversed = { ...snapshot, protocols: [...snapshot.protocols].reverse() };
  assert.deepEqual(buildRadar(reversed), buildRadar(snapshot));
});

test('calibration counts a token once and chooses its largest positive-TVL observation', () => {
  const model = calibrateModel(snapshot);
  const eligible = snapshot.protocols.filter(p => p.gecko_id?.trim() && p.tvl_usd > 0 && p.mcap_usd && p.mcap_usd > 0);
  const tokenIds = new Set(eligible.map(p => p.gecko_id!.trim().toLowerCase()));
  assert.equal(model.comparable_count, tokenIds.size);
  assert.ok(tokenIds.size >= 10);
  const source = eligible.find(p => p.tvl_usd > 1)!;
  const duplicate = { ...source, slug: 'test-lower-tvl-duplicate', tvl_usd: 1, mcap_usd: 900_000_000 };
  assert.deepEqual(calibrateModel({ ...snapshot, protocols: [...snapshot.protocols, duplicate] }), model);
});

test('sparse calibration falls back and extreme comparable sets remain bounded', () => {
  const sample = Array.from({ length: 12 }, (_, i) => ({
    ...snapshot.protocols[0]!,
    slug: `test-comparable-${i}`,
    gecko_id: `test-id-${i}`,
    tvl_usd: 100_000_000,
    mcap_usd: 1_000_000_000,
  }));
  assert.equal(calibrateModel({ ...snapshot, protocols: sample.slice(0, 9) }).base_multiple, MODEL.base_multiple);
  assert.equal(calibrateModel({ ...snapshot, protocols: sample }).base_multiple, 2);
  const tinyCaps = sample.map(p => ({ ...p, mcap_usd: 1 }));
  assert.equal(calibrateModel({ ...snapshot, protocols: tinyCaps }).base_multiple, 0.05);
});

test('board covers the watchlist and publishes the same scores and participation steps to the dashboard', () => {
  const { board, radar } = buildRadar(snapshot);
  const slugs = new Set(board.map(row => row.slug));
  const records = new Map(snapshot.protocols.map(row => [row.slug, row]));
  assert.equal(board.length, 200);
  assert.equal(slugs.size, board.length);
  assert.equal(snapshot.watchlist.length, 40);
  assert.ok(snapshot.watchlist.every(slug => slugs.has(slug)));

  board.forEach((row, i) => {
    assert.equal(row.rank, i + 1);
    if (i > 0) assert.ok(board[i - 1]!.implied_value_usd >= row.implied_value_usd);
    assert.equal(row.implied_value_usd, impliedValue(records.get(row.slug)!, snapshot.as_of, radar.model).implied);
    assert.equal(row.implied_value_usd, radar.rows[i]!.implied_value_usd);
    assert.deepEqual(row.farm_steps, radar.rows[i]!.farm_steps);
    assert.ok(row.farm_steps.length >= 3 && row.farm_steps.length <= 12);
    assert.ok(row.farm_steps.every(step => step.length >= 20 && step.length <= 600));
    assert.ok(row.farm_steps.every(step => !/qualifying action each week|hold the position for at least|under \$3 of gas/i.test(step)));
  });
});

test('each real top-20 candidate has dated identity and route evidence', () => {
  const { board } = buildRadar(snapshot);
  for (const row of board.slice(0, 20)) {
    const evidence = productResearch[row.slug];
    assert.ok(evidence, row.slug);
    assert.ok(evidence.identity && evidence.checks && evidence.exit);
    assert.match(evidence.checkedOn, /^2026-11-(18|19)$/);
    assert.equal(new URL(evidence.source).protocol, 'https:');
    assert.equal(row.farm_steps[0], evidence.route);
  }
});

test('stratified refits reproduce candidate ranges and preserve calibrated category support', () => {
  const { board } = buildRadar(snapshot);
  const keys = board.map(row => row.slug);
  const original = measureRefitSensitivity(snapshot, keys);
  const replay = measureRefitSensitivity({ ...snapshot, protocols: [...snapshot.protocols].reverse() }, keys);
  assert.deepEqual(replay, original);
  assert.equal(original.refits, 200);
  assert.equal(original.rows.size, keys.length);
  assert.equal(original.category_strata_sizes.reduce((sum, size) => sum + size, 0), original.comparable_count);
  assert.ok(original.category_strata_sizes.length > 1);
  assert.ok(original.pooled_comparable_count > 0);
  assert.equal([...original.rows.values()].reduce((sum, row) => sum + row.top_count_hits, 0),
    original.refits * original.top_count);
  for (const row of original.rows.values()) {
    assert.ok(1 <= row.rank.p05 && row.rank.p05 <= row.rank.median && row.rank.median <= row.rank.p95 && row.rank.p95 <= keys.length);
    assert.ok(1 <= row.value_usd.p05 && row.value_usd.p05 <= row.value_usd.median && row.value_usd.median <= row.value_usd.p95);
    assert.ok(row.top_count_hits >= 0 && row.top_count_hits <= original.refits);
  }
  assert.ok([...original.rows.values()].some(row => row.value_usd.p05 < row.value_usd.p95));
});
