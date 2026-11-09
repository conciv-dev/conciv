# TypeScript 7 for every conciv package

Issue #373. Second attempt; the first (2026-08-09) was parked on a corrupt `@conciv/core` d.ts.

## Goal

Every `@conciv/*` package, `apps/conciv`, `apps/storybook` and `apps/site` typecheck and emit
declarations with TypeScript 7 (`typescript@^7.0.2`, the native Go `tsc`). Consumer fixture apps
(`e2e/*`, `apps/examples/*`) move to TS7 too, except where a tool they exercise cannot run on it
yet; each such holdout stays on TypeScript 6 through one named catalog and has a written unblock
check, so the remaining migration is a grep and a version bump.

## What went wrong last time

The first attempt blamed rolldown-plugin-dts's tsgo generator. That diagnosis was wrong.

Real cause: sxzz/rolldown-plugin-dts#295 (open, unfixed at 0.30.0). In a shared chunk,
`patchImportExport` (`src/fake-js/patch.ts`) compares the alias Rolldown picked under
`minifyInternalExports` (`o`, `t`, `Id`...) against the set of original type-only export names.
A value whose minified alias equals a type name gets `type` (we saw `type makeApp as o`, consumers
fail `TS1362`); a type whose alias differs loses its `type`. It is generator-independent. The
`resolver: 'tsc'` we adopted in 23891276 never fixed it; it changed export order, so the collision
stopped landing on a value by luck. Under TS7 the `tsc` resolver cannot run at all (TS7 ships no
classic JS API), so the luck ran out.

Upstream-confirmed workaround: with `minifyInternalExports: false` both sides of that comparison
use original names and the output is correct.

## Decisions (approved by Omri, 2026-11-09)

1. Catalog `typescript: ^7.0.2`. `bin` stays `tsc`; no script renames.
2. (Revised twice 2026-11-09; Omri: one way for every package.) No package bundles declarations.
   Every tsdown config sets `dts: false` (today `dts: true` or `dts: {resolver: 'tsc'}`: ai, brand,
   chat, client, contract, core, db, extension-compiler, extension, grab, harness-init, harness, it,
   mascot, page, plugin, preact, react, serve, solid, storage-history, tools, try), and declarations
   come from `tsc -p tsconfig.build.json` exactly like the 20 packages that already do it (brand,
   embed, protocol, ui-kit-*, most extensions). Copy their shape: tsconfig.build.json layout,
   `build` script order, buildinfo placement (the #374 fix, see
   `fix(build): stop the declaration build from losing its own output`), and point every
   `exports[*].types` at the emitted per-file d.ts. rolldown-plugin-dts leaves every type path,
   so #295 cannot reach any package. `minifyInternalExports` stays at its default.
   Packages whose dist mixes bundled JS from several entries keep tsdown for JS only.
3. No d.ts guard: with no bundled declarations there is nothing for it to catch. The
   `check-dts` command from commit b54b5ea1d is deleted (revert it, including its ci.yml and
   `conciv-publish check` wiring and its test describe).
