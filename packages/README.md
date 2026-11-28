# packages

## Overview

The npm packages that make up conciv. `@conciv/it` is the one users
install; it pulls in the engine, the bundler plugin, the browser widget, the agent harness adapters and the built-in
plugins. Each side has four kinds of package: a plugin API (what a plugin author imports), an app API (the machinery
behind it), defaults (the product with no plugin in it) and the app (the defaults plus the plugins conciv ships).
`@internal/*` packages are private and inlined where they are used; `@conciv/*` packages are published.

## Subdirectories & Boundaries

Engine (node):

- backend-plugin-api: [backend-plugin-api/README.md](./backend-plugin-api/README.md) - `@conciv/backend-plugin-api`, what a plugin's engine part imports: `Plugin.define`, the rpc contract helpers, the tool and context types.
- backend-app-api: [backend-app-api/README.md](./backend-app-api/README.md) - `@conciv/backend-app-api`, the engine-side plugin host: plugin state, the hook registry and the tool domain, in Effect.
- backend-defaults: [backend-defaults/README.md](./backend-defaults/README.md) - `@conciv/backend-defaults`, the engine with no plugin in it: HTTP, rpc, MCP and login surface, chat, code mode, pty.
- backend: [backend/README.md](./backend/README.md) - `@conciv/backend`, the shipped engine: `createBackend` with the built-in page plugin.
- serve: [serve/README.md](./serve/README.md) - `@conciv/serve`, the Hono node server wrapper with WebSocket support and graceful shutdown.
- home: [home/README.md](./home/README.md) - `@conciv/home`, the per-user home registry: running engines and hub connections in `home.db`.
- harness: [harness/README.md](./harness/README.md) - `@conciv/harness`, coding-agent adapters (`claude`, `codex`, `gemini-cli`, `opencode`, `pi`) behind the `HarnessAdapter` contract, and their `conciv init` contributions.
- simulation: [simulation/README.md](./simulation/README.md) - `@conciv/simulation`, the scripted agent and fixed network table an engine runs on under `CONCIV_SIMULATE`, and the driver side of the widget's drive mode.
- skills: [skills/README.md](./skills/README.md) - `@conciv/skills`, agent skill markdown discovered through `@tanstack/intent`, plus a citation checker.

Widget (browser):

- frontend-plugin-api: `@conciv/frontend-plugin-api`, what a plugin's browser part imports: `Plugin.define`, its slots, hooks and rpc client types.
- frontend-app-api: [frontend-app-api/README.md](./frontend-app-api/README.md) - `@internal/frontend-app-api`, the opaque definitions, plugin loading and persistence behind the browser plugin API.
- frontend-defaults: [frontend-defaults/README.md](./frontend-defaults/README.md) - `@internal/frontend-defaults`, the shell with no plugin in it: router, pane, composer, sessions and settings.
- app: [app/README.md](./app/README.md) - `@conciv/app`, the shipped widget: the shell plus the page and terminal renderers (`app/src/builtins.ts`), built into `app/dist/conciv-widget.global.js`.
- client: [client/README.md](./client/README.md) - `@conciv/client`, the browser's engine connection and rpc client.
- storage-history: [storage-history/README.md](./storage-history/README.md) - A TanStack `RouterHistory` persisted in Web Storage.
- ui-kit-system: [ui-kit-system/README.md](./ui-kit-system/README.md) - The Solid design system: Ark UI wrappers, custom primitives, skins and generated tokens.
- ui-kit-chat: [ui-kit-chat/README.md](./ui-kit-chat/README.md) - Solid chat UI kit on the assistant-ui API: headless primitives and a styled set.
- ui-kit-chat-tools: [ui-kit-chat-tools/README.md](./ui-kit-chat-tools/README.md) - Headless per-tool primitives and styled tool cards.
- ui-kit-tap: [ui-kit-tap/README.md](./ui-kit-tap/README.md) - TipTap editors for Solid.
- ui-kit-terminal: [ui-kit-terminal/README.md](./ui-kit-terminal/README.md) - Solid terminal components on xterm.js with a reconnecting WebSocket model.
- solid-diffs: [solid-diffs/README.md](./solid-diffs/README.md) - Solid wrappers around `@pierre/diffs`.
- solid-streamdown: [solid-streamdown/README.md](./solid-streamdown/README.md) - Streaming markdown renderer for Solid, derived from Vercel's Streamdown.
- mascot: [mascot/README.md](./mascot/README.md) - The animated mascot: GSAP core service with a Solid wrapper.
- mascot-react: [mascot-react/README.md](./mascot-react/README.md) - The mascot as a React component.
- brand, brand-react: [brand/README.md](./brand/README.md), [brand-react/README.md](./brand-react/README.md) - The conciv logo as Solid and React components plus static assets.

