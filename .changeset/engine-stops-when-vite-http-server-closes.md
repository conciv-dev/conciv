---
'@conciv/unplugin': patch
---

The dev server exits promptly on stop: the vite plugin starts stopping the engine as soon as Vite's http server closes, instead of waiting behind Vite's own teardown for the closeServer hook.
