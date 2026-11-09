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
2. (Revised 2026-11-09, Omri picked "plain tsc emit".) `packages/core`, `packages/chat`,
   `packages/client`, `packages/contract` stop bundling declarations: tsdown `dts: false`, and
   declarations come from `tsc -p tsconfig.build.json` exactly like the 20 packages that already
   do it (brand, embed, protocol, ui-kit-*, most extensions). Copy their shape: tsconfig.build.json
   layout, `build` script order, buildinfo placement (the #374 fix, see
   `fix(build): stop the declaration build from losing its own output`), and point every
   `exports[*].types` at the emitted per-file d.ts. No rolldown-plugin-dts in these four packages'
   type path at all, so #295 cannot reach them. `minifyInternalExports` stays at its default.
   This is a trial on four packages; the report says how it went (build time, d.ts diff, attw/publint,
   consumer typecheck) and which of the remaining 14 tsdown `dts: true` packages emit a shared d.ts
   chunk (check-dts tells), so Omri can decide on moving all of them.
3. A d.ts value-export guard (stays while any package still bundles d.ts through tsdown; deleted
   when none do): a `conciv-publish check-dts` command that walks every published
   package's `dist/**/*.d.{ts,mts,cts}`, and for each `export { type X as Y }` /
   `export { type X }` specifier fails when `X` is declared in that file as a value
   (`declare const|let|var|function|class|enum`, `declare namespace` with values). It also flags
   the false negative: a specifier without `type` whose local is only a `type`/`interface`
   declaration in that file. Wired into `conciv-publish check` (release path) and into `ci.yml`
   after the build, so a regression fails the PR, not the release. Upstream's issue suggests
   exactly this oracle. Its tests: a describe in `packages/publish/test/publish.test.ts` with inline
   d.ts strings (one value-as-type case, one type-without-type case, one clean case).
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
stable API lands and twoslash adopts it. `minifyInternalExports: false` goes when
rolldown-plugin-dts#295 ships, proven by `check-dts` staying green after removal.

### TypeScript 6 holdouts

| App        | Blocker                             | Upstream                                   | Unblock check                                                                                   |
| ---------- | ----------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| e2e/svelte | svelte-check has no stable TS7 mode | sveltejs/language-tools#3063, #3185, #3174 | svelte-check release with TS7 peer or stable `--tsgo`; `pnpm --filter <app> check` green on TS7 |

(Implementation adds rows only for proven failures, with the failing command and error line.)

## Acceptance

- No `typescript@6` in any `@conciv/*`, `apps/conciv`, `apps/storybook`, `apps/site` importer in
  `pnpm-lock.yaml`; `grep -r "catalog:ts6"` lists exactly the holdout table.
- Core's shared-chunk d.ts: value exports carry no `type` (diff the export lines against today's
  TS6 build); consumer probe `import {makeApp} from '@conciv/core'` + call typechecks under
  `verbatimModuleSyntax`.
- `check-dts` green on every published package; reverting the `minifyInternalExports` setting makes
  it fail (fail-first proof).
- typecheck + test for every changed package and its dependents, `pnpm release:check`
  (publint + attw), fallow audit clean, affected e2e green, storybook build, site snippet
  regeneration identical.
- Before/after wall time of the full typecheck recorded in the PR body.
