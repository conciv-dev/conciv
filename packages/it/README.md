# @conciv/it

The conciv dev agent, one install. Re-exports the unplugin under conciv/plugin/\* (vite, webpack, rspack, rollup, esbuild, nextjs).

Part of [conciv](https://github.com/conciv-dev/conciv).

## Framework support

Add `conciv()` to your bundler config — the plugin boots the dev agent engine and
mounts the in-page **widget**. It reaches the page two ways, so it works whether or
not the host lets a plugin edit the served HTML:

| Setup                       | How the widget loads                                                     |
| --------------------------- | ------------------------------------------------------------------------ |
| Vite (classic `index.html`) | `transformIndexHtml` injects the loader `<script>` + `pw-api-base` meta. |
| TanStack Start (± nitro)    | The extensions module is imported from the client entry (module graph).  |
| Next.js                     | `plugin/nextjs/widget` client entry + fixed `port`.                      |

For SSR hosts like TanStack Start (with or without the nitro server layer), the
rendered document never passes through vite's HTML seam — no static `index.html`
for `transformIndexHtml`, and the connect-stack response is discarded. So instead
of editing HTML, conciv appends a dynamic `import` of its virtual extensions module
to the framework's client entry and bakes the engine origin into that module
(`window.__CONCIV_API_BASE__`, the same seam Next.js uses). No user config, no
fixed port. See `apps/examples/tanstack-start` — its `widget-mount.e2e.test.ts`
proves the widget mounts on both the classic and nitro stacks (toggle with
`CONCIV_NITRO=1`).
