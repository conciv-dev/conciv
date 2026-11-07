---
'@conciv/core': patch
'@conciv/app': patch
'@conciv/embed': patch
'@conciv/plugin': patch
'@conciv/cli': patch
'@conciv/protocol': patch
'@conciv/contract': patch
'@conciv/client': patch
'@conciv/harness-testkit': patch
'@conciv/extension-testkit': patch
'@conciv/extension-whiteboard': patch
---

The engine now refuses every request from a browser it does not trust. A browser becomes trusted by entering the 6-digit code the dev server prints (or opening the printed link); the widget shows a locked launcher until then. Inside the Vite DevTools dock the widget is trusted through DevTools' own login. `conciv auth revoke [id] [--all]` lists and removes trusted browsers.

Revoking a browser takes effect on the running engine without a restart. The open `/health` route now answers only `{ok, harness, engine: {stale}}`; the full staleness reading stays on the gated `meta.engine` RPC. When any engine call answers 401 the widget checks its login again and shows the locked launcher if the engine no longer trusts it; Retry on the unreachable screen does the same check. A revoke also closes every socket the browser opened (close code 1008), which locks an open tab right away. A missing session header now answers 400 BAD_REQUEST, so 401 only means the login gate refused.

The launcher now drags like the TanStack Devtools trigger: drop it anywhere, throw it, pin it into a corner, or drag it off an edge to tuck it into a tab (click the tab to bring it back). Arrows move the focused launcher and Shift with an arrow sends it to a corner. The chat panel opens toward the free side of wherever the launcher sits, and the spot is remembered per browser.
