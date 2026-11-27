# Plugin UI Bridge (any framework): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A plugin's UI (panel, settings page, slot, composer pill menu, code block, tool card) can be written in React
(and, by the same contract, any framework), not only Solid, the way TanStack Devtools lets plugins render in any framework.

**Architecture:** As TanStack Devtools (`_ref/tanstack-devtools`, at `e672e44`): the shell stays Solid and gains one
framework-free contract, "mount into this element": `(element, props) => dispose`. A Solid helper in
`@conciv/frontend-plugin-api` turns such a mount into the `render` every registry already takes, so no registry type
changes. `@conciv/react` gains the React side: components given to `<ConcivWidget plugins={...}/>` render into those
elements through React portals inside the host app's own React tree (one React, the app's context), so the host app's
own bundler compiles them and no separate plugin build is needed. `@conciv/preact` gets the same.

**Tech Stack:** Solid (shell), React 19 `createPortal` / Preact `createPortal`, the existing `@conciv/react` and
`@conciv/preact` packages.

**Spec:** the maintainer's words of 2026-11-27 ("we need a way to load React or whatever; we should have had a bridge";
"check tanstack devtools react bridge"; "a new lane from main") and this file.

## Reference, read before coding (TanStack Devtools)

- Core contract: `packages/devtools/src/context/devtools-context.tsx:75`:
  `render: (el: HTMLDivElement, props: TanStackDevtoolsPluginProps) => void`.
- React adapter: `packages/react-devtools/src/devtools.tsx`: `pluginsMap` (:180-215) wraps each plugin's `render`; when the
  core calls `render(el)`, the adapter stores `el` in state (`setPluginContainers`) and the React element in state
  (`convertRender`), then renders `createPortal(<>{PluginComponents[key]}</>, pluginContainer)` (:262).
- Author helper: `packages/devtools-utils/src/react/plugin.tsx` `createReactPlugin({name, Component})` returns
  `[Plugin, NoOpPlugin]`; `panel.tsx` `createReactPanel` mounts a core class into a React ref.
- The Solid, Vue, Svelte, Preact and Angular adapters in `packages/{solid,vue,svelte,preact,angular}-devtools` and
  `packages/devtools-utils/src/*` follow the same shape.

## Global Constraints

- No registry type changes: `Panel.render`, `SettingsPage.render`, `Slot.render`, `ComposerPill.menu`,
  `CodeBlock.render`, `ToolRegistry.render` keep taking a Solid render; the bridge produces one.
- One React: the React UI renders through portals from `<ConcivWidget/>`'s React tree, never a second `createRoot` per
  contribution (TanStack's choice, so the app's providers and context reach plugin UI).
- Props stay live: when the Solid props change (a getter re-reads), the React component re-renders with the new values;
  no remount.
- Cleanup: when the shell disposes the contribution (tab closed, plugin unloaded), the portal is removed.
- No comments in TS/JS, functions not classes, no IIFEs, no module-level state, no mocks, no product code for tests.
  Solid: no raw `createSignal`/`createEffect`; the prop bridge uses `createRenderEffect`/`on` only if no primitive fits,
  and the commit body says why (AGENTS.md rule).
- New public exports (each named in the PR body for the maintainer): `mount` helper in `@conciv/frontend-plugin-api`,
  `createReactPlugin` (and the React contribution helpers) in `@conciv/react`, the same in `@conciv/preact`.

## Goals checklist (done only when the orchestrator checks every box)

- [ ] A React component works as a panel tab, a settings page, a slot, a composer pill menu, a code block render and a
      tool card, given through `<ConcivWidget plugins={[...]}/>` in a React host app.
- [ ] The React UI is inside the host app's React tree (a React context provided above `<ConcivWidget/>` is readable in
      the plugin component).
- [ ] Props update live; closing a tab or unloading the plugin removes the React UI.
- [ ] Solid plugins are unchanged; no registry type changed.
- [ ] Preact gets the same through `@conciv/preact`.
- [ ] No feature lost; tests extend existing journeys.

