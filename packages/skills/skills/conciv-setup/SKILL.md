---
name: conciv-setup
description: Use when installing or mounting the conciv dev-agent widget in an app — adding @conciv/it to a Vite/webpack/Rspack/Next.js/Rollup/esbuild build, wiring a manual createConciv/mountConciv setup for a bundler with no plugin, choosing/configuring a harness (claude/codex), or setting the conciv() / ConcivSettingsInit config surface. Covers first install through a working chat button in dev.
metadata:
  package: '@conciv/skills'
---

# Setting up conciv

## Overview

conciv is a dev-only chat widget plus an engine that lets a coding agent read and act on the running
app. Two install paths exist and picking the wrong one is the recurring failure: `@conciv/it` is a
bundler plugin that boots the engine process AND injects the widget script for you, but it only has a
real implementation for Vite and Next.js — its webpack/Rspack entries boot the engine but do **not**
inject the widget, and its Rollup/esbuild entries are build-only no-ops today
(`packages/it/README.md:9-27`, `apps/site/content/docs/quick-start/webpack.mdx:6-7`,
`apps/site/content/docs/quick-start/rollup.mdx:21-23`). Reach for `@conciv/embed`'s
`createConciv`/`mountConciv` directly whenever there is no bundler plugin to boot the engine for you
(a custom framework, a webview, a React/Preact host) or whenever the widget itself needs to be
mounted by hand.

The second recurring failure is shipping the widget to production: conciv mounts in dev only by
convention, not by a build-time strip — `enabled` defaults to `true`
(`resolveConfig`, `packages/core/src/config.ts:27`), so a plugin call left unguarded stays live in a
production bundle. Every quick-start gates it: `conciv({enabled: process.env.NODE_ENV !==
'production'})` (`apps/site/content/docs/quick-start/vite.mdx:93-95`).

## Decision: plugin vs manual mount

| Setup                                                        | Path                                                 | Injects widget?                 | Boots engine?                                  |
| ------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------- | ---------------------------------------------- |
| Vite                                                         | `@conciv/it/plugin/vite`                             | yes (`transformIndexHtml`)      | yes                                            |
| Next.js                                                      | `@conciv/it/plugin/nextjs` + `/plugin/nextjs/widget` | yes (client entry)              | yes                                            |
| webpack                                                      | `@conciv/it/plugin/webpack`                          | no — you inject via `widgetUrl` | yes                                            |
| Rspack                                                       | `@conciv/it/plugin/rspack`                           | no — you inject via `widgetUrl` | yes                                            |
| Rollup                                                       | `@conciv/it/plugin/rollup`                           | no-op today                     | no-op today                                    |
| esbuild                                                      | `@conciv/it/plugin/esbuild`                          | no-op today                     | no-op today                                    |
| Anything else (custom host, React/Preact wrapper, no plugin) | `@conciv/embed` `createConciv`/`mountConciv`         | you call `.mount(el)`           | you point it at a running engine via `apiBase` |

(`packages/it/package.json:23-46` lists the `./plugin/*` export map this table is built from;
`apps/site/content/docs/quick-start/index.mdx:34-70` is the framework picker these come from.)

## Zero-config: Vite

```ts title="vite.config.ts"
import {defineConfig} from 'vite'
import conciv from '@conciv/it/plugin/vite'

export default defineConfig({
  plugins: [conciv({enabled: process.env.NODE_ENV !== 'production'})],
})
```

`pnpm add -D @conciv/it`, add the plugin, `vite dev`, click the conciv button
(`apps/site/content/docs/quick-start/vite.mdx:28-95`).

## Zero-config: Next.js

Next.js needs three files at the project root next to `next.config.ts`
(`apps/site/content/docs/quick-start/nextjs.mdx:102-108`):

```ts title="next.config.ts"
import type {NextConfig} from 'next'
import {withConciv} from '@conciv/it/plugin/nextjs'

const nextConfig: NextConfig = {}
export default withConciv(nextConfig)
```

```ts title="instrumentation.ts"
export {register} from '@conciv/it/plugin/nextjs'
```

```ts title="instrumentation-client.ts"
import '@conciv/it/plugin/nextjs/widget'
```

(`apps/site/content/docs/quick-start/nextjs.mdx:64-88`.)

## webpack / Rspack: plugin boots the engine, you inject the widget

```js title="webpack.config.js"
const conciv = require('@conciv/it/plugin/webpack')
module.exports = {plugins: [conciv.default({enabled: process.env.NODE_ENV !== 'production'})]}
```

Gate it like every other integration: the webpack/Rspack `unplugin` hooks boot the engine whenever
`options.enabled !== false`, with no build-mode check of their own (`packages/plugin/src/index.ts:19-24`)
— unlike Vite, where the plugin only runs in `serve` mode, a webpack/Rspack production build DOES
run this hook, so an unguarded `enabled` really does boot the engine in prod.

