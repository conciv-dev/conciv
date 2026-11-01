# @conciv/ui-kit-system

The conciv design system: SolidJS primitives (Button plus Ark-UI-based Collapsible,
HoverCard, ScrollArea, Combobox, Progress) styled with the shared UnoCSS preset, so every
surface looks and behaves identically. Most components are viewable in Storybook.

The full component list (Dialog, Select, Menu, Popover, Tooltip/TooltipGroup, Toast, Tabs,
Switch, Slider, TextField/TextArea, VirtualJsonTree, ZoomableImage and more), the skin system
and the token exports are in [src/README.md](./src/README.md).

Part of [conciv](https://github.com/conciv-dev/conciv). It ships as a dependency of the
umbrella package; install that:

```sh
npm install -D @conciv/it
```

## Interface

- [src/README.md](./src/README.md): components, skins, tokens and helpers.
- [scripts/README.md](./scripts/README.md): token CSS and contract-doc generation and drift check.
- Exports (`package.json`): `.` -> `./dist/index.js` (from `src/index.tsx`), `./tokens` -> `./dist/tokens.js` (from `src/tokens.ts`), `./tokens.css` -> `./src/tokens.css` (generated). `files`: `dist`, `docs`, `src/tokens.css`. No bin.
- Generated docs: `docs/skin-anchors.md`, `docs/extension-tokens.md`.
- Peer `solid-js` ^1.9.13; runtime deps `@ark-ui/solid`, `@solid-primitives/{clipboard,event-listener,resize-observer,timer}`, `@tanstack/solid-virtual`, `@zag-js/json-tree-utils`, `class-variance-authority`, `lucide-solid`.
- Scripts: `gen:tokens` (`node scripts/gen-tokens.ts`), `gen:check` (`node scripts/check-tokens.ts`), `build` (`pnpm gen:tokens && vite build && tsc -p tsconfig.build.json`), `typecheck` (`tsconfig.json` and `tsconfig.scripts.json`), `lint` (`oxlint`), `test` (`vitest run --passWithNoTests`), `publint`, `attw` (`--profile esm-only --exclude-entrypoints tokens.css`).
- Vitest projects (`vitest.config.ts`): `browser` (headless Chromium through `playwright({})`, `test/**/*.browser.test.ts(x)`, `ciTestSolidBrowser()`, UnoCSS plugin) and `node` (`test/**/*.it.test.ts`, `test/**/*.node.test.ts`).
- `uno.config.ts`: `presetConciv()` over `src/**/*.{ts,tsx}`; `postcss.config.mjs`: `@unocss/postcss`.

## Invariants

- `build` runs `gen:tokens` before `vite build` (`package.json`).
- The vite lib build emits ES only (`formats: ['es']`) with entries `index` and `tokens`, and keeps `solid-js`, `@ark-ui/*`, `lucide-solid` and `@conciv/*` external (`vite.config.ts`).
- Stories and tests are excluded from emitted declarations (`tsconfig.build.json`).
- Browser tests run serially (`fileParallelism: false`, `vitest.config.ts`).
- Committed `src/tokens.css` and `docs/*.md` must match the generator output (`gen:check`, see [scripts/README.md](./scripts/README.md)).

## Side Effects

- `vite build` empties and writes `dist/` (`emptyOutDir: true`); `gen:tokens` rewrites `src/tokens.css` and `docs/*.md`.
- The `browser` test project launches headless Chromium (`vitest.config.ts`).

## Verification

- Run: `cd packages/ui-kit-system && pnpm test`
- Also: `pnpm gen:check`, `pnpm typecheck`, `pnpm lint`
