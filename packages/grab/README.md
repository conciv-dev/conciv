# @conciv/grab

The conciv element-grab contract: the grab data types
(`Grab`/`GrabPreview`/`DomPreview`/`ImagePreview`/`ElementSource`) and the `GrabActions` picker shape
shared by the widget and the page plugin.

Part of [conciv](https://github.com/conciv-dev/conciv). It ships as a dependency of the
umbrella package; install that:

```sh
npm install -D @conciv/it
```

## Invariants

- The grab data types are owned by `@conciv/frontend-plugin-api/grab`, this package's only runtime dependency; it
  re-exports them and adds the picker shape (`GrabActions`, `GrabProvider`) and two label helpers (`src/grab.ts`).
- `tsconfig.json` extends `@internal/tsconfig/tsconfig.web.json` (`lib: [ES2025, DOM, DOM.Iterable]`) with
  `types: []`.

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/grab` from the repo root (turbo builds the package and its dependencies first)
