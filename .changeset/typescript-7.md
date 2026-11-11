---
'@conciv/core': patch
---

Build every package with TypeScript 7. Declarations now come from plain `tsc` per source file instead of a bundled d.ts, so published `.d.ts` files mirror the source layout; the exported names and their value/type kinds are unchanged.
