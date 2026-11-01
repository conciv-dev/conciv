# mascot/src/solid

## Overview

The Solid compound component over the core service, with the same slots as the React wrapper. Built by `tsdown.config.ts` and, as preserved JSX, by `tsdown.solid-source.config.ts` into `dist/solid`.

## Interface

- `index.ts:Mascot` - `MascotRoot` with `Head`, `Eyes`, `Antenna`, `Binary`, `Effect` attached.
- `index.ts` - re-exports `useMascotContext`, the prop types, the core config types, `robotLayers` and `robotSkin`.
- `mascot-root.tsx:MascotRoot` - root element; `use-mascot.ts:createMascotHost` creates the service and slot tracking (`MascotSlots`).
- `mascot-effect.tsx:MascotEffect` / `mascot-binary.tsx:MascotBinary` - effect slots.
- `mascot-props.ts:MascotProps` / `MascotLayerProps` / `MascotFollowPartProps` / `MascotBinaryProps`, `composeRefs`, `mergeStyle`.

## Invariants

- `mascot-context.ts:useMascotContext` - throws `a mascot part can only render inside <Mascot />` outside the root.
- `use-mascot.ts:createMascotHost` - a second component claiming the same part throws `partAlreadyProvided`.

## Side Effects

- `use-mascot.ts:createMascotHost` - creates the core service and calls `service.destroy()` in `onCleanup`.
- Part components bind DOM elements through the service refs.

## Verification

- Run: `cd packages/mascot && pnpm test` (vitest, then Playwright on `tests/e2e`)
- Run: `cd packages/mascot && pnpm typecheck`
