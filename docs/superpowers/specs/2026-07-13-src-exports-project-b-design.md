# Src Exports for Browser Internals (Project B): Spike Round

**Status:** spikes open, no plan yet. Project A (publish consolidation) is independent; B lands after.

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

### S3: UnoCSS / shadow styles without package builds

ui-kit styles today come out of each package's build. Host vite has no uno pipeline.

- Falsify: with S2's flipped package, check what breaks visually; enumerate where css artifacts
  come from today (embed style injection into the shadow root, `@property` hoisting).
- Options to compare: plugin runs the uno generator over `@conciv` src at dev time vs keeping a
  tiny css-only build per ui-kit vs one prebuilt css artifact in embed.
- Exit: styled widget in a host with zero `@conciv` builds, or a measured verdict that css stays a
  built artifact (acceptable: css builds are cheap and not the stale-dist pain point).

### S4: HMR and cold-start cost

- Falsify: with the browser set flipped, measure example-app cold start and widget HMR
  (edit ui-kit-chat src, expect plain vite reload, no rebuild).
- Check `optimizeDeps`: `@conciv/*` src must be excluded from prebundling or esbuild chokes on
  TSX/solid; excluding it puts every module on the dev-transform path, hence the cold-start
  measurement.
- Exit: cold start within ~2s of today; HMR replaces the rebuild-then-hard-reload loop.

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

## Out of scope

- Node chain on src (needs a TS loader story, e.g. nub; separate later spike).
- Reducing published package count (Project A / rejected; see the consolidation design).
- Publishing ui-kits as consumer libraries.
