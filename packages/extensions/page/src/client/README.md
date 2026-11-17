# page/src/client

## Overview

Only the snapdom capture plugins are left here, for the design extension (`@conciv/extension-design`, `src/client/capture.ts`, `src/client/frame-capture.ts`). The page plugin keeps its own copy (`@conciv/builtin-plugins`, `src/page/capture-plugins.ts`).

## Interface

- `capturePlugins` (`capture-plugins.ts`): the `SnapdomPlugin` list every capture passes: `keep-body-margins` and `keep-one-line-text` (a box snapdom pinned to one line passes `text-wrap-mode: nowrap` down to its descendants, which snapdom's tag reset would otherwise set back to `wrap`)

## Side Effects

- `capturePlugins` (`capture-plugins.ts`) changes the snapdom clone's styles, not the live DOM

## Verification

- Run: `pnpm exec turbo run typecheck --filter=@conciv/extension-page` from the repo root
