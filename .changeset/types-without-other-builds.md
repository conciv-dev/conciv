---
'@conciv/unplugin': patch
'@conciv/plugin-testkit': patch
'@conciv/harness-testkit': patch
---

`@conciv/unplugin` and both testkits write their type declarations with tsdown's isolated-declarations output instead of `tsc`, so their `build:types` reads no other package's build and waits only for the package's own build. A package that lists unplugin or a kit as a devDependency no longer waits for the widget bundle or the app to build before its typecheck and tests. `tsc` still checks every file in each package's `typecheck` task.
