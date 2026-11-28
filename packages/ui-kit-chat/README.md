# @conciv/ui-kit-chat

A clean-room SolidJS implementation of the assistant-ui chat API: headless compound
primitives (Thread/Message/Composer/ActionBar/…) plus a neutral, themeable styled set, bound
to the canonical `@tanstack/ai-client` data model. Every component is viewable in Storybook
against the real `useChat` behind a fake connection.

Part of [conciv](https://github.com/conciv-dev/conciv). It ships as a dependency of the
umbrella package; install that:

```sh
npm install -D @conciv/it
```

## Interface

- `package.json:exports` - `.` (`dist/ui-kit-chat.js`), `./tools` (`dist/tools.js`), `./draft-storage` (`dist/draft-storage.js`), `./theme/tokens.css` (source CSS), `./theme/fonts`, `./theme/code-theme`.
- `package.json:scripts` - `build` (`tsdown && vite build`), `typecheck`, `publint`, `attw`. No `test` script.
- `package.json:peerDependencies` - `solid-js` `^1.9.13`.
- Subdirectory: [src](./src/README.md) - entries, store, behaviors, primitives, styled, tools, theme.

## Invariants

- `vite.config.ts` `build.lib.entry` (and `tsdown.config.ts` `entry`, declarations only) define the five public entries (`ui-kit-chat`, `tools`, `draft-storage`, `theme/fonts`, `theme/code-theme`); the JavaScript is bundled (shared chunks beside them), the declarations one file per module. Its dependencies and the `solid-js` peer stay external (read from `package.json`; an import with a `?` query is bundled).
- The highlight worker (`highlight-worker.ts?worker&inline`) and the `.woff2?inline` fonts are inlined by Vite's own `?worker&inline` and `?inline` (`vite.config.ts`, the library build; `tsdown` writes only the declarations).
- `uno.config.ts` scans `src` and `../ui-kit-system/src` (without tests, specs and stories) with `presetConciv`, so utility classes used in either package are generated here.
- `CollapsibleCard` stays internal: `src/tools.tsx` does not export it and the `conciv/tool-card-shell` lint rule blocks imports of it from outside this package.

## Side Effects

- See the child READMEs: draft persistence to caller-provided `WebStorage`, clipboard writes, a Shiki web worker for code highlighting, a lazy `mermaid` import, and DOM listeners and observers in the thread viewport.

## Verification

- Run: `pnpm exec turbo run build typecheck --filter=@conciv/ui-kit-chat` from the repo root
