---
'@conciv/extension-compiler': patch
---

A page that runs conciv in the Vite DevTools dock no longer gets a second widget when one of its modules is a framework client entry: the page module stays out when the page carries the dock module's script, even when the host html has its own `conciv-widget` meta. A `conciv-widget` meta that holds `null` or another non-object value no longer stops the page widget from mounting.
