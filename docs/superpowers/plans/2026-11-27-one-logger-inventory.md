# One Logger: Inventory (Task 1)

Taken on `feat/one-logger` at c026faad9 (main d0009c974). Tests, stories, `dist` and `e2e/` excluded.

Classes: **log** is a diagnostic; it moves to the side's one API (`Effect.log*` in the engine, the one `log` in the
browser and host side) and is off by default. **output** is a command printing to its user on purpose; it stays.
**not a call** and **doc** are text that only names `console`.

## Counts

- `console.*`: 155 lines. 132 **log** in `packages/`, 3 **log (site)** in `apps/site/src`, 16 **output**, 2 **not a
  call**, 2 **doc**. The plan's 165 counted `.(log|warn|error|info|debug)` without the open paren and in `apps/site`
  beyond `src`; the difference is the regex. `plugins/recorder` and `cli` have no logging `console` call today (the
  plan listed one each); cli's two are `--help`/`--version` output.
- Raw `process.std*.write`: 17 sites, 2 **log**, 15 **output**.
- Effect logger stacks: 2, merged into 1 (Task 2).
- Hand-made log callbacks: the engine's `Log` (`engine/lib/logging.ts:84`, made by `logOnRuntime`/`logOnContext`)
  threaded through 13 files, the two `type Log = (message: string) => void` in `ai/`, and `Scope` `options.log` in
  `frontend-plugin-api`. All **log**.
- Not a logger (the plan listed it): `backend-app-api/src/core/bus.ts:153` `log` is the bus's event log, a
  `Stream<LogItem>` of stored events, not diagnostics. Untouched.
- Native: no `print`/`os_log`/`NSLog` in `native/` or any `.swift` source. Nothing to do.
- Other logger objects: `unplugin/src/core/vite.ts:179` writes the engine's host `emit` sink to vite's
  `server.config.logger`; that is the host sink of Task 2 (stays, as the one place the dev server prints engine logs).
- `@clack/prompts` in `cli/src/init/wizard.ts` and `try/src/cli.ts`: user prompts, **output**.

## Engine logger stacks (Task 2)

| file:line                                                             | what                                                                                                    | class                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/backend-defaults/src/util/observability.ts:20-50`           | stack A: file + stderr + OTLP loggers, `MinimumLogLevel` constant from `CONCIV_LOG_LEVEL`, default INFO | **log**: becomes the one layer, level from a `Ref`            |
| `packages/backend-defaults/src/util/observability/logging.ts:128-152` | stack A's stderr logger (`CONCIV_PRINT_LOGS=1`) and `minimumLogLevel()`                                 | **log**: stderr only when level is not `off` and no host sink |
| `packages/backend-defaults/src/util/observability/otlp.ts`            | OTLP loggers + tracer                                                                                   | **log**: kept as an output of the one layer                   |
| `packages/backend-defaults/src/engine/lib/logging.ts:75-82`           | stack B: `Logger.layer` to the host's `emit`                                                            | **log**: becomes an output of the one layer                   |
| `packages/backend-defaults/src/engine/runtime/observability.ts:50`    | composes A and B                                                                                        | **log**: composes the one layer                               |

## Hand-made log callbacks (Task 2)

All **log**; each callback is deleted and its call sites log with `Effect.log*` (or run it through the runtime the
caller already has where the caller is promise code).

| file                                                                               | what                                                          |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/backend-defaults/src/engine/lib/logging.ts:84-98`                        | `type Log`, `logOnRuntime`, `logOnContext`                    |
| `packages/backend-defaults/src/engine/start.ts` (180, 221, 236, 247, 349, 421)     | `earlyLog`, `log`, threaded into port, cleanup, home registry |
| `packages/backend-defaults/src/engine/app.ts` (157, 269, 288, 366, 525, 703, 1004) | `earlyLog`, `log`, saved models, env, configured rows         |
| `packages/backend-defaults/src/engine/engine-login.ts` (95, 171, 180)              | code store, trusted browsers                                  |
| `packages/backend-defaults/src/engine/runtime/core-runtime.ts` (16, 58)            | core runtime deps                                             |
| `packages/backend-defaults/src/engine/sessions/session-rows.ts` (411, 666, 672)    | row reads                                                     |
| `packages/backend-defaults/src/engine/sessions/session-search.ts:321`              | search index                                                  |
| `packages/backend-defaults/src/engine/settings/settings-storage.ts` (55, 81, 135)  | settings file                                                 |
| `packages/backend-defaults/src/engine/api/call-trace.ts:27`                        | call trace deps                                               |
| `packages/backend-defaults/src/engine/api/mcp.ts:217`                              | MCP deps                                                      |
| `packages/backend-defaults/src/engine/api/rpc/hub.ts` (22, 32)                     | hub rpc deps                                                  |
| `packages/backend-defaults/src/engine/api/rpc/mount.ts:84`                         | mount rpc deps                                                |
| `packages/backend-defaults/src/engine/api/rpc/sessions.ts` (182, 195, 209)         | sessions rpc deps                                             |
| `packages/backend-defaults/src/ai/code-mode.ts:34`                                 | `type Log = (message: string) => void`                        |
| `packages/backend-defaults/src/ai/quickjs-thread.ts:24`                            | `type Log = (message: string) => void`                        |
| `packages/frontend-plugin-api/src/scope.ts:35` (75, 96)                            | `Scope.make` `options.log` (Task 5)                           |

