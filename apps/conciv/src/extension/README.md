# extension

## Overview

Creates the client instances of the `@conciv/extension` extensions a host still passes to the router (today only the iOS native shell's bridge). The app renders nothing of them except each extension's page-level `Surface`, through `shell/effects-surface.tsx`; tools, views, slots, commands, attachment cards and settings of extensions are no longer mounted. Plugins (`runtime/plugin`) are the way to add UI.

## Invariants

- `create-instances.ts:createInstances`: an extension whose `__client` throws is logged and dropped; the others still mount

## Side Effects

- `create-instances.ts:createInstances`: `console.error` when an extension fails to mount

## Verification

- Run: `pnpm exec turbo run typecheck lint test --filter=@conciv/app` from the repo root (turbo builds the package and its dependencies first)
