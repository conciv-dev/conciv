---
'@conciv/plugin': patch
---

Every tsdown-built package ships JavaScript source maps next to its `dist`, as the vite-built ones already do, and the kit's coverage counts code run from a package's `dist` on its `src` lines.
