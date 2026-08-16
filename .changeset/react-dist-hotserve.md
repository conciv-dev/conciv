---
'@conciv/extension-compiler': patch
---

React entry points of `@conciv/*` packages now always resolve to their built `dist` files in dev. The vite dev hot-serve remaps a workspace `dist` entry to its `src` sibling and Solid-compiles the TSX it finds there, which turned `@conciv/mascot/react` into Solid output inside a React host and crashed server rendering with `Comp is not a function`. Any dist stem under `react/` is now left on dist, where it needs no transform; the `.jsx` Solid-condition mapping is unchanged.
