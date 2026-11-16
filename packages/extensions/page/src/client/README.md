# page/src/client

## Overview

What is left of the old page extension's browser half: the agent cursor simulator (simulator.ts, simulator-look.ts, agent-cursor.tsx) and the snapdom capture plugins. The page tool bodies, the tool cards and the grab attachment card live in `@conciv/builtin-plugins` (`src/page`).

## Interface

- `mountSimulator`, `startTask`, `touchTask`, `endTask`, `endRun`, `acceptQueue`, `queueStopped`, `arriveAt`, `landQueued`, `finishQueue`, `pointAt`, `simulateClick`, `setNativeValue`, `simulateFill`, `typeByEvents`, `typeByCommands` (`simulator.ts`): the agent cursor simulator and its queue beats
- `aimCursor`, `dropCursor`, `pressCursor`, `windowAt`, `pageAt`, `cursorElement`, `AimedCursors`, `CursorLook` (`agent-cursor.tsx`): the drawn agent cursors
- the `cv-sim-*` class names, `AGENT_BLUE`, `AGENT_PURPLE`, `SIMULATOR_CSS` (`simulator-look.ts`)
- `capturePlugins` (`capture-plugins.ts`): the `SnapdomPlugin` list every capture passes: `keep-body-margins` and `keep-one-line-text` (a box snapdom pinned to one line passes `text-wrap-mode: nowrap` down to its descendants, which snapdom's tag reset would otherwise set back to `wrap`)

## Side Effects

- `capturePlugins` (`capture-plugins.ts`) changes the snapdom clone's styles, not the live DOM

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension-page` from the repo root (turbo builds the package and its dependencies first)
