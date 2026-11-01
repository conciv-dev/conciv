# @conciv/it

**Conceive it.** The conciv dev agent, one install. Re-exports the unplugin under conciv/plugin/\* (vite, webpack, rspack, rollup, esbuild, nextjs).

Part of [conciv](https://github.com/conciv-dev/conciv).

## Framework support

Add `conciv()` to your bundler config. The plugin boots the dev agent engine and
mounts the in-page **widget**. It reaches the page two ways, so it works whether or
not the host lets a plugin edit the served HTML:

| Setup                       | How the widget loads                                                         |
| --------------------------- | ---------------------------------------------------------------------------- |
| Vite (classic `index.html`) | `transformIndexHtml` injects the loader `<script>` + `conciv-api-base` meta. |
| TanStack Start (± nitro)    | The extensions module is imported from the client entry (module graph).      |
| Next.js                     | `plugin/nextjs/widget` client entry + fixed `port`.                          |

For SSR hosts like TanStack Start (with or without the nitro server layer), the
rendered document never passes through vite's HTML seam; no static `index.html`
for `transformIndexHtml`, and the connect-stack response is discarded. So instead
of editing HTML, conciv appends a dynamic `import` of its virtual extensions module
to the framework's client entry and bakes the engine origin into that module
(`window.__CONCIV_API_BASE__`, the same seam Next.js uses). No user config, no
fixed port. See `apps/examples/tanstack-start`; its `widget-mount.e2e.test.ts`
proves the widget mounts on both the classic and nitro stacks (toggle with
`CONCIV_NITRO=1`).

## Interface

- `package.json:exports` - `./plugin/vite`, `./plugin/webpack`, `./plugin/rspack`, `./plugin/rollup`, `./plugin/esbuild`, `./plugin/nextjs` (with an `edge-light` condition to `nextjs-edge.js`), `./plugin/nextjs/widget`.
- `tsdown.config.ts:external` - `@conciv/*`, `unplugin`, `vite`, `launch-editor` and `next` stay external.
- `vitest.config.ts:projects` - `it` (all `test/**/*.test.ts` except the design test) and `design` (`test/design.it.test.ts`, 120 s timeouts, no file parallelism).
- Source: [src](./src/README.md).
- Test fixtures: `test/fixtures/design/` (the design fixture host, provenance components and the target renderer used by `test/design.it.test.ts`).

## Invariants

- None

## Side Effects

- The package root (configs and manifest) has none. At runtime package paths are resolved with `import.meta.resolve` at module load; the bundled plugin carries `@conciv/plugin`'s effects. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/it` from the repo root (turbo builds the package and its dependencies first)
