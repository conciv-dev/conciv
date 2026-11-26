---
'@conciv/app': patch
'@conciv/simulation': patch
'@internal/frontend-defaults': patch
---

`mount` takes `plugins` by name, as the config does, and with no engine opens the app in servers mode on its connect panel, as the embed does. `createEngine(config, {port: 'connect', token})` starts the engine on the first free connect port (4732 to 4741) with that token. The app opens its event stream only once an engine is bound, so a servers-mode app no longer logs that the core is not connected.
