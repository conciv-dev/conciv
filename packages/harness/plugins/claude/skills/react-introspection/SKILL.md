---
name: react-introspection
description: Use when the user asks about a React component on the live page, or you need to map a rendered element to its source file, read its props/hooks/state, dump the component tree, or find a component by name. The conciv_page tool's own description names its React capabilities and their arguments. Reach for this instead of poking __REACT_DEVTOOLS_GLOBAL_HOOK__ or fiber keys through the eval capability.
---

# React introspection

The live page is a React app. The `conciv_page` tool reads the fiber tree directly (via bippy) and
symbolicates through the dev server's source maps. Use it. Do NOT hand-roll fiber detection with
`eval` + `__REACT_DEVTOOLS_GLOBAL_HOOK__` or `__reactFiber$` keys; that is what these capabilities
already do, correctly and source-mapped.

## Which capabilities exist

Read the `conciv_page` tool description. It lists every capability the running app offers, grouped
by category, each with its own summary — the React ones are the `react` group. That list is
generated from the running registry, so it is never stale, and it is the only place to look. Do not
work from memory, and do not work from a list written in a file.

Arguments are one flat object; only the fields relevant to the chosen capability apply. Target an
element with a CSS `selector`, a `ref` from the latest snapshot, or a React component `name`. Prefer
`ref`; refs go stale on re-render.

## Why to reach for it

- **"Where does this come from?"** — resolve a rendered element to its component's source
  `file:line`, symbolicated to a real source location from the owner stack rather than the dev
  wrapper. Then open and edit that real file.
- **"What is it holding right now?"** — read the live values before reasoning about behaviour. They
  are best-effort and serialized; partial hooks with no React DevTools hook installed are normal,
  not an error.
- **"What is the structure here?"** — walk the tree under an element, or find every mounted instance
  of a component when the user names one but you have no element yet.
- **"Is my hypothesis right?"** — patch a live value and watch the page, or record re-renders and
  report what changed. Both are ephemeral: verify, then edit the real source.

## Typical flow

1. Ground yourself: take a snapshot to get refs, or find the component by name if the user named it.
2. Locate the element's source `file:line`, then open and edit that real file.
3. Inspect the live values when you need them to reason about state.

If a capability returns `no React fiber` / `no root element`, the element is outside a React tree or
not hydrated yet; re-snapshot after the page settles rather than falling back to `eval`.
