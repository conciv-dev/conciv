# One Logger, Off by Default: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One logging API per side (Effect `Effect.log*` in the engine and plugin engine parts, one `log` in the
widget, plugin browser parts and host-side code), one output, every log off by default, turned on by a flag, the
config, or an agent (outside through the hub or CLI, inside through a tool).

**Architecture:** The engine's two Effect logger stacks merge into one layer whose minimum level is a runtime `Ref`.
The level is computed once from CLI flag > env > config > `off`, and changed at runtime through `logs.setLevel`. The
widget logs through evlog core with a drain that sends batches over the existing engine socket to `logs.write`, so
browser logs land in the engine's one sink. Every `console.*`, raw `process.std*.write` used for logging, and
hand-made `log` callback becomes the side's one API.

**Tech Stack:** Effect 4 `Logger`/`References.MinimumLogLevel`, oRPC (contract procedures), evlog core (`evlog`) in
the browser, oxlint `no-console`.

**Spec:** the maintainer's words of 2026-11-27 (quoted below) and the oRPC 2 plan's Task 17 (`feat/orpc-2`,
`docs/superpowers/plans/2026-11-27-orpc-2-upgrade.md`), which this plan must not conflict with.

## Task 1: Full inventory, classified (before any code)

The orchestrator's count on main (d0009c974), tests, stories and dist excluded:

- `console.*`: 84 files, 165 calls in `packages/` and `apps/site/src` (per package: frontend-defaults 25,
  frontend-app-api 12, unplugin 6, ui-kit-chat 6, plugins/page 5, plugins/terminal 4, backend-defaults 3, client 2,
  app 2, react 2, preact 2, solid-streamdown 2, skills 2, ui-kit-system 1, types 1, publish 1, harness 1,
  frontend-plugin-api 1, plugins/recorder 1, cli 1, and apps/site).
- Raw `process.stderr/stdout.write`: 16 sites: backend-defaults `util/observability/logging.ts`, bundle-size `cli.ts`
  (2), cli `envelope.ts` (2) and `hub.ts`, harness `init/claude/bridge.ts`, publish `ci-shards.ts` (3), simulation
  `backend/simulated-provider.ts` and `simulated-ui.ts`, try `cli.ts` and `connect.ts` (2), unplugin
  `core/shutdown-deadline.ts`.
- Effect logger stacks: `util/observability.ts` + `util/observability/logging.ts` (file, stderr, OTLP via
  `otlp.ts`), and `engine/lib/logging.ts` (host `emit`).
- Hand-made log callbacks threaded as arguments: `type Log = (message: string) => void` in
  `backend-defaults/src/ai/code-mode.ts:34` and `ai/quickjs-thread.ts:24`, `log: Log` deps in `engine/api/call-trace.ts`,
  `engine/api/mcp.ts`, `engine/api/rpc/{hub,mount,sessions}.ts` (and more: `git grep -nE "\blog: Log\b|type Log ="`),
  `backend-app-api/src/core/bus.ts:153` `log`, `frontend-plugin-api/src/scope.ts` `options.log`.
- Libraries: `@clack/prompts` in `cli/src/init/wizard.ts` and `try/src/cli.ts` (user-facing prompts, not logs).

