---
'@conciv/extension-compiler': patch
---

The vite dev hot-serve remaps a workspace `dist` entry to its `src` sibling and Solid-compiles the TSX it finds there. That remap used to key off a `react/` folder-name convention, which turned `@conciv/mascot/react` into Solid output inside a React host and crashed server rendering with `Comp is not a function`. The decision is now derived from the found source file's nearest `tsconfig.json` (following its `extends` chain): a subtree whose effective `compilerOptions.jsxImportSource` is set to something other than `solid-js`, or whose `compilerOptions.jsx` is `react-jsx`/`react-jsxdev` without a `solid-js` `jsxImportSource`, is classified non-Solid and stays on `dist`. Everything else — an explicit `jsxImportSource: "solid-js"`, or no JSX config in the chain at all (pure-TS subtrees) — keeps the existing remap-to-`src` behavior.

`@conciv/mascot`'s React wrapper subtree carried its JSX config in a sibling file (`tsconfig.react.json` at the package root) rather than in a tsconfig local to `src/react/`, which the nearest-tsconfig directory walk can't discover. It has been relocated to `src/react/tsconfig.json` so the declaration lives with the code it governs; `tsdown.react.config.ts` and the package's `typecheck` script now point at the new path.
