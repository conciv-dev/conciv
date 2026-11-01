# mascot/src/core

## Overview

The framework-free mascot service. `createMascot` binds the head, eyes and antenna layers and an effect host, then sequences pose, activity, gaze and effects with GSAP. The skin, curve geometry and tip-anchor math live here too.

## Interface

- `index.ts` - the `@conciv/mascot` entry: `createMascot`, `robotSkin`, `robotLayers` and the config, effect, part and curve types.
- `mascot.ts:createMascot(initial, skin = robotSkin)` - returns a `MascotService` with `update`, `registerParts`, `mountEffect`, `unmountEffect`, `connect`, `destroy`.
- `mascot.ts:MascotConnect` - `getRootProps`, `getHeadProps`, `getEyesProps`, `getAntennaProps`, `getEffectHostProps(id)`, each `{style, ref, release}`.
- `config.ts:MascotConfig` / `MascotState` (`'rest' | 'awake'`) / `MascotFollow` / `MascotActivity` - config types; `followChannels`, `activityChannels`, `reduceMotion` and the timing constants (`THROB_BEATS`, `HEAD_BOB_BEATS`, `BLINK_BEATS`, `WORK_CYCLE_S`, ...).
- `skin.ts:MascotSkin` / `robotSkin` - layer images, origins, tip fractions and reference antenna size.
- `path.ts:CurveStyle` (`'straight' | 'arc' | 'hook' | 'fan' | 'auto'`), `measureEmitterRoom`, `resolveCurveStyle`, `emitterCurvePoints`, `stageViewportBounds`.
- `tip-anchor.ts:antennaTipAnchor` / `antennaTipInRoot` / `measureAntennaLayout` / `antennaOriginOffset` - antenna tip geometry.
- `tip-transition.ts:enterFromTip` / `exitIntoTip` - GSAP enter and exit tweens for effect elements.
- `layer-styles.ts:rootStyle` / `headStyle` / `eyesStyle` / `antennaStyle` / `effectHostStyle` - inline style records.
- `style-merge.ts:isGeometryProperty` / `kebabCaseProperty` / `camelCaseProperty` - style merge helpers (also a build entry).
- `slot-contract.ts:partAlreadyProvided` / `MascotPartName` - the one-slot-per-part error.
- `stage-sheet.ts:installStageSize` - adopts a shared stage stylesheet into the element's root.
- Subdirectories: [effects](./effects/README.md), [parts](./parts/README.md).

## Invariants

- `mascot.ts:followTarget` - no gaze channel is followed while `working` or under reduced motion.
- `mascot.ts` - under `reduceMotion()` the pose is set with `pose.set` instead of animated.
- `mascot.ts:createMascot` - after `destroy()` the service ignores further updates and registrations.
- `slot-contract.ts:partAlreadyProvided` - error `mascot part '<part>' is already provided; render exactly one <Mascot.X>`.

## Side Effects

- `mascot.ts:watchVisibility` - creates an `IntersectionObserver` on the stage when available; `teardown` disconnects it.
- `mascot.ts:teardown` - disposes the controllers and puts the antenna back in place of the lean wrapper.
- `stage-sheet.ts:installStageSize` - creates one `CSSStyleSheet` per document and appends it to `adoptedStyleSheets`.
- `config.ts:reduceMotion` - reads the `prefers-reduced-motion` media query.

## Verification

- Run: `cd packages/mascot && pnpm test` (vitest, then Playwright on `tests/e2e`)
- Run: `cd packages/mascot && pnpm typecheck`
