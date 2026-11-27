---
'@conciv/app': patch
'@conciv/backend-app-api': patch
'@conciv/backend-defaults': patch
'@conciv/backend-plugin-api': patch
'@conciv/backend-test-utils': patch
'@conciv/backend': patch
'@conciv/cli': patch
'@conciv/client': patch
'@conciv/errors': patch
'@conciv/frontend-plugin-api': patch
'@conciv/harness': patch
'@conciv/home': patch
'@conciv/it': patch
'@conciv/preact': patch
'@conciv/protocol': patch
'@conciv/react': patch
'@conciv/serve': patch
'@conciv/simulation': patch
'@conciv/solid': patch
'@conciv/try': patch
'@conciv/types': patch
'@conciv/unplugin': patch
'@conciv/plugin-ios': patch
'@conciv/plugin-page': patch
'@conciv/plugin-recorder': patch
'@conciv/plugin-tanstack': patch
'@conciv/plugin-test-runner': patch
'@conciv/plugin-whiteboard': patch
---

Works on Node 22 and later (22.16 or newer, the first 22.x with the `node:sqlite` APIs the engine uses). Node code builds for node22, and `Promise.try` and `URL.parse`, which Node 22 lacks or added late, are not used.
