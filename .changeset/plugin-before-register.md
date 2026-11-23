---
'@conciv/plugin': patch
'@conciv/plugin-page': patch
'@conciv/embed': patch
---

A plugin's app part can declare `beforeRegister(options)` and `enforce` (`pre` | `post`); the host calls every known plugin's `beforeRegister` in enforce order before any setup. The page plugin installs its React bridge there, and the embed no longer names any plugin.
