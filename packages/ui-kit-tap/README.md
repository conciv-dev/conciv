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

- `package.json:exports["."]` - `dist/index.js` with types in `dist/index.d.ts`.
- `vite.config.ts` - library entry `src/index.tsx`, ES format; `solid-js`, `@ark-ui/*`, `@conciv/*`, `@tiptap/*`, `prosemirror-*` and `@floating-ui/*` external.
- `uno.config.ts` - `presetConciv()`, scanning `src/**` and `../ui-kit-system/src/**`.
- `postcss.config.mjs` - the `@unocss/postcss` plugin.
- Source: [src](./src/README.md).

## Invariants

- None

## Side Effects

- None

## Verification

- Run: `cd packages/ui-kit-tap && pnpm test`
