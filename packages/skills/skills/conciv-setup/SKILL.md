---
name: conciv-setup
description: 'Use when installing or mounting the conciv dev-agent widget in an app: adding @conciv/it to a Vite/webpack/Rspack/Next.js build, rendering <ConcivWidget /> from @conciv/react, @conciv/preact or @conciv/solid, mounting it by hand with createConciv/mountConciv from @conciv/app, choosing a harness (claude/codex/opencode/gemini-cli), or setting the conciv() / ConcivSettingsInit config. Covers first install through a working chat button in dev.'
metadata:
  package: '@conciv/skills'
---

# Setting up conciv

## Overview

conciv is a dev-only chat widget plus an engine that lets a coding agent read and act on the running
app. An app installs one package, `@conciv/it`, as a dev dependency. It is a bundler plugin that starts
the engine AND puts the widget on the page, on Vite, Next.js, webpack and Rspack. Its Rollup and esbuild
entries exist but do nothing (`packages/unplugin/src/unplugin.ts:157-158`,
`apps/site/content/docs/bundlers.mdx`).

The fastest path is `npx @conciv/cli@latest init` in the app's folder: it finds the framework, installs
`@conciv/it` and wires the config (`apps/site/content/docs/getting-started/index.mdx`).

conciv runs in the dev server only. The Vite plugin applies to `vite dev` alone (`apply: 'serve'`,
`packages/unplugin/src/core/vite.ts:313`). webpack and Rspack do nothing in a `production` mode build,
and an unset `mode` counts as production (`packages/unplugin/src/unplugin.ts:131`). Next.js starts no
engine in production (`packages/unplugin/src/core/nextjs.ts:136`). `enabled: false` turns it off
everywhere (default `true`, `packages/backend-defaults/src/engine/config.ts:87`).

## Decision: which path

| Setup                                       | Path                                                     | Puts the widget on the page? | Starts the engine?         |
| ------------------------------------------- | -------------------------------------------------------- | ---------------------------- | -------------------------- |
| Vite (and Astro)                            | `@conciv/it/plugin/vite`                                 | yes                          | yes                        |
| Next.js                                     | `@conciv/it/plugin/nextjs` + `/plugin/nextjs/widget`     | yes (client instrumentation) | yes                        |
| webpack                                     | `@conciv/it/plugin/webpack`                              | yes (a dev entry)            | yes                        |
| Rspack                                      | `@conciv/it/plugin/rspack`                               | yes (a dev entry)            | yes                        |
| Rollup, esbuild                             | `@conciv/it/plugin/rollup`, `/plugin/esbuild`            | no                           | no                         |
| You place the widget in your own components | the plugin with `widget: false`, plus `<ConcivWidget />` | you render it                | yes (the plugin)           |
| No framework wrapper, your own mount point  | `createConciv` / `mountConciv` from `@conciv/app`        | you call `mount(el)`         | no: point `apiBase` at one |

(`packages/it/package.json:24-58` is the `./plugin/*` export map.)

## Vite

From `apps/site/content/docs/bundlers/vite.mdx`:

```ts title="vite.config.ts"
import {defineConfig} from 'vite'
import conciv from '@conciv/it/plugin/vite'

export default defineConfig({
  plugins: [conciv()],
})
```

## Next.js

The `withConciv` config and two instrumentation files, from `apps/site/content/docs/bundlers/nextjs.mdx:64-86`:

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

Put the instrumentation files in the folder that holds `app` or `pages`: the project root, or `src/`.
Options go in the second argument, `withConciv(nextConfig, options)`.

## webpack and Rspack

From `apps/site/content/docs/bundlers/webpack.mdx:42-48`:

```js title="webpack.config.js"
const conciv = require('@conciv/it/plugin/webpack')

module.exports = {
  plugins: [conciv.default()],
}
```

Set `mode: 'development'` (or pass `--mode development`). In any mode but production the plugin writes
`.conciv/widget-client.<port>.gen.js` and adds it as an entry of every chunk, then starts the engine on
the compiler's first watch run (`packages/unplugin/src/unplugin.ts:130-149`). A one-off build starts no
engine. Rspack is the same with `@conciv/it/plugin/rspack`.

## Placing the widget yourself

`widget: false` keeps the engine and adds nothing to the page
(`apps/site/content/docs/reference/configuration.mdx`). Then render `<ConcivWidget />` from `@conciv/react`,
`@conciv/preact` or `@conciv/solid`, so the page does not get two. The Solid one, from
`e2e/vite-solid-component/src/vite-solid-component.tsx:1-16`:

```tsx
import {render} from 'solid-js/web'
import {ConcivWidget} from '@conciv/solid'
import './index.css'
import App from './App.tsx'

const root = document.getElementById('root')

render(
  () => (
    <>
      <App />
      <ConcivWidget />
    </>
  ),
  root!,
)
```

`ConcivWidget`'s props are `ConcivInit` (`packages/react/src/react.ts:6`): `plugins`, `settings`,
`apiBase`, `grabProvider`, `engineToken`. Pass `apiBase` when the engine is not on the page's origin, as
the Next.js component host does (`e2e/nextjs-component/app/conciv-widget-client.tsx:7-10`).

## Manual mount: `@conciv/app`

