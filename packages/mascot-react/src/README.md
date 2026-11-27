# mascot-react/src

## Overview

The React compound component over the core service (`mascot-react.ts`): `Mascot` with `Head`, `Eyes`, `Antenna`, `Binary` and `Effect` slots. Built to `dist` by `vite.config.ts`.

## Invariants

- `mascot-context.ts:useMascotContext` - throws `a mascot part can only render inside <Mascot />` outside the root.
- `use-mascot.ts` - a second component claiming the same part throws `partAlreadyProvided`.
- `mascot-effect.tsx:EffectHost` - a new `mount` function identity remounts the effect.

## Side Effects

- `use-mascot.ts:useMascotHost` - creates the core service once (`useState`) and calls `service.update` with the root props.
- `mascot-root.tsx:MascotRoot` - binds the root element through the service ref and calls `rootProps.release(node)` on ref cleanup.

## Verification

- Run: `pnpm exec turbo run typecheck --filter=@conciv/mascot-react` from the repo root (turbo builds the package and its dependencies first)
