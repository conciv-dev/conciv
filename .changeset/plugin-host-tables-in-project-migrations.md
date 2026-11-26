---
'@conciv/backend-app-api': patch
---

The plugin host's tables are created with the project database's other tables, under the same lock, so two engines starting at once on a new project both start.
