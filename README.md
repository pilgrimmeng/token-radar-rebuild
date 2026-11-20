# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)

An offline dashboard for the make.fun Token Radar bounty. It ranks 40 required watchlist protocols and 160 early candidates from the official frozen DefiLlama snapshot. The snapshot belongs next to the unpacked kit and stays outside Git.

## Run locally

Node 22.18 or newer is required.

```sh
node main.ts --input /path/to/kit/input/snapshot.json --output ./out
```

Open `out/dashboard/index.html`. Use the search box or category selector to narrow the board, sort by column, and select a row for its evidence, implied value, and participation checks. The same entrypoint writes `board.json` and `dossier.json`.

## What the estimate means

The scale is the median market-cap-to-adjusted-TVL ratio across distinct CoinGecko IDs in the snapshot. Each ID supplies its largest-TVLed protocol record. Growth and listing age use bounded starter adjustments. With fewer than 10 comparables, the fallback scale is 0.25. The fitted scale stays between 0.05 and 2.

The model estimates a hypothetical protocol token value. Snapshot fields describe what DefiLlama recorded at the fetch time. Dated source notes identify existing product tokens, vault shares and points independently. Participation notes highlight checks to make before entry. Verify current terms with the provider.

## Local verification

Set `RADAR_SNAPSHOT` to the official frozen snapshot path and `RADAR_OUTPUT` to the generated output directory, then run `node --test tests/*.test.ts`. To regenerate the three images, run the entrypoint first, then run the capture script with a local Playwright module and Chromium executable:

```sh
node tools/capture-screenshots.mjs ./out ./screenshots /path/to/playwright /path/to/chrome
node main.ts --input /path/to/kit/input/snapshot.json --output ./out
```

The second entrypoint run rebuilds the dossier from the final screenshots.
