---
'@conciv/backend-app-api': patch
---

A plugin added to the project's `conciv` folder, or a change in a plugin folder configured by path, is picked up on Linux after that folder was deleted and created again (a branch switch, a restore), instead of the watch staying on the deleted folder and missing every later change.
