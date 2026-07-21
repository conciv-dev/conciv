# @conciv/react

React component for the [conciv](https://conciv.dev) widget.

```tsx
import {ConcivWidget} from '@conciv/react'

export function App() {
  return (
    <>
      <YourApp />
      <ConcivWidget />
    </>
  )
}
```

Renders a single empty anchor `<div>`; the widget mounts into it inside a shadow root and overlays the viewport with fixed positioning, so placement in your tree doesn't affect where it appears. Unmounting the component removes the widget. SSR-safe (`'use client'`, effects don't run on the server). No Solid tooling or build plugin required.

Props (all optional): `extensions` (conciv extensions to load: an array, or a `() => Promise<AnyExtension[]>` loader), `settings` (same shape as the `pw-widget` meta config), `apiBase` (conciv server URL; defaults to the meta/query resolution).

In SSR frameworks (Next.js app router etc.), pass `extensions` as a loader with a dynamic import; extension client modules are compiled Solid browser code and must not be imported during the server render:

```tsx
const extensions = () => import('@conciv/extension-terminal/client').then((mod) => [mod.default])

<ConcivWidget extensions={extensions} />
```

Prop changes remount the widget with the new configuration. Keep the `extensions` array identity-stable (module constant or `useMemo`); a fresh array each render remounts each render; `settings`/`apiBase` are compared by value, inline literals are fine. Passing `apiBase` explicitly is the recommended secure usage; the `?core=` query-param fallback is restricted to loopback/same-origin URLs. The widget's font and CSS `@property` registrations stay in `document.head` after unmount (idempotent, reused on remount).

If your build also runs the `@conciv/it` plugin, set its `widget: false` option so the plugin's script inject and the component don't both mount a widget; pick one path.
