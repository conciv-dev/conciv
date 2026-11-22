---
'@conciv/plugin-testkit': patch
---

`mount` now renders the app inside a `data-conciv-root` host appended to `document.body`, as the embed does, so the page plugin in a test skips the widget's own elements the way it does on a real page.
