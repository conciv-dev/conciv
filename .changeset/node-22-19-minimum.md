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
'@conciv/plugin-design': patch
'@conciv/plugin-ios': patch
'@conciv/plugin-page': patch
'@conciv/plugin-recorder': patch
'@conciv/plugin-tanstack': patch
'@conciv/plugin-test-runner': patch
'@conciv/plugin-whiteboard': patch
'@conciv/preact': patch
'@conciv/protocol': patch
'@conciv/react': patch
'@conciv/serve': patch
'@conciv/simulation': patch
'@conciv/solid': patch
'@conciv/try': patch
'@conciv/types': patch
'@conciv/unplugin': patch
---

conciv needs Node 22.19 or later. Effect 4.1 and undici 8 declare `>=22.19.0`, so every published package now declares that floor in `engines.node`. `@conciv/plugin-page` uses js-beautify 1.15, whose dependencies install on every Node 22.19+ release; js-beautify 2 pulled `nopt` and `abbrev` that refuse Node 22.19 to 22.22.1 and 24.0 to 24.14.
