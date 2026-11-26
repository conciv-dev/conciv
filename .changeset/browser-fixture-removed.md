---
'@internal/vitest-config': patch
---

`@conciv/browser-fixture` is removed and no longer published. Its one Chromium per test file came from the old tests; browser tests now run in vitest browser mode through `concivTest()` of `@internal/vitest-config`.
