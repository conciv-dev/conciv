# mascot/src/core/effects

## Overview

The antenna-tip effects. Each file exports one `EffectMount`; `effect.ts` defines the effect contract (an `EffectMount` takes `{host, stage, antenna, skin}` and returns a handle with `start`, `stop(onRested)`, `rest`, `remove` and optional `anchor`, `replan`) and `effect-support.ts` holds the shared emitter, canvas and frame-loop helpers.

## Invariants

- `effect-support.ts:readPlacedTip` - throws `a tip emitter needs inline left and top in pixels before it can be anchored` when the element has no pixel `left`/`top`.
- `effect-support.ts:createTipEmitter.stop` - a second `stop` during an exit is ignored; the element is removed and `onRested` called when the exit tween completes.
- `effect-support.ts:antennaScaleFactor` - returns 1 when the antenna has no size.

## Side Effects

- `effect-support.ts:createTipEmitter` - appends the emitter element to the host and removes it on `rest`/`remove`; runs GSAP tweens (`enterFromTip`, `exitIntoTip`).
- `effect-support.ts:runFrameLoop` - adds a callback to `gsap.ticker` and returns its removal.
- `effect-support.ts:createSparkCanvas` - creates a `<canvas>` element and 2D context.
- `spark-fountain.ts` - uses `Math.random`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/mascot` from the repo root (turbo builds the package and its dependencies first)
- Run: `pnpm exec turbo run typecheck --filter=@conciv/mascot` from the repo root (turbo builds the package and its dependencies first)
