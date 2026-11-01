# bundle-size/src

## Overview

CLI and library that gzip-measure every non-private package's dist JS/CSS, the embed widget global bundle, and the apps/site worker (through a wrangler dry-run). The CLI renders a markdown size table with deltas against a baseline JSON file and fails when the worker exceeds a 3 MiB gzip budget.

## Interface

- CLI `conciv-bundle-size` (`cli.ts`): measures from process.cwd(); `--output <path>` writes sizes JSON, `--baseline <path>` reads the baseline to diff against
- `PackageSize` type (`measure.ts`): {name, raw, gzip, files}
- `WorkerReport` type (`measure.ts`): {size: PackageSize, chunks: {file, gzip}[]}
- `WORKER_NAME` (`measure.ts`): 'conciv.dev worker (apps/site)'
- `WORKER_LIMIT_KIB` (`measure.ts`): 3 * 1024 (3072 KiB gzip budget)
- `measureSizes(root)` (`measure.ts`): widget bundle size first, then non-private packages under packages/ and packages/extensions/ sorted by name
- `parseSizes(raw)` (`measure.ts`): parses baseline JSON leniently into PackageSize[]
- `parseWorkerSize(wranglerOutput)` (`measure.ts`): strips ANSI codes and extracts 'Total Upload: X KiB / gzip: Y KiB' as bytes
- `workerIsOverBudget(report, limitKib)` (`measure.ts`): true when gzip &gt; limitKib*1024
- `workerIsBuilt(root)` (`measure.ts`): checks that apps/site/dist/server/wrangler.json exists
- `measureWorker(root)` (`measure.ts`): runs a wrangler dry-run and returns the total plus per-chunk gzip sizes sorted descending
- `formatWorkerOverBudget(report, limitKib)` (`measure.ts`): message listing the top 10 chunks
- `renderSizes(current, baseline)` (`measure.ts`): markdown '## Bundle size' table with total and per-package delta against main

## Invariants

- `publishedPackages` (`measure.ts`): skips dirs without package.json and manifests with private === true or a non-string name
- `distFiles` (`measure.ts`): counts only .js/.mjs/.cjs/.css files under dist, recursively
- `measureSizes` (`measure.ts`): drops packages with 0 dist files; the widget row is included only if packages/embed/dist/conciv-widget.global.js exists
- `parseSizes` (`measure.ts`): invalid JSON or a non-array gives []; entries without a string name are dropped; non-number raw/gzip/files default to 0
- `parseWorkerSize` (`measure.ts`): throws unless exactly one wrangler size line matches, and on non-finite numbers
- `measureWorker` (`measure.ts`): throws if apps/site/dist/server/wrangler.json is missing, naming `pnpm exec turbo run build --filter=site`
- `cli.ts`: measureWorker runs unconditionally, so the CLI throws when the site worker is not built; a missing baseline file means no baseline

## Side Effects

- `cli.ts`: writeFileSync of sizes JSON to the --output path
- `cli.ts`: appends markdown to the file in env GITHUB_STEP_SUMMARY when set, otherwise writes to stdout
- `cli.ts`: writes the over-budget message to stderr and sets process.exitCode = 1
- `measureWorker` (`measure.ts`): spawns `pnpm --filter site exec wrangler deploy --dry-run --config dist/server/wrangler.json --outdir <tmp>` with FORCE_COLOR=0 and NO_COLOR=1
- `measureWorker` (`measure.ts`): creates a temp dir via mkdtempSync('conciv-worker-size-') and removes it in finally
- `measureSizes` / `publishedPackages` (`measure.ts`): read package.json and dist files from disk

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/bundle-size` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/bundle-size && pnpm typecheck && pnpm lint`
