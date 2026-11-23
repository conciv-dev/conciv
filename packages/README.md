# packages

## Overview

The npm packages that make up conciv. `@conciv/it` is the one users install; it pulls in the engine (`core`), the bundler plugin, the browser widget (`embed` and the `ui-kit-*` packages), the agent harness adapters and the built-in plugins. The rest are contracts shared between those halves (`protocol`, `contract`, `plugin`, `grab`), published SDKs for host frameworks (`react`, `preact`, `solid`), and private tooling for this repo (`publish`, `vitest-config`, `oxlint-plugin`, `bundle-size`, `uno-preset`).

## Subdirectories & Boundaries

Engine and plugin:

- core: [core/README.md](./core/README.md) - `@conciv/core`, the Hono engine: sessions, chat plane, oRPC router, MCP endpoint, push WebSocket and the plugin host.
- it: [it/README.md](./it/README.md) - `@conciv/it`, the installable umbrella. Builds the per-bundler plugin entries; the built-in plugins reach it inlined in `embed`.
- unplugin: [unplugin/README.md](./unplugin/README.md) - `@conciv/unplugin`, the unplugin that boots the engine and injects the widget (Vite full hook, webpack/rspack boot and widget entry, Next.js wrapper).
- cli: [cli/README.md](./cli/README.md) - The `conciv` binary: `init` and `tools`, each leaf command writing one JSON envelope.
- try: [try/README.md](./try/README.md) - `npx @conciv/try --token`: a token-gated loopback core paired with conciv.dev.
- serve: [serve/README.md](./serve/README.md) - Hono node server wrapper with WebSocket support and graceful shutdown.
- db: [db/README.md](./db/README.md) - Drizzle SQLite schema and queries on `node:sqlite`, bundled migrations.
- chat: [chat/README.md](./chat/README.md) - The chat plane over `@conciv/ai`: turns, hydration, transcript import, tool approvals, HTTP and WebSocket routes.
- ai: [ai/README.md](./ai/README.md) - Chat runtime over TanStack AI: harness text adapters, server middleware pipeline, Solid client session, testkit streams.
- harness: [harness/README.md](./harness/README.md) - Coding-agent adapters (`claude`, `codex`, `gemini-cli`, `opencode`, `pi`) behind the `HarnessAdapter` contract.
- harness-init: [harness-init/README.md](./harness-init/README.md) - Per-harness `conciv init` contributions: detection, AGENTS.md text, generated install files.
- harness-testkit: [harness-testkit/README.md](./harness-testkit/README.md) - Test helpers that boot an app against a scripted or real harness.
- tools: [tools/README.md](./tools/README.md) - Agent tools `conciv_ui`, `server_*` and `open`, with their Solid cards.
- skills: [skills/README.md](./skills/README.md) - Agent skill markdown discovered through `@tanstack/intent`, plus a citation checker.
- plugin-host: [plugin-host](./plugin-host) - `@conciv/plugin-host`, the engine-side plugin host core runs: plugin state, the hook registry and the tool domain, in Effect.

Plugins (`plugins/*`, one plugin per package, each with its engine part and its browser part):

- plugins/page: [plugins/page/README.md](./plugins/page/README.md) - `@conciv/plugin-page`, the built-in page plugin: the connection to the page, its tools, cards and DOM helpers.
- plugins/terminal: [plugins/terminal/README.md](./plugins/terminal/README.md) - `@conciv/plugin-terminal`, the built-in terminal tab over core's persistent pty.
- plugins/ios: [plugins/ios/README.md](./plugins/ios/README.md) - `@conciv/plugin-ios`, builds, runs and reads a native iOS app on the simulator.
- plugins/recorder: [plugins/recorder/README.md](./plugins/recorder/README.md) - `@conciv/plugin-recorder`, the page's rrweb recording and a distilled action log for the agent.
- plugins/tanstack: [plugins/tanstack/README.md](./plugins/tanstack/README.md) - `@conciv/plugin-tanstack`, build errors, route manifest and server-function calls of a TanStack app.
- plugins/test-runner: [plugins/test-runner/README.md](./plugins/test-runner/README.md) - `@conciv/plugin-test-runner`, runs the project's tests and shows them live.
- plugins/try-it: [plugins/try-it/README.md](./plugins/try-it/README.md) - `@conciv/plugin-try-it`, the plugin conciv.dev composes into its widget.
- plugins/whiteboard: [plugins/whiteboard/README.md](./plugins/whiteboard/README.md) - `@conciv/plugin-whiteboard`, a canvas the user and the agent share.

