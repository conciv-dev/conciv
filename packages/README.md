# packages

## Overview

The npm packages that make up conciv. `@conciv/it` is the one users install; it pulls in the engine (`core`), the bundler plugin, the browser widget (`embed` and the `ui-kit-*` packages), the agent harness adapters and the built-in extensions. The rest are contracts shared between those halves (`protocol`, `contract`, `extension`, `grab`), published SDKs for host frameworks (`react`, `preact`, `solid`), and private tooling for this repo (`publish`, `vitest-config`, `oxlint-plugin`, `bundle-size`, `browser-fixture`, `uno-preset`).

## Subdirectories & Boundaries

Engine and plugin:

- core: [core/README.md](./core/README.md) - `@conciv/core`, the Hono engine: sessions, chat plane, oRPC router, MCP endpoint, push WebSocket and extension mounting.
- it: [it/README.md](./it/README.md) - `@conciv/it`, the installable umbrella. Builds the per-bundler plugin entries and bundles the built-in extensions.
- plugin: [plugin/README.md](./plugin/README.md) - `@conciv/plugin`, the unplugin that boots the engine and injects the widget (Vite full hook, webpack/rspack boot, Next.js wrapper).
- extension-compiler: [extension-compiler/README.md](./extension-compiler/README.md) - Build plumbing for extension code: client/server split, Solid compile, source stamping, the `virtual:conciv-extensions` module.
- cli: [cli/README.md](./cli/README.md) - The `conciv` binary: `init` and `tools`, each leaf command writing one JSON envelope.
- try: [try/README.md](./try/README.md) - `npx @conciv/try --token`: a token-gated loopback core paired with conciv.dev.
- serve: [serve/README.md](./serve/README.md) - Hono node server wrapper with WebSocket support and graceful shutdown.
- db: [db/README.md](./db/README.md) - Drizzle SQLite schema and queries on `node:sqlite`, bundled migrations.
- chat: [chat/README.md](./chat/README.md) - The chat plane over `@conciv/ai`: turns, hydration, transcript import, tool approvals, HTTP and WebSocket routes.
- ai: [ai/README.md](./ai/README.md) - Chat runtime over TanStack AI: harness text adapters, server middleware pipeline, Solid client session, testkit streams.
- harness: [harness/README.md](./harness/README.md) - Coding-agent adapters (`claude`, `codex`, `gemini-cli`, `opencode`, `pi`) behind the `HarnessAdapter` contract.
- harness-init: [harness-init/README.md](./harness-init/README.md) - Per-harness `conciv init` contributions: detection, AGENTS.md text, generated install files.
- harness-testkit: [harness-testkit/README.md](./harness-testkit/README.md) - Test helpers that boot an app against a scripted or real harness.
- tools: [tools/README.md](./tools/README.md) - Agent tools `conciv_ui`, `conciv_extensions`, `server_*` and `open`, with their Solid cards.
- skills: [skills/README.md](./skills/README.md) - Agent skill markdown discovered through `@tanstack/intent`, plus a citation checker.

Contracts:

- protocol: [protocol/README.md](./protocol/README.md) - Zod schemas and types for the wire protocol; zero-runtime apart from small helpers.
- contract: [contract/README.md](./contract/README.md) - The oRPC contract between core and its clients, with fetch and browser RPC clients.
- extension: [extension/README.md](./extension/README.md) - The extension authoring contract: `defineExtension`, `defineTool`, host hooks, server tool registry.
- grab: [grab/README.md](./grab/README.md) - Element-grab types, `GrabApi` and the size-bounded attachment serializer.
- extensions: [extensions/README.md](./extensions/README.md) - The nine built-in `@conciv/extension-*` packages.
- extension-testkit: [extension-testkit/README.md](./extension-testkit/README.md) - Mounts an extension in a real browser against a real server.

Browser widget:

- embed: [embed/README.md](./embed/README.md) - Mounts the widget into a shadow root and starts the page plane; ESM and IIFE entries.
- page: [page/README.md](./page/README.md) - The DOM side of the page plane: page driver, element refs, console buffer, React bridge, `react-grab` picking.
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
- browser-fixture: [browser-fixture/README.md](./browser-fixture/README.md) - One vitest fixture that launches a single Playwright Chromium per file.