4. Code that needs the classic TS API:
   - `storybook-solidjs-vite` 10.7.4 already depends on and imports `@typescript/typescript6` itself
     (`dist/internal/docgen-worker.js`). Nothing to do; verify storybook still builds with docgen.
   - `apps/site/scripts/highlight-snippets.ts`: import `createTwoslasher` from `twoslash/core` and
     pass `tsModule` from `@typescript/typescript6` (new devDependency of `apps/site`, catalog entry).
     `@typescript/vfs` takes `ts` as an argument and never imports it. twoslash 0.3.9 peers
     `typescript ^5.5 || ^6` (twoslashes/twoslash#93 open); the regenerated
     `framework-snippets.gen.ts` must be byte-identical to today's.
   - `packages/extension/test/extension.test.ts` ("every scaffold kind emits source that parses"):
     use `oxc-parser` (already in the catalog) instead of `ts.transpileModule`.
   - `packages/extensions/tanstack/test/tanstack.test.ts` ("typescript resolves types by
     customConditions"): run the real TS7 `tsc` on the fixture (with and without
     `customConditions: ["browser"]`) and assert on its resolution output (`--traceResolution` or
     `--explainFiles`). This tests the compiler consumers run.
   - Remove `import ... from 'typescript'` everywhere else it appears; there should be none left.
5. Holdouts: a named pnpm catalog `ts6` (`typescript: ^6.0.3`) used only by apps that cannot run
   on TS7. Known one: `e2e/svelte` (svelte-check peers `^5 || ^6`; its `--tsgo` mode is
   experimental with open bugs sveltejs/language-tools#3063, #3185, #3174; Microsoft's announcement
   says Svelte stays on 6). Every other e2e/example app is tried on TS7 first (Next.js apps need a
   real `next build` with its type check); only a demonstrated failure earns `catalog:ts6`.
   `conciv-publish check-catalog` must accept the named catalog.
6. Editor: TS7 has no tsserver; its language server is LSP. CLI/CI are the source of truth.

## Migration path for holdouts

The "TypeScript 6 holdouts" table below is the single record. Each row: app, the tool that blocks,
the upstream issue, the check that unblocks it. Re-attempt = for each row, check the issue/changelog,
switch `catalog:ts6` to `catalog:`, run that app's typecheck + e2e. When the table is empty, delete
the `ts6` catalog. `@typescript/typescript6` goes when twoslash ships TS7 support (#93) or TS 7.1's
stable API lands and twoslash adopts it. Bundled d.ts (tsdown `dts: true`) may come back only after
rolldown-plugin-dts#295 ships, and only for every package at once, with a d.ts export diff proving the
public surface unchanged.

### TypeScript 6 holdouts

| App                      | Blocker                                                                                                                                                                                                                                                                                                          | Upstream                                                                                                        | Unblock check                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| e2e/svelte               | svelte-check 4.7.7 refuses TS7 alone: `svelte-check --tsconfig ./tsconfig.json` on TS7 throws `Error: TypeScript 7 support currently requires both TypeScript 7 and TypeScript 6 installed in your project, and requires using the --tsgo or --tsgo-experimental-api flag.`                                      | sveltejs/language-tools#3063, #3185, #3174                                                                      | svelte-check release with TS7 peer or stable `--tsgo`; `pnpm --filter <app> check` green on TS7 |
| apps/examples/nextjs-app | its `lint` (eslint-config-next 16.4.3 pulls typescript-eslint 8.61.1, which loads the classic TypeScript API) crashes on TS7: `pnpm --filter nextjs-app lint` throws `TypeError: Cannot read properties of undefined (reading 'Cjs')` at `@typescript-eslint/typescript-estree/dist/create-program/shared.js:59` | typescript-eslint peers `typescript >=4.8.4 <6.1.0`; TS7 support tracked in typescript-eslint/typescript-eslint | typescript-eslint release peering TS7; `pnpm --filter nextjs-app lint` and `build` green on TS7 |

(Implementation adds rows only for proven failures, with the failing command and error line.)

## Acceptance

- No `typescript@6` in any `@conciv/*`, `apps/conciv`, `apps/storybook`, `apps/site` importer in
  `pnpm-lock.yaml`; `grep -r "catalog:ts6"` lists exactly the holdout table.
- Public type surface unchanged for every package moved off bundled d.ts: per package, every
  `exports` subpath's exported names and kinds (value vs type) match main's TS6 build; list any
  difference. Consumer probe: `import {makeApp} from '@conciv/core'` + call typechecks under
  `verbatimModuleSyntax`.
- No tsdown config with `dts` other than `false`; `rolldown-plugin-dts` absent from every type path.
- typecheck + test for every changed package and its dependents, `pnpm release:check`
  (publint + attw), fallow audit clean, affected e2e green, storybook build, site snippet
  regeneration identical.
- Before/after wall time of the full typecheck recorded in the PR body.

## Results

Same machine (12 cores), cold: every `*.tsbuildinfo` and `packages/**/dist` deleted, and turbo pointed
at an empty `TURBO_CACHE_DIR` per run (no `--force`). The set is
`--filter='./packages/*' --filter='./packages/extensions/*' --filter='./apps/*'` at
`TURBO_CONCURRENCY=70%`, measured with `/usr/bin/time -l`. The typecheck run includes the
dependency builds it waits on (all 96 tasks were cache misses in both runs). RSS is the largest
single process.

Caveat: other worktrees were running suites the whole time. Load average was about 64 when sampled
during the TS6 runs and 87 to 137 during the TS7 runs, so wall time is not comparable between the
two columns. User CPU and RSS are the reliable comparison.

| Measure                                                          | TS6 (main toolchain)                     | TS7 (this branch)                     |
| ---------------------------------------------------------------- | ---------------------------------------- | ------------------------------------- |
| Build, 47 tasks: wall / user / max RSS                           | 465.2 s / 363.0 s / 3.61 GB              | 1154.5 s / 247.8 s / 1.51 GB          |
| Typecheck incl. builds, 96 tasks: wall / user / max RSS          | 618.0 s / 777.2 s / 3.10 GB              | 1131.1 s / 369.7 s / 1.30 GB          |
| `tsc -p packages/core/tsconfig.json --noEmit`, 3 cold runs: wall | 26.5 s, 20.2 s, 25.4 s                   | 17.8 s, 24.9 s, 24.1 s                |
| same: user / max RSS                                             | 11.4, 10.2, 10.6 s / 0.88, 0.72, 0.74 GB | 6.9, 6.7, 6.8 s / 0.98, 0.81, 0.90 GB |

The TS7 typecheck run had one failing task (`site#typecheck`, see the twoslash note in the report);
it ran to completion with `--continue`.
