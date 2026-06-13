# devgent

An embeddable AI dev agent for your running app — **chat, page control, and live tests,
injected into the page via a Vite plugin**.

devgent boots a framework-free h3 engine (`@devgent/core`) behind a set of `/api/*` HTTP routes
on its own dev port, spawns a headless harness (default `claude -p`), and injects a React widget
into the previewed page. From the widget you can chat with the agent, watch it think and call
tools, approve risky commands, answer agent-generated UI prompts, and see live test result cards
— all without leaving the app you're building.

```
 ┌─────────────┐      /api/* (SSE + JSON)       ┌──────────────────┐
 │  browser    │ ◀──────────────────────────▶  │  @devgent/core   │
 │  widget     │   chat stream · page-bus ·     │  (h3 + srvx)     │
 │ (React,     │   test stream · approvals      │   → harness      │
 │  shadow DOM)│                                │   (claude/codex) │
 └─────────────┘                                └──────────────────┘
   injected by @devgent/plugin (vite/webpack/…)
```

> Status: early. Extracted from an internal preview tool and being generalized for any app.

## Packages

| Package                                          | What it is                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| [`@devgent/protocol`](./packages/protocol)       | Shared wire types + `define*` factories (chat, generative UI, test, page, harness/runner/bundler, config). Zero-runtime.             |
| [`@devgent/core`](./packages/core)               | The framework-free h3 + srvx engine: all `/api/*` routes, lock, session, uiBus, harness + test-runner registries, the BundlerBridge. |
| [`@devgent/harness`](./packages/harness)         | Harness adapters behind a capability interface: claude + codex, plus gemini-cli/opencode/pi stubs.                                   |
| [`@devgent/test-runner`](./packages/test-runner) | Test-runner adapters over a clean-child fd3 driver: vitest (full), jest/node-test/playwright (stubs).                                |
| [`@devgent/plugin`](./packages/plugin)           | The dev agent as an unplugin: `@devgent/plugin/vite` (full), webpack/rspack/rollup/esbuild entries. Boots core + injects the widget. |
| [`@devgent/widget`](./packages/widget)           | The browser half: a React chat UI in an open Shadow DOM, the test card, and the page-control driver.                                 |
| [`@devgent/cli`](./packages/cli)                 | The `devgent` CLI the agent calls from Bash: `tools server / page / test / open` + `ui`, against core's `/api/*` surface.            |

## Quickstart

Add the plugin to your app's `vite.config.ts` and serve the widget bundle:

```ts
import {defineConfig} from 'vite'
import devgent from '@devgent/plugin/vite'

export default defineConfig({
  plugins: [devgent()],
})
```

`@devgent/core` boots its own dev engine (the `/api/*` surface + the bundled widget) and the
plugin injects the widget `<script>` into your HTML. Override defaults via
`devgent({harness, testRunner, previewId, widgetUrl, …})`. The widget probes `/api/chat/session`
on load and only shows the ✦ FAB when the dev-server routes are live, so it's inert on a plain
preview.

`claude` (the Claude Code CLI) must be on your `PATH` for the chat to answer.

See [`apps/examples/tanstack-start`](./apps/examples/tanstack-start) for a complete, runnable
host app:

```sh
pnpm install
pnpm --filter tanstack-start-example dev
# open the printed URL, click the ✦ button
```

## Configuration

`devgent(options)` — every field is optional:

| Option         | Default                  | Purpose                                                                |
| -------------- | ------------------------ | ---------------------------------------------------------------------- |
| `enabled`      | `true`                   | Mount the agent. Gate it on dev mode in real apps.                     |
| `harness`      | `"claude"`               | Harness adapter id (`claude`, `codex`, …).                             |
| `harnessBin`   | adapter `binName`        | Override the harness binary on `PATH`.                                 |
| `testRunner`   | `"vitest"`               | Test-runner adapter id.                                                |
| `widgetUrl`    | `DEVGENT_WIDGET_URL` env | `<script src>` for the injected widget bundle. Omit to skip injection. |
| `lockDir`      | `process.cwd()`          | Holds `.devgent/{agent.lock,sessions,bin}`.                            |
| `systemPrompt` | built-in                 | Appended to each agent turn.                                           |
| `previewId`    | `"local"`                | Correlates a resumable session.                                        |
| `sessionId`    | –                        | Resume an existing thread.                                             |

## Routes (the wire contract)

All under the `/api` prefix on the core dev port:

| Route                                                   | Method           | Purpose                                                                 |
| ------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------- |
| `/api/chat`                                             | POST (SSE)       | The chat turn — AG-UI event stream.                                     |
| `/api/chat/session`                                     | GET              | Current session + lock; the widget's availability probe.                |
| `/api/chat/history`                                     | GET              | Hydrate a resumed thread.                                               |
| `/api/chat/permission`, `/api/chat/permission-decision` | POST             | Risky-command gate (PreToolUse hook ⇄ widget allow/deny).               |
| `/api/chat/ui`                                          | POST             | Inject agent-generated UI (`devgent ui …`).                             |
| `/api/chat/stop`                                        | POST             | Cancel the active turn.                                                 |
| `/api/test-runner/{list,run,status,stop,ui}`            | POST/GET         | Drive the out-of-process test runner.                                   |
| `/api/test-runner/stream`                               | GET (SSE)        | Live test results.                                                      |
| `/api/server/*`                                         | GET/POST         | BundlerBridge: config / resolve / graph / transform / reload / restart. |
| `/api/page/*`                                           | GET (SSE) / POST | Page-bus: the agent reads and drives the live DOM.                      |
| `/api/editor/open`                                      | POST             | Open a file in the editor.                                              |

## Develop

```sh
pnpm install
pnpm build        # turbo: protocol → plugin/widget
pnpm typecheck
pnpm test         # integration tests only (real servers/browsers, no mocks)
pnpm lint         # oxlint
pnpm format:check # oxfmt
```

Conventions: pnpm + turborepo; tsdown for node builds, vite (lib mode) for the widget;
vitest; oxlint + oxfmt; strict TypeScript; no barrel files (per-module subpath exports);
integration tests only (`*.it.test.ts`).

## License

[MIT](./LICENSE)
