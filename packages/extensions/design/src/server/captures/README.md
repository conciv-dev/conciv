# design/src/server/captures

## Overview

tabCapture calls the page-side capture function named by `captureDef.name`, passing width, height and a timeout. It validates the reply with zod and decodes the base64 PNG. It also exposes a clear operation that sends `{clear: true}` to the same page call.

## Interface

- `tabCapture` (`tab.ts`): Capture named 'tab' with `capture({width,height,page})` returning raster, viewport, route and components, and `clear({page})`

## Invariants

- The page response must match ClientCaptureSchema (image, width, height, route, recursive LiveComponent tree), otherwise zod `.parse` throws (`tabCapture`, `tab.ts`)
- The capture timeout equals `TOLERANCES.frameSettleMs + TOLERANCES.captureBudgetMs` (`tabCapture`, `tab.ts`)

## Side Effects

- Makes RPC calls to the browser page via `page.call(captureDef.name, ...)` for capture and clear (`tabCapture`, `tab.ts`)

## Verification

- Run: `pnpm exec turbo run typecheck lint --filter=@conciv/extension-design` from the repo root (turbo builds the package and its dependencies first) (the package has no `test` script)
