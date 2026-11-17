---
'@conciv/unplugin': patch
---

webpack and Rspack development builds now get the conciv widget on the page from the plugin itself: it adds a generated client entry to the build, so there is nothing to serve and no script tag to add. A production build (or `enabled: false`) carries no widget and starts no engine. On webpack and Rspack the engine port now defaults to 41700, as on Next.js, because the widget is built with it; pass `port` to change both. `conciv init` on webpack or Rspack no longer prints a card about the widget.

The `widgetUrl` option and the `CONCIV_WIDGET_URL` environment variable are removed. Nothing read them.

`widget: false` now keeps the widget off the page on webpack, Rspack and Next.js; the engine still starts.
