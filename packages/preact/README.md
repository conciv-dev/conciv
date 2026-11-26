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

Props (all optional): `settings` (same shape as the `conciv-widget` meta config), `apiBase` (conciv server URL; defaults to the meta/query resolution). The Terminal panel is built into the widget. Plugins the engine lists reach the widget on their own.

Prop changes remount the widget with the new configuration. `settings`/`apiBase` are compared by value, inline literals are fine. Passing `apiBase` explicitly is the recommended secure usage; the `?core=` query-param fallback is restricted to loopback/same-origin URLs. The widget's font and CSS `@property` registrations stay in `document.head` after unmount (idempotent, reused on remount).

If your build also runs the `@conciv/it` plugin, set its `widget: false` option so the plugin's script inject and the component don't both mount a widget; pick one path.

## Interface

- Source: [src/README.md](./src/README.md). `exports["."]` -> `./dist/preact.js` + `./dist/preact.d.ts`; dependency
  `@conciv/app`; peer `preact` >=10 (`package.json`).

## Invariants

- `tsdown.config.ts` keeps `@conciv/*`, `preact` and `preact/hooks` external.
- Remount rules (`configKey` value comparison) are in [src/README.md](./src/README.md#invariants).

## Side Effects

- `ConcivWidget` mounts the widget into its host div and unmounts it on cleanup (`src/preact.ts`).

## Verification

- Run: `pnpm exec turbo run typecheck --filter=@conciv/preact` from the repo root (the package has no tests yet)
