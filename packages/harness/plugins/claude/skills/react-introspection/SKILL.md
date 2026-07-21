---
name: react-introspection
description: Use when the user asks about a React component on the live page, or you need to map a rendered element to its source file, read its props/hooks, dump the component tree, or find a component by name. Covers the conciv_page tool's locate/inspect/tree/find verbs. Reach for this instead of poking __REACT_DEVTOOLS_GLOBAL_HOOK__ or fiber keys via the eval verb.
---

# React introspection

The live page is a React app. The `conciv_page` MCP tool has four React verbs that read the fiber
tree directly (via bippy) and symbolicate through the dev server's source maps. Use them. Do NOT
hand-roll fiber detection with the `eval` verb + `__REACT_DEVTOOLS_GLOBAL_HOOK__` or
`__reactFiber$` keys; that is what these verbs already do, correctly and source-mapped.

Call `conciv_page` with a `verb` plus an element target: either a positional CSS `selector` or a
`ref` (from the latest `conciv_page` `snapshot`). Prefer `ref`; refs go stale on re-render.

## Verbs (the `verb` argument to `conciv_page`)

- `locate`: resolve a rendered element to its component's source `file:line`. The "where does this
  come from?" verb. Reply is symbolicated to a real source location (e.g. `app/page.tsx:17`),
  derived from the owner stack, not the dev wrapper.
- `inspect`: `{component, props, hooks}` for the element's nearest component. Props/hooks are
  best-effort (serialized); hooks may be partial when no React DevTools hook is installed, which is
  normal and not an error.
- `tree`: the component tree (`{nodes}`) rooted at the element, or the page root if no target. Use
  to understand structure.
- `find`: find mounted instances by component `name` (`{matches}`). Use when the user names a
  component but you don't have an element yet.

## Typical flow

1. Ground yourself: call `conciv_page` with `{verb: 'snapshot'}` to get refs, or
   `{verb: 'find', name: '<Component>'}` if the user named a component.
2. `{verb: 'locate', ref: '<r>'}` to jump to the source `file:line`, then open and edit that real
   file directly.
3. `{verb: 'inspect', ref: '<r>'}` when you need the live props/hooks to reason about state.

If a verb returns `no React fiber` / `no root element`, the element is outside a React tree or not
hydrated yet; re-snapshot after the page settles rather than falling back to `eval`.
