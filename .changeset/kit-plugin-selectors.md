---
'@conciv/plugin-testkit': patch
---

`createEngine({plugins})` passes remove entries (`-id`), wildcard entries and built-in selectors (`conciv.*`) to the engine untouched, instead of looking them up as installed packages.
