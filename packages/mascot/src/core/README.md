# mascot/src/core

## Overview

The framework-free mascot service. `createMascot` binds the head, eyes and antenna layers and an effect host, then sequences pose, activity, gaze and effects with GSAP. The skin, curve geometry and tip-anchor math live here too.

## Interface

- `core.ts` is the `@conciv/mascot` entry; `adapter.ts` the `./adapter` entry framework wrappers build on.
- Subdirectories: [effects](./effects/README.md), [parts](./parts/README.md).

## Invariants

- `mascot.ts:followTarget` - no gaze channel is followed while `working` or under reduced motion.
- `mascot.ts` - under `reduceMotion()` the pose is set with `pose.set` instead of animated.
- `mascot.ts:createMascot` - after `destroy()` the service ignores further updates and registrations.
- `slot-contract.ts:partAlreadyProvided` - error `mascot part '<part>' is already provided; render exactly one <Mascot.X>`.

## Side Effects

- `mascot.ts:watchVisibility` - creates an `IntersectionObserver` on the stage when available; `teardown` disconnects it.
- `mascot.ts:teardown` - disposes the controllers and puts the antenna back in place of the lean wrapper.
- `stage-sheet.ts:installStageSize` - appends a stage `CSSStyleSheet` to the root's `adoptedStyleSheets` unless one is already adopted there.
- `config.ts:reduceMotion` - reads the `prefers-reduced-motion` media query.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/mascot` from the repo root (turbo builds the package and its dependencies first)
- Run: `pnpm exec turbo run typecheck --filter=@conciv/mascot` from the repo root (turbo builds the package and its dependencies first)
