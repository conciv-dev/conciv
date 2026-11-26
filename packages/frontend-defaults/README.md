# @internal/frontend-defaults

## Overview

The widget's shell with no plugin in it: the router, pane, composer, sessions and settings, a TanStack Solid Router
UI over the `@conciv/protocol` rpc surface. Private, never published. `@conciv/app` inlines it into the widget bundle
with the plugins conciv ships; standalone dev runs it against an engine: `pnpm dev`, then open
`http://localhost:3000/?core=http://127.0.0.1:<engine-port>`.

Routes are the layout: `/` closed, `/panel/$sessionId/$view` panel, `/quick` quick
terminal layer, `/pip/$sessionId` picture-in-picture. Embedded runs use a memory
history that starts on this tab's last screen (sessionStorage, as opencode keeps one URL per
window); standalone uses browser history.

## Interface

- `exports` (`package.json`): `.` (`src/frontend-defaults.tsx`: `ConcivApp`, `Platform`, `createBrowserEngine` and
  what a host needs to build one) and `./drive` (`src/drive/drive.ts`, drive mode).
- scripts (`package.json`): `dev` (vite, port 3000), `generate-routes` (`tsr generate`), `build`, `typecheck`, `test`
  (vitest), `test:perf`
- `vite.config.ts`: `tanstackRouter({target: 'solid', autoCodeSplitting: false})`, `UnoCSS` (`unocss/vite`),
  `solidPlugin` and `concivTest({environment: 'happy-dom', browser: true})`, with the drive commands from
  `test/utils/drive-commands.ts`
- `uno.config.ts`: `presetConciv`, scanning `src`, the ui-kits and `frontend-app-api`, and no plugin; the
  utilities reach the widget through `virtual:uno.css?inline` (`src/lib/widget-styles.ts`)
- Subdirectories: [src](./src/README.md).

## Invariants

- Ships no plugin: the plugins are given by the host (`Platform.plugins`, `Platform.builtins`).
- The calm perf suite (`test/e2e/chat-pane.perf.e2e.test.tsx`) runs only in the `perf` project (`pnpm test:perf`).

## Side Effects

- None

## Verification

- Run: `pnpm exec turbo run typecheck test --filter=@internal/frontend-defaults` and `pnpm lint` from the repo root (turbo builds the package and its dependencies first)
