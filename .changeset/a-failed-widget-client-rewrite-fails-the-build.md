---
'@conciv/unplugin': patch
---

A webpack or rspack watch build whose widget client cannot be rewritten for the engine's chosen port now fails with "conciv: the engine failed to start" and the cause, instead of booting the engine while the page's client still points at the asked port.
