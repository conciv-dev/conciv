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

Renders a single empty anchor `<div>`; the widget mounts into it inside a shadow root and overlays the viewport with fixed positioning, so placement in your tree doesn't affect where it appears. Removing the component removes the widget. SSR-safe (renders nothing on the server). Props are reactive the Solid way — any tracked change remounts the widget with the new configuration, no memoization needed.

Props (all optional): `extensions` (conciv extensions to load — an array, or a `() => Promise<AnyExtension[]>` loader), `settings` (same shape as the `pw-widget` meta config), `apiBase` (conciv server URL; defaults to the meta/query resolution).

In SSR setups (SolidStart), pass `extensions` as a loader with a dynamic import — extension client modules are browser code and must not be imported during the server render:

```tsx
const extensions = () => import('@conciv/extension-terminal/client').then((mod) => [mod.default])

<ConcivWidget extensions={extensions} />
```

Your app and the widget share one `solid-js` copy (the widget externalizes it); keep `solid-js` deduped in your bundler config if you alias or vendor it.

If your build also runs the `@conciv/it` plugin, set its `widget: false` option so the plugin's script inject and the component don't both mount a widget — pick one path.
