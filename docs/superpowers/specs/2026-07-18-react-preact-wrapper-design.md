# React/Preact widget wrapper design

Date: 2026-07-18
Status: approved pattern (TanStack devtools core+wrapper), pending spec review

## Goal

Let React and Preact apps render the conciv widget as a framework-native component:

```tsx
import {ConcivWidget} from '@conciv/react'

<ConcivWidget extensions={[terminal()]} />
```

No Solid tooling in the host app, no build plugin required, SSR-safe (Next.js app router). Mirrors
the `@tanstack/devtools` + `@tanstack/react-devtools` split: Solid is compiled at library build
time, the wrapper is a thin lifecycle shim.

## Reference pattern (TanStack devtools)

- `@tanstack/devtools` exposes a framework-free handle (`TanStackDevtoolsCore`) with
  `mount(el)` / `unmount()`. `mount()` guards `typeof document === 'undefined'`, then
  dynamic-imports the Solid `mount-impl` (lazy split keeps SSR imports light), holds an
  `AbortController` so unmount-during-mount is safe, and stores the Solid `render()` dispose.
- `@tanstack/react-devtools` is one component: create the core once in `useState`, `useEffect`
  mounts it and returns `unmount` as cleanup. Entry has `'use client'`. Preact wrapper is the same
  with `preact/hooks`.
- Reverse portals (React-rendered content inside the Solid shell) exist for their plugin system.
  We defer that: conciv extensions are conciv-owned Solid code. Not in scope.

## Architecture

Three changes: a lifecycle handle in `@conciv/embed`, and two new thin packages.

### 1. `@conciv/embed`: `createConciv` handle

New public function alongside `mountConciv`:

```ts
type ConcivInit = {
  extensions?: AnyExtension[]
  settings?: ConcivSettingsInit // raw meta-config shape, declared in @conciv/protocol (WidgetConfig + defaultOpen)
  apiBase?: string
}

function createConciv(init: ConcivInit): {mount(): Promise<void>, unmount(): void}
```

`mount()` resolves when the widget has booted and rejects on load/boot failure (after cleanup + logging). The `[data-conciv-root]` host element is claimed synchronously inside `mount()` so concurrent mounts (two handles, or component + script-tag inject) collapse to one widget with a warning.

- `mount()`:
  - `typeof document === 'undefined'` → return (SSR no-op).
  - Existing `[data-conciv-root]` singleton guard → `console.warn` (loud: component + injected
    script both active) and no-op.
  - State machine `unmounted → mounting → mounted`; `AbortController` created per mount.
  - Dynamic `import('./mount-impl.js')` carries the heavy graph (router app, ui-kits, page plane).
    The static `mount.js` entry stays import-safe for SSR: no top-level DOM access, no heavy deps.
  - Import failure → `console.error('[conciv] failed to load widget', err)`, state resets to
    `unmounted`.
- `unmount()`:
  - Aborts an in-flight mount, then runs the teardown bundle returned by boot:
    Solid `render()` dispose (currently dropped in `mount.tsx:43`), page-plane
    `startPagePlane(...).dispose` (already returns `{dispose}`), shadow-root host element removal.
  - No-op when unmounted (React cleanup may run without a mount having happened).
- Config threading: boot uses `init.apiBase ?? resolveApiBase()` and
  `init.settings ?? parseConcivSettings(metaContent('pw-widget'))`. Existing meta/query resolution
  stays the fallback, so the script-tag path is unchanged.
- `mountConciv(extensions)` becomes `createConciv({extensions}).mount()` — global/script-tag embed
  path keeps identical behavior.
- Implementation must verify Solid dispose tears down router SSE subscriptions and the react-bridge
  install is either idempotent or included in teardown.

### 2. `@conciv/react`

New package `packages/react`:

- Exports `ConcivWidget(props: ConcivInit): null` and the props type. `'use client'` banner on the
  entry.
- Props are fully reactive: the mount effect keys on a value-stable serialization of
  `apiBase`/`settings` plus the `extensions` array identity; any change tears down and reboots the
  widget with the new configuration (settings/extensions feed router creation at boot, so remount
  is the correct live-update). Renders `null`: the widget owns its body-level shadow root; no host
  DOM node needed, so no `react-dom` dependency.
- StrictMode double-invoke: effect runs mount → cleanup unmount → mount; the abort + full teardown
  make this safe by construction.
- Deps: `@conciv/embed`. Peer: `react >=16.8` (+ `@types/react` optional). Build: tsdown, plain TS
  (no JSX needed).

### 3. `@conciv/preact`

Same component via `preact/hooks`. Peer `preact >=10`. Otherwise identical (~40 lines).

## No plugin required

The component is self-sufficient like `<TanStackDevtools />`: rendering it mounts the widget, which
talks to the conciv server at `apiBase` (prop, else global/meta/`?core=` resolution). The dev server
still comes from the `@conciv/it` plugin or the CLI, but the component does not depend on plugin
script injection. If a host runs both plugin auto-inject and the component, the singleton guard
keeps one widget and warns.

## Publishing

- Both packages: `publishConfig.access: public`, `homepage: https://conciv.dev`, `repository` block
  with `directory`, added to `PUBLIC_PACKAGES` in `packages/publish/src/guards.ts`, joined to the
  fixed `@conciv/*` version line. One changeset covers the set.
- npm OIDC cannot create new packages: both need the known manual first-publish + per-package
  trusted-publisher bootstrap.

## Testing

Real browser (Playwright/Chromium), never jsdom; assert observable behavior only.

- `@conciv/embed`: IT for `createConciv` — mount renders widget, unmount removes shadow root and
  stops the page plane, unmount-during-mount aborts cleanly, double mount warns and stays single.
  Runs against the prebuilt bundle per existing embed IT conventions.
- `@conciv/react` / `@conciv/preact`: IT with a minimal vite-built host fixture (inside the package,
  not an example app) importing built dists. Assert: widget appears on render; removing the
  component removes the widget; StrictMode double-mount yields exactly one widget.
- Follow-up (not blocking): add a React-wrapper consumer to the e2e consumer suite.

## Out of scope

- Reverse portals for host-framework content inside the widget (custom FAB, custom tool cards).
- Vue/Svelte wrappers.
