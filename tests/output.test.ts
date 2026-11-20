import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { boardIssue, parseSnapshot, type BoardRow } from '../lib/model.ts';
import { buildDossier } from '../vendor/makefun-board.ts';

const output = process.env.RADAR_OUTPUT;
const input = process.env.RADAR_SNAPSHOT;
assert.ok(output && input, 'Set RADAR_OUTPUT and RADAR_SNAPSHOT to the real local output and input');
const snapshot = parseSnapshot(readFileSync(input, 'utf8'));
const raw = readFileSync(join(output, 'board.json'));
const { rows } = JSON.parse(raw.toString('utf8')) as { rows: BoardRow[] };

test('dashboard_files: offline source and allowed paths only', () => {
  const directory = join(output, 'dashboard');
  const names = readdirSync(directory, { withFileTypes: true });
  assert.ok(names.some(entry => entry.name === 'index.html'));
  for (const extension of ['.css', '.js']) {
    assert.ok(names.some(entry => entry.name.endsWith(extension)));
  }
  let total = 0;
  for (const entry of names) {
    assert.ok(entry.isFile(), entry.name);
    assert.match(entry.name, /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/);
    const bytes = readFileSync(join(directory, entry.name));
    total += bytes.length;
    const text = bytes.toString('utf8');
    if (entry.name.endsWith('.html')) assert.doesNotMatch(text, /<[^>]*=["'][^"']*https?:\/\//i);
    if (entry.name.endsWith('.css')) assert.doesNotMatch(text, /https?:\/\//i);
    if (entry.name.endsWith('.js')) {
      assert.doesNotMatch(text, /(?:from\s*|import\s*\(?(?:\s*)|require\s*\(\s*)['"]https?:\/\//i);
    }
  }
  assert.ok(names.length <= 400 && total <= 4_194_304);
});

test('board_file, sorted_by_value, coverage, farm_steps: starter validator accepts real board', () => {
  assert.ok(raw.length <= 8_388_608);
  assert.ok(rows.every(row => typeof row.name === 'string' && row.name.trim().length > 0));
  assert.ok(rows.every(row => row.implied_value_usd <= 100_000_000_000_000));
  assert.equal(boardIssue(rows, snapshot), null);
});

test('screenshots: final PNG files have valid headers, file sizes and dimensions', () => {
  const directory = join(output, 'screenshots');
  const names = readdirSync(directory).sort();
  assert.deepEqual(names, ['1-board.png', '2-detail.png', '3-filtered.png']);
  for (const name of names) {
    const bytes = readFileSync(join(directory, name));
    assert.ok(bytes.length <= 524_288, name);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    assert.ok(Math.max(width, height) <= 1440 && Math.min(width, height) >= 800, name);
  }
});

test('dossier_matches: generated dossier matches the kit library byte for byte', () => {
  const dossier = readFileSync(join(output, 'dossier.json'));
  assert.ok(dossier.length <= 1_572_864);
  const rebuilt = buildDossier(output, {
    text_max_bytes: 65_536,
    screenshots: { max: 4, max_bytes: 524_288 },
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  });
  assert.ok(dossier.equals(rebuilt), 'Dossier differs from the kit reconstruction');
});
