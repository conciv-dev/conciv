# @conciv/mascot-react

The conciv robot mascot as a React compound component over the framework-free `@conciv/mascot`
service: the same compound API and the same slots as `@conciv/mascot/solid`.

```tsx
import {Mascot} from '@conciv/mascot-react'
import {steamEffect} from '@conciv/mascot/effects/steam'

const mountSteam = () => steamEffect

const SteamingRobot = ({busy}: {busy: boolean}) => (
  <Mascot className="size-16" working={busy} follow>
    <Mascot.Head />
    <Mascot.Antenna follow={false} />
    <Mascot.Effect mount={mountSteam} />
  </Mascot>
)
```

It follows React's own conventions:
`className` instead of `class`, and `style` as a camelCased object rather than Solid's kebab-cased
one. Both wrappers are mechanical: all sequencing lives in the core service.

In React, `mount` is a dependency: a new function identity remounts the effect, which drains the
particles in flight and starts them again. That is what you want when the effect really changed, so
keep `mount` stable otherwise — a module-level constant as above, or `useCallback` over the values it
closes over. Solid reads `mount` inside its own tracked scope, so an inline arrow there is fine.

## Interface

- `package.json:exports` - `.` only: [src](./src/README.md).
- `package.json:dependencies` - `@conciv/mascot`, reached only through `.`, `./adapter` and `./effects/binary`.
- `tsdown.config.ts:entry` - `src/index.ts` (unbundled, ESM).
- Tests: `tests/unit/` (packed install and publish surface) and `tests/browser/` (React wrapper in Chromium).

## Invariants

- `package.json:peerDependencies` - `react` `>=18`.

## Side Effects

- None at import; the root component drives GSAP tweens on its layer elements through the core service.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/mascot-react` from the repo root (turbo builds the package and its dependencies first)
- Run: `pnpm exec turbo run typecheck --filter=@conciv/mascot-react` from the repo root (turbo builds the package and its dependencies first)
