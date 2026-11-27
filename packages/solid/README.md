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

Props (all optional): `settings` (same shape as the `conciv-widget` meta config), `apiBase` (conciv server URL; defaults to the meta/query resolution). The Terminal panel is built into the widget. Plugins the engine lists reach the widget on their own.

Your app and the widget share one `solid-js` copy (the widget externalizes it); keep `solid-js` deduped in your bundler config if you alias or vendor it.

If your build also runs the `@conciv/it` plugin, set its `widget: false` option so the plugin's script inject and the component don't both mount a widget; pick one path.

## Interface

- Source: [src/README.md](./src/README.md). `exports["."]` -> `./dist/solid.js` + `./dist/solid.d.ts`; dependency
  `@conciv/app`; peer `solid-js` ^1.8 (`package.json`).

## Invariants

- `vite.config.ts` keeps `@conciv/*`, `solid-js` and `solid-js/web` external, so the host's one `solid-js` copy is
  the widget's.

## Side Effects

- None at import; `ConcivWidget` mounts the widget (see [src/README.md](./src/README.md#side-effects)).

## Verification

- Run: `pnpm exec turbo run typecheck --filter=@conciv/solid` from the repo root (the package has no tests yet)
