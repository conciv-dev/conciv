---
'@conciv/simulation': patch
'@conciv/backend-test-utils': patch
---

The test engine carries its project folder as `root` (the real path), and `directory` runs it on an existing fixture project instead of a fresh folder. The engine's state stays in the kit's own temp folder, so stopping it never touches the fixture. `directory` cannot be given with `files`.
