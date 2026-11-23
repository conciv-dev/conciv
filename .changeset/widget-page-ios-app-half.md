---
'@conciv/core': patch
'@conciv/embed': patch
'@conciv/it': patch
'@conciv/unplugin': patch
'@conciv/plugin-ios': patch
---

Core serves a standalone widget page at `/widget` that names no plugin: the request origin is its engine address, an optional `?launcher=native|mascot` sets the launcher, and it loads the plain `conciv-widget.global.js`. The `/native` page, the embed's `conciv-widget-native` bundle and `nativePageDir` are gone (`widgetPageDir` replaces it). The iOS page half is now the ios plugin's own `./plugin-experimental` app part, loaded as an engine plugin: it speaks to the Swift SDK, registers the native grab picker, and keeps its grabs in its own store with its own note card.
