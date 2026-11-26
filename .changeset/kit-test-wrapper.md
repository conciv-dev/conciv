---
'@conciv/simulation': patch
'@conciv/app': patch
---

`conciv-test` (a bin of `@conciv/plugin-testkit`) runs vitest with a home of its own: a fresh folder as `HOME`, the XDG folders and `TMPDIR`, and none of the developer's secrets or `CONCIV_*` variables, removed when vitest exits. It keeps the developer's Playwright browsers folder: `PLAYWRIGHT_BROWSERS_PATH` if set, otherwise the folder Playwright would use with the real home. Code that reads `os.homedir()` directly, and browser-mode engines that start in vitest's own process, no longer see the developer's home.
