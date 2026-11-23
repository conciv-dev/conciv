---
'@conciv/core': patch
'@conciv/contract': patch
---

The panel grounds a grabbed element's source through the page plugin's own `symbolicate`, called with `plugin.call`. The engine's `page.symbolicate` route and the engine scope's `symbolicate` are gone.
