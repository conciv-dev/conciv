# extension

## Overview

Mounts `@conciv/extension` extensions into the app: instance creation, slot surfaces, boundary-wrapped tool and attachment renderers and panel view collection.

## Interface

- `createInstances(extensions)` (`create-instances.ts`): calls each `extension.__client?.()` and returns `ExtensionInstance[]`
- `ExtensionInstance` type, `ExtensionSurface({name, instances})` (`extension-slots.tsx`): renders every instance into a named `ExtensionSlot` via `MountedExtension`
- `guardedComponent`, `guardedToolCards`, `guardedAttachmentCards` (`extension-boundary.tsx`): wrap extension tool and attachment renderers in boundaries
- `collectViews(instances)`, `PanelView` (`extension-views.ts`): flattens each extension's `views` with its instance

## Invariants

- `create-instances.ts:createInstances`: an extension whose `__client` throws is logged and dropped; the others still mount
- `extension-slots.tsx:ExtensionSurface`: slot surfaces use the `silent` fallback

## Side Effects

- `create-instances.ts:createInstances`: `console.error` when an extension fails to mount

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
