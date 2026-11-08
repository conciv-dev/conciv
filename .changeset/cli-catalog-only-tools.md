---
'@conciv/cli': patch
---

`conciv tools` builds every tool group from the running dev server's catalog, so a mounted extension's tools appear under their own name and the CLI no longer depends on any extension package. `npx @conciv/cli` installs 47 packages (49 MB) instead of 500 (681 MB). Without a running server, `conciv tools ...` and its `--help` print the "No conciv dev server" error instead of an offline list.
