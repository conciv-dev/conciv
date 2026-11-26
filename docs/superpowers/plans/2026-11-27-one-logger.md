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

## Goals checklist (the plan is not done until every box is checked by the orchestrator)

- [ ] One logging API per side: engine and plugin engine parts use only `Effect.log*`; widget, plugin browser parts
      and host-side code use only the one `log`. Proof: oxlint `no-console` is an error and passes; `git grep` for
      `type Log =`, `log: Log`, `process.std(err|out).write` (outside **output** files of the inventory) returns nothing.
- [ ] One output: every log, engine and browser, lands in the engine's one sink. Proof: the two Effect stacks are
      one layer; browser logs arrive through `logs.write` with `source: 'client'`.
- [ ] Off by default: a fresh engine with no flag, env or config logs nothing (file, stderr, sink) and the widget
      builds no log event.
- [ ] On by flag, env or config: `--verbose`, `--log-level <level>`, `CONCIV_LOG_LEVEL`, `conciv({logLevel})`, in that
      precedence, computed by one function.
- [ ] On at runtime by an agent: outside (`logs.setLevel` over the hub, `conciv logs level <level>`) and inside (the
      `set_log_level` tool), for the engine, the widget, or both; `logs.level` shows the current levels live.
- [ ] Agents read the logs: `logs.query`/`logs.tail` over the hub and the CLI (`conciv logs`), and code mode inside.
- [ ] Every inventory row classed **log** is converted; every **output** row is untouched and listed.
- [ ] No feature lost: every message that was logged before still exists at a level.
- [ ] No test added where an existing journey can carry it; the test budget is unchanged or each raise is accounted.

## Who runs what

Agents write code and run ONLY typecheck, build, lint, format, fallow and the conciv-publish guards. Agents run NO
tests of any kind. The orchestrator runs every test, reads the full diff, checks the goals above, and pushes.

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

### Task 6: Agents can read the logs (outside and in)

The maintainer: "we must expose an API for the agent to query the logs". evlog has no MCP server or agent tools (read
2026-11-27: `evlog@2.37.1` exports, `@evlog/cli` 0.13.0 has `init`, `agents`, `map` only, the signals pages have no read
path). It does ship the storage and the reads:

- `evlog/fs`: `createFsDrain` writes NDJSON per day (`.evlog/logs/2026-03-14.jsonl`, size rotation);
  `readFsLogs({dir, since, until, level, filter})` (async generator of `WideEvent`) and `tailFsLogs` (follow).
- `evlog/memory`: `createMemoryDrain({store, maxEvents: 1000})` ring buffer; `readMemoryLogs({store, since, until,
  level, filter, limit})`.

Steps (maintainer: "can't we store it in our db?" Yes: the engine's own database, not evlog's files or memory):

- Storage is a table in the engine database `backend-defaults` owns (beside the chat tables and the migration
  history; add a drizzle migration the way the existing ones are made, `gen-migrations`). Shape it as evlog's own table
  for self-hosted storage (`@evlog/nuxthub` `evlog_events`, read 2026-11-27): `log_events` with `id` (text PK),
  `timestamp`, `level`, `source` ('engine' | 'client'), `service`, `message`, `method`, `path` (rpc procedure), `status`,
  `duration_ms`, `request_id`, `session_id`, `error`, `data` (JSON text of the remaining fields), `created_at`; indexes
  on `timestamp`, `level`, `source`, `session_id`, `request_id`, `created_at`.
- The one sink (Task 2) writes every entry, engine and client, through one custom evlog drain
  (`evlog.dev/extend/custom-drains`) inside evlog's batching pipeline (`createDrainPipeline`, its default batch size and
  interval), so a burst is one insert. The insert never logs (no recursion): a failed insert is dropped and counted.
  Nothing is written while the level is `off`. This replaces the hand-written file logger; no fs or memory adapter.
- Retention: default 7 days, config `logRetention` (`'7d'`, `'24h'`), one delete on engine start and then every half of
  the window (the `@evlog/nuxthub` schedule), as an Effect fiber the engine owns.

