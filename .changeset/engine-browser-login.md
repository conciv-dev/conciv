---
'@conciv/core': patch
'@conciv/app': patch
'@conciv/embed': patch
'@conciv/plugin': patch
'@conciv/cli': patch
'@conciv/protocol': patch
---

The engine now refuses every request from a browser it does not trust. A browser becomes trusted by entering the 6-digit code the dev server prints (or opening the printed link); the widget shows a locked launcher until then. Inside the Vite DevTools dock the widget is trusted through DevTools' own login. `conciv auth revoke [id] [--all]` lists and removes trusted browsers.
