---
'@conciv/extension-terminal': patch
---

Replace `node-pty` with `@lydell/node-pty`, which ships prebuilt binaries as platform-scoped optional dependencies and has no install scripts. Installing `@conciv/it` under pnpm >= 10 no longer fails with `ERR_PNPM_IGNORED_BUILDS` or requires build-script approval (#109).
