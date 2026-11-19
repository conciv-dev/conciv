---
'@conciv/plugin-host': patch
'@conciv/core': patch
'@conciv/protocol': patch
'@conciv/ui-kit-system': patch
'@conciv/ui-kit-chat': patch
'@conciv/embed': patch
---

The last pieces of the old extension system are gone. The plugin host no longer keeps a list of mounted extension names (it was always empty), so a plugin can register any rpc id. The tool list no longer carries an `extension` field nothing set, and a crashed plugin is logged as a plugin. The ui-kit-system token contract for third-party UI is now the plugin author contract (`docs/plugin-tokens.md`), and the READMEs describe plugins instead of extensions.
