# @conciv/ui-kit-chat-tools

The conciv tool-card vocabulary: concrete tool-call cards (Bash, Edit, Read, Search, Todo,
apply_patch, page, ui, …) built on `@conciv/ui-kit-chat`'s tool-building primitives and
`@conciv/ui-kit-system`. `@conciv/ui-kit-chat` stays tool-agnostic; this package knows the tools.

Part of [conciv](https://github.com/conciv-dev/conciv). It ships as a dependency of the
umbrella package; install that:

```sh
npm install -D @conciv/it
```

## Overview

Package root: Vite library build plus tsc declarations; tests run in headless Chromium through Vitest browser mode.

## Interface

- `exports['.']` (`package.json`): ./dist/index.js; publishes only dist
- `scripts` (`package.json`): build (`vite build && tsc -p tsconfig.build.json`), typecheck, lint, test (`vitest run --passWithNoTests`), publint, attw
- `vite.config.ts`: `solidLibConfig` with entry src/index.tsx
- `vitest.config.ts`: browser project `ui-kit-chat-tools-browser` over test/**/*.browser.test.tsx
- `uno.config.ts`: `presetConciv()` over this package and ../ui-kit-chat/src and ../ui-kit-system/src
- Subdirectories:
  - src: [./src/README.md](./src/README.md) - the barrel and its primitives and styled cards

## Invariants

- `exports` (`package.json`): only the root entry is public
- `external` (`vite.config.ts`): @conciv/*, solid-js, zod, shiki and lucide-solid are not bundled

## Side Effects

- `build` script (`package.json`): writes dist/
- `vitest.config.ts`: tests launch headless Chromium

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/ui-kit-chat-tools` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/ui-kit-chat-tools && pnpm typecheck && pnpm lint`
