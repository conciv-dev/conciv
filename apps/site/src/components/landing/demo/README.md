# demo

## Overview

The interactive hero demo: a fake app preview whose elements can be grabbed, a scripted transcript, and an optional in-browser language model (transformers.js in a Web Worker) that turns an instruction into a CSS patch.

## Interface

- `Demo` (`demo.tsx`): the demo component, lazy-loaded by `Hero`
- `useDemo` (`use-demo.ts`): demo state
- `AppPreview({picking, onPick})` (`app-preview.tsx`), `Composer` (`composer.tsx`), `Transcript` (`transcript.tsx`), `MessageRow` (`message-row.tsx`), `GrabReference` (`grab-reference.tsx`), `GhostCursor` (`ghost-cursor.tsx`)
- `PICKABLES`, `pickScenario`, `DEFAULT_SCENARIO`, `GREETING`, `Scenario`, `Pickable`, `Message` (`demo-data.ts`)
- `MODELS`, `DEFAULT_MODEL`, `CssPatch`, `LoadProgress`, `RunResult`, `ModelWorkerRequest`, `ModelWorkerResponse` (`models.ts`)
- `loadModel(modelId, onProgress)`, `instructionToPatch(html, instruction)`, `getDevice()` (`local-model.ts`): transformers.js `pipeline` on `webgpu` or `wasm`
- `model.worker.ts`: worker handling `load` and run messages, replying `progress`, `ready`, `load-error`, `result`, `run-error`
- `useLocalModel()` (`use-local-model.ts`): owns the module Worker
- `useMeteredConnection()` (`use-metered-connection.ts`): true on `saveData` or cellular connections

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

- Run: `pnpm exec turbo run typecheck lint test --filter=site` from the repo root (turbo builds the package and its dependencies first)
