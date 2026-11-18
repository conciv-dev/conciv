---
'@conciv/plugin-host': patch
---

A plugin added to the project's `conciv` folder after that folder was deleted and created again (a branch switch, a restore) is picked up on Linux, instead of the watch staying on the deleted folder and missing every later plugin.
