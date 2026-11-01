# extension-testkit/src/host

## Overview

Browser page for the test host. It mounts the extension under test (from a virtual module) inside a wired `HostApiProvider` with a composer, surface, view tabs, an attachment form and a fixture DOM, and includes a click-based grab implementation.

## Interface

- `index.html`: meta tags `conciv-api-base` / `conciv-session` with placeholders `__CONCIV_API_BASE__` / `__CONCIV_SESSION__`
- `host-entry.tsx`: calls `startHost(extension)` with the `virtual:conciv-extension-under-test` default export
- `startHost(extension)` (`host-runtime.tsx`): builds the RPC client and HostApiProvider and renders the composer slot, surface, views, attach form and `FixtureElement`
- `MountedViews` / `MountedComposerSlot` / `AttachFixtureForm` (`host-runtime.tsx`)
- `testkit:attach` CustomEvent (`host-runtime.tsx`): detail {name, type, text} attaches a File
- `FixtureElement` (`fixture-element.tsx`): 'Comment target', 'Add marker' and 'Fixture input' controls
- `makeHostGrab(doc)` / `makeImageHostGrab(dataUrl)` (`grab.ts`)
- `virtual:conciv-extension-under-test` (`virtual-extension.d.ts`): default export typed `AnyExtension`

## Invariants

- `makeHostGrab` (`grab.ts`): only elements with or inside `[data-conciv-source]` can be picked; `cancel` resolves the pending pick with null
- `parseSource` (`grab.ts`): `filePath:line:column` split on the last two colons
- `startHost` (`host-runtime.tsx`): `testkit:attach` events failing the zod `attachDetail` schema are ignored; an empty `conciv-session` gives sessionId null
- `applyWidth` (`host-runtime.tsx`): composer width clamped to [80, 1600]

## Side Effects

- `installStorageFixtures` (`host-runtime.tsx`): adds a ~10KB script and a ~600KB `style[data-conciv-fonts]` to document.head
- `startHost` (`host-runtime.tsx`): appends a `div[data-conciv-root].dark` and a fixture root to document.body; listens for `testkit:attach`
- `openEditor` (`host-runtime.tsx`): calls `rpc.editor.open`
- `showToast` / `showAttachment` / `showCardAttachment` (`host-runtime.tsx`): append elements to body
- `makeHostGrab` (`grab.ts`): capture-phase document click listener

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-testkit` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/extension-testkit && pnpm typecheck && pnpm lint`
