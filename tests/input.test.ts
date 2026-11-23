import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseSnapshot, SnapshotError } from '../lib/model.ts';

const original = JSON.parse(readFileSync(process.env.RADAR_SNAPSHOT!, 'utf8'));

test('parser rejects ambiguous identities and missing watchlist entries before Map conversion', () => {
  const duplicate = structuredClone(original);
  duplicate.protocols.push(duplicate.protocols[0]);
  assert.throws(() => parseSnapshot(JSON.stringify(duplicate)), /duplicate protocol slugs/);
  const missing = structuredClone(original);
  missing.watchlist.push('absent-protocol');
  assert.throws(() => parseSnapshot(JSON.stringify(missing)), /missing protocol/);
  const repeated = structuredClone(original);
  repeated.watchlist.push(repeated.watchlist[0]);
  assert.throws(() => parseSnapshot(JSON.stringify(repeated)), /duplicate watchlist/);
});

test('parser refuses malformed fields that previously became null or silently changed dates', () => {
  for (const [field, value] of [
    ['gecko_id', 17], ['symbol', false], ['category', []], ['chains', ['Ethereum', null]],
    ['tvl_usd', -1], ['tvl_usd', 12.5], ['mcap_usd', '100'], ['change_7d', '5'],
    ['slug', 'bad slug'], ['name', '  '], ['listed_at', '2026-02-30'],
  ]) {
    const broken = structuredClone(original);
    broken.protocols[0][field as string] = value;
    assert.throws(() => parseSnapshot(JSON.stringify(broken)), SnapshotError, String(field));
  }
  const brokenDate = structuredClone(original);
  brokenDate.as_of = '2026-13-01';
  assert.throws(() => parseSnapshot(JSON.stringify(brokenDate)), /as_of date/);
  assert.deepEqual(parseSnapshot(JSON.stringify(original)), original);
});
