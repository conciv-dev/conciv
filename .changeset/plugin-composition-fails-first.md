---
'@internal/frontend-defaults': patch
---

A plugin composition failure (two plugins with one id) throws before the app starts anything, so no engine connection, login or navigation restore is left running, and no callback reads a binding before its declaration.
