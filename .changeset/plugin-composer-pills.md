---
'@internal/frontend-defaults': patch
'@conciv/app': patch
---

Plugin pills sit above the composer, beside the `session.status` slot, in ascending order. A pill whose `show` returns `undefined` renders nothing. A plain pill runs on click, a rows pill opens a menu of its rows, and a menu pill opens a popover around the plugin's content.
