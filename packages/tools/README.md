# @conciv/tools

conciv agent tools: `conciv_ui`, `conciv_extensions`, the dev-server `server_*` tools and `open`, plus their Solid tool cards.
Tools are declared with `defineTool` (`@conciv/protocol/chat-tool-types`, `@conciv/extension/tool`).

Part of [conciv](https://github.com/conciv-dev/conciv).

## Interface

- [src/README.md](./src/README.md): tool definitions, sandbox wrappers and the card registry.
- [src/builtins/README.md](./src/builtins/README.md): `server_config`, `server_urls`, `server_resolve`, `server_graph`, `server_transform`, `server_reload`, `server_restart`, `open`.
- [src/cards/README.md](./src/cards/README.md): `UiCard`, `OpenCard`, `ExtensionsCard`.
- Exports (`package.json`): `.` -> `dist/tools.js`, `./defs` -> `dist/defs.js`, `./builtins` -> `dist/builtins.js`, `./cards` -> `dist/cards.js` (`browser` and `import` conditions), `./package.json`. No bin.
- Dependencies: `@conciv/extension`, `@conciv/extension-page`, `@conciv/protocol`, `@conciv/solid-diffs`, `@conciv/ui-kit-chat`, `@conciv/ui-kit-system`, `lucide-solid`, `zod`; peer `solid-js` ^1.9.13.
- Scripts: `build` (`tsdown && vite build && tsc -p tsconfig.cards.build.json`), `typecheck` (`tsconfig.json` and `tsconfig.cards.json`), `lint` (`oxlint`), `test` (`vitest run`), `publint`, `attw` (`--profile esm-only`).

## Invariants

- ESM only (`"type": "module"`, attw `esm-only`); only `dist` is published (`files`).
- `vite.config.ts` uses `emptyOutDir: false` because tsdown writes `dist/` first in the `build` script.
- Card `.tsx` code is type-checked separately with the DOM lib and Solid JSX (`tsconfig.cards.json`); `tsconfig.json` covers only `src/**/*.ts` and `test/**/*.ts`.

## Side Effects

- `build` writes `dist/`. Tool runtime effects are in [src/README.md](./src/README.md) and [src/builtins/README.md](./src/builtins/README.md).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/tools` from the repo root (turbo builds the package and its dependencies first)
