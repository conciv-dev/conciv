# mascot/src/core/parts

## Overview

The three GSAP controllers the mascot service drives: pose (rest and awake), activity (bob, throb, blink while working, plus mounted effects) and follow (eye and antenna gaze toward the pointer).

## Invariants

- `pose.ts:createPoseController` - a new pose kills the running pose timeline first.
- `activity.ts:createActivityController` - the work timeline repeats forever (`repeat: -1`) and is paused while the stage is not visible (`setVisible(false)`).

## Side Effects

- `follow.ts:createFollowController` - adds a passive `pointermove` listener on `window` while following and removes it when it stops.
- `follow.ts` - passive `scroll` (capture) and `resize` listeners on `window` to drop cached measurements.
- `follow.ts:wrapForLean` - inserts a wrapper element around the antenna.
- `pose.ts` / `activity.ts` - create and kill GSAP timelines and tweens on the part elements.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/mascot` from the repo root (turbo builds the package and its dependencies first)
- Run: `pnpm exec turbo run typecheck --filter=@conciv/mascot` from the repo root (turbo builds the package and its dependencies first)