**Port from `@evlog/nuxthub@2.0.2` (battle tested, SQLite included; the maintainer's reference).** Its source, read
2026-11-27, is in the published tarball (`npm pack @evlog/nuxthub@2.0.2`; the orchestrator's copy:
`/private/tmp/claude-501/-Users-omrikatz-Public-web-aidx/5ce1036e-c16e-427d-ba99-bb3348610668/scratchpad/evlog-nuxthub/package/dist`).
Port these files as they are, adapted only to repo rules (no comments, functions, Effect instead of Nitro):

- `runtime/db/schema/events.sqlite.js` (`evlogEvents`, `sqliteTable('evlog_events', ...)`): our table takes the same
  columns, types, `notNull`s and the six indexes, same names with our table name. Two additions, each a deliberate
  deviation: `message` (text, our log entries have one) and `session_id` (text, indexed: agents filter by session).
  `environment` is filled with the engine's channel (`util/observability.ts` `app.channel`, `'local'` by default).
- `runtime/drain.js`: `extractRow` (the `INDEXED_FIELDS` split into columns vs the `data` JSON, `coalesceString`,
  `parseDurationMs`, `error` to JSON text, `id: crypto.randomUUID()`, `createdAt: new Date().toISOString()`) and
  `insertWithRetry` (3 attempts, 500 ms doubling). Their retryable codes are network database codes; for SQLite the
  retryable one is `SQLITE_BUSY` (check the error shape our drizzle driver throws and match on it). Their final
  `console.error` on a failed insert becomes a count the engine exposes in `logs.level` (`dropped`), never a log.
- `runtime/utils/retention.js`: `parseRetention` (`^(\d+)(d|h|m)$`, the same error text without their link) and
  `retentionToCron` (half the window: `*/N * * * *` under an hour, `0 */N * * *` under a day, `0 3 * * *` otherwise).
  Config `logRetention` is validated with `parseRetention` at config parse time.
- `runtime/tasks/evlog-cleanup.js`: `db.delete(...).where(lt(createdAt, cutoff))` with `cutoff = now - totalMs`.
  Nitro's scheduled task becomes an Effect fiber: run once at engine start, then on Effect's `Schedule.cron` built from
  `retentionToCron(retention)`. Their `console.log`/`console.error` become `Effect.logDebug`/`Effect.logWarning`.
- Not ported: `runtime/api/_cron/evlog-cleanup.js` and the Vercel cron (no serverless host here; the fiber is enough),
  and the MySQL/PostgreSQL schemas (we run SQLite only).
- Contract: `logs.query({since?, until?, level?: LogLevel[], source?: 'engine' | 'client', text?, sessionId?, limit (default
  200, max 2000)})` is one drizzle query on `log_events` (filters become WHERE clauses on the indexed columns; `text`
  matches `message` and `data`), newest first. `logs.tail({level?, source?})` streams new events as they are inserted
  (an Effect `PubSub` the drain publishes to, as an async iterator).
  Both `.effect` handlers once the oRPC 2 PR lands; plain handlers until then.
- Outside agent: through the hub like any procedure, and `conciv logs [--level <l>] [--since <time>] [--grep <text>]
  [--follow]` in the CLI.
- Inside agent: code mode gets them as `external_logs_query` / the tail as a stream, like every engine capability
  (read how core capabilities reach code mode and follow it). Reading logs does not ask permission; widget events carry
  page data, so `source: 'client'` events are redacted through evlog's redaction config (read `evlog.dev/learn/redaction`)
  before they are stored.
- Logs off means nothing is stored and `logs.query` answers `[]` with `{level: 'off'}` so the agent knows to raise it.
- Not now: `@evlog/signals` (model judgments on each event through an external AI gateway, a cost and egress decision for
  the maintainer later).
- **Tests:** fold into the Task 4 step in `router.it.test.ts`: after `logs.setLevel('debug')`, a call's log entry comes
  back from `logs.query({text})`.
- Goals checklist addition: "Agents read the logs: `logs.query`/`logs.tail` over the hub and CLI, and code mode inside."
