// A working token-radar-01 entry (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores every
// pre-token protocol with the model in lib/model.ts, writes the ranked board to /output/board.json, and
// copies this repository's dashboard/ and screenshots/ to /output. Last, it writes /output/dossier.json,
// the summary the judge reads, with the vendored make.fun library.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html, dashboard/app.css
// and dashboard/app.js read /output/data.js, which this program writes from the same board. A starting
// point, not a winner: it covers the watchlist, states the model and gives every protocol a farm plan.
// Change the model, the page or the plan; keep the gate's shape.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

import { measureRefitSensitivity } from './lib/stability.ts';
import { calibrationDiagnostic, fixedTvlEstimate, valuationComparison } from './lib/diagnostics.ts';
import { productResearch } from './lib/evidence.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

const { rows: sensitivity, ...refitInfo } = measureRefitSensitivity(snapshot, board.map(row => row.slug));
const diagnostic = calibrationDiagnostic(snapshot);
const enrichedBoard = board.map(row => ({ ...row, fixed_tvl_estimate_usd: fixedTvlEstimate(row.tvl_usd), refit_sensitivity: sensitivity.get(row.slug)! }));
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: enrichedBoard, refit_sensitivity: refitInfo, calibration_diagnostic: diagnostic, valuation_comparison: valuationComparison })}\n`);
// Retain the actual listing fields behind each detail's snapshot status.
const recordedProtocols = new Map(snapshot.protocols.map((protocol) => [protocol.slug, protocol]));
const detailRows = radar.rows.map((row) => {
  const record = recordedProtocols.get(row.slug)!;
  const evidence = productResearch[row.slug];
  return {
    ...row,
    fixed_tvl_estimate_usd: fixedTvlEstimate(row.tvl_usd),
    refit_sensitivity: sensitivity.get(row.slug)!,
    token_status: {
      snapshot_date: snapshot.as_of,
      snapshot_source: snapshot.source,
      // A symbol or CoinGecko ID is evidence of a listing in this snapshot.
      has_recorded_listing: record.symbol !== null || record.gecko_id !== null,
      label: evidence?.kind ?? "No listing in snapshot",
      symbol: record.symbol,
      gecko_id: record.gecko_id,
      // Protocol documentation is a separate evidence layer from the frozen listing.
      product_evidence: row.slug === 'onre' ? {
        checked_on: '2026-11-19',
        observations: [
          {
            finding: 'ONyc is an issued yield-bearing asset representing exposure to a reinsurance account on Solana. A separate OnRe governance token launch remains unverified by this evidence.',
            publisher: 'OnRe · Tokenized Reinsurance (ONyc)',
            url: 'https://make.fun/bounty/token-radar-01'
          }
        ]
      } : undefined
    }
  };
});

writeFileSync(join(out, 'data.js'), dataScript({ as_of: snapshot.as_of, source: snapshot.source, rows: detailRows, refit_sensitivity: refitInfo, calibration_diagnostic: diagnostic, valuation_comparison: valuationComparison }));

// Copy dashboard static assets if present in repo
const dashboardDir = join(here, 'dashboard');
if (existsSync(dashboardDir)) {
  mkdirSync(join(out, 'dashboard'), { recursive: true });
  for (const entry of readdirSync(dashboardDir)) {
    const srcPath = join(dashboardDir, entry);
    if (statSync(srcPath).isFile()) {
      copyFileSync(srcPath, join(out, 'dashboard', entry));
    }
  }
}

// Copy screenshots if present
const screenshotsDir = join(here, 'screenshots');
if (existsSync(screenshotsDir)) {
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  let count = 0;
  for (const entry of readdirSync(screenshotsDir)) {
    if (!IMAGE_NAME.test(entry)) continue;
    const srcPath = join(screenshotsDir, entry);
    const st = statSync(srcPath);
    if (st.isFile() && st.size <= SCREENSHOT_CAPS.max_bytes) {
      copyFileSync(srcPath, join(out, 'screenshots', entry));
      count++;
      if (count >= SCREENSHOT_CAPS.max) break;
    }
  }
}

// Build and write dossier summary
const dossier = buildDossier({
  board: enrichedBoard,
  snapshot,
  refitSensitivity: refitInfo,
  calibrationDiagnostic: diagnostic,
  valuationComparison
});

if (Buffer.byteLength(dossier, 'utf8') > TEXT_MAX_BYTES) {
  process.stderr.write(`token radar: dossier exceeds max bytes limit (${TEXT_MAX_BYTES})\n`);
  process.exit(1);
}

writeFileSync(join(out, 'dossier.json'), dossier);
process.stdout.write(`token radar: successfully scored ${board.rows?.length ?? board.length} protocols -> ${out}\n`);