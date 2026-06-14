---
name: react-introspection
description: Use when the user asks about a React component on the live page, or you need to map a rendered element to its source file, read its props/hooks, dump the component tree, or find a component by name. Covers the aidx tools page locate/inspect/tree/find verbs. Reach for this instead of poking __REACT_DEVTOOLS_GLOBAL_HOOK__ or fiber keys via page eval.
---

# React introspection

The live page is a React app. The `aidx tools page` CLI has four React verbs that read the
fiber tree directly (via bippy) and symbolicate through the dev server's source maps. Use them.
Do NOT hand-roll fiber detection with `page eval` + `__REACT_DEVTOOLS_GLOBAL_HOOK__` or
`__reactFiber$` keys — that is what these verbs already do, correctly and source-mapped.

Verbs target an element by positional CSS selector or `--ref` (a ref from the latest
`aidx tools page snapshot`). Prefer `--ref`; refs go stale on re-render.

## Verbs

- `aidx tools page locate <sel|--ref>` — resolve a rendered element to its component's source
  `file:line`. This is the "where does this come from?" verb. Reply is symbolicated to a real
  source location (e.g. `app/page.tsx:17`), derived from the owner stack, not the dev wrapper.
- `aidx tools page inspect <sel|--ref>` — `{component, props, hooks}` for the element's nearest
  component. Props/hooks are best-effort (serialized); hooks may be partial when no React
  DevTools hook is installed, which is normal and not an error.
- `aidx tools page tree [sel|--ref]` — the component tree (`{nodes}`) rooted at the element, or
  the page root if no target. Use to understand structure.
- `aidx tools page find --name <Component>` — find mounted instances by component name
  (`{matches}`). Use when the user names a component but you don't have an element yet.

## Typical flow

1. Ground yourself: `aidx tools page snapshot` to get refs, or `find --name` if the user named
   a component.
2. `locate --ref <r>` to jump to the source `file:line`, then `aidx tools open <file> --line <n>`
   to open it for the user, or edit the real file.
3. `inspect --ref <r>` when you need the live props/hooks to reason about state.

If a verb returns `no React fiber` / `no root element`, the element is outside a React tree or
not hydrated yet — re-snapshot after the page settles rather than falling back to `eval`.
