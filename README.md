# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Moksed96/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Moksed96/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for make.fun — which pre-token protocol is worth farming next, and what to do about it. My entry in the "Build the best token launch radar" bounty: a Node 22 program that reads a sealed snapshot of the protocol universe, ranks every clean pre-token protocol by implied value, and writes a static dashboard with a per-protocol detail view and a farm plan for each row.

## How the value is built

Implied value = **TVL × category multiple × growth × maturity**. The category multiple is the median market-cap-to-TVL ratio of the live protocols in the protocol's own category, shrunk toward the global median when the category is thin and clamped to [0.05, 1.00]. Growth comes from the seven-day TVL change, maturity from how long the protocol has run with no token on record. The board carries 178 rows: the 40 watchlist protocols plus the 138 clean pre-token protocols below the $100M floor. Twenty further protocols are deliberately left off — each is a wrapped, staked, bridged or vault product of a protocol that already trades, so ranking it would double-count one market cap.

## Run it

```sh
# main.ts reads /input/snapshot.json and writes /output/ (or use --input / --output)
node main.ts --input <snapshot.json> --output out
```

Then serve the output directory and open the dashboard:

```sh
python3 -m http.server 8000 --directory out
```

The dashboard is a static page with no network: search, category, chain and minimum-TVL filters, a watchlist-only toggle, a live-comparables tab, and a detail view for every row that shows the model's arithmetic and the farm plan. The page recomputes each row's implied value in the browser and checks it against the board's number.

## Layout

- `main.ts` — entrypoint: read the snapshot, build the board, write `board.json`, `data.js`, copy `dashboard/` + `screenshots/`, write `dossier.json`
- `lib/model.ts` — snapshot parsing, the radar model, farm plans, board validation
- `lib/comparables.ts` — category-median multiples, exposed for the page
- `dashboard/` — the static page (`index.html`, `app.css`, `app.js`)
- `screenshots/` — three renders of the dashboard: the board, a detail view, a filtered view
- `vendor/makefun-board.ts` — make.fun's dossier library, vendored unchanged

---

<sub>Entered on [make.fun](https://make.fun/?ref=469bxynt&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
