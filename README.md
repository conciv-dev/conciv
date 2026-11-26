<div align="center">

<a href="https://conciv.dev">
  <img src="./.github/assets/hero.png" alt="conciv: your coding agent, living inside your running app" width="860">
</a>

<h1>✦&nbsp; conciv</h1>

<p>
  <em>Conceive it.</em>
  <br>
  <strong>Your coding agent, living inside your running app.</strong>
  <br>
  Add conciv to your build. Then chat, let it drive the page, and run your tests,
  <br>
  without ever leaving the thing you're building.
</p>

<p>
  <a href="https://conciv.dev"><strong>Website</strong></a>
  &nbsp;·&nbsp;
  <a href="./apps/examples/tanstack-start"><strong>Example app</strong></a>
  &nbsp;·&nbsp;
  <a href="./apps/site/content/docs"><strong>Docs</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/conciv-dev/conciv/issues"><strong>Report a bug</strong></a>
</p>

<p>
  <a href="https://www.npmjs.com/package/@conciv/it"><img alt="npm" src="https://img.shields.io/npm/v/%40conciv%2Fit?style=flat-square&color=cb3837&label=npm"></a>
  <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/conciv-dev/conciv/ci.yml?branch=main&label=CI&style=flat-square">
  <img alt="License" src="https://img.shields.io/github/license/conciv-dev/conciv?color=3b82f6&style=flat-square">
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A5%2026-3c873a?style=flat-square">
  <img alt="Status" src="https://img.shields.io/badge/status-beta-e8552d?style=flat-square">
</p>

</div>

---

## What is conciv?

**conciv** puts an AI dev agent inside the app you are already running. Add conciv to your Vite, Next.js, webpack or
Rspack config, and a conciv button appears in your dev preview. Open it and you're talking to an agent that can
**see the page you're building**, **drive it**, **edit your source**, and **run your tests**, all in the same window,
without a second terminal or a context switch.

It's **dev-only** (never shipped to production) and **harness-agnostic**: it drives a real coding CLI under the hood
(Claude Code by default, or Codex, OpenCode, Gemini CLI or Pi), so the agent is as capable as the tool you already
trust.

## Features

- 💬 &nbsp;**Chat in-app**: talk to an agent that sees your running page, streams its reasoning, and calls tools live.
- 🕹️ &nbsp;**Page control**: it grabs elements, clicks, fills, inspects React props/state, and live-edits the DOM to preview changes.
- 🧪 &nbsp;**Live tests**: add the test-runner plugin, run Vitest or Playwright, and watch pass/fail result cards render right inside the app.
- 🧩 &nbsp;**Plugins**: add a plugin to `plugins` or `conciv/plugins/` and get new agent tools with their own cards and panels.
- ✅ &nbsp;**Approvals**: when the agent asks for permission, a card in the thread lets you approve or deny it.
- 🔌 &nbsp;**Vite, Next.js, webpack and Rspack**: dev-only, never in your production bundle.
- 🤝 &nbsp;**Harness-agnostic**: Claude Code, Codex, OpenCode, Gemini CLI and Pi behind one capability interface.
- 🌘 &nbsp;**Zero style leak**: the widget lives in an open Shadow DOM, isolated from your app's CSS.

## How it works

The build integration (`@conciv/it`, on `@conciv/unplugin`) starts the conciv engine (`@conciv/backend`, a **hono**
server) on its own port on `127.0.0.1`. The engine runs the harness (Claude Code by default) and the plugins, and the
integration adds the Solid widget (`@conciv/app`) to your page. The widget talks to the engine over oRPC. The first
time a browser opens the widget, it asks for a 6-digit code the dev server prints in its terminal.

## Try it live

