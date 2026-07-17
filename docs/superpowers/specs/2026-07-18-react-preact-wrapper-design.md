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

function createConciv(init: ConcivInit): {mount(el: HTMLElement): Promise<void>, unmount(): void}
```

Exactly the `TanStackDevtoolsCore` shape: `mount(el)` mounts into a caller-provided element (the impl attaches the shadow root to a disposable inner div so remount works — `attachShadow` is once-per-element); no page-level singleton — two handles are two widgets, the caller's choice. `mount()` resolves when the widget has booted and rejects on load/boot failure (after cleanup + logging). The script-tag `mountConciv` keeps its own body-appended element and idempotence marker.

- `mount(el)`:
  - `typeof document === 'undefined'` → return (SSR no-op); a second mount on a mounted handle is a
    no-op (per-handle state machine `unmounted → mounting → mounted`, `AbortController` per mount).
  - Dynamic `import('./mount-impl.js')` carries the heavy graph (router app, ui-kits, page plane).
    The static `mount.js` entry stays import-safe for SSR: no top-level DOM access, no heavy deps.
  - Failure → cleanup, one `console.error`, promise rejects.
- `unmount()`:
  - Aborts an in-flight mount, then runs the fault-isolated teardown: Solid `render()` dispose
    (currently dropped in `mount.tsx:43`), page-plane `dispose`, `queryClient.clear()`, page-driver
    `dispose` (console patch + window listeners), inner-host removal, `__TSR_ROUTER__` restore,
    `__CONCIV_*` global clears.
  - No-op when unmounted (React cleanup may run without a mount having happened).
- Config threading: boot uses `init.apiBase ?? resolveApiBase()` (with `?core=` constrained to
  loopback/same-origin) and `init.settings ?? parseConcivSettings(metaContent('pw-widget'))`.
  Existing meta/query resolution stays the fallback, so the script-tag path is unchanged.
- `mountConciv(extensions)` creates its own body-appended element (with a synchronous
  `data-conciv-script-root` idempotence marker) and mounts into it — script-tag behavior unchanged.

### 2. `@conciv/react`

New package `packages/react`:

- Exports `ConcivWidget(props: ConcivInit): null` and the props type. `'use client'` banner on the
  entry.
- Renders a ref'd anchor `<div>` and mounts the core into it from an effect — the TanStack wrapper
  shape. The widget's inner host is `position: fixed`, so the overlay is viewport-anchored
  regardless of tree placement. Props are fully reactive: the mount effect keys on a value-stable
  serialization of `apiBase`/`settings` plus the `extensions` array identity; any change tears down
  and reboots the widget with the new configuration (settings/extensions feed router creation at
  boot, so remount is the correct live-update). No `react-dom` dependency (`createElement` from
  `react`).
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
script injection. Running both plugin auto-inject and the component mounts two widgets — like any
duplicated component, that's the host's call; the READMEs say to pick one path.

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

- Reverse portals for host-framework content inside the widget (custom FAB, custom tool cards) —
  the future `<ConcivWidget>{children}</ConcivWidget>` slot; the anchor-element API leaves room for
  it without a breaking change.
- Vue/Svelte wrappers.