## Who runs what

Agents write code and run ONLY typecheck, build, lint, format, fallow and the conciv-publish guards. Agents run NO
tests of any kind. The orchestrator runs every test, reads the full diff, checks the goals, and pushes.

### Task 1: The framework-free mount in `@conciv/frontend-plugin-api`

**Files:** `packages/frontend-plugin-api/src/` (a new `mount.tsx`, exported from the root entry), its README invariants.

- `export type Mount<P> = (element: HTMLElement, props: () => P) => () => void`
- `export function mountRender<P>(mount: Mount<P>): (props: P) => JSX.Element`: returns a Solid render that creates a
  `<div>` (styled to fill its slot with UnoCSS), calls `mount(div, () => props)` once the div is connected, and calls the
  returned dispose in `onCleanup`. Props reach the mount as a getter so the framework side reads fresh values.
- Prop changes: the framework side needs a signal when props change. Give `Mount` a second shape the React adapter uses:
  `mount(element, props, onChange)` where `onChange(listener)` subscribes to prop changes (Solid `on` over the props'
  getters inside `createRenderEffect`, justified in the commit). Pick the smallest shape that lets Task 2 re-render.
- **Tests:** fold one step into `frontend-defaults/test/e2e` (the journey that renders a plugin panel): a panel given
  with `mountRender` that writes plain DOM (no framework) shows its text, follows a prop change, and is gone after the tab
  closes. This proves the contract with no React in the shell's tests.

### Task 2: React contributions in `@conciv/react`

**Files:** `packages/react/src/react.ts` (and new files beside it), `packages/react/package.json` (exports; `react-dom` peer).

- `<ConcivWidget/>` keeps a registry of mounts in React state (TanStack's `setPluginContainers` + `setPluginComponents`):
  each bridged contribution, when Solid calls its mount, adds `{key, element, node}`; dispose removes it.
  `<ConcivWidget/>` renders `createPortal(node, element)` for each entry next to its host div.
- Author helpers (names follow TanStack's `createReactPlugin`):
  `reactPanel(Component)`, `reactSlot(Component)`, `reactSettingsPage(Component)`, `reactComposerMenu(Component)`,
  `reactCodeBlock(Component)`, `reactToolCard(Component)`, each returning the Solid render a registry takes, built with
  Task 1's `mountRender`, so a plugin writes
  `ctx.add(Panel, {id, title, render: reactPanel(MyPanel)})`.
- The helpers need the `<ConcivWidget/>` that mounted the plugin: pass it through the plugin context the host already
  gives (read how `ConcivInit.plugins` reach `createConciv` in `packages/app/src/mount.ts:13,133-140` and how
  `frontend-app-api` builds `ctx`); never a module-level registry.
- **Tests:** `packages/react` has no tests today; add its one browser test file (the package budget allows one) with one
  journey: a React host with a context provider renders `<ConcivWidget plugins={[plugin]}/>` against the fake engine
  (`@internal/test-utils`), the plugin's React panel reads the context, its prop updates, the tab closes and the React UI
  is gone; a React tool card renders for a tool call. Account for the new test in the PR body (no existing journey can
  carry a React host).

### Task 3: Preact

**Files:** `packages/preact/src/preact.ts` and beside it.

- Same as Task 2 with Preact's `createPortal`.
- **Tests:** fold into the Task 2 journey's shape in `packages/preact`'s one browser test file (new; account in the PR body).

### Task 4: Docs and the example

**Files:** the plugin docs pages (on `docs/plugin-guides` the docs lane owns: do NOT edit them here; write the snippet
for the docs lane into the PR body instead), `apps/examples` React host only if one exists.

- PR body: a "React plugin UI" section with one complete example (a React panel through `reactPanel`), for the docs lane
  to place.

### Changeset

`@conciv/frontend-plugin-api`, `@conciv/react`, `@conciv/preact` minor-level feature (fixed group: one entry).