Shared contracts:

- protocol: [protocol/README.md](./protocol/README.md) - `@conciv/protocol`, the oRPC contract and the zod schemas shared by the engine and its clients.
- types: [types/README.md](./types/README.md) - `@conciv/types`, wire types.
- grab: [grab/README.md](./grab/README.md) - `@conciv/grab`, element-grab types and label helpers.

Plugins (`plugins/*`, one plugin per package, each with its engine part and its browser part):

- plugins/page: [plugins/page/README.md](./plugins/page/README.md) - `@conciv/plugin-page`, the built-in page plugin: the connection to the page, its tools, cards and DOM helpers.
- plugins/terminal: [plugins/terminal/README.md](./plugins/terminal/README.md) - `@internal/plugin-terminal`, the built-in terminal tab over the engine's persistent pty.
- plugins/ios: [plugins/ios/README.md](./plugins/ios/README.md) - `@conciv/plugin-ios`, builds, runs and reads a native iOS app on the simulator.
- plugins/recorder: [plugins/recorder/README.md](./plugins/recorder/README.md) - `@conciv/plugin-recorder`, the page's rrweb recording and a distilled action log for the agent.
- plugins/tanstack: [plugins/tanstack/README.md](./plugins/tanstack/README.md) - `@conciv/plugin-tanstack`, build errors, route manifest and server-function calls of a TanStack app.
- plugins/test-runner: [plugins/test-runner/README.md](./plugins/test-runner/README.md) - `@conciv/plugin-test-runner`, runs the project's tests and shows them live.
- plugins/try-it: [plugins/try-it/README.md](./plugins/try-it/README.md) - `@conciv/plugin-try-it`, the plugin conciv.dev composes into its widget.
- plugins/whiteboard: [plugins/whiteboard/README.md](./plugins/whiteboard/README.md) - `@conciv/plugin-whiteboard`, a canvas the user and the agent share.

The built-ins page and terminal draw with the UI kits directly; `app/src/builtins.ts` composes them. Every other plugin
draws through `ctx.ui` and imports no `@conciv/ui-kit*` package (`conciv-publish check-plugin-ui-kit`).

Install and host SDKs:

- it: [it/README.md](./it/README.md) - `@conciv/it`, the installable umbrella: the per-bundler plugin entries.
- unplugin: [unplugin/README.md](./unplugin/README.md) - `@conciv/unplugin`, boots the engine and injects the widget (Vite full hook, webpack/rspack boot and widget entry, Next.js wrapper).
- cli: [cli/README.md](./cli/README.md) - `@conciv/cli`, the `conciv` binary: `init`, `tools`, `auth`, `mcp` and `plugin`.
- try: [try/README.md](./try/README.md) - `npx @conciv/try --token`: a token-gated loopback engine paired with conciv.dev.
- react, preact, solid: [react/README.md](./react/README.md), [preact/README.md](./preact/README.md), [solid/README.md](./solid/README.md) - `ConcivWidget` for each host framework.

Test utilities:

- backend-test-utils: [backend-test-utils/README.md](./backend-test-utils/README.md) - `@conciv/backend-test-utils`, the `test` fixture that starts the real engine on a scripted model.
- engine-kit: [engine-kit/README.md](./engine-kit/README.md) - `@internal/engine-kit`, the engine kit backend-defaults' own tests and backend-test-utils share.
- frontend-test-utils: [frontend-test-utils/README.md](./frontend-test-utils/README.md) - `@internal/frontend-test-utils`, renders a plugin or the full shell against the fake or a real engine.
- vitest-config: [vitest-config/README.md](./vitest-config/README.md) - `@internal/vitest-config`, `concivTest()`: the test projects, the isolated home and the CI reporters.

Repo tooling (private):

- publish: [publish/README.md](./publish/README.md) - The `conciv-publish` release CLI: guards, changesets, npm sync, Swift mirror.
- oxlint-plugin: [oxlint-plugin/README.md](./oxlint-plugin/README.md) - The repo's custom oxlint rules.
- uno-preset: [uno-preset/README.md](./uno-preset/README.md) - The shared UnoCSS preset.
- tsconfig: [tsconfig/README.md](./tsconfig/README.md) - Shared TypeScript presets.
- bundle-size: [bundle-size/README.md](./bundle-size/README.md) - CI gzip size check against a main-branch baseline.