No install needed: open [conciv.dev](https://conciv.dev), click "Try it live", and paste the
pairing prompt into Claude Code (or run the `npx @conciv/try` command it shows). The widget on
the landing page connects to the agent on your machine. Everything stays local: the engine binds
`127.0.0.1` only, gated by a one-time token, and prompts never touch our servers.

## Quickstart

```sh
npx @conciv/cli@latest init
```

or install it yourself and add conciv to your app's `vite.config.ts`:

```sh
npm i -D @conciv/it
```

```ts
import {defineConfig} from 'vite'
import conciv from '@conciv/it/plugin/vite'

export default defineConfig({
  plugins: [conciv()],
})
```

Install and log in to the agent CLI you want (Claude Code by default), start your dev server, click the conciv button
in the corner of your app, and type the code your terminal prints.

Override defaults via `conciv({harness, plugins, port, …})`. Next.js uses `@conciv/it/plugin/nextjs`, webpack and
Rspack `@conciv/it/plugin/webpack` and `/rspack`; see the [quick start](https://conciv.dev/docs/quick-start).

## Plugins

Teach the agent new tricks with a plugin. List it in `plugins` (an npm package or a local
directory, with options as `['name', {...}]`) or drop it in `conciv/plugins/`, and the engine loads
it live. A plugin adds agent tools, a result card per tool and panels in the widget, and can be
added or removed while the app runs. Plugins ship
with a real test harness: [`@conciv/backend-test-utils`](./packages/backend-test-utils) boots the real
engine with your plugin loaded and a fake model.

The page and terminal plugins are built in. The others are separate installs:

- 🧪 &nbsp;[**Test runner**](./packages/plugins/test-runner): runs your tests (Vitest and Playwright). The Tests tab streams live rows, and a card shows the finished run in the thread.
- 🎥 &nbsp;[**Recorder**](./packages/plugins/recorder): records the page with rrweb and gives the agent a distilled log of what you did.
- 🧭 &nbsp;[**TanStack**](./packages/plugins/tanstack): build errors, the route manifest and server-function calls of a TanStack Router or Start app.
- 📱 &nbsp;[**iOS**](./packages/plugins/ios): builds, runs, screenshots and reads the logs of a native iOS app on the simulator.

## Supported tools

| Area          | Supported                                           | Not yet           |
| ------------- | --------------------------------------------------- | ----------------- |
| **Harnesses** | Claude Code, Codex, OpenCode, Gemini CLI            | Pi                |
| **Bundlers**  | Vite, Next.js, webpack and Rspack (no module graph) | Rollup, esbuild   |
| **Tests**     | Vitest, Playwright                                  | Jest, `node:test` |

## Packages

Install these. Everything else on npm under `@conciv/*` comes in automatically:

| Package                                                         | What it is                                                                                                |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [`@conciv/it`](./packages/it)                                   | **The one you install.** `@conciv/it/plugin/vite`, `/nextjs`, `/webpack`, `/rspack`.                      |
| [`@conciv/cli`](./packages/cli)                                 | `npx @conciv/cli@latest init` sets a project up; `conciv tools` is the CLI the agent drives the app with. |
| [`@conciv/plugin-test-runner`](./packages/plugins/test-runner)  | The test-runner plugin: `plugins: [['@conciv/plugin-test-runner', {runner: 'vitest'}]]`.                  |
| [`@conciv/backend-plugin-api`](./packages/backend-plugin-api)   | What a plugin's engine part imports.                                                                      |
| [`@conciv/frontend-plugin-api`](./packages/frontend-plugin-api) | What a plugin's browser part imports.                                                                     |
| [`@conciv/backend-test-utils`](./packages/backend-test-utils)   | Starts the real engine with your plugin loaded and a scripted model, for a plugin's own tests.            |
| [`@conciv/try`](./packages/try)                                 | `npx @conciv/try --token <t>`: try conciv live on conciv.dev with the agent already on your machine.      |

Every package, published or internal, is listed in [packages/README.md](./packages/README.md).

## Documentation

Full docs live at **[conciv.dev](https://conciv.dev)** and in
[`apps/site/content/docs`](./apps/site/content/docs): quick-start guides per bundler, usage
(chat, page control, live tests, approvals), harness and test-runner configuration, and
troubleshooting.

## Repository blueprint

Every package, app and source directory carries a `README.md` with its purpose, invariants, side effects and the command that verifies it. Start from the three top-level blueprints and follow the links down.

### Subdirectories & System Boundaries

- packages: [packages/README.md](./packages/README.md) - the npm packages: engine and plugin, shared contracts, the browser widget and UI kits, host framework SDKs, and private repo tooling.
- apps: [apps/README.md](./apps/README.md) - the conciv.dev site, the Storybook and the example host apps.
- native: [native/README.md](./native/README.md) - the Swift ConcivWidget iOS SDK and the ConcivDemo app.

### Global Invariants

- Everything is ESM, Node >= 26, one pnpm workspace with catalog-pinned dependencies and turbo as the task graph.
- Code shared between the browser and Node lives in a contract package (`protocol`, `types`, `grab`, and the plugin APIs); the browser never imports a server entry.
- The public package set is `PUBLIC_PACKAGES` in `packages/publish`; `@internal/*` packages are never published and are inlined where they are used.
- The engine binds loopback only; cross-origin access is gated by the engine's Host and Origin checks in `packages/backend-defaults/src/engine`.

### Global Side Effects

- The engine writes its SQLite database and port file under the project's `.conciv` folder, registers itself in the conciv home folder (`CONCIV_HOME`, else the platform data folder), and writes the iOS pairing file to `~/.conciv`.
- Harness adapters read the user's agent transcripts (`~/.claude`, `~/.codex`, `~/.pi`, opencode's database) and spawn the agent binaries.
- The Vite plugin boots the engine process, injects the widget meta tags and script into served HTML and serves the widget boot script from the dev server.
- `conciv-publish` publishes to npm, pushes git tags and force-pushes the `conciv-swift` mirror.

### System Verification

- Run: `pnpm typecheck && pnpm lint && pnpm test` at the repo root (turbo runs every package; `pnpm lint` is one oxlint over the repo), or `pnpm test:affected` for packages changed since `origin/main`.

## Contributing

Issues and PRs are welcome. This is a young project moving fast, so the best first step is to run the
[example app](./apps/examples/tanstack-start), find something rough, and open an issue.

```sh
pnpm install
pnpm dev        # runs the tanstack-start example with conciv wired in
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for setup, everyday commands, and PR guidelines.

## Star history

<a href="https://www.star-history.com/#conciv-dev/conciv&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=conciv-dev/conciv&type=Date&theme=dark">
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=conciv-dev/conciv&type=Date">
    <img alt="Star history chart for conciv-dev/conciv" src="https://api.star-history.com/svg?repos=conciv-dev/conciv&type=Date" width="600">
  </picture>
</a>

## License

[MIT](./LICENSE) © conciv

<div align="center">
  <br>
  <sub><strong>conciv</strong> · as in <code>@conciv/it</code>. Say it out loud.</sub>
  <br>
  <sub>Built with hono, Solid, and a real coding agent living in the page.</sub>
</div>
