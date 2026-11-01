# @conciv/solid-streamdown

A SolidJS streaming-markdown renderer: a port of Vercel's streamdown (block memoization, incomplete-markdown handling, token fade-in) onto Solid + the unified pipeline. Encapsulated so the widget can swap it without churn.

Part of [conciv](https://github.com/conciv-dev/conciv).

## Interface

- `package.json:exports` - `.` (`dist/index.js`) and `./styles.css` (`src/styles.css`).
- `vite.config.ts` - library build of `src/index.tsx` to `index.js`, ES format; `solid-js`, `solid-js/web`, `solid-js/store` and `shiki` external.
- Source: [src](./src/README.md).

## Invariants

- None

## Side Effects

- None

## Verification

- Run: `cd packages/solid-streamdown && pnpm test`
