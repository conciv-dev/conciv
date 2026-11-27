# mascot/src/solid

## Overview

The Solid compound component over the core service (`solid.ts`: `Mascot` with `Head`, `Eyes`, `Antenna`, `Binary` and `Effect` slots), with the same slots as the React wrapper. Built by `vite.config.ts` and, as preserved JSX, by its `source` environment into `dist/solid`.

## Invariants

- `mascot-context.ts:useMascotContext` - throws `a mascot part can only render inside <Mascot />` outside the root.
- `use-mascot.ts:createMascotHost` - a second component claiming the same part throws `partAlreadyProvided`.

## Side Effects

- `use-mascot.ts:createMascotHost` - creates the core service and calls `service.destroy()` in `onCleanup`.
- Part components bind DOM elements through the service refs.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/mascot` from the repo root (turbo builds the package and its dependencies first)
- Run: `pnpm exec turbo run typecheck --filter=@conciv/mascot` from the repo root (turbo builds the package and its dependencies first)
