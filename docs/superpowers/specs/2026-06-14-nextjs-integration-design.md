# Next.js Integration — Design

Date: 2026-06-14
Status: Approved (design); pending implementation plan

## Goal

Let users run the mandarax dev agent inside a Next.js app with the least friction Next physically
allows, and ship a Next.js example app scaffolded with `create-next-app`.

Target: **App Router, Turbopack default** (Next 16, current default bundler for dev and build).

## Background — why Next is not "just rsbuild"

mandarax integrates with Vite via a bundler hook (`transformIndexHtml`) because in Vite the
dev server owns the HTML. In Next.js the **bundler does not own the HTML — React does.** Next
renders every page's HTML itself and hands the bundler only JS/CSS modules. This is true under
_every_ Next bundler (Turbopack, webpack, rspack), so no unplugin bundler entry can inject the
widget. Confirmed by Vercel's own dev toolbar and the Sentry SDK, which both integrate through
Next's framework conventions, not a bundler plugin.

Consequence: the existing `unplugin.webpack`/`rspack` hooks (boot-only) do not help Next, and a
`BundlerBridge` (`/api/server/*` resolve/transform/graph) is **not feasible** — Turbopack exposes
no plugin API to wrap. Next runs **boot + inject only**, the same degradation as the current
rspack path.

## Chosen approach — convention files (the Sentry model)

No proxy, no `mandarax dev`, no React component, no `layout.tsx` edit. Integration is three
"instructions" touchpoints, all framework conventions:

```ts
// next.config.ts
import {withMandarax} from '@mandarax/plugin/nextjs'
export default withMandarax({
  /* user config */
})

// instrumentation.ts          — boots the engine server-side, once per server start
export {register} from '@mandarax/plugin/nextjs'

// instrumentation-client.ts   — runs on the client on every page, mounts the widget
import '@mandarax/plugin/nextjs/widget'
```

- `instrumentation.ts` `register()` — Next's sanctioned server-startup hook. Boots the engine.
- `instrumentation-client.ts` — Next auto-bundles and runs this on the client before the app is
  interactive, on every page (stable in Next 16). This is the client door Sentry uses; it
  replaces both the bundler HTML injection and any layout component.
- `withMandarax(nextConfig)` — synchronizes the port between server and client (see below) and is the
  one-line config wrapper users already expect from Next SDKs.

A future `create`/codemod step can write all three files automatically for zero manual effort
(what `@sentry/wizard` does). Out of scope for v1; v1 documents the three lines.

## The port problem and its solution

The engine boots on a port server-side (`register`), but the client widget — bundled into
`instrumentation-client.ts` — needs the _same_ port, and `NEXT_PUBLIC_*` values are inlined at
compile time.

Decision: **use a fixed, configurable port (default constant), not a random one.**
`start()` currently boots on `port: 0` (random); Next must pin it. A random port chosen at
`next.config` eval time cannot be trusted to reach the client compiler — Next evaluates the
config in separate processes (dev server, build workers), so `process.env` mutation there is not
reliably observed by the client bundle's `NEXT_PUBLIC_*` inlining.

- `withMandarax({ port? })` resolves a port (default e.g. `41700`, user-overridable), exposes it as
  `env.NEXT_PUBLIC_MANDARAX_PORT` via Next's `env` config so it inlines into the client bundle, and as
  a non-public var for `register()` to read.
- `register()` boots the engine on that fixed port.
- the client entry reads `process.env.NEXT_PUBLIC_MANDARAX_PORT` and points the widget at
  `http://127.0.0.1:<port>`.

If the port is taken, fail loudly with a clear message telling the user to set `withMandarax({port})`.

## Components / changes

### New: `@mandarax/plugin/nextjs` (and `/nextjs/widget` subpath)

- `withMandarax(nextConfig)` — returns a Next config with `env.NEXT_PUBLIC_MANDARAX_PORT` set; carries
  mandarax options (harness, testRunner, enabled, port, stateRoot) for `register` to consume (via a
  serialized env var or a shared module, whichever survives Next's process model).
- `register()` — calls the existing `makeEngineBooter(options, cwd)` from `boot.ts`, but on the
  pinned port. Dev-gated (`process.env.NODE_ENV !== 'production'`, `enabled !== false`).
- `/nextjs/widget` entry — client-only; reads the inlined port, supplies the apiBase to the
  widget, then mounts.

### Touch: `@mandarax/core` engine — allow a fixed port

`StartOpts` gains an optional `port?: number`; `serve({ port })` uses it (falls back to `0`).
Minimal, additive, does not affect existing Vite/webpack callers.

### Touch: `@mandarax/widget` — apiBase without a meta tag

`mount.tsx` resolves apiBase from `<meta name="pw-api-base">`. Add a fallback: accept an explicit
apiBase (e.g. read `window.__MANDARAX_API_BASE__` or a small `mount({apiBase})` export). The Next
client entry sets it from the inlined port before mounting. Keep the existing meta-tag path intact
for Vite. Self-mount must also wait for DOM readiness (`instrumentation-client` runs early).

### Touch: `@mandarax/plugin` packaging

Add `./nextjs` and `./nextjs/widget` to `package.json` `exports`; add `next` as an optional
peer dependency; add the entry source files (`src/nextjs.ts`, `src/nextjs-widget.ts`,
`src/core/nextjs.ts`).

### New: `apps/examples/nextjs-app`

Scaffold with `create-next-app` (App Router, TypeScript, Turbopack). Wire the three touchpoints.
Demonstrates the integration and serves as a manual/automated smoke target.

## Out of scope (v1)

- BundlerBridge / `/api/server/*` for Next (no Turbopack plugin API).
- Pages Router.
- Proxy mode (`mandarax dev`) — viable alternative for true zero-edit, deferred.
- Auto-writing the convention files (codemod/wizard) — deferred.

## Verification

- Example app: `next dev` boots; engine logs a port; the widget mounts and `probeChatAvailable`
  succeeds against the pinned port; chat reaches the harness.
- Production build (`next build && next start`): widget and engine are absent (dev-gated).
- Existing Vite path unchanged (regression check on the tanstack-start example).

```

## Open questions
None blocking. Port default value and the exact mechanism for passing mandarax options to `register`
(env var vs shared module) are implementation details to settle in the plan.
```
