# Src Exports for Browser Internals (Project B): Spike Round

**Status:** implemented for the 12-package browser set (plan
`docs/superpowers/plans/2026-07-13-src-exports-browser-set.md`). Deviation from the plan found in
execution: plain src exports broke the Next example, whose Turbopack bundles embed via
`instrumentation-client.ts` and cannot resolve NodeNext `./x.js` specifiers against `.tsx` src nor
solid-compile it. Final shape: exports carry a `conciv-src` condition (src) with the dist map as
fallback; the conciv vite plugin (`resolve.conditions`) and `tsconfig.base.json`
(`customConditions`) opt in, every other resolver gets dist. Published manifests still dist-only
via `publishConfig.exports`. Follow-up: serve the widget bundle from the engine for non-vite hosts
(https://github.com/conciv-dev/conciv/issues/59). Still open: S3 (uno pipeline → embed src flip),
extensions `./client` exports, cold-start measurement (S4).

**Goal:** browser-set packages export `./src/*.ts(x)` in the workspace and stop building in dev.
Published tarballs stay dist-only via `publishConfig.exports` (pnpm rewrites the manifest at pack
time). Kills the rebuild-dist-then-reload loop and the stale-dist regression class.

**Reference pattern:** oRPC. Dev exports point at src, publishConfig swaps in dist:

```jsonc
// packages/next/package.json (middleapi/orpc)
"exports": {".": "./src/index.ts"},
"publishConfig": {"exports": {".": {"types": "./dist/index.d.mts", "import": "./dist/index.mjs"}}},
"files": ["dist"]
```

Why it does not transplant 1:1: oRPC src is plain `.ts` consumed by bundler-driven playgrounds.
Our browser set is Solid TSX + UnoCSS, bundled in dev by the HOST app's vite, which has neither
transform. And the node chain (it, plugin, core, harness, serve, db, tools, cli, protocol,
contract, extension-compiler, testkits, publish) loads in plain node: no TSX, no NodeNext `./x.js`
specifiers against src. Node chain keeps dist regardless.

**Src-flip candidates (browser set):** embed (lib export; `conciv-widget.global.js` stays a built
artifact), ui-kit-system, ui-kit-chat, ui-kit-chat-tools, ui-kit-tap, ui-kit-terminal, solid-diffs,
solid-streamdown, mascot, client, page, grab, storage-history, uno-preset. First-party extensions:
`./client` export only (`.` stays dist for the node builtins path).

## Spikes

Each spike is cheap to falsify. Run them in order; S1 and S2 are the kill-shots.

### S1: does our release path honor `publishConfig.exports`?

The rewrite is a pnpm feature (`pnpm pack` / `pnpm publish`). Our release is `changeset publish`
(`packages/publish/src/cli.ts` release command). If changesets shells out to `npm publish`, the
rewrite never happens and we ship src-pointing exports with `files: ["dist"]`: a broken package.

- Falsify: add `publishConfig.exports` to one package on a branch. `pnpm pack` it and read the
  tarball's package.json (proves the pnpm side). Then publish via `changeset publish
--no-git-checks` against a local verdaccio registry and fetch the manifest back.
- Exit: rewritten exports in the fetched manifest. If not, the fix is swapping the publish step to
  `pnpm publish -r` (changesets versioning stays); spike whether provenance + OIDC survive that.
- Guard either way: `attw --pack` / publint already run on tarballs in `release:check`; confirm
  they fail loudly on a src-pointing published manifest.

**RESULT (2026-07-13): PASS.** Flipped ui-kit-system to src exports + `publishConfig.exports`.
`pnpm pack` tarball manifest carries the dist exports, `publishConfig.exports` consumed, no stray
src files. Changesets 2.31 `getPublishTool` detects pnpm from the lockfile and spawns
`pnpm publish` (already our CI path today, so OIDC/provenance unchanged). publint packs with
`pnpm pack` and passes. **attw packs with npm: no rewrite, false 💀 on every entrypoint.** Fix in
the plan: per-package attw scripts become `pnpm pack` + `attw <tarball>`. attw against the pnpm
tarball is green.

### S2: solid transform for `@conciv` src in any host

The plugin already owns a solid config seam (`concivSolidConfig`,
`packages/plugin/src/core/vite.ts`). Extend it to compile `@conciv/*` src TSX inside an arbitrary
host vite, including React hosts.

- Falsify: flip ONE package (ui-kit-system) to src exports locally. Widget must render in both
  example apps (tanstack-start = solid-adjacent, nextjs-app = React host).
- Must hold: host react plugin excludes `@conciv` paths; solid stays a singleton (the
  concivSolidConfig dedupe already exists for the site embed, reuse it); include patterns match
  symlink REALPATHS (`packages/...`), not `node_modules/@conciv/...`.
- Exit: widget renders, no dual-Solid crash, extension popovers positioned (context intact).

**RESULT (2026-07-13): PASS** in the tanstack-start example (React host, @vitejs/plugin-react).
Spike patch: `transformConcivModule` gained an `isConcivSrcTsx(id)` branch (regex on
`packages/(ui-kit-*|solid-*|mascot|client|page|grab|embed)/src/*.tsx`) routing to the existing
`compileExtensionSolid` babel pass, before the extension-module branch. With ui-kit-system on src
exports the widget mounted fully styled, console clean; vite served
`packages/ui-kit-system/src/button.tsx` solid-compiled (`_$template` imports from the single
solid-js dev copy). No dual-Solid, no dedupe changes needed. Two follow-ups for the plan: the
prod matcher should resolve `@conciv` package roots instead of a path regex (host repos can have
their own `packages/*/src/*.tsx`), and a stale `node_modules/.vite` prebundle 504s after the
export-map flip: the plugin should bump/clear the optimizeDeps cache on conciv version change.
nextjs-app host not yet exercised.

### S3: UnoCSS / shadow styles without package builds

ui-kit styles today come out of each package's build. Host vite has no uno pipeline.

- Falsify: with S2's flipped package, check what breaks visually; enumerate where css artifacts
  come from today (embed style injection into the shadow root, `@property` hoisting).
- Options to compare: plugin runs the uno generator over `@conciv` src at dev time vs keeping a
  tiny css-only build per ui-kit vs one prebuilt css artifact in embed.
- Exit: styled widget in a host with zero `@conciv` builds, or a measured verdict that css stays a
  built artifact (acceptable: css builds are cheap and not the stale-dist pain point).

**Observation from the S2 run:** widget rendered fully styled with ui-kit-system on src, because
the injected css is embed's built artifact and the src classes matched what it was generated
from. Caveat that keeps S3 open: ADD a new utility class in ui-kit src and the embed css is
stale until an embed rebuild. Decide: uno generation in the plugin at dev time vs accepting
css-artifact rebuilds.

### S4: HMR and cold-start cost

- Falsify: with the browser set flipped, measure example-app cold start and widget HMR
  (edit ui-kit-chat src, expect plain vite reload, no rebuild).
- Check `optimizeDeps`: `@conciv/*` src must be excluded from prebundling or esbuild chokes on
  TSX/solid; excluding it puts every module on the dev-transform path, hence the cold-start
  measurement.
- Exit: cold start within ~2s of today; HMR replaces the rebuild-then-hard-reload loop.

**RESULT (2026-07-13): partial.** Live-edit proven: editing `button.tsx` src was served fresh by
the host vite immediately, zero package rebuild (the whole rebuild-dist-then-hard-reload loop
gone for the flipped package). Cold-start delta and browser-side HMR boundary behavior (does the
widget hot-swap or full-reload) not yet measured.

### S5: node-import closure of the browser set

Project A's S4 trace classified packages, but tests are their own consumers: node-environment
vitest suites must not start importing browser src TSX (they cannot compile it; the repo rule pins
`environment: 'node'` everywhere).

- Falsify: rerun the import trace over test files + testkits for the 14 candidates; list every
  node-side import of a browser-set package.
- Exit: empty list, or a per-suite fix list (usually: assert on built artifacts like
  embed's mount-externals test already does).

### S6: typecheck and turbo graph after the flip

- Consumers now typecheck against src: confirm `pnpm typecheck` passes without the browser set's
  d.ts, and whether project references / tsconfig paths need touching.
- `pnpm test` build-first dependency should shrink to the node chain: measure the turbo graph
  before/after (`turbo run test --dry`).
- Exit: green typecheck + measured build-step reduction; that number is the payoff line for the
  plan doc.

**RESULT (2026-07-13): hazard confirmed.** With ui-kit-system on src exports, `pnpm typecheck`
fails in `tanstack-start-example`: it compiles `ui-kit-system/src/resize.ts` under the EXAMPLE's
tsconfig, which lacks `noUncheckedIndexedAccess`, so `KEY_DIRECTION[grow][key] ?? 0` is dead code
and `dir === 0` is TS2367. Package's own typecheck passes. Consumers apply their own flags to dep
src; any strictness divergence surfaces phantom errors. Plan prerequisite: all workspace apps and
examples extend the same strict tsconfig base (they should anyway).

## Out of scope

- Node chain on src (needs a TS loader story, e.g. nub; separate later spike).
- Reducing published package count (Project A / rejected; see the consolidation design).
- Publishing ui-kits as consumer libraries.
