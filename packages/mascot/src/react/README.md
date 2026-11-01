# mascot/src/react

## Overview

The React compound component over the core service: `Mascot` with `Head`, `Eyes`, `Antenna`, `Binary` and `Effect` slots. Built to `dist/react` by `tsdown.react.config.ts`.

## Interface

- `index.ts:Mascot` - `MascotRoot` with `Head`, `Eyes`, `Antenna`, `Binary`, `Effect` attached.
- `index.ts` - re-exports `useMascotContext`, the prop types, the core config types, `robotLayers` and `robotSkin`.
- `mascot-root.tsx:MascotRoot` - root element; `use-mascot.ts:useMascotHost` creates the service and part claims.
- `mascot-effect.tsx:MascotEffect` - mounts `props.mount()` as an effect; `mascot-binary.tsx:MascotBinary` mounts the binary effect with `curve`.
- `mascot-props.ts:MascotProps` / `MascotLayerProps` / `MascotFollowPartProps` / `MascotBinaryProps`, `composeRefs`, `mergeStyle`.
- `use-layout-effect.ts:useIsomorphicLayoutEffect` - `useEffect` without a `document`, `useLayoutEffect` otherwise.

## Invariants

- `mascot-context.ts:useMascotContext` - throws `a mascot part can only render inside <Mascot />` outside the root.
- `use-mascot.ts` - a second component claiming the same part throws `partAlreadyProvided`.
- `mascot-effect.tsx:EffectHost` - a new `mount` function identity remounts the effect.

## Side Effects

- `use-mascot.ts:useMascotHost` - creates the core service once (`useState`) and calls `service.update` with the root props.
- `mascot-root.tsx:MascotRoot` - binds the root element through the service ref and calls `rootProps.release(node)` on ref cleanup.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/mascot` from the repo root (turbo builds the package and its dependencies first) (vitest, then Playwright on `tests/e2e`)
- Run: `pnpm exec turbo run typecheck --filter=@conciv/mascot` from the repo root (turbo builds the package and its dependencies first)
