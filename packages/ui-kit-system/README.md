# @conciv/ui-kit-system

The conciv design system: SolidJS primitives (Button plus Ark-UI-based Collapsible,
HoverCard, ScrollArea, Combobox, Progress) styled with the shared UnoCSS preset, so every
surface looks and behaves identically. Most components are viewable in Storybook.

The skin system and tokens are described in [src/README.md](./src/README.md).

Part of [conciv](https://github.com/conciv-dev/conciv). It ships as a dependency of the
umbrella package; install that:

```sh
npm install -D @conciv/it
```

## Interface

- [src/README.md](./src/README.md): components, skins, tokens and helpers.
- [src/scripts/README.md](./src/scripts/README.md): token CSS and contract-doc generation and drift check.
- Exports (`package.json`): `.` -> `./dist/ui-kit-system.js` (from `src/ui-kit-system.tsx`), `./tokens.css` -> `./src/tokens.css` (generated), `./host.css` -> `./src/host.css`. No bin.
- Generated docs: `docs/skin-anchors.md`, `docs/plugin-tokens.md`.
- Scripts: `gen:tokens` (`node src/scripts/gen-tokens.ts`), `gen:check` (`node src/scripts/check-tokens.ts`), `build` (`pnpm gen:tokens && vite build`), `typecheck`, `publint`, `attw`. No `test` script.
- `uno.config.ts`: `presetConciv()` over `src`; `postcss.config.mjs`: `@unocss/postcss`.

## Invariants

- `build` runs `gen:tokens` before `vite build` (`package.json`).
- The vite lib build emits ES only (`formats: ['es']`) with the entry `ui-kit-system`, and keeps `solid-js`, `@ark-ui/*`, `lucide-solid`, `@conciv/*` and `@tanstack/solid-hotkeys` external (`vite.config.ts`).
- Stories and tests are excluded from emitted declarations (`tsconfig.build.json`).
- Committed `src/tokens.css` and `docs/*.md` must match the generator output (`gen:check`, see [src/scripts/README.md](./src/scripts/README.md)).

## Side Effects

- `vite build` empties and writes `dist/` (`emptyOutDir: true`); `gen:tokens` rewrites `src/tokens.css` and `docs/*.md`.

## Verification

- Run: `pnpm gen:check` and `pnpm typecheck` in the package, and `pnpm lint` at the repo root
