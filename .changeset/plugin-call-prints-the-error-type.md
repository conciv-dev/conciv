---
'@conciv/cli': patch
---

`conciv plugin call` now prints a plugin method's declared error in full: the error envelope carries the error's `type` and `data` next to its `message`, and the command still exits 1.
