---
'@conciv/simulation': patch
'@conciv/plugin-testkit': patch
---

The testkits are leaves: every `@conciv/*` package they need is a peer dependency, so a workspace package can list a kit in its devDependencies without a build cycle. Each kit's `build` is tsdown alone, and its types come from a separate `build:types` step that waits for the packages whose types it reads.
