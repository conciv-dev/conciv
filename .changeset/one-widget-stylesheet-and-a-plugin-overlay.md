---
'@conciv/plugin': patch
'@conciv/embed': patch
---

The widget builds its stylesheet once per document as a constructed `CSSStyleSheet`, and every widget root in that document (the widget, the extension effects surface, plugin overlays) adopts it instead of carrying its own `<style>` copy; the picture-in-picture window builds its own one for its document. Plugins get `ctx.overlay(options?)` on the experimental context: a layer over the page and under the widget, a `div` in its own shadow root styled with the widget's stylesheet plus any `options.styles` CSS text, carrying the widget's color scheme and skin as they change, removed by its `dispose()` or with the plugin.
