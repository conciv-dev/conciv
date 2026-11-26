---
'@conciv/app': patch
---

`virtual:conciv-test-plugins` is fixed text with integer indexes: the by-name plugins' names, ids and kinds reach `mount` as data through vitest's `provide`, and each window plugin loads through the literal specifier `virtual:conciv-test-plugin/<index>`, which the kit resolves to its folder. No name or path is pasted into generated code.
