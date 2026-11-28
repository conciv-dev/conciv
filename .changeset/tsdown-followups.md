---
'@conciv/plugin-page': patch
'@conciv/ui-kit-chat': patch
'@conciv/protocol': patch
---

The published packages ship no source or declaration maps (they pointed at src/, which no package ships), built with
tsdown 0.23.7. @conciv/plugin-page builds every entry in one unbundled build, so its browser entries import its own
dist/rpc.js. @conciv/ui-kit-chat's JavaScript is bundled again, with the same entries.
