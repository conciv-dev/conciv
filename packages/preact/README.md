# @conciv/preact

Preact component for the [conciv](https://conciv.dev) widget.

```tsx
import {ConcivWidget} from '@conciv/preact'

export function App() {
  return (
    <>
      <YourApp />
      <ConcivWidget />
    </>
  )
}
```

Renders a single empty anchor `<div>`; the widget mounts into it inside a shadow root and overlays the viewport with fixed positioning, so placement in your tree doesn't affect where it appears. Unmounting the component removes the widget. SSR-safe (effects don't run on the server). No Solid tooling or build plugin required.

Props (all optional): `extensions` (conciv extensions to load: an array, or a `() => Promise<AnyExtension[]>` loader), `settings` (same shape as the `conciv-widget` meta config), `apiBase` (conciv server URL; defaults to the meta/query resolution).

In SSR setups, pass `extensions` as a loader with a dynamic import; extension client modules are compiled Solid browser code and must not be imported during the server render:

```tsx
const extensions = () => import('@conciv/extension-terminal/client').then((mod) => [mod.default])

<ConcivWidget extensions={extensions} />
```

Prop changes remount the widget with the new configuration. Keep the `extensions` array identity-stable (module constant or `useMemo`); a fresh array each render remounts each render; `settings`/`apiBase` are compared by value, inline literals are fine. Passing `apiBase` explicitly is the recommended secure usage; the `?core=` query-param fallback is restricted to loopback/same-origin URLs. The widget's font and CSS `@property` registrations stay in `document.head` after unmount (idempotent, reused on remount).

If your build also runs the `@conciv/it` plugin, set its `widget: false` option so the plugin's script inject and the component don't both mount a widget; pick one path.

## Interface

- [src/README.md](./src/README.md): `ConcivWidget`, `ConcivWidgetProps` and re-exported `@conciv/embed` types.
- `test/fixtures/host/`: Preact host page used by the integration test.
- `exports["."]` -> `./dist/index.js` + `./dist/index.d.ts`; `files: ["dist"]`; dependency `@conciv/embed`; peer `preact` >=10; `sideEffects: false`; engines node >=22.13 (`package.json`).
- `tsdown.config.ts`: entry `src/index.ts`, ESM + dts, externals `/^@conciv\//`, `preact`, `preact/hooks`.
- Scripts: `build` (`tsdown`), `typecheck`, `lint` (`oxlint`), `test` (`vite build --config vite.fixture.config.ts && vitest run`), `publint`, `attw` (`--profile esm-only`).

## Invariants

- The `test` script builds the fixture into `test/dist` before `vitest run`, because `test/widget.it.test.ts` reads `test/dist` (`package.json`, `vite.fixture.config.ts`).
- Integration tests run serially (`fileParallelism: false`, `vitest.config.ts`).
- Remount rules (`configKey` value comparison, `extensions` reference comparison) are in [src/README.md](./src/README.md#invariants).

## Side Effects

- `ConcivWidget` mounts the widget into its host div and unmounts it on cleanup (`src/index.ts`).
- The `test` script empties and writes `test/dist` (`emptyOutDir: true`, `vite.fixture.config.ts`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/preact` from the repo root (turbo builds the package and its dependencies first)
