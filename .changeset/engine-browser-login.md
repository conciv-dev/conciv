---
'@conciv/core': patch
'@conciv/app': patch
'@conciv/embed': patch
'@conciv/plugin': patch
'@conciv/cli': patch
'@conciv/protocol': patch
'@conciv/contract': patch
---

The engine now refuses every request from a browser it does not trust. A browser becomes trusted by entering the 6-digit code the dev server prints (or opening the printed link); the widget shows a locked launcher until then. Inside the Vite DevTools dock the widget is trusted through DevTools' own login. `conciv auth revoke [id] [--all]` lists and removes trusted browsers.

Revoking a browser takes effect on the running engine without a restart. The open `/health` route now answers only `{ok, harness, engine: {stale}}`; the full staleness reading stays on the gated `meta.engine` RPC. When any engine call answers 401 the widget checks its login again and shows the locked launcher if the engine no longer trusts it; Retry on the unreachable screen does the same check.