## Raw `process.std*.write`

| file:line                                                         | what                                                            | class                                                                  |
| ----------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/backend-defaults/src/util/observability/logging.ts:132` | stack A's stderr logger                                         | **log** (Task 2)                                                       |
| `packages/cli/src/hub.ts:602`                                     | `logHub`: the stdio MCP server's failure lines on stderr        | **log**: the CLI's own diagnostic, follows the level (Task 3)          |
| `packages/bundle-size/src/cli.ts:29`, `:32`                       | report, over-budget line                                        | **output**                                                             |
| `packages/cli/src/envelope.ts:9`, `:17`                           | `--json` envelope                                               | **output**                                                             |
| `packages/harness/src/init/claude/bridge.ts:79`                   | generated bridge script's protocol replies on stdout            | **output** (a wire, not a log)                                         |
| `packages/publish/src/ci-shards.ts:88`, `:153`, `:192`, `:209`    | matrix, skip note, summary, usage                               | **output**                                                             |
| `packages/simulation/src/backend/simulated-provider.ts:310`       | `conciv drive backend websocket: <url>`                         | **output**: drivers and docs read this line (`docs/simulation.mdx:52`) |
| `packages/simulation/src/backend/simulated-ui.ts:128`             | `conciv drive ui websocket: <url>`                              | **output**: same                                                       |
| `packages/try/src/cli.ts:31`                                      | `conciv-try` lines                                              | **output**                                                             |
| `packages/try/src/connect.ts:54`, `:56`                           | login banner, errors to the user                                | **output**                                                             |
| `packages/unplugin/src/core/shutdown-deadline.ts:60`              | the dev server's last line before `exit(1)` on a stuck shutdown | **output** (fatal, printed at every level)                             |

## `console.*`

Side: **engine/host node** (engine, harness, types, cli, unplugin) uses `Effect.log*` where Effect runs and the one
host `log` otherwise; **browser** uses the widget `log` (plugins through `ctx.log`); **site** is `apps/site`, a React
app outside the widget and engine: it is not in the lint scope (`packages/*/src`) and keeps its own `console` (a
difference from the plan, which listed it in the count).

The three `unplugin/src/core/widget-module.ts`/`widget-start.ts` lines are source the plugin writes into the host
page's module, run before any widget or engine connection exists. They become the widget's own mount reporting
(the generated code calls `mountConciv()`, which logs its failure through the widget `log`).

| file:line                                                                    | what                                                                                                             | class          | side             |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------- | ---------------- |
| `apps/site/src/lib/live-widget.tsx:9`                                        | `console.error('conciv live widget mount failed', error),`                                                       | **log (site)** | site             |
| `apps/site/src/lib/mount-live-widget.ts:40`                                  | `.catch((error: unknown) => console.error('conciv try param could not be cleared', error))`                      | **log (site)** | site             |
| `apps/site/src/lib/og-render.server.ts:46`                                   | `console.error('Failed to generate OG image', error)`                                                            | **log (site)** | site             |
| `packages/app/src/mount-impl.tsx:40`                                         | `console.warn('[conciv] ignoring non-loopback cross-origin ?core= api base')`                                    | **log**        | browser          |
| `packages/app/src/mount.ts:77`                                               | `console.error('[conciv] failed to start widget', error)`                                                        | **log**        | browser          |
| `packages/app/src/mount.ts:101`                                              | `console.error('[conciv] panel command failed', error)`                                                          | **log**        | browser          |
| `packages/backend-defaults/src/ai/code-mode.ts:109`                          | prompt text that tells the model to use `console.log` in code mode; untouched                                    | **not a call** | engine/host node |
| `packages/backend-defaults/src/ai/image-tool-results.ts:165`                 | `console.error(`[ai] the tool bridge request failed: ${String(error)}`)`                                         | **log**        | engine/host node |
| `packages/cli/src/run.ts:32`                                                 | `--help` text                                                                                                    | **output**     | engine/host node |
| `packages/cli/src/run.ts:36`                                                 | `--version` text                                                                                                 | **output**     | engine/host node |
| `packages/client/src/plugin/rpc.ts:182`                                      | `console.error(error)`                                                                                           | **log**        | engine/host node |
| `packages/client/src/plugin/rpc.ts:187`                                      | `console.error(`[plugin] the event subscription of rpc.${definition.id}.${name} failed`, error),`                | **log**        | engine/host node |
| `packages/client/src/settings/settings.ts:117`                               | `console.error(`conciv: following the ${target.scope} settings of "${target.namespace}" failed`, error)`         | **log**        | engine/host node |
| `packages/frontend-app-api/src/persistence/persist.ts:98`                    | `console.error(`[persistence] write failed for ${input.name}`, error)`                                           | **log**        | browser          |
| `packages/frontend-app-api/src/persistence/storage.ts:167`                   | `console.error(`[persistence] write failed for ${key}`, error)`                                                  | **log**        | browser          |
| `packages/frontend-app-api/src/persistence/storage.ts:180`                   | `console.error(`[persistence] write failed for ${key}: this browser's storage is full`)`                         | **log**        | browser          |
| `packages/frontend-app-api/src/persistence/storage.ts:220`                   | `console.error(`[persistence] could not put back ${entry.key}`, error)`                                          | **log**        | browser          |
| `packages/frontend-app-api/src/persistence/storage.ts:233`                   | `console.error(`[persistence] read failed for ${name}`, error)`                                                  | **log**        | browser          |
| `packages/frontend-app-api/src/persistence/storage.ts:265`                   | `console.error(`[persistence] remove failed for ${name}`, error)`                                                | **log**        | browser          |
| `packages/frontend-app-api/src/persistence/storage.ts:514`                   | `const failed = (key: string) => (error: unknown) => console.error(`[persistence] remove failed for ${key}`, er` | **log**        | browser          |
| `packages/frontend-app-api/src/plugin/dialog-stack.tsx:287`                  | `void Promise.try(fn).catch((cause: unknown) => console.error('[dialog]', cause))`                               | **log**        | browser          |
| `packages/frontend-app-api/src/plugin/enable-state.ts:11`                    | `console.error(`[plugins] dropped the stored enable state of ${id}`, row.error)`                                 | **log**        | browser          |
| `packages/frontend-app-api/src/plugin/hmr.tsx:20`                            | `.catch((cause: unknown) => console.error(`[plugin] ${definition.id}`, cause))`                                  | **log**        | browser          |
| `packages/frontend-app-api/src/plugin/host.tsx:456`                          | `void Promise.try(() => setMachine(next.state)).catch((cause: unknown) => console.error('[plugin] host', cause)` | **log**        | browser          |
| `packages/frontend-app-api/src/plugin/host.tsx:467`                          | `console.error(`[plugin] ${'id' in effect ? effect.id : effect.instance.definition.id}`, cause)`                 | **log**        | browser          |
| `packages/frontend-app-api/src/plugin/host.tsx:530`                          | `console.error(`[plugin] ${effect.id}`, effect.cause)`                                                           | **log**        | browser          |
| `packages/frontend-app-api/src/plugin/host.tsx:547`                          | `void Promise.resolve(returned).catch((cause: unknown) => console.error(`[plugin] ${effect.id}`, cause))`        | **log**        | browser          |
| `packages/frontend-app-api/src/plugin/host.tsx:563`                          | `void Promise.try(fn).catch((cause: unknown) => console.error(`[plugin] ${plugin}`, cause))`                     | **log**        | browser          |
| `packages/frontend-app-api/src/plugin/located.ts:25`                         | `return void Promise.try(effect.run).catch((cause: unknown) => console.error('[plugin]', cause))`                | **log**        | browser          |
| `packages/frontend-app-api/src/plugin/manager.ts:19`                         | `console.error('[plugins] following the plugin enable state failed', error)`                                     | **log**        | browser          |
| `packages/frontend-app-api/src/plugin/plugins.tsx:57`                        | `console.error('[plugin] plugin experimental effect failed', cause),`                                            | **log**        | browser          |
| `packages/frontend-app-api/src/plugin/plugins.tsx:103`                       | `console.error('[plugin] failed to load plugin experimentals', effect.cause)`                                    | **log**        | browser          |
| `packages/frontend-app-api/src/plugin/render.tsx:257`                        | `console.error(`[plugin] ${item.plugin}`, cause),`                                                               | **log**        | browser          |
| `packages/frontend-app-api/src/plugin/startup.ts:87`                         | `console.error('[plugin] failed to load installed plugin list', cause)`                                          | **log**        | browser          |
| `packages/frontend-app-api/src/plugin/stores.ts:92`                          | `if (effect.log) console.error('[plugin storage] Load failed', effect.cause)`                                    | **log**        | browser          |
| `packages/frontend-app-api/src/plugin/stores.ts:101`                         | `(write) => void write.catch((cause: unknown) => console.error('[plugin storage] Queued write failed', cause)),` | **log**        | browser          |
| `packages/frontend-app-api/src/plugin/stores.ts:161`                         | `console.error('[plugin storage] Queued write failed', cause),`                                                  | **log**        | browser          |
| `packages/frontend-defaults/src/app/engine-login.tsx:67`                     | `console.error('[conciv] the magic link code exchange failed', error)`                                           | **log**        | browser          |
| `packages/frontend-defaults/src/app/engine-login.tsx:100`                    | `console.error('[conciv] could not ask the dev server for a login code', error)`                                 | **log**        | browser          |
| `packages/frontend-defaults/src/app/engine-login.tsx:115`                    | `console.error('[conciv] the code exchange failed', error)`                                                      | **log**        | browser          |
| `packages/frontend-defaults/src/app/live-sessions.ts:152`                    | `session.refresh().catch((error: unknown) => console.error('[conciv] re-hydrating the chat failed', error))`     | **log**        | browser          |
| `packages/frontend-defaults/src/app/start-session.ts:11`                     | `console.error('[conciv] could not start a new session', error)`                                                 | **log**        | browser          |
| `packages/frontend-defaults/src/data/app-data.ts:147`                        | `if (!refusedByEngine(error)) console.error('[conciv] could not save the draft', error)`                         | **log**        | browser          |
| `packages/frontend-defaults/src/data/app-data.ts:208`                        | `console.error(`[conciv] could not check session ${sessionId}, so its local draft stays`, error)`                | **log**        | browser          |
| `packages/frontend-defaults/src/data/app-data.ts:215`                        | `console.error('[conciv] could not remove the local draft of a gone session', error)`                            | **log**        | browser          |
| `packages/frontend-defaults/src/data/app-data.ts:221`                        | `console.error('[conciv] could not list the local drafts', error)`                                               | **log**        | browser          |
| `packages/frontend-defaults/src/data/app-data.ts:235`                        | `console.error('[conciv] could not empty the local draft store', error)`                                         | **log**        | browser          |
| `packages/frontend-defaults/src/drive/drive.ts:53`                           | `console.warn('[conciv] drive could not answer the engine', error),`                                             | **log**        | browser          |
| `packages/frontend-defaults/src/drive/drive.ts:58`                           | `if (!ctx.signal.aborted) console.error('[conciv] drive stopped answering the engine', error)`                   | **log**        | browser          |
| `packages/frontend-defaults/src/frontend-defaults.tsx:61`                    | `console.error('[conciv] teardown step failed', error)`                                                          | **log**        | browser          |
| `packages/frontend-defaults/src/frontend-defaults.tsx:117`                   | `console.error(`[conciv] the rebind names no engine base: ${apiBase}`, error)`                                   | **log**        | browser          |
| `packages/frontend-defaults/src/frontend-defaults.tsx:169`                   | `console.error(`[conciv] this host cannot rebind the widget to ${nextApiBase}`)`                                 | **log**        | browser          |
| `packages/frontend-defaults/src/frontend-defaults.tsx:174`                   | `console.error('[conciv] the queries did not reset after a rebind', error)`                                      | **log**        | browser          |
| `packages/frontend-defaults/src/frontend-defaults.tsx:177`                   | `console.error('[conciv] the trust check after a rebind failed', error)`                                         | **log**        | browser          |
| `packages/frontend-defaults/src/frontend-defaults.tsx:187`                   | `console.error('[conciv] the widget did not leave the other engine’s session after a rebind', error)`            | **log**        | browser          |
| `packages/frontend-defaults/src/lib/color-scheme.ts:101`                     | `console.warn(`                                                                                                  | **log**        | browser          |
| `packages/frontend-defaults/src/pane/chat-pane.tsx:360`                      | `console.error('[conciv] could not restore the draft', error)`                                                   | **log**        | browser          |
| `packages/frontend-defaults/src/pane/composer-input-adapter.tsx:60`          | `console.error('[conciv] could not remove the attachment', error)`                                               | **log**        | browser          |
| `packages/frontend-defaults/src/pane/deleted-session-panel.tsx:22`           | `console.error('[conciv] could not read the deleted session draft', error)`                                      | **log**        | browser          |
| `packages/frontend-defaults/src/pane/deleted-session-panel.tsx:29`           | `console.error('[conciv] could not move to a new session', error)`                                               | **log**        | browser          |
| `packages/frontend-defaults/src/pane/draft-storage.ts:111`                   | `console.error('[conciv] the local draft is not a draft, read as absent', parsed.error)`                         | **log**        | browser          |
| `packages/frontend-defaults/src/pane/draft-storage.ts:144`                   | `console.error('[conciv] could not read the local draft', error)`                                                | **log**        | browser          |
| `packages/frontend-defaults/src/pane/draft-storage.ts:154`                   | `console.error(`[conciv] the local draft has no bytes for ${attachment.name}`)`                                  | **log**        | browser          |
| `packages/frontend-defaults/src/pane/draft-storage.ts:173`                   | `console.error(`[conciv] could not read ${attachment.name} from the local draft`, error)`                        | **log**        | browser          |
| `packages/frontend-defaults/src/pane/draft-storage.ts:282`                   | `console.error('[conciv] could not keep the draft stamp in the local draft', error)`                             | **log**        | browser          |
| `packages/frontend-defaults/src/pane/draft-storage.ts:526`                   | `if (!isCancelledError(error)) console.error('[conciv] could not read the saved draft', error)`                  | **log**        | browser          |
| `packages/frontend-defaults/src/pane/draft-storage.ts:556`                   | `console.error('[conciv] could not keep the returned text in the local draft', error)`                           | **log**        | browser          |
| `packages/frontend-defaults/src/pane/draft-storage.ts:677`                   | `console.warn(`[conciv] ${file.name} is over ${MAX_INLINE_BYTES} bytes, so the local draft keeps no copy of it`` | **log**        | browser          |
| `packages/frontend-defaults/src/pane/draft-storage.ts:681`                   | `console.error('[conciv] could not keep the attached image in the local draft store', error)`                    | **log**        | browser          |
| `packages/frontend-defaults/src/pane/draft-storage.ts:717`                   | `console.error('[conciv] could not read the saved images of the deleted session draft', error)`                  | **log**        | browser          |
| `packages/frontend-defaults/src/pane/draft-storage.ts:736`                   | `console.error('[conciv] could not remove the local draft of the deleted session', error)`                       | **log**        | browser          |
| `packages/frontend-defaults/src/pane/draft-storage.ts:799`                   | `written = queued.catch((error: unknown) => console.error('[conciv] a local draft step failed', error))`         | **log**        | browser          |
| `packages/frontend-defaults/src/pane/draft-storage.ts:812`                   | `console.error('[conciv] could not keep the queued message as a draft', error)`                                  | **log**        | browser          |
| `packages/frontend-defaults/src/pane/draft-storage.ts:908`                   | `console.error('[conciv] could not read the saved draft, the local draft stays', error)`                         | **log**        | browser          |
| `packages/frontend-defaults/src/pane/plugin-composer-pills.tsx:59`           | `void Promise.try(action).catch((cause: unknown) => console.error(`[plugin] ${props.plugin}`, cause))`           | **log**        | browser          |
| `packages/frontend-defaults/src/pane/trigger-sources.ts:47`                  | `void Promise.try(run).catch((cause: unknown) => console.error(owner, cause))`                                   | **log**        | browser          |
| `packages/frontend-defaults/src/pane/trigger-sources.ts:199`                 | `if (!isCancelledError(result.reason)) console.error(`[conciv] the @ list could not read ${catalog}`, result.re` | **log**        | browser          |
| `packages/frontend-defaults/src/routes/panel.$sessionId.tsx:109`             | `.catch((error: unknown) => console.error('[conciv] the session row did not load before the panel', error))`     | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/browser-tab/open-browser-tab.ts:133` | `Effect.sync(() => signal.aborted \|\| console.warn('[conciv] reporting the browser tab failed', cause)),`       | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/browser-tab/open-browser-tab.ts:148` | `: Effect.sync(() => console.warn('[conciv] the browser tab could not open', Cause.pretty(cause))),`             | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/persistence/drafts.ts:363`           | `console.error(`[persistence] draft ${key} references blobs with no bytes to restore`, unrestored)`              | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/persistence/drafts.ts:397`           | `console.error(`[persistence] draft ${key} is not a stored document, read as absent`, parsed.error)`             | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/persistence/drafts.ts:440`           | `console.error('[conciv] drafts stay engine-only', error)`                                                       | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/persistence/drafts.ts:477`           | `console.error('[persistence] the draft database did not open; drafts stay engine-only', error)`                 | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/persistence/last-screen.ts:9`        | `console.error('[persistence] could not read the last screen of this tab', error)`                               | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/persistence/last-screen.ts:18`       | `console.error('[persistence] could not keep the last screen of this tab', error)`                               | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/persistence/leaving-copy.ts:28`      | `console.error(`[persistence] could not keep the leaving copy of draft ${name}`, error)`                         | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/persistence/leaving-copy.ts:36`      | `console.error(`[persistence] could not drop the leaving copy of draft ${name}`, error)`                         | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/persistence/leaving-copy.ts:44`      | `console.error(`[persistence] could not read the leaving copy of draft ${name}`, error)`                         | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/persistence/leaving-copy.ts:54`      | `console.error(`[persistence] the leaving copy of draft ${name} is not a draft, dropped`, parsed.error)`         | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/persistence/leaving-copy.ts:75`      | `console.error('[persistence] could not drop the leaving copies of the drafts', error)`                          | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/persistence/session-storage.ts:5`    | `console.error('[persistence] this page has no sessionStorage', error)`                                          | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/plugin/host-apis.tsx:200`            | `void Promise.try(() => effect.run(effect.attached)).catch((cause: unknown) => console.error('[plugin]', cause)` | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/plugin/host-apis.tsx:389`            | `run: () => void Promise.try(() => action.run()).catch((cause: unknown) => console.error('[plugin]', cause)),`   | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/plugin/host-apis.tsx:621`            | `return console.error(`                                                                                          | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/plugin/host-apis.tsx:629`            | `.catch((cause: unknown) => console.error(`[plugin] ${plugin}: the draft did not open`, cause))`                 | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/plugin/host-apis.tsx:655`            | `void navigated.catch((cause: unknown) => console.error(`[plugin] ${plugin}: settings did not open`, cause))`    | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/plugin/host-apis.tsx:679`            | `void router.invalidate().catch((cause: unknown) => console.error('[plugin] Route check failed', cause))`        | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/plugin/mounted-session.ts:164`       | `console.error('[plugin] Composer write failed', cause),`                                                        | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/plugin/mounted-session.ts:195`       | `console.error('[plugin] Composer draft load failed', effect.cause)`                                             | **log**        | browser          |
| `packages/frontend-defaults/src/runtime/plugin/mounted-session.ts:224`       | `console.error('[plugin] Composer.attach is not implemented yet', part.type)`                                    | **log**        | browser          |
| `packages/frontend-defaults/src/shell/notice-context.tsx:35`                 | `console.error(`[conciv] ${message}`, error)`                                                                    | **log**        | browser          |
| `packages/frontend-defaults/src/shell/plugin-surfaces.tsx:131`               | `console.error(`[plugin] ${item.plugin} panel list failed`, cause)`                                              | **log**        | browser          |
| `packages/frontend-defaults/src/shell/plugin-surfaces.tsx:146`               | `console.error(`[plugin] ${item.plugin} panel normalize failed`, cause)`                                         | **log**        | browser          |
| `packages/frontend-plugin-api/src/scope.ts:49`                               | doc example of the hand-made `options.log`; goes with the callback                                               | **log**        | browser          |
| `packages/harness/src/codex/models.ts:90`                                    | `console.warn(`conciv: ignoring unparsable ${path}`, error)`                                                     | **log**        | engine/host node |
| `packages/plugins/page/src/attachment.ts:72`                                 | `Effect.sync(() => ended.aborted \|\| console.warn('[conciv] page send failed', cause)),`                        | **log**        | browser          |
| `packages/plugins/page/src/attachment.ts:98`                                 | `Effect.sync(() => ended.aborted \|\| console.warn('[conciv] page command failed', cause)),`                     | **log**        | browser          |
| `packages/plugins/page/src/attachment.ts:112`                                | `Effect.sync(() => ended.aborted \|\| console.warn('[conciv] page event subscription failed', cause)),`          | **log**        | browser          |
| `packages/plugins/page/src/grab.ts:64`                                       | `console.error('[page] the element picker did not start', cause)`                                                | **log**        | browser          |
| `packages/plugins/page/src/operations.ts:683`                                | `console.error(`[conciv] page ${operation} ${kind} capture failed`, error)`                                      | **log**        | browser          |
| `packages/plugins/page/src/operations.ts:714`                                | `console.error(`[conciv] page ${operation} capture bundle failed`, error)`                                       | **log**        | browser          |
| `packages/plugins/page/src/react.ts:35`                                      | `console.warn('[conciv] react devtools hook unavailable', error)`                                                | **log**        | browser          |
| `packages/plugins/page/src/react.ts:90`                                      | `console.warn('[conciv] react source frames unavailable', error)`                                                | **log**        | browser          |
| `packages/plugins/page/src/react.ts:503`                                     | `console.warn('[conciv] react render tracking unavailable', error)`                                              | **log**        | browser          |
| `packages/plugins/page/src/simulator.ts:108`                                 | `console.warn('[conciv] agent glow fade failed', reason)`                                                        | **log**        | browser          |
| `packages/plugins/page/src/simulator.ts:177`                                 | `console.warn('[conciv] agent glow unavailable', error)`                                                         | **log**        | browser          |
| `packages/plugins/terminal/src/terminal-panel.tsx:46`                        | `console.error('[terminal] loading the session terminal failed', cause)`                                         | **log**        | browser          |
| `packages/plugins/terminal/src/terminal-surface.tsx:91`                      | `console.error('[terminal] opening the session terminal failed', cause)`                                         | **log**        | browser          |
| `packages/plugins/terminal/src/terminal-toolbar.tsx:64`                      | `console.error('[terminal] picking an element failed', cause)`                                                   | **log**        | browser          |
| `packages/plugins/terminal/src/terminal-transport.ts:20`                     | `console.error('[terminal] a terminal call failed', cause)`                                                      | **log**        | browser          |
| `packages/preact/src/README.md:16`                                           | README line; updated with the code                                                                               | **doc**        | browser          |
| `packages/preact/src/preact.ts:31`                                           | `handle.mount(host).catch((error: unknown) => console.error('conciv widget failed to mount', error))`            | **log**        | browser          |
| `packages/publish/src/cli.ts:124`                                            | `for (const note of await assertTestsWithinBudget(cwd)) console.log(note)`                                       | **output**     | browser          |
| `packages/publish/src/cli.ts:206`                                            | `console.log(`                                                                                                   | **output**     | browser          |
| `packages/publish/src/cli.ts:218`                                            | `console.log(`                                                                                                   | **output**     | browser          |
| `packages/publish/src/cli.ts:235`                                            | `console.log(JSON.stringify({healthy, plan}, null, 2))`                                                          | **output**     | browser          |
| `packages/publish/src/cli.ts:239`                                            | `console.log(`${name}: ${state} -> ${actions.join(', ')}`)`                                                      | **output**     | browser          |
| `packages/publish/src/cli.ts:241`                                            | `console.log(`${healthy}/${states.length} packages healthy`)`                                                    | **output**     | browser          |
| `packages/publish/src/cli.ts:390`                                            | `console.log(`                                                                                                   | **output**     | browser          |
| `packages/publish/src/cli.ts:394`                                            | `console.log(`dry run: skipping tag lookup and push for ${MIRROR_REPOSITORY}`)`                                  | **output**     | browser          |
| `packages/publish/src/cli.ts:412`                                            | `console.log(`conciv-swift ${sdkVersion} already tagged on ${MIRROR_REPOSITORY} and identical; nothing to publi` | **output**     | browser          |
| `packages/publish/src/cli.ts:416`                                            | `console.log(`published conciv-swift ${sdkVersion} to ${MIRROR_REPOSITORY}`)`                                    | **output**     | browser          |
| `packages/react/src/react.ts:30`                                             | `handle.mount(host).catch((error: unknown) => console.error('conciv widget failed to mount', error))`            | **log**        | browser          |
| `packages/skills/src/cli.ts:11`                                              | `console.log(report)`                                                                                            | **output**     | browser          |
| `packages/skills/src/cli.ts:13`                                              | `console.error(report)`                                                                                          | **output**     | browser          |
| `packages/solid-streamdown/src/README.md:22`                                 | README line; updated with the code                                                                               | **doc**        | browser          |
| `packages/solid-streamdown/src/streamdown.tsx:291`                           | `console.error(`[streamdown] ${props.node.language ?? 'plain'} fence view failed`, error)`                       | **log**        | browser          |
| `packages/types/src/state-types.ts:21`                                       | `if (!ExistingFileErrorSchema.safeParse(error).success) console.error('conciv: could not write', ignoreFile, er` | **log**        | engine/host node |
| `packages/ui-kit-chat/src/behaviors/composer-draft-storage.ts:88`            | `console.error(`[conciv] could not read ${attachment.name}, so the saved draft leaves it out`, error)`           | **log**        | browser          |
| `packages/ui-kit-chat/src/primitives/composer/composer-handlers.tsx:25`      | `console.error('[conciv] the message could not be sent', error)`                                                 | **log**        | browser          |
| `packages/ui-kit-chat/src/styled/composer.tsx:54`                            | `console.error('[conciv] could not remove the attachment', error)`                                               | **log**        | browser          |
| `packages/ui-kit-chat/src/styled/highlight-shared.ts:45`                     | sample source shown by the highlighter; untouched                                                                | **not a call** | browser          |
| `packages/ui-kit-system/src/scripts/check-tokens.ts:16`                      | `console.error(`                                                                                                 | **output**     | browser          |
| `packages/ui-kit-system/src/scripts/check-tokens.ts:22`                      | `console.log(`Generated token outputs are up to date (${generatedOutputs().length} files).`)`                    | **output**     | browser          |
| `packages/unplugin/src/core/bin-shim.ts:21`                                  | `console.error('conciv: could not link the conciv command into', binDir, error)`                                 | **log**        | engine/host node |
| `packages/unplugin/src/core/vite.ts:92`                                      | `console.warn(`                                                                                                  | **log**        | engine/host node |
| `packages/unplugin/src/core/vite.ts:208`                                     | `.catch((error: unknown) => console.error('conciv: stopping the engine failed', error))`                         | **log**        | engine/host node |
| `packages/unplugin/src/core/widget-module.ts:24`                             | `` mountConciv().catch((error) => console.error('[conciv] widget failed to start', error))`,`                    | **log**        | engine/host node |
| `packages/unplugin/src/core/widget-module.ts:38`                             | `` conciv.mount(panel).catch((error) => console.error('[conciv] widget failed to start', error))`,`              | **log**        | engine/host node |
| `packages/unplugin/src/core/widget-start.ts:9`                               | `mountWidget().catch((error) => console.error('[conciv] widget failed to start', error))`                        | **log**        | engine/host node |
| `packages/unplugin/src/unplugin.ts:26`                                       | `console.error('conciv: could not write', ignoreFile, error)`                                                    | **log**        | engine/host node |
| `packages/unplugin/src/unplugin.ts:33`                                       | `console.error(`                                                                                                 | **log**        | engine/host node |
| `packages/unplugin/src/unplugin.ts:50`                                       | `console.error(`conciv: could not write the widget client ${path}, so the page gets no widget: ${cause}`)`       | **log**        | engine/host node |
| `packages/unplugin/src/unplugin.ts:123`                                      | `.catch((error: unknown) => console.error('conciv: stopping the engine failed', error))`                         | **log**        | engine/host node |
