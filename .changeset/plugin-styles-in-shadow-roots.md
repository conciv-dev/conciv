---
'@conciv/app': patch
---

CSS a plugin contributes with `ctx.add(Style, css)` is applied in the widget's shadow root, in each PiP window and in each plugin overlay, after the app's own sheet, and removed when the plugin withdraws it or unloads.
