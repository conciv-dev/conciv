# @conciv/solid-streamdown

A SolidJS streaming-markdown renderer: a port of Vercel's streamdown (block memoization, incomplete-markdown handling, token fade-in) onto Solid + the unified pipeline. Encapsulated so the widget can swap it without churn.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Interface

- `package.json:exports` - `.` (`dist/solid-streamdown.js`) and `./styles.css` (`src/styles.css`).
- `tsdown.config.ts` - library build of `src/solid-streamdown.tsx` to `solid-streamdown.js`, ES format; its dependencies and the `solid-js` peer stay external (tsdown's default).
- `vitest.config.ts` - `vite-plugin-solid` and `concivTest()`.
- Source: [src](./src/README.md).

## Invariants

- None

## Side Effects

- The package root (configs and manifest) has none. At runtime `Streamdown` sets the `--sd-caret` CSS variable on its root while animating. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/solid-streamdown` from the repo root (turbo builds the package and its dependencies first)
