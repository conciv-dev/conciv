# bundle-size/src

## Overview

CLI and library that gzip-measure every non-private package's dist JS/CSS (under `packages/` and `packages/plugins/`), the widget bundle of `@conciv/app` (its first load and its lazy chunks as two rows), and the apps/site worker (through a wrangler dry-run). The CLI renders a markdown size table with deltas against a baseline JSON file and fails when the worker's uncompressed upload (wrangler's `Total Upload`) exceeds Cloudflare's 64 MiB Worker size limit. The gzip figure is reported for reference only: Cloudflare removed its compressed limit on 2026-09-04.

## Interface

- CLI `conciv-bundle-size` (`cli.ts`): measures from `process.cwd()`; `--output <path>` writes sizes JSON, `--baseline <path>` reads the baseline to diff against.

## Invariants

- `publishedPackages` (`measure.ts`): skips dirs without package.json and manifests with private === true or a non-string name
- `distFiles` (`measure.ts`): counts only .js/.mjs/.cjs/.css files under dist, recursively
- `measureSizes` (`measure.ts`): drops packages with 0 dist files; the two widget rows are included only if `packages/app/dist/conciv-widget.global.js` and `packages/app/dist/widget` exist; the first-load row is the loader plus the static-import closure of its entry chunk and the `mount-impl` chunk, the lazy row every other `dist/widget` chunk
- `parseSizes` (`measure.ts`): invalid JSON or a non-array gives []; entries without a string name are dropped; non-number raw/gzip/files default to 0
- `parseWorkerSize` (`measure.ts`): throws unless exactly one wrangler size line matches, and on non-finite numbers
- The worker budget is 64 MiB uncompressed (`WORKER_LIMIT_KIB`), checked against `Total Upload`, not gzip; `measureWorker` (`measure.ts`) throws if apps/site/dist/server/wrangler.json is missing, naming `pnpm exec turbo run build --filter=site`
- `cli.ts`: measureWorker runs unconditionally, so the CLI throws when the site worker is not built; a missing baseline file means no baseline

## Side Effects

- `cli.ts`: writeFileSync of sizes JSON to the --output path
- `cli.ts`: appends markdown to the file in env GITHUB_STEP_SUMMARY when set, otherwise writes to stdout
- `cli.ts`: writes the over-budget message to stderr and sets process.exitCode = 1
- `measureWorker` (`measure.ts`): spawns `pnpm --filter site exec wrangler deploy --dry-run --config dist/server/wrangler.json --outdir <tmp>` with FORCE_COLOR=0 and NO_COLOR=1
- `measureWorker` (`measure.ts`): creates a temp dir via mkdtempSync('conciv-worker-size-') and removes it in finally
- `measureSizes` / `publishedPackages` (`measure.ts`): read package.json and dist files from disk

## Verification

- Typecheck: `pnpm exec turbo run typecheck --filter=@conciv/bundle-size` from the repo root (the package has no `test` script)
