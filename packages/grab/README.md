# @conciv/grab

The conciv element-grab contract: the grab data types
(`Grab`/`StagedGrab`/`GrabPreview`/`DomPreview`/`ImagePreview`/`ElementSource`) and the `GrabApi` capability surface
shared by the widget and the extension contract.

Part of [conciv](https://github.com/conciv-dev/conciv). It ships as a dependency of the
umbrella package; install that:

```sh
npm install -D @conciv/it
```

## Interface

- [src/README.md](./src/README.md): all types, `sourceLabel`, `composeGrabText`, and the grab-attachment serializer.
- `exports["."]` -> `dist/grab.js` (from `src/grab.ts`); `exports["./grab-attachment"]` -> `dist/grab-attachment.js` (`GRAB_MIME`, `grabToPayload`, `grabToFile`, `parseGrabPayload`, `MAX_PAYLOAD_BYTES`, `imagePreviewBudget`) (`package.json`).
- Only runtime dependency: `zod`. Scripts: `build` (`tsdown`), `typecheck`, `lint` (`oxlint`), `test` (`vitest run --passWithNoTests`), `publint`, `attw`.

## Invariants

- `tsconfig.json` uses `lib: [ES2024, DOM, DOM.Iterable]`, `types: []`, and includes only `src/**/*.ts`.
- Payload size and shape rules are in [src/README.md](./src/README.md#invariants).

## Side Effects

- None

## Verification

- Run: `cd packages/grab && pnpm test`
