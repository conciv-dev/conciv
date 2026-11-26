---
'@internal/frontend-defaults': patch
---

Plugins are no longer loaded twice at login: the widget loads them once, and the console no longer shows 'the plugin manager was disposed' right after you log in.