`createConciv(init)` returns a handle: `mount(el)`, `unmount()`, `open()`, `close()`, `toggle()` and
`rebind(apiBase)` (`packages/app/src/mount.ts:25-32`, `packages/app/src/mount.ts:38-124`). `mount`
does nothing when the handle is not `unmounted`, and a failed mount resets it and rethrows. `open`,
`close` and `toggle` send panel commands over the window event bus, which the widget answers once it
is mounted. `rebind` does nothing unless the widget is mounted. `ConcivInit` is
`packages/app/src/mount.ts:12-23`.

`mountConciv(plugins?)` is the one-shot form: it appends a `[data-conciv-script-root]` div to
`document.body` and mounts there, and does nothing when that element already exists or inside a
capture frame (`packages/app/src/mount.ts:132-146`). It returns no handle. conciv.dev mounts its own
widget this way (`apps/site/src/lib/mount-live-widget.ts:65`).

`@conciv/react`'s `ConcivWidget` is the reference wrapper: it creates the handle in an effect, mounts it
on its own div, unmounts in the effect's cleanup, and makes a new handle only when its config changes
(`packages/react/src/react.ts:14-36`).

## Connecting a harness

`harness` picks the agent CLI a new chat starts with: `claude` (the default), `codex`, `opencode`,
`gemini-cli` or `pi` (`apps/site/content/docs/reference/configuration.mdx`). The CLI must be on the `PATH` of the
shell that starts the dev server, and logged in. `pi` has no chat today: its `chatConfig` always ends
the run with `pi is not installed or not yet supported` (`unsupportedChatConfig`,
`packages/harness/src/pi/pi.ts:9-16`, wired at `packages/harness/src/pi/pi.ts:36`).

```ts
conciv({harness: 'codex'})
```

To let an agent session in your own terminal find and drive your open conciv tabs, connect it:
`conciv init` offers it, or run `npx @conciv/cli@latest mcp connect <agent>` with `claude`, `codex`,
`gemini-cli` or `opencode`. It adds the `conciv-hub` MCP server (`conciv mcp serve --agent <agent>`,
`packages/cli/src/hub.ts`) to that agent's config. `conciv mcp disconnect <agent>` removes it
(`apps/site/content/docs/agents.mdx`).

## Config surface

`ConcivConfig` is the object passed to `conciv({...})`. Every field is optional
(`apps/site/content/docs/reference/configuration.mdx`):

| Field          | Default                 | Use for                                                               |
| -------------- | ----------------------- | --------------------------------------------------------------------- |
| `enabled`      | `true`                  | `false` starts no engine and adds no widget                           |
| `harness`      | `'claude'`              | the agent CLI a new chat starts with                                  |
| `port`         | the port used last time | the engine port; a taken one falls back to a free port with a warning |
| `widget`       | both layouts on         | `{modal, quickTerminal}`, or `false` to render the widget yourself    |
| `plugins`      | `[]`                    | plugins to load (see the conciv-develop skill)                        |
| `systemPrompt` | the built-in prompt     | a string replaces it, `false` sends none                              |

`ConcivSettingsInit` is a **wider** type than `ConcivConfig.widget`: it extends `WidgetConfig` with
`defaultOpen`, `launcher: 'native' | 'mascot' | false` and `surface`
(`packages/types/src/config-types.ts:28-34`). It is the `settings` field of `createConciv` and
`ConcivWidget`, so `defaultOpen` and `launcher` apply only there, not through `conciv({widget})`.
From `apps/site/content/docs/reference/configuration.mdx`:

```ts
conciv({widget: {modal: {position: 'top-left'}}})
conciv({widget: {quickTerminal: {hotkey: ['Mod+`', 'Control+k']}}})
conciv({widget: {quickTerminal: false}})
conciv({widget: {modal: false}})
```

## Red flags: stop and fix

- `@conciv/it/plugin/rollup` or `/plugin/esbuild` added expecting the engine to start: both do
  nothing; serve the app with Vite instead.
- A webpack or Rspack config with no `mode`: it counts as production, so there is no widget and no
  engine.
- `<ConcivWidget />` or `createConciv(...).mount(el)` with the plugin's widget still on: the page gets
  two. Pass `widget: false` to the plugin.
- `createConciv(...).mount(el)` with no `unmount()` in teardown: the mounted app and its connection stay.
- `mountConciv` called expecting a handle to unmount later: it returns none; use `createConciv`.
- `harness: 'pi'` for real use: its chat always fails.

## Sources

- `packages/app/src/mount.ts`
- `packages/app/package.json`
- `packages/react/src/react.ts`
- `packages/it/package.json`
- `packages/it/README.md`
- `packages/unplugin/src/unplugin.ts`
- `packages/unplugin/src/core/vite.ts`
- `packages/unplugin/src/core/nextjs.ts`
- `packages/backend-defaults/src/engine/config.ts`
- `packages/types/src/config-types.ts`
- `packages/harness/src/pi/pi.ts`
- `packages/cli/src/hub.ts`
- `e2e/vite-solid-component/src/vite-solid-component.tsx`
- `e2e/nextjs-component/app/conciv-widget-client.tsx`
- `apps/site/src/lib/mount-live-widget.ts`
- `apps/site/content/docs/getting-started/index.mdx`
- `apps/site/content/docs/bundlers/vite.mdx`
- `apps/site/content/docs/bundlers/nextjs.mdx`
- `apps/site/content/docs/bundlers/webpack.mdx`
- `apps/site/content/docs/bundlers/rspack.mdx`
- `apps/site/content/docs/bundlers.mdx`
- `apps/site/content/docs/agents.mdx`
- `apps/site/content/docs/reference/configuration.mdx`
