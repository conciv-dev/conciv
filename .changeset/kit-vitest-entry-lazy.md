---
'@conciv/plugin-testkit': patch
---

`concivTest()` does nothing outside vitest: its `config` hook returns nothing unless vite's mode is `test`, and only then loads the test projects. The `@conciv/plugin-testkit/vitest` entry imports nothing at load, so `vite build` and `vite dev` of a package that lists it load none of the test stack.
