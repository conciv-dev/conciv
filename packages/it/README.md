# @conciv/it

The conciv dev agent, one install. Re-exports the unplugin under conciv/plugin/\* (vite, webpack, rspack, rollup, esbuild, nextjs).

Part of [conciv](https://github.com/conciv-dev/conciv).

## Framework support

The plugin boots the dev agent engine and serves `/@conciv/extensions.js` in any
supported bundler. The in-page **widget** is auto-injected only where conciv can
reach the served HTML document:

| Setup                       | Engine boots | Widget auto-injects | Notes                                       |
| --------------------------- | ------------ | ------------------- | ------------------------------------------- |
| Vite (classic `index.html`) | ✅           | ✅                  | Injected via `transformIndexHtml`.          |
| Next.js                     | ✅           | ✅                  | Uses fixed `port` so server + client agree. |
| TanStack Start (nitro SSR)  | ✅           | ❌                  | Not yet supported — see below.              |

### TanStack Start (not yet supported)

Adding `conciv()` to `vite.config.ts` boots the engine and serves the extensions
script, but the widget does **not** mount. Two gaps:

1. The React-rendered nitro SSR document has no classic `index.html`, so neither
   `transformIndexHtml` nor the response-buffering middleware injects the
   `pw-api-base` / `pw-widget` meta tags or the loader `<script>`.
2. `options.port` is honored only on the Next.js/`makeEngineBooter` path, so the
   Vite engine binds a random port each boot — manual meta-tag wiring can't pin it.

Tracking a nitro/h3 injection hook (or a dedicated TanStack Start adapter, like
`plugin/nextjs/widget`) plus `port` support on the Vite path.
