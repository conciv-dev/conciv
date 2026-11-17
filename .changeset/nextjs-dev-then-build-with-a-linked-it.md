---
'@conciv/unplugin': patch
---

Next.js: running `next dev` and then `next build` no longer fails with a Turbopack panic about `.conciv/bin/conciv`. Only apps where `@conciv/it` is linked from a local checkout of this repo were hit (contributors and the repo's own examples); an app that installs `@conciv/it` from npm was not affected. `register()` now loads the engine as plain Node modules that Turbopack does not bundle, so the `conciv` command link points at the real CLI file, and a link that cannot be made is logged once as a `conciv:` line instead of being left broken.
