# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/pilgrimmeng/token-radar-rebuild/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/pilgrimmeng/token-radar-rebuild/reward.svg)](https://make.fun/bounty/token-radar-01)

An offline dashboard for the make.fun Token Radar bounty. It ranks 40 required watchlist protocols and 160 early candidates from the official frozen DefiLlama snapshot. The snapshot belongs next to the unpacked kit and stays outside Git.

## Run locally

Node 22.18 or newer is required.

```sh
node main.ts --input /path/to/kit/input/snapshot.json --output ./out
```

Open `out/dashboard/index.html`. Use the search box or category selector to narrow the board, sort by column, and select a row for its evidence, implied value, and participation checks. The same entrypoint writes `board.json` and `dossier.json`.

## Valuation and held-out comparison

The fitted growth-and-age estimate drives the ranking and is exported as `implied_value_usd`. Each candidate also has a fixed reference of 0.25 × snapshot TVL in `fixed_tvl_estimate_usd`. In leave-one-token-out evaluation on 128 traded comparables, the fixed reference had lower median absolute log error (1.591 versus 1.647). The comparison changes both the scale and the use of growth and age, so it cannot isolate calibration's contribution. We retain the fitted estimate as the radar's growth- and age-adjusted scenario. Constant ranks across refits reflect the shared scale and provide no evidence of ranking robustness.

The scale is the median market-cap-to-adjusted-TVL ratio across distinct CoinGecko IDs in the snapshot. Each ID supplies its largest-TVLed protocol record. Growth and listing age use bounded starter adjustments. With fewer than 10 comparables, the fallback scale is 0.25. The fitted scale stays between 0.05 and 2.

The model estimates a hypothetical protocol token value. Snapshot fields describe what DefiLlama recorded at the fetch time. Dated source notes identify existing product tokens, vault shares and points independently. Participation notes highlight checks to make before entry. Verify current terms with the provider.

## Local verification

Set `RADAR_SNAPSHOT` to the official frozen snapshot path and `RADAR_OUTPUT` to the generated output directory, then run `node --test tests/*.test.ts`. To regenerate the three images, run the entrypoint first, then run the capture script with a local Playwright module and Chromium executable:

```sh
node tools/capture-screenshots.mjs ./out ./screenshots /path/to/playwright /path/to/chrome
node main.ts --input /path/to/kit/input/snapshot.json --output ./out
```

The second entrypoint run rebuilds the dossier from the final screenshots.

## Refit sensitivity

The detail panel summarizes 200 seeded calibration refits with the same candidates and category-stratified sampling of distinct traded comparables. Categories with fewer than four comparables and unlabelled rows share a pool. Each refit uses the same bounded median calibration and the same scoring formula as the main board. The refits change a shared scale, so ranks usually remain fixed. The reported percentiles and top-20 frequency summarize refits of this snapshot.

The paired coefficient comparison uses the same 128 held-out tokens and identical bounded growth and listing-age adjustments. Median absolute log error is 1.646514 for fitted coefficients and 1.631675 for the fixed 0.25 coefficient. The fixed coefficient performs slightly better on this snapshot. The existing fitted ranking scenario is retained pending stronger evidence for changing the primary model.