The built-ins page and terminal draw with the UI kits directly; the app composes them (`apps/conciv/src/runtime/plugin/builtins.ts`) and `embed` inlines them. Every other plugin draws through `ctx.ui` and imports no `@conciv/ui-kit*` package (`conciv-publish check-plugin-ui-kit`).

Contracts:

- protocol: [protocol/README.md](./protocol/README.md) - Zod schemas and types for the wire protocol; zero-runtime apart from small helpers.
- contract: [contract/README.md](./contract/README.md) - The oRPC contract between core and its clients, with fetch and browser RPC clients.
- grab: [grab/README.md](./grab/README.md) - Element-grab types and label helpers.
- plugin: [plugin/README.md](./plugin/README.md) - `@conciv/plugin`, the plugin SDK: `Plugin.define` for a plugin's engine and browser parts, RPC contracts, registries and stores.
- plugin-internal: [plugin-internal/README.md](./plugin-internal/README.md) - Private stamp (`defineInternalPlugin`) that marks a first-party plugin, so the app hands its setup more of its own components on `ctx.ui`.
- extensions: [extensions/README.md](./extensions/README.md) - `@conciv/extension-design`, the one package left from the old extension system, out of the release.
- plugin-testkit: [plugin-testkit/README.md](./plugin-testkit/README.md) - Boots the real engine and widget with the fake model chat for widget and plugin tests: core kit, wire observers and fault injectors.

Browser widget:

- embed: [embed/README.md](./embed/README.md) - Mounts the widget into a shadow root; ESM and IIFE entries.
- client: [client/README.md](./client/README.md) - oRPC query utilities, chat connection, push and reachability helpers.
- storage-history: [storage-history/README.md](./storage-history/README.md) - A TanStack `RouterHistory` persisted in Web Storage.
- ui-kit-system: [ui-kit-system/README.md](./ui-kit-system/README.md) - The Solid design system: Ark UI wrappers, custom primitives, skins and generated tokens.
- ui-kit-chat: [ui-kit-chat/README.md](./ui-kit-chat/README.md) - Solid chat UI kit on the assistant-ui API: headless primitives and a styled set.
- ui-kit-chat-tools: [ui-kit-chat-tools/README.md](./ui-kit-chat-tools/README.md) - Headless per-tool primitives and styled tool cards.
- ui-kit-tap: [ui-kit-tap/README.md](./ui-kit-tap/README.md) - TipTap editors for Solid: `RichTextField` and `MentionField`.
- ui-kit-terminal: [ui-kit-terminal/README.md](./ui-kit-terminal/README.md) - Solid terminal components on xterm.js with a reconnecting WebSocket model.
- solid-diffs: [solid-diffs/README.md](./solid-diffs/README.md) - Solid wrappers around `@pierre/diffs`.
- solid-streamdown: [solid-streamdown/README.md](./solid-streamdown/README.md) - Streaming markdown renderer for Solid, derived from Vercel's Streamdown.
- mascot: [mascot/README.md](./mascot/README.md) - The animated mascot: GSAP core service with Solid and React wrappers.
- brand: [brand/README.md](./brand/README.md) - The conciv logo as Solid and React components plus static assets.

Host framework SDKs:

- react: [react/README.md](./react/README.md) - `ConcivWidget` for React.
- preact: [preact/README.md](./preact/README.md) - `ConcivWidget` for Preact.
- solid: [solid/README.md](./solid/README.md) - `ConcivWidget` for Solid.

Repo tooling (private):

- publish: [publish/README.md](./publish/README.md) - The `conciv-publish` release CLI: guards, changesets, npm sync, Swift mirror.
- vitest-config: [vitest-config/README.md](./vitest-config/README.md) - Shared vitest CI config, Solid cleanup, CI shard planning and summary CLIs.
- oxlint-plugin: [oxlint-plugin/README.md](./oxlint-plugin/README.md) - The repo's custom oxlint rules.
- uno-preset: [uno-preset/README.md](./uno-preset/README.md) - The shared UnoCSS preset.
- bundle-size: [bundle-size/README.md](./bundle-size/README.md) - CI gzip size check against a main-branch baseline.