- [ ] Re-run the inventory yourself (the greps above plus `git grep -nE "\.(warn|error|info|debug)\(" ` for any other
      logger objects, e.g. vite's `server.config.logger`, and `native/` Swift `print`/`os_log`) and write a table to
      `docs/superpowers/plans/2026-11-27-one-logger-inventory.md`: file:line, what it is, and its class:
      **log** (diagnostics: goes through the side's one API and is off by default) or **output** (the CLI, publish, skills,
      bundle-size, try and the dev server printing to the user on purpose: stays, and follows `--quiet`/its command's own
      rules). Every hand-made `log` callback is classed **log** and is deleted in favour of `Effect.log*` (engine) or the
      widget `log`. Commit the inventory before Task 2.

The maintainer: "we don't need 5 loggers"; "all logs are off by default; only verbose flags or a CLI flag turn them on;
an agent, outside or in, can turn them on too"; client logging per `evlog.dev/use-cases/client-logging`.

What exists today (read 2026-11-27):

- Engine stack A: `backend-defaults/src/util/observability.ts:20-50` + `util/observability/logging.ts:135-152`: Effect
  loggers to a file, stderr and OTLP; level from `CONCIV_LOG_LEVEL`, default **INFO** (`minimumLogLevel()`).
- Engine stack B: `backend-defaults/src/engine/lib/logging.ts`: an Effect `Logger` to the host's `emit` sink.
- `console.*` in product code: frontend-defaults 25 files, frontend-app-api 12, unplugin 6, ui-kit-chat 6,
  plugins/page 5, plugins/terminal 4, backend-defaults 3, client 2, app 2, react 2, preact 2, solid-streamdown 2,
  ui-kit-system 1, types 1, harness 1, frontend-plugin-api 1, plugins/recorder 1 (`git grep -lE "console\.(log|warn|error|info|debug)" -- 'packages/*/src' 'packages/plugins/*/src'`, tests and stories excluded).
  CLI terminal output (`packages/cli`), `packages/publish` and `packages/skills` scripts print to the user on
  purpose and are not logs.

## Global Constraints

- One logging API per side. Engine and plugin engine parts: `Effect.log*` only. Widget, plugin browser parts and the
  unplugin host side: one `log` (evlog core `log` from `evlog`, Task 5). No `console.*` in product code: add an oxlint
  `no-console` error for `packages/*/src` and `packages/plugins/*/src`, with the CLI, publish and skills packages
  excepted, and the one sink in Task 2 excepted by an inline disable on that line.
- One level, one place: `LogLevel = 'off' | 'error' | 'warn' | 'info' | 'debug' | 'trace'`, default `'off'`. A level
  below the current one is dropped before anything is formatted.

### Task 2: One engine logger stack

**Files:** `backend-defaults/src/util/observability.ts`, `util/observability/logging.ts`, `engine/lib/logging.ts`,
the 3 `console.*` files in backend-defaults, `harness` 1, `types` 1.

- Merge stacks A and B into one Effect logger layer: outputs are the host `emit` sink (when the host gave one), the log
  file, stderr only when the level is not `off` and no host sink is given, and OTLP when configured; evlog's
  `loggerLayer()` (and, once the oRPC 2 PR lands, under `evlog/effect` `loggerLayer()`) sits on top. Delete the second stack.
- `References.MinimumLogLevel` comes from a `Ref` the engine owns (`LogLevel.Service` with `get`, `set`, `changes`),
  not from a constant, so it can change at runtime. Initial value: Task 3. `off` maps to Effect's `None`.
- `console.*` in the engine becomes `Effect.log*`.
- **Tests:** `backend-defaults/test/it/session.it.test.ts` and `http.it.test.ts` keep passing with logs off (default).

### Task 3: Turning logs on: config, CLI flag, env

**Files:** `packages/types/src/config-types.ts` (+ its zod schema), `packages/cli/src` (the commands that start or
attach to an engine), `packages/unplugin/src` (passes config to the engine), `util/observability/logging.ts`.

- Config: `conciv({logLevel: 'debug'})`, default `'off'`, with a `.describe()` so the docs table generates it.
- CLI: `--verbose` (= `debug`) and `--log-level <level>` on every command that starts an engine or runs against one;
  the CLI's own diagnostic lines follow the same level (its user-facing output does not).
- Env: `CONCIV_LOG_LEVEL` stays as the way the dev server and spawned engines inherit it; precedence:
  CLI flag > env > config > `off`. One function computes it (`readLogLevel`), used everywhere.
- **Tests:** fold one row into the existing config parsing test table (`logLevel` default `off`, a valid level,
  an invalid one rejected).

### Task 4: Turning logs on at runtime: an agent outside or in

**Files:** `packages/protocol/src/contract.ts`, `backend-defaults/src/engine/api/rpc/router.ts`, the core tools
(where `assist` tools are registered), `packages/cli/src`.

- Contract: `logs.level` (live query, output `{engine: LogLevel, widget: LogLevel}`) and `logs.setLevel`
  (`{level: LogLevel, scope: 'engine' | 'widget' | 'all'}`), both `.effect` handlers on `LogLevel.Service`.
- Outside agent: the hub exposes it like every other procedure; the CLI gets `conciv logs level [<level>]`
  (prints the current levels with no argument).
- Inside agent: a core tool `set_log_level` (an asking operation is a tool, never an rpc method). It asks
  through the normal permission flow only when raising above `warn` for the widget, since widget logs may carry page
  data; read the permission rules in `backend-app-api` and follow their shape.
- **Tests:** fold into `backend-defaults/test/it/router.it.test.ts` "outside agents": the outside client sets the
  level to `debug`, a later call's wide event reaches the sink; set `off`, nothing does.

### Task 5: Widget and plugin browser logging over the engine socket

Source: `evlog.dev/use-cases/client-logging` and `evlog.dev/extend/drain-pipeline`: `evlog` core `initLogger({drain})`
with `log.info({...})`; `evlog/http`'s drain posts over HTTP, which we may not use (all browser-engine traffic is oRPC
over the WebSocket). A custom drain is a function (`evlog.dev/extend/custom-drains`; read it before writing).

**Files:** `packages/client/src` (the drain), `packages/protocol/src/contract.ts`, the engine router, the widget files
listed above.

- Contract: `logs.write` takes a batch of client events (zod schema mirroring evlog's drained event: level, time,
  service, fields), handled as `.effect`: each event goes to the engine logger as one `Effect.log` at its level with
  `source: 'client'` and the event's fields as annotations, so it lands in the same sink.
- Widget: `initLogger({drain})` once at mount, where `drain` batches (evlog's pipeline: size 25, 2 s) and calls
  `logs.write` over the engine connection; with no connection it drops the batch (never queues unbounded).
  The widget's level follows `logs.level`'s `widget` value through the live query; `off` means `log.*` returns
  before building the event. Default `off`.
- Every `console.*` in the widget, ui kits and plugin browser parts becomes `log.*` (object form,
  `{action, ...fields}`), and plugins get `log` from their context (`ctx.log` on the frontend plugin API), not an import.
- No trace join: evlog's client docs do not tie client events to server traces; client events carry the session id
  and tab id as fields instead.
- **Tests:** fold one step into the `frontend-defaults` e2e that already sets settings: with `logs.setLevel` to
  `debug` for the widget, an action that logs reaches the engine sink with `source: 'client'`.
