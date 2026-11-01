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

- `package.json:exports` - `.` (`dist/index.js`), `./tools` (`dist/tools.js`), `./theme/tokens.css` (source CSS), `./theme/fonts`, `./theme/code-theme`.
- `package.json:scripts` - `build` (`vite build && tsc -p tsconfig.build.json`), `typecheck`, `lint` (`oxlint`), `test` (`vitest run`), `publint`, `attw`.
- `package.json:peerDependencies` - `solid-js` `^1.9.13`.
- Subdirectory: [src](./src/README.md) - entries, store, behaviors, primitives, styled, tools, theme.

## Invariants

- `vite.config.ts:build.lib.entry` defines the four JS entries (`index`, `tools`, `theme/fonts`, `theme/code-theme`) and keeps `solid-js`, `zod`, `mermaid`, `@tanstack/*`, `@conciv/*`, `@pierre/diffs`, `shiki` and `@shikijs/*` external.
- `vitest.config.ts` runs two projects: `ui-kit-chat` (node, `test/**/*.test.ts`) and `ui-kit-chat-browser` (Playwright Chromium, `test/**/*.browser.test.tsx`, `fileParallelism: false`).
- `uno.config.ts` scans `src/**` and `../ui-kit-system/src/**` with `presetConciv`, so utility classes used in either package are generated here.
- `CollapsibleCard` stays internal: `src/tools.tsx` does not export it and the `conciv/tool-card-shell` lint rule blocks imports of it from outside this package.

## Side Effects

- See the child READMEs: draft persistence to caller-provided `WebStorage`, clipboard writes, a Shiki web worker for code highlighting, lazy `mermaid` and `rrweb-snapshot` imports, and DOM listeners and observers in the thread viewport.

## Verification

- Run: `cd packages/ui-kit-chat && pnpm test`