The plugin does not add a `<script>` tag either way. There is no published `@conciv/widget/global`
package — the CLI's own webpack/Rspack init card names one, but that's a known upstream docs bug; the
widget bundle you need to serve is `conciv-widget.global.js`, built as part of `@conciv/embed`'s
`dist/` (published in its npm tarball, `packages/embed/package.json`'s `files` field is `["dist"]`).
Copy or proxy `node_modules/@conciv/embed/dist/conciv-widget.global.js` to a static path and point
`widgetUrl` at it (`apps/site/content/docs/quick-start/webpack.mdx:53-57`,
`packages/cli/src/init/steps/framework/webpack-family.ts:35`):

```ts
conciv({enabled: process.env.NODE_ENV !== 'production', widgetUrl: '/conciv-widget.js'})
```

Rspack is the same shape, swap `@conciv/it/plugin/rspack`
(`apps/site/content/docs/quick-start/rspack.mdx:40-57`). Rollup and esbuild plugin entries exist in
`packages/it/package.json` but are documented as build-only no-ops — use Vite for the real
integration instead (`apps/site/content/docs/quick-start/rollup.mdx:21-23`,
`apps/site/content/docs/quick-start/esbuild.mdx:21-23`).

## Manual mount: `@conciv/embed`

Use this when no `@conciv/it` plugin boots the widget for you, or when you are wiring a
framework-specific wrapper. `createConciv` returns a handle you mount into an element and tear down
yourself; `mountConciv` is the one-shot, fire-and-forget version that appends its own root div to
`document.body` (`packages/embed/src/mount.ts:32-90`, `packages/embed/src/mount.ts:92-101`). Gate the
mount call yourself the same way a plugin's `enabled` option would:

```ts
import {createConciv, type ConcivInit} from '@conciv/embed'

if (process.env.NODE_ENV !== 'production') {
  const handle = createConciv({
    extensions: [],
    apiBase: 'http://localhost:5178',
  })
  await handle.mount(document.getElementById('conciv-root')!)
  // later: handle.unmount()
}
```

`ConcivInit` fields: `extensions` (array or async loader), `settings` (`ConcivSettingsInit`),
`apiBase` (engine origin — required whenever the engine isn't served from the same origin/port the
page loads from), `grabProvider` (`packages/embed/src/mount.ts:9-14`). The handle also exposes
`open()`/`close()`/`toggle()` (dispatch DOM `CustomEvent`s the widget listens for) and
`rebind(apiBase)` to repoint an already-mounted widget at a different engine
(`packages/embed/src/mount.ts:16-23`, `packages/embed/src/mount.ts:72-89`).

For a single always-on instance with no manual lifecycle, `mountConciv(extensions)` is a bare
fire-and-forget call — it no-ops if a `[data-conciv-script-root]` element already exists, so it is
safe to call more than once (`packages/embed/src/mount.ts:92-101`):

```ts
import {mountConciv} from '@conciv/embed'

mountConciv([myExtension])
```

(Real `mountConciv` call site: `packages/extensions/tanstack/test/host/main.tsx:5` (import) and
`packages/extensions/tanstack/test/host/main.tsx:155` (call).)

For a framework component that owns mount/unmount through its own lifecycle, wrap `createConciv` —
`@conciv/react`'s `ConcivWidget` is the reference shape: it mounts on a ref'd div in an effect, tears
down on unmount, and remounts only when `apiBase`/`settings`/`extensions` actually change
(`packages/react/src/index.ts:8-26`).

## Connecting a harness

`harness` on the plugin config (or `ConcivConfig` passed to `createConciv`'s engine side) picks the
agent CLI behind the chat. `claude` and `codex` are fully supported (`claude` is the default and needs
the `claude` CLI on `PATH`). `gemini-cli` and `opencode` are also real, implemented adapters — ACP and
opencode's own text adapter respectively (`packages/harness/src/gemini-cli/index.ts`,
`packages/harness/src/opencode/index.ts`). Only `pi` is a stub: its `chatConfig` always returns a
"not yet supported" error (`unsupportedChatConfig`, `packages/harness/src/_shared/stub.ts:10-17`,
wired at `packages/harness/src/pi/index.ts:26`) even though its `history`/`connect` sidecars are real
(`packages/protocol/src/config-types.ts:35-36` for the `harness`/`harnessBin` fields):

```ts
conciv({harness: 'codex', harnessBin: '/usr/local/bin/codex'})
```

`harnessBin` overrides the binary resolved from `PATH` — set it when the CLI isn't on the default
`PATH` the dev server sees, or to pin a specific install. `claudePath`/`claudeSessionId` are
deprecated aliases for `harnessBin`/`sessionId`
(`apps/site/content/docs/configuration.mdx:54`, `packages/protocol/src/config-types.ts:44-45`).

## Minimal config surface

`ConcivConfig` (the object passed to `conciv({...})`) — every field optional, all default to sane
values (`packages/protocol/src/config-types.ts:27-46`, `apps/site/content/docs/configuration.mdx:18-52`):

| Field          | Default         | Use for                                                                       |
| -------------- | --------------- | ----------------------------------------------------------------------------- |
| `enabled`      | `true`          | gate to dev: `enabled: process.env.NODE_ENV !== 'production'`                 |
| `harness`      | `'claude'`      | pick the agent CLI                                                            |
| `harnessBin`   | adapter default | non-`PATH` binary location                                                    |
| `widgetUrl`    | unset           | webpack/Rspack manual injection target                                        |
| `port`         | auto            | fix the engine port (required, not just preferred, on Next.js/webpack/Rspack) |
| `systemPrompt` | built-in        | a string here REPLACES the built-in prompt, it does not append to it          |
| `widget`       | both layouts on | `{modal, quickTerminal}` — position/hotkey or disable a layout                |

A string `systemPrompt` swaps out `CHAT_SYSTEM_PROMPT` entirely (`resolveSystemPrompt`,
`packages/core/src/config.ts:18-22`); every installed extension's own `systemPrompt` is still appended
after it, string or not (`composeSystemPrompt`, `packages/core/src/start.ts:110-117`).

`ConcivSettingsInit` is a **different, wider** type than `ConcivConfig.widget`: it's the `settings`
field you pass directly to `createConciv`/`@conciv/react`'s `ConcivWidget`
(`packages/embed/src/mount.ts:11`), and it additionally carries `defaultOpen` and
`launcher: 'native' | 'mascot' | false` (`packages/protocol/src/config-types.ts:17-21`).
`ConcivConfig.widget` is typed `WidgetConfig | false` (`packages/protocol/src/config-types.ts:33`) —
just `{modal, quickTerminal}`, no `defaultOpen`/`launcher` — so a bundler-plugin `conciv({widget: ...})`
call cannot set those two; they only apply through a direct `createConciv({settings: ...})` call
(manual mount, or a framework wrapper like `@conciv/react`). `ConcivSettingsInit` does extend
`WidgetConfig`, so `modal`/`quickTerminal` are valid on `settings` too:

```ts
conciv({widget: {modal: {position: 'top-left'}}})
conciv({widget: {quickTerminal: {hotkey: ['Mod+`', 'Control+k']}}})
conciv({widget: {quickTerminal: false}}) // corner modal only
```

(`apps/site/content/docs/configuration.mdx:72-86`.)

## Red flags — stop and fix

- `conciv()` (or `createConciv`) called with no `enabled`/env gate anywhere in the chain — it ships to
  production by default.
- `@conciv/it/plugin/rollup` or `/plugin/esbuild` added expecting the engine to boot — both are
  documented no-ops; use Vite or a manual `@conciv/embed` mount instead.
- webpack/Rspack setup with the plugin added but no `widgetUrl` — the engine boots but nothing ever
  appears on the page.
- `createConciv(...).mount(el)` called without ever calling `unmount()` in teardown (component
  unmount, page navigation) — leaks the mounted app and its subscriptions.
- `mountConciv` called expecting a return value/handle to unmount later — it is fire-and-forget by
  design; use `createConciv` if you need lifecycle control.
- `harness: 'pi'` picked for real use — its `chatConfig` is a stub that always errors
  (`packages/harness/src/pi/index.ts:26`); `claude`, `codex`, `gemini-cli`, and `opencode` all have a
  real `chatConfig`.
- Hand-rolling a `<script src=...>` injection for Vite/Next.js — both already inject the widget
  through the plugin; a second manual mount double-mounts.

## Sources

- `packages/embed/src/mount.ts`
- `packages/embed/package.json`
- `packages/core/src/config.ts`
- `packages/core/src/start.ts`
- `packages/plugin/src/index.ts`
- `packages/it/README.md`
- `packages/it/package.json`
- `packages/protocol/src/config-types.ts`
- `packages/react/src/index.ts`
- `packages/extensions/tanstack/test/host/main.tsx`
- `packages/cli/src/init/steps/framework/webpack-family.ts`
- `apps/site/content/docs/quick-start/index.mdx`
- `apps/site/content/docs/quick-start/vite.mdx`
- `apps/site/content/docs/quick-start/nextjs.mdx`
- `apps/site/content/docs/quick-start/webpack.mdx`
- `apps/site/content/docs/quick-start/rspack.mdx`
- `apps/site/content/docs/quick-start/rollup.mdx`
- `apps/site/content/docs/quick-start/esbuild.mdx`
- `apps/site/content/docs/configuration.mdx`
- `packages/harness/src/gemini-cli/index.ts`
- `packages/harness/src/opencode/index.ts`
- `packages/harness/src/pi/index.ts`
- `packages/harness/src/_shared/stub.ts`
