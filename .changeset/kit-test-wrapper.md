---
'@conciv/harness-testkit': patch
'@conciv/plugin-testkit': patch
---

`conciv-test` (a bin of `@conciv/plugin-testkit`) runs vitest with a home of its own: a fresh folder as `HOME`, the XDG folders and `TMPDIR`, and none of the developer's secrets or `CONCIV_*` variables, removed when vitest exits. Code that reads `os.homedir()` directly, and browser-mode engines that start in vitest's own process, no longer see the developer's home.
