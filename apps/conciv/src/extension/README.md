# extension

## Overview

Mounts `@conciv/extension` extensions into the app: instance creation, slot surfaces, error boundaries with fallbacks, panel view collection and the pane grab API.

## Interface

- `createInstances(extensions)` (`create-instances.ts`): calls each `extension.__client?.()` and returns `ExtensionInstance[]`
- `ExtensionInstance` type, `ExtensionSurface({name, instances})` (`extension-slots.tsx`): renders every instance into a named `ExtensionSlot` via `MountedExtension`
- `ExtensionBoundary` (`extension-boundary.tsx`): `ErrorBoundary` plus `Suspense` with fallback `silent` | `tab` | `card` | `chip`
- `guardedComponent`, `guardedToolCards`, `guardedAttachmentCards` (`extension-boundary.tsx`): wrap extension tool and attachment renderers in boundaries
- `collectViews(instances)`, `PanelView` (`extension-views.ts`): flattens each extension's `views` with its instance
- `makePaneGrabApi(staging, provider?)` (`pane-grab.ts`): `GrabApi` from the provider or `@conciv/page` `grabApi`, plus pane staging

## Invariants

- `create-instances.ts:createInstances`: an extension whose `__client` throws is logged and dropped; the others still mount
- `extension-boundary.tsx:ExtensionBoundary`: a crash in one extension renders only its fallback and never unmounts the host; `tab` fallback offers retry and refocuses
- `extension-slots.tsx:ExtensionSurface`: slot surfaces use the `silent` fallback

## Side Effects

- `create-instances.ts:createInstances`: `console.error` when an extension fails to mount
- `extension-boundary.tsx:reportCrash`: `console.error` with the extension name and error

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
