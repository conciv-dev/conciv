# @conciv/solid

Solid component for the [conciv](https://conciv.dev) widget.

```tsx
import {ConcivWidget} from '@conciv/solid'

export function App() {
  return (
    <>
      <YourApp />
      <ConcivWidget />
    </>
  )
}
```

Renders a single empty anchor `<div>`; the widget mounts into it inside a shadow root and overlays the viewport with fixed positioning, so placement in your tree doesn't affect where it appears. Removing the component removes the widget. SSR-safe (renders nothing on the server). Props are reactive the Solid way: any tracked change remounts the widget with the new configuration, no memoization needed.

Props (all optional): `extensions` (conciv extensions to load: an array, or a `() => Promise<AnyExtension[]>` loader), `settings` (same shape as the `conciv-widget` meta config), `apiBase` (conciv server URL; defaults to the meta/query resolution).

In SSR setups (SolidStart), pass `extensions` as a loader with a dynamic import; extension client modules are browser code and must not be imported during the server render:

```tsx
const extensions = () => import('@conciv/extension-terminal/client').then((mod) => [mod.default])

<ConcivWidget extensions={extensions} />
```

Your app and the widget share one `solid-js` copy (the widget externalizes it); keep `solid-js` deduped in your bundler config if you alias or vendor it.

If your build also runs the `@conciv/it` plugin, set its `widget: false` option so the plugin's script inject and the component don't both mount a widget; pick one path.

## Overview

Published package that wraps @conciv/embed in a Solid `<ConcivWidget />` component. Its test script builds a Vite fixture host first and then runs Playwright-based vitest tests against it.

## Interface

- `exports['.']` (`package.json`): ./dist/index.js with ./dist/index.d.ts; sideEffects false; engines node &gt;=22.13
- `dependencies` / `peerDependencies` (`package.json`): @conciv/embed and peer solid-js &gt;=1.8
- `scripts.test` (`package.json`): `vite build --config vite.fixture.config.ts && vitest run`; also build (tsdown), typecheck, lint, publint, attw
- `tsdown.config.ts`: entry src/index.ts, esm, dts; externals @conciv/*, solid-js, solid-js/web
- `vite.fixture.config.ts`: root test/fixtures/host, vite-plugin-solid, output to test/dist
- `vitest.config.ts`: node env, test/**/*.test.ts, fileParallelism false, testTimeout 60s, hookTimeout 90s
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - the `ConcivWidget` component
  - `test/fixtures/host/`: fixture page the tests drive

## Invariants

- `external` (`tsdown.config.ts`): @conciv/* and solid-js are not bundled into dist
- `fileParallelism: false` (`vitest.config.ts`): test files run one at a time

## Side Effects

- `vite.fixture.config.ts`: the test script empties and writes test/dist

## Verification

- Run: `cd packages/solid && pnpm test`
- Typecheck and lint: `cd packages/solid && pnpm typecheck && pnpm lint`
