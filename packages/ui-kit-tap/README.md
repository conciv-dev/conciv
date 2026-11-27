# @conciv/ui-kit-tap

TipTap-based rich-text primitives for conciv (SolidJS, shadow-DOM-safe): a mention composer
built on `@tiptap/core` and the shared `@conciv/ui-kit-system` tokens. Each primitive is
viewable in Storybook.

Part of [conciv](https://github.com/conciv-dev/conciv). It ships as a dependency of the
umbrella package; install that:

```sh
npm install -D @conciv/it
```

## Interface

- `package.json:exports["."]` - `dist/ui-kit-tap.js` with types in `dist/ui-kit-tap.d.ts`.
- `tsdown.config.ts` - library entry `src/ui-kit-tap.tsx`, ES format; its dependencies (`@conciv/ui-kit-system`, `@tiptap/*`, `@floating-ui/dom`) and the `solid-js` peer stay external (tsdown's default).
- `uno.config.ts` - `presetConciv()`, scanning `src` and `../ui-kit-system/src`, without tests, specs and stories.
- `postcss.config.mjs` - the `@unocss/postcss` plugin.
- Source: [src](./src/README.md).

## Invariants

- None

## Side Effects

- The package root (configs and manifest) has none. At runtime the fields create a TipTap `Editor` on the host element and destroy it on cleanup. Full list in [src/README.md](./src/README.md#side-effects).

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-tap` from the repo root (the package has no `test` script)
