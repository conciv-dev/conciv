# extension-testkit/src/host

## Overview

Browser page for the test host. It mounts the extension under test (from a virtual module) inside a wired `HostApiProvider` with a composer, surface, view tabs, an attachment form and a fixture DOM, and picks elements through the click-based grab from `@conciv/plugin-testkit/host/grab`.

## Interface

- `index.html`: meta tags `conciv-api-base` / `conciv-session` with placeholders `__CONCIV_API_BASE__` / `__CONCIV_SESSION__`
- `host-entry.tsx`: calls `startHost(extension)` with the `virtual:conciv-extension-under-test` default export
- `startPageHost(extension)` (`page-host.ts`, the `./host` export): logs the page in like the widget does (stored token, else the `#conciv_otp` magic link code), runs the extension's client factory, and serves the page plane on the `conciv-session` push channel with the extension's client tools and effects, as the widget does; an extension's own host page (for example a React app) calls it directly
- `startHost(extension)` (`host-runtime.tsx`): runs `startPageHost`, then builds the browser RPC client, HostApiProvider and a `QueryClientProvider` from `@conciv/client` (as the widget root does) and renders the composer slot, surface, views, attach form and `FixtureElement`
- `MountedViews` / `MountedComposerSlot` / `AttachFixtureForm` (`host-runtime.tsx`); `MountedViews` renders the active view's `actions` above its `Component`, as the panel header does
- `testkit:attach` CustomEvent (`host-runtime.tsx`): detail {name, type, text} attaches a File
- `FixtureElement` (`fixture-element.tsx`): 'Comment target', 'Add marker' and 'Fixture input' controls
- `virtual:conciv-extension-under-test` (`virtual-extension.d.ts`): default export typed `AnyExtension`

## Invariants

- `startPageHost` (`page-host.ts`): an empty `conciv-session` serves no page plane
- `startHost` (`host-runtime.tsx`): `testkit:attach` events failing the zod `attachDetail` schema are ignored; an empty `conciv-session` gives sessionId null
- `applyWidth` (`host-runtime.tsx`): composer width clamped to [80, 1600]

## Side Effects

- `startPageHost` (`page-host.ts`): installs the React bridge and opens the session push socket

- `installStorageFixtures` (`host-runtime.tsx`): adds a ~10KB script and a ~600KB `style[data-conciv-fonts]` to document.head
- `startHost` (`host-runtime.tsx`): appends a `div[data-conciv-root].dark` and a fixture root to document.body; listens for `testkit:attach`
- `openEditor` (`host-runtime.tsx`): calls `rpc.editor.open`
- `showToast` / `showAttachment` / `showCardAttachment` (`host-runtime.tsx`): append elements to body

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-testkit` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/extension-testkit && pnpm typecheck && pnpm lint`
