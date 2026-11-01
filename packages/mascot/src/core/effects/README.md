# mascot/src/core/effects

## Overview

The antenna-tip effects. Each file exports one `EffectMount`; `effect.ts` defines the effect contract and `effect-support.ts` holds the shared emitter, canvas and frame-loop helpers.

## Interface

- `effect.ts:EffectMount` - `(context: EffectContext) => EffectHandle`; `EffectContext` is `{host, stage, antenna, skin}`.
- `effect.ts:EffectHandle` - `start()`, `stop(onRested)`, `rest()`, `remove()`, optional `anchor(tip)`.
- `effect-support.ts:createTipEmitter` / `createTimelineEmitter` / `createNozzleEmitter` / `createParticleNozzleEmitter` - build an `EffectHandle` around an element anchored at the antenna tip.
- `effect-support.ts:createTipShell` / `createSparkCanvas` / `sparkCanvasGeometry` / `antennaScaleFactor` / `runFrameLoop` - DOM, canvas and ticker helpers.
- `effect-support.ts:WILL_CHANGE_STYLE` / `SPARK_COLOR` / `SPARK_ACCENT_COLOR` / `TIP_ORIGIN` / `noEmitterWork` - shared constants.
- `binary.ts:binaryEffect` / `configureBinaryEffect({curve})` - rising binary digits along a `CurveStyle` path.
- `matrix.ts:matrixEffect`, `thought-cloud.ts:thoughtCloudEffect`, `pixel-bubbles.ts:pixelBubblesEffect`, `signal-rings.ts:signalRingsEffect`, `speech-bubble.ts:speechBubbleEffect`, `steam.ts:steamEffect` - tip effects.
- `spark.ts:sparkEffect`, `spark-burst.ts:sparkBurstEffect`, `spark-fountain.ts:sparkFountainEffect`, `satellite.ts:satelliteEffect`, `led-cone.ts:ledConeEffect`, `tick-ring.ts:tickRingEffect`, `signal-bars.ts:signalBarsEffect`, `heart.ts:heartEffect`, `notes.ts:notesEffect` - tip effects.
- Exported tuning constants such as `steam.ts:PUFF_COUNT`, `matrix.ts:MATRIX_GLYPHS`, `notes.ts:NOTE_GLYPHS`, `pixel-bubbles.ts:PIXEL_BUBBLES_COUNT`.

## Invariants

- `effect-support.ts:placedTipOf` - throws `a tip emitter needs inline left and top in pixels before it can be anchored` when the element has no pixel `left`/`top`.
- `effect-support.ts:createTipEmitter.stop` - a second `stop` during an exit is ignored; the element is removed and `onRested` called when the exit tween completes.
- `effect-support.ts:antennaScaleFactor` - returns 1 when the antenna has no size.

## Side Effects

- `effect-support.ts:createTipEmitter` - appends the emitter element to the host and removes it on `rest`/`remove`; runs GSAP tweens (`enterFromTip`, `exitIntoTip`).
- `effect-support.ts:runFrameLoop` - adds a callback to `gsap.ticker` and returns its removal.
- `effect-support.ts:createSparkCanvas` - creates a `<canvas>` element and 2D context.
- `spark-fountain.ts` - uses `Math.random`.

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/mascot` from the repo root (turbo builds the package and its dependencies first) (vitest, then Playwright on `tests/e2e`)
- Run: `pnpm exec turbo run typecheck --filter=@conciv/mascot` from the repo root (turbo builds the package and its dependencies first)
