---
'@conciv/plugin-page': patch
'@conciv/embed': patch
'@conciv/unplugin': patch
---

The page plugin's browser build carries its own bippy, react-grab, ai-motion, js-beautify and @jridgewell/trace-mapping; the embed no longer depends on bippy or react-grab.
