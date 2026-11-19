# @conciv/it

**Conceive it.** The conciv dev agent, one install. Re-exports the unplugin under `@conciv/it/plugin/*` (vite, webpack, rspack, rollup, esbuild, nextjs).

Part of [conciv](https://github.com/conciv-dev/conciv).

## Framework support

Add `conciv()` to your bundler config. The plugin boots the dev agent engine and
mounts the in-page **widget**. It reaches the page two ways, so it works whether or
not the host lets a plugin edit the served HTML:

| Setup                       | How the widget loads                                                         |
| --------------------------- | ---------------------------------------------------------------------------- |
| Vite (classic `index.html`) | `transformIndexHtml` injects the loader `<script>` + `conciv-api-base` meta. |
| TanStack Start (± nitro)    | The widget module is imported from the client entry (module graph).          |
| Next.js                     | `plugin/nextjs/widget` client entry + fixed `port`.                          |
| webpack, Rspack             | The plugin adds a generated client entry in dev builds + fixed `port`.       |

For SSR hosts like TanStack Start (with or without the nitro server layer), the
rendered document never passes through vite's HTML seam; no static `index.html`
for `transformIndexHtml`, and the connect-stack response is discarded. So instead
of editing HTML, conciv appends a dynamic `import` of its virtual widget module (`/@conciv/widget.js`)
to the framework's client entry and bakes the engine origin into that module
(`window.__CONCIV_API_BASE__`, the same seam Next.js uses). No user config, no
fixed port. See `apps/examples/tanstack-start` (toggle the nitro stack with
`CONCIV_NITRO=1`).

## Invariants

- `./plugin/webpack`, `./plugin/rspack` and the Next.js entries also carry a `default` condition, so a CommonJS config can `require()` them (`require('@conciv/it/plugin/webpack').default()`); `./plugin/nextjs` has an `edge-light` condition to `nextjs-edge.js`.
- The build bundles nothing of conciv: every `@conciv/*` import stays external (`tsdown.config.ts`), so the plugin is the one `@conciv/unplugin` the host installs.
- Source: [src](./src/README.md).

## Side Effects

- The package root (configs and manifest) has none. At runtime package paths are resolved with `import.meta.resolve` at module load; the re-exported plugin carries `@conciv/unplugin`'s effects. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/it` from the repo root (turbo builds the package and its dependencies first)
