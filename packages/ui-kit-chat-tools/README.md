# @conciv/ui-kit-chat-tools

The conciv tool-card vocabulary: concrete tool-call cards (Bash, Edit, Read, Search, Todo,
apply_patch, …) built on `@conciv/ui-kit-chat`'s tool-building primitives and
`@conciv/ui-kit-system`. `@conciv/ui-kit-chat` stays tool-agnostic; this package knows the tools.

Part of [conciv](https://github.com/conciv-dev/conciv). It ships as a dependency of the
umbrella package; install that:

```sh
npm install -D @conciv/it
```

## Overview

Package root: tsdown library build with declarations; unit tests in node (`test/unit`).

## Interface

- `exports['.']` (`package.json`): ./dist/ui-kit-chat-tools.js; publishes only dist
- `scripts` (`package.json`): build (`tsdown`), typecheck, test (`vitest run`), publint, attw
- `tsdown.config.ts`: entry src/ui-kit-chat-tools.tsx, with `unplugin-solid/rolldown`
- `vitest.config.ts`: `vite-plugin-solid` plus `concivTest()`
- `uno.config.ts`: `presetConciv()` over this package and ../ui-kit-chat/src and ../ui-kit-system/src
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - the barrel and its primitives and styled cards

## Invariants

- `exports` (`package.json`): only the root entry is public
- Its dependencies (@conciv/\*, zod, es-toolkit, lucide-solid) and the solid-js peer are not bundled (tsdown's default)

## Side Effects

- `build` script (`package.json`): writes dist/

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat-tools` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/ui-kit-chat-tools && pnpm typecheck`, then `pnpm lint` at the repo root
