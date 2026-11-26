# demo

## Overview

The interactive hero demo: a fake app preview whose elements can be grabbed, a scripted transcript, and an optional in-browser language model (transformers.js in a Web Worker) that turns an instruction into a CSS patch.

## Invariants

- `local-model.ts`: `env.allowLocalModels = false`, `env.useBrowserCache = true`
- `local-model.ts:loadModel`: reuses the pipeline when the same model id is already loaded
- `local-model.ts:instructionToPatch`: throws when the output has no JSON object or the chat template or generation is not a string
- `model.worker.ts`: errors are posted back as `load-error`/`run-error`, never thrown out of the worker

## Side Effects

- `local-model.ts:loadModel`: downloads model weights from the Hugging Face hub and caches them in the browser cache
- `use-local-model.ts:useLocalModel`: `new Worker(new URL('./model.worker.ts', import.meta.url), {type: 'module'})`
- `use-metered-connection.ts`: listens to `navigator.connection` `change`
- `demo.tsx`: `setTimeout` delays in the scripted flow

## Verification

- Run: `pnpm exec turbo run typecheck test --filter=site` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first)
