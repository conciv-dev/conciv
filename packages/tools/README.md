# @conciv/tools

The `conciv_ui` agent tool and the Solid tool cards for `conciv_ui` and `open` (the `open` tool itself
comes from the engine's server plugin). Tools are declared with `defineTool` (`@conciv/protocol/chat-tool-types`).

Part of [conciv](https://github.com/conciv-dev/conciv).

## Overview

- [src/README.md](./src/README.md): tool definitions, sandbox wrappers and the card registry.
- [src/cards/README.md](./src/cards/README.md): `UiCard`, `OpenCard`.

## Invariants

- ESM only (`"type": "module"`, attw `esm-only`); only `dist` is published (`files`).
- `vite.config.ts` uses `emptyOutDir: false` because tsdown writes `dist/` first in the `build` script; the cards build keeps `solid-js`, `zod`, `lucide-solid` and every `@conciv/*` import external.
- `uno.config.ts` serves the UnoCSS lint rules only; the hosts that render the cards (the widget, storybook) scan `src/**` with their own uno config.
- `tsconfig.json` extends the Solid preset, so card `.tsx` code is type-checked with the DOM lib and Solid JSX alongside `src/**/*.ts` and `test/**/*.ts`.

## Side Effects

- `build` writes `dist/`. Tool runtime effects are in [src/README.md](./src/README.md).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/tools` from the repo root (turbo builds the package and its dependencies first)
