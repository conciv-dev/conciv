---
name: react-introspection
description: Use when the user asks about a React component on the live page, or you need to map a rendered element to its source file, read its props/hooks/state, dump the component tree, or find a component by name. The sandbox catalog names the React capabilities and their arguments. Reach for this instead of poking __REACT_DEVTOOLS_GLOBAL_HOOK__ or fiber keys through the eval capability.
---

# React introspection

The live page is a React app. The `page.*` capabilities inside `execute_typescript` read the fiber
tree directly (via bippy) and symbolicate through the dev server's source maps. Use them. Do NOT hand-roll fiber detection with
`eval` + `__REACT_DEVTOOLS_GLOBAL_HOOK__` or `__reactFiber$` keys; that is what these capabilities
already do, correctly and source-mapped.

## Which capabilities exist

Call `await external_catalog({search: 'react'})` inside `execute_typescript`. It lists every
capability the running app offers with the exact function name to call, each with its own summary -
the React ones are the `react` category. `await external_catalog({name})` returns one full typed
signature. That list is generated from the running registry, so it is never stale, and it is the
only place to look. Do not work from memory, and do not work from a list written in a file.

Each capability validates its own arguments. Target an element with a CSS `selector`, a `ref` from
the latest snapshot, or a React component `name`. Prefer `ref`; refs go stale on re-render.

## Why to reach for it

- **"Where does this come from?"**: resolve a rendered element to its component's source
  `file:line`, symbolicated to a real source location from the owner stack rather than the dev
  wrapper. Then open and edit that real file.
- **"What is it holding right now?"**: read the live values before reasoning about behaviour. They
  are best-effort and serialized; partial hooks with no React DevTools hook installed are normal,
  not an error.
- **"What is the structure here?"** - walk the tree under an element, or find every mounted instance
  of a component when the user names one but you have no element yet.
- **"Is my hypothesis right?"** - patch a live value and watch the page, or record re-renders and
  report what changed. Both are ephemeral: verify, then edit the real source.

## Typical flow

1. Ground yourself: take a snapshot to get refs, or find the component by name if the user named it.
2. Locate the element's source `file:line`, then open and edit that real file.
3. Inspect the live values when you need them to reason about state.

If a capability returns `no React fiber` / `no root element`, the element is outside a React tree or
not hydrated yet; re-snapshot after the page settles rather than falling back to `eval`.
