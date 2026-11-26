---
'@internal/frontend-defaults': patch
'@conciv/app': patch
---

A plugin panel that throws no longer takes down the session view. A panel whose tab list throws shows no tabs, and a throw while it renames a stored tab, or while its tab is focused or closed, is skipped. The error shows under the plugin in Settings > Plugins until Reload starts it again, and the chat and every other plugin keep working.
