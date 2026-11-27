# @conciv/cli

## 0.0.23

### Patch Changes

- [#879](https://github.com/conciv-dev/conciv/pull/879) [`2a8657b`](https://github.com/conciv-dev/conciv/commit/2a8657b60f990eaa5ffdf4961b48a49dc2a85da3) Thanks [@omridevk](https://github.com/omridevk)! - The conciv section `conciv init` writes to AGENTS.md (and the Claude plugin's conciv skill) now teaches commands that run as written: `tools react find --name <ComponentName>` instead of `react find <ComponentName>`, and tracking as `tools react track --action start`, reproduce, `--action report [--name <ComponentName>]`, then `--action stop`, instead of `react track <selector>`. `react inspect` and `page eval` now show the argument each one needs. A project set up before this keeps the old text until you run `npx @conciv/cli@latest init` again, which replaces the marked conciv section.

  The dev server's `graph` method (`conciv plugin call server graph`) with a path relative to the project (`src/routes/index.tsx`) or a `/src/...` url now finds the module; before, only an absolute path did, and anything else answered an empty graph. A path that matches no module now fails with `no module for <file> in the dev server's module graph` instead of an empty success.

- [#839](https://github.com/conciv-dev/conciv/pull/839) [`fe94df4`](https://github.com/conciv-dev/conciv/commit/fe94df49d1089d57a4e08f19b731cc24f4a4f031) Thanks [@omridevk](https://github.com/omridevk)! - New `conciv auth link <page-url>` prints a one-time login link for the conciv dev server of the current project, for example `http://localhost:3001/#conciv_otp=123456`. Opening it logs that browser in without reading a code from the terminal, so a headless run (Playwright, `claude -p`) can log in on its own. The code comes from the new `auth.issueCode` procedure, which only the engine token may call.

  Outside agents that name the tab they act on (the `conciv` CLI with `--tab`, a `conciv mcp serve` call with a `tab`, and the Claude plugin bridge) no longer get a per-call Approve card for tools that ask: their own permission mode decides. A `conciv` CLI call with no `--tab` that finds its engine through the home db acts on the user's latest tab, so it keeps the Approve card. The agent inside the tab keeps its Approve cards, and the one-time Allow under `hubAccess: 'session'` or `'project'` is unchanged.

- [#923](https://github.com/conciv-dev/conciv/pull/923) [`e0e9fd1`](https://github.com/conciv-dev/conciv/commit/e0e9fd1753ca941ea1195d048dd04a894245a2db) Thanks [@omridevk](https://github.com/omridevk)! - The `conciv` CLI and `conciv mcp serve` no longer say no dev server is running (or "0 running") when a dev server is only slow to answer its health check. When the quick 300 ms check finds no engine that can answer, they ask the silent ones once more with a 2 s bound, and if those still do not answer, they name each one and the error it gave. Without `--tab`, the CLI no longer falls back to port 5173 while dev servers are registered but silent. `checkEngines` in `@conciv/db` takes an optional `roots` list to check only those engines.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A tool's optional boolean flag left off the command line no longer reaches the tool as false; the field is left out, as the tool's schema allows.

- [#1171](https://github.com/conciv-dev/conciv/pull/1171) [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d) Thanks [@omridevk](https://github.com/omridevk)! - `conciv tools` builds every page command from the tool's own input schema, as for any plugin tool: the separate `conciv tools react` group is gone (its commands are `conciv tools page find|inspect|locate|override|track|tree`), an optional selector is the `--selector` flag (`conciv tools page text --selector h1`), and a tool with one required text field takes it as its argument (`conciv tools page find App`, `conciv tools page eval <expression>`). The agent guide `conciv init` writes uses these forms.

- [#1079](https://github.com/conciv-dev/conciv/pull/1079) [`6b61e98`](https://github.com/conciv-dev/conciv/commit/6b61e983f253833a39e576536a45a3e4f7a119b9) Thanks [@omridevk](https://github.com/omridevk)! - Every `conciv` command starts faster and installs less: the CLI ships its pure-JS dependencies bundled into its dist (only the native `@ast-grep/napi` is still installed), so a command such as `conciv plugin call` uses about a third of the CPU it did; the MCP server stack loads only for `conciv mcp serve`, and the agent-connection code only for `conciv mcp connect|disconnect|list`.

- [#1147](https://github.com/conciv-dev/conciv/pull/1147) [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93) Thanks [@omridevk](https://github.com/omridevk)! - The conciv CLI reads and writes project files without blocking.

- [#1192](https://github.com/conciv-dev/conciv/pull/1192) [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980) Thanks [@omridevk](https://github.com/omridevk)! - Code blocks draw in their card while a reply streams, name their language with a code icon, highlight every shiki language and sit apart from each other; thread rows re-measure after a skin change; a tab opened while its session is deleted is closed; the hub answers tasks.

- [#992](https://github.com/conciv-dev/conciv/pull/992) [`b27ba9d`](https://github.com/conciv-dev/conciv/commit/b27ba9d3e787c376d7a90ed7eb3eb8f7616f9ccd) Thanks [@omridevk](https://github.com/omridevk)! - conciv writes .conciv/.gitignore so its machine state stays out of git; settings/ and harnesses.json stay shareable.

- [#1192](https://github.com/conciv-dev/conciv/pull/1192) [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980) Thanks [@omridevk](https://github.com/omridevk)! - Names of removed packages leave the product: `@conciv/types` drops the unused `ExtensionRegistry` and `ExtensionPackage` types, `conciv plugin call` gives a real rpc id and method as its examples, and package descriptions name the engine and the widget instead of the old core, embed and `@conciv/ai`.

- [#1149](https://github.com/conciv-dev/conciv/pull/1149) [`95a6136`](https://github.com/conciv-dev/conciv/commit/95a61369984b6c93529156d13ec8fdb73c2bc723) Thanks [@omridevk](https://github.com/omridevk)! - The engine token now travels one way only: as `?conciv_auth_token=<token>` on the connect URL, checked once at connect like Devframe's static tokens. Every plain HTTP request carries it on its own URL; the rpc socket reads it from its upgrade URL when it opens, and the engine token then trusts that socket for its life. The `/t/<token>` path prefix and the `Authorization: Bearer` header are gone. The MCP url the engine hands its harnesses is `<origin>/api/mcp?conciv_auth_token=<token>`; the conciv home db keeps each engine's bare origin and its token in separate columns, and `makeRpcClient(apiBase, {token})` and `makeBrowserRpcClient(apiBase, {token})` put the token on the URL.

  A plugin server entry's `http.password` is now the server's credential: the widget connects to `http.url` with it as the engine token. The try-it plugin hands its pairing token that way, and its probe keeps only the engine that token opens.

- [#1126](https://github.com/conciv-dev/conciv/pull/1126) [`a3312e3`](https://github.com/conciv-dev/conciv/commit/a3312e303cb721b782442cdb952b10b5c348ec50) Thanks [@omridevk](https://github.com/omridevk)! - `@conciv/extension` is deleted and no longer published: plugins replace extensions. `@conciv/cli`, `@conciv/tools` and the widget no longer depend on it. `@conciv/types/page-types` drops `EFFECTS_SURFACE_ATTR`, and `CONCIV_UI_SELECTOR` no longer matches `[data-conciv-effects]`: nothing renders that surface any more, and plugin overlays carry `PLUGIN_OVERLAY_ATTR`.

- [#1147](https://github.com/conciv-dev/conciv/pull/1147) [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93) Thanks [@omridevk](https://github.com/omridevk)! - Finding the installed agent CLIs, checking the Claude plugin install and the Claude MCP bridge's endpoint lookup no longer block.

- [#1147](https://github.com/conciv-dev/conciv/pull/1147) [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93) Thanks [@omridevk](https://github.com/omridevk)! - The conciv home folder and its database files are checked and made private without blocking, once, before the home database opens.

- [#835](https://github.com/conciv-dev/conciv/pull/835) [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae) Thanks [@omridevk](https://github.com/omridevk)! - The hub talks to engines over the typed oRPC contract. `conciv mcp serve` now calls `code.execute`, `code.discover`, `code.describe`, `tabs.get` and `page.queue.wait` instead of reading MCP text from `/api/mcp`, so a queue call becomes an MCP task whenever the script started a queue, whatever it returns, and a script that only returns a queue-shaped object no longer does. `GET /api/tabs` is replaced by `tabs.list` / `tabs.get`; an engine without them is reported as too old. `/api/mcp` and `code.execute` run one shared engine function. The image helpers (`imagesIn`, `withoutImages`, `imageBlocks`) move from `@conciv/ai/server` to `@conciv/types/chat-message-types`.

  `page_queue` now plays the list and returns every outcome in the same call (if the list outlasts 120 s it returns the progress so far plus a queueId and the rest arrives on its own); `page_queue_async` answers with a queueId at once and pushes the outcomes back when the list ends. `page_queue_wait` is gone as an agent tool; only queues still playing when a call returns become an MCP task.

- [#805](https://github.com/conciv-dev/conciv/pull/805) [`7c4cf8c`](https://github.com/conciv-dev/conciv/commit/7c4cf8cfba7eff9dcd09da39e8aeda9947c58d3b) Thanks [@omridevk](https://github.com/omridevk)! - Outside agents: the hub sends a block straight to the engine that holds the tab named by the new optional `tab` input (no forwarding between engines, `external_use_tab` is gone), the hub keeps its runner, one browser tab answers each page query, and outside approvals default to open.

- [#996](https://github.com/conciv-dev/conciv/pull/996) [`f13572b`](https://github.com/conciv-dev/conciv/commit/f13572bd98d0f51e04cae05daf846e3b9b332924) Thanks [@omridevk](https://github.com/omridevk)! - The conciv MCP hub (`conciv mcp serve`) serves a third tool, `list_tabs`: it lists the open conciv tabs of every running dev server on the machine, with the same rows as before (project, branch, root, href, pageTitle, sessionTitle, lastActive, running, state, harness, browserTabs) and every dev server that did not answer under `unreachable`. An outside agent calls it first, then passes a tab's id as `tab` on `execute_typescript` and `discover_tools`. `conciv tools tabs` prints the same listing and no longer goes through a tab, so it never asks for an Allow.

  Removed: the engine's `tabs` tool, so `external_tabs({})` no longer exists in code mode (in the tab or in an outside run); use the hub's `list_tabs`, or `conciv tools tabs` in a terminal. An outside run's `NO_TAB` error and the hub's `TAB_NOT_OPEN` reply now name `list_tabs`. The `@conciv/tools/builtins` export is removed, with `BUILTIN_TABS_TOOL`, `TabsToolContext`, `BuiltinCategory` and `builtinToolNames()`; it held nothing else once `server_reload` was removed.

- [#1185](https://github.com/conciv-dev/conciv/pull/1185) [`bbea2a1`](https://github.com/conciv-dev/conciv/commit/bbea2a1d9e492a6b2cd72d8fa97a6ed67605318b) Thanks [@omridevk](https://github.com/omridevk)! - Ids conciv makes have one format from one maker, opencode's: sessions are `ses_` plus a descending id (runs `run_`, markers `mrk_`, calls `call_`, hub tasks `tsk_`, engines `eng_`, ptys `pty_`, settings generations `gen_`, and every assistant message conciv streams `msg_`, whatever id the CLI gave it); an existing local database holds `conciv_` session ids that no longer validate, so reset it.

- [#1053](https://github.com/conciv-dev/conciv/pull/1053) [`fbef752`](https://github.com/conciv-dev/conciv/commit/fbef75212d86265489a5c8e1c7966f1d9040793b) Thanks [@omridevk](https://github.com/omridevk)! - `conciv init` now names the skills pack's setup, develop, debug and harness guides instead of extension authoring.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `conciv init` installs with the detected package manager, falling back to npm in a project with no lockfile instead of failing, and runs pnpm and yarn through corepack when corepack is available, as before. Ctrl-C between steps now restores the config and exits with code 130; before, it ended the process without restoring the config. An interrupted install is asked to stop with SIGINT, so npm rolls back, given up to five seconds (a second Ctrl-C skips the wait), then ended, and the config is restored only after it has stopped.

- [#1192](https://github.com/conciv-dev/conciv/pull/1192) [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980) Thanks [@omridevk](https://github.com/omridevk)! - `conciv init` and the CLI's bug hint write their messages without em dashes, for example `no package.json here: run init from your app directory`; the quick-start quotes the new wording.

- [#1191](https://github.com/conciv-dev/conciv/pull/1191) [`d0009c9`](https://github.com/conciv-dev/conciv/commit/d0009c9748360343de7a47802a75b4bd0264b13e) Thanks [@omridevk](https://github.com/omridevk)! - `conciv init` on a Rollup or esbuild project now links its card to https://conciv.dev/docs/quick-start/other-bundlers, the page that replaced the separate Rollup and esbuild pages.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - `conciv init` stops its package install and restores your config on SIGTERM and SIGHUP as well as Ctrl-C, exits with 128 plus the signal number (130, 143, 129), and kills the install if init exits while it runs.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - `conciv init` stopped with Ctrl-C, SIGTERM or SIGHUP while a harness command runs (such as `claude plugin install`) now stops that command too, puts your config back and exits, instead of waiting for the command to finish.

- [#1192](https://github.com/conciv-dev/conciv/pull/1192) [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980) Thanks [@omridevk](https://github.com/omridevk)! - `conciv init` in a Next.js project whose app lives in `src/app` or `src/pages` writes `instrumentation.ts` and `instrumentation-client.ts` into `src/`, where Next.js reads them, instead of the project root.

- [#868](https://github.com/conciv-dev/conciv/pull/868) [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af) Thanks [@omridevk](https://github.com/omridevk)! - Names ending in "Of" are gone from conciv code: every function, type and member is named with a verb first that says what it does, and the `conciv/no-of-suffix` lint rule keeps it that way. Renamed public exports: `@conciv/types/chat-event-types` `approvalAskOf` is now `readApprovalAsk` and `approvalSettledOf` is now `readApprovalSettled`; `@conciv/extension` `ConfigOf` is now `InferConfig` and `SettingsOf` is now `InferSettings`; `@conciv/db` `modelOf` is now `readModel`; `@conciv/ui-kit-chat` `parentToolCallIdOf` is now `readParentToolCallId`, and `rowMarkOf` (`@conciv/ui-kit-chat/tools`) is now `resolveRowMark`; `@conciv/ui-kit-chat-tools` `patchTextOf` is now `readPatchText`. Renamed public members: `@conciv/ai/client` `ChatSession.harnessOf` is now `readHarness`, and the `@conciv/ai/server` `drizzleChatStores` option `harnessOf` is now `readHarness`; `@conciv/mascot-react` `MascotContextValue.claimOf` is now `readClaim`; `@conciv/ui-kit-system` `VirtualListProps` `sizeOf` and `keyOf` are now `readSize` and `readKey`.

- [#1197](https://github.com/conciv-dev/conciv/pull/1197) [`25ec2d8`](https://github.com/conciv-dev/conciv/commit/25ec2d81d4559a6afdf531b8fbae38d561eb9656) Thanks [@omridevk](https://github.com/omridevk)! - Engine logs are off by default and go through one logger. The engine's two Effect logger stacks (file, stderr and OTLP; the host's `log.emit` sink) are one layer whose level lives in a service the engine creates, so it can change while the engine runs. `CONCIV_LOG_LEVEL` takes `off` (the default), `error`, `warn`, `info`, `debug` or `trace`; `CONCIV_PRINT_LOGS` is gone: at any level other than `off` the lines go to the host's sink, or to stderr when the host gave none. The login code a browser asks for is not a log and always reaches the host. Every hand-made log callback in the engine is gone: promise code logs with `Effect.log*` on the engine runtime.

  Logs are turned on by `conciv({logLevel})`, `CONCIV_LOG_LEVEL` (which wins over the config) and, for the CLI's own diagnostics on stderr, `--verbose` (debug) or `--log-level <level>`, which win over both. One function, `readLogLevel` in `@conciv/types/config-types`, computes the level everywhere.

  An agent can switch logs while the engine runs: `logs.level` (a live stream of `{engine, widget}`) and `logs.setLevel` on the rpc contract, `conciv logs level [<level>] [--scope engine|widget|all]` in the CLI, and the `set_log_level` tool inside, which asks the user before raising the widget above `warn`.

  The widget logs through evlog: off by default, its level follows `logs.level`, and its events reach the engine in batches over the engine socket (`logs.write`), so they land in the engine's one sink. Plugins get `ctx.log`. The engine stores every log in its database (`log_events`, kept `logRetention`, 7 days by default) and agents read it: `logs.query`, `logs.tail` and `logs.cleanup` on the contract, `conciv logs` and `conciv logs cleanup` in the CLI, and the `logs_query` tool (`external_logs_query` in code mode). The log file in the conciv home is gone.

- [`6d5d306`](https://github.com/conciv-dev/conciv/commit/6d5d306e1133aecf64d2ddb4351b7468e1f2d26b) Thanks [@omridevk](https://github.com/omridevk)! - A page tool that asks, called from outside the widget, now waits on its card until the user answers it instead of being refused with a retry; a widget call runs with the click as its approval, and `Permission.Unattended` settles asks that nobody is present to answer.

  A permission answer is opencode's reply, `once`, `always` or `reject`, in place of approve or deny with a session scope. The "Allow for session" button is gone: a card offers Approve and Deny, plus "Always allow" (a saved project rule) only when the ask can be saved. A call for a missing or deleted session is refused with `session "<id>" does not exist` before the tab check.

- [#829](https://github.com/conciv-dev/conciv/pull/829) [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d) Thanks [@omridevk](https://github.com/omridevk)! - Agents can queue a list of page actions in one call; the page plays them in order with the pointer and the results come back when the list is done.

- [#1166](https://github.com/conciv-dev/conciv/pull/1166) [`93fa1ac`](https://github.com/conciv-dev/conciv/commit/93fa1acac79cf1e5610a4368d984dd81c52e0971) Thanks [@omridevk](https://github.com/omridevk)! - The live-edit journal is a page tool: `page.changes` (with `clear: true` to empty it after returning it) lists the page edits made in the session, for the agent, for code mode and as `conciv tools page changes [--clear]`. The engine's `page.changes` and `page.clearChanges` routes, the CLI's hand-written `page changes` command and the protocol's `PageChangeEntry` are gone; the entry type lives in the page plugin, which records each edit under a `PageConnection.change` span.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - `conciv plugin call` now prints a plugin method's declared error in full: the error envelope carries the error's `type` and `data` next to its `message`, and the command still exits 1.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - `conciv plugin call <rpcId> <method> --data '<json>'` calls a method a plugin registered on your running dev server and prints its output as JSON, from the project folder or from anywhere on the machine. You name the plugin's RPC id and the method; the CLI does not list them. The terminal holds the engine token, so it calls as the owner: only callers that announce themselves as outside, such as agents connected through `conciv mcp`, are still refused plugin calls.

- [#985](https://github.com/conciv-dev/conciv/pull/985) [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580) Thanks [@omridevk](https://github.com/omridevk)! - The project config takes `permission` and `permissions`: allow, deny or ask for a tool ahead of time, for every agent, so a headless run or CI needs nobody at the tab. `permission` is a short form (one effect for everything, per tool, or per tool and resource); `permissions` lists full `{action, resource, effect}` rules. A config rule never opens the page tools before the tab connects. A rule in these options now decides a terminal page eval too: `conciv tools page eval` runs with `permission: {page_eval: 'allow'}` and is refused with `page_eval: 'deny'`, with nobody at the tab.

  A page eval card no longer offers "Always allow": an answer approves that one eval and saves no rule, so every later eval asks again unless a config rule decides it.

  A terminal eval naming its tab (`--tab`) is asked the same way: only a config rule lets it run with nobody to approve, and a config deny refuses it.

- [#993](https://github.com/conciv-dev/conciv/pull/993) [`7596ab6`](https://github.com/conciv-dev/conciv/commit/7596ab6d8d314343585424f539198cd1d3ec5e5f) Thanks [@omridevk](https://github.com/omridevk)! - The agent's `server_reload` tool is removed, and with it the `conciv tools server reload <file>` command (the whole `conciv tools server` group is gone; the dev-server methods answer through `conciv plugin call server <method>`). Instead, save the file: the dev server's own watcher pushes the hot update, and the page plugin's hot update wait (`page_hmr`, `conciv tools page hmr`) reports when it landed.

  Removed published exports: `@conciv/protocol` loses `contract.server` (the `server.reload` procedure and its `NO_BUNDLER` error), so `RpcClient` and the `@conciv/backend-plugin-api` client no longer have a `server` group; `@conciv/tools/builtins` loses `BUILTIN_SERVER_TOOL`, `BUILTIN_SERVER_TOOLS`, `ServerToolContext`, `SERVER_TOOL_PREFIX` and `serverOperationOfTool`, and `builtinToolNames()` now answers only `tabs`. The agent guide no longer teaches `conciv tools server ...`. `BundlerBridge` (`@conciv/types/bundler-types`) loses `reload(file)`, and the Vite bridge from `@conciv/extension/vite` no longer implements it; a bridge keeps `restart`, and the hot update itself is the dev server's.

- [#952](https://github.com/conciv-dev/conciv/pull/952) [`1f5b893`](https://github.com/conciv-dev/conciv/commit/1f5b8933dc4ba2970371fa4b0c88f1a1426c05c3) Thanks [@omridevk](https://github.com/omridevk)! - The dev-server commands `conciv tools server config`, `urls`, `resolve`, `graph` and `transform`, and `conciv tools open`, are gone: use `conciv plugin call server <method>` with the input as `--data '<json>'`, for example `conciv plugin call server graph --data '{"file":"src/app.ts"}'` or `conciv plugin call server open --data '{"file":"src/app.ts","line":7}'`. `conciv tools server reload <file>` stays. `conciv tools server restart` is gone and nothing replaces it: the agent's `server_restart` tool asks first, and a person restarts their own dev server in their terminal. The engine's RPC procedures `server.config`, `server.urls`, `server.resolve`, `server.graph`, `server.transform`, `server.restart` and `editor.open` are removed; the same methods, except `restart`, answer through `plugin.call` with rpc id `server`. The agent's `server_*` tools and `open` now come from the engine's server plugin, and the agent guide teaches `conciv plugin call server graph` and `transform`.

  When a session's stored permissions cannot be read, an outside agent is no longer offered the server tools or `open`: they are plugin tools now and plugin tools are withheld in that state, as the skill tool already was.

- [#1191](https://github.com/conciv-dev/conciv/pull/1191) [`d0009c9`](https://github.com/conciv-dev/conciv/commit/d0009c9748360343de7a47802a75b4bd0264b13e) Thanks [@omridevk](https://github.com/omridevk)! - `@conciv/db` is gone; each owner holds its own tables. The per-user home registry (engines, hub connections) is the new package `@conciv/home`. The engine's database moves into the engine: the plugin host's tables (`sessions`, instructions, events, kv, saved permissions) live in `@conciv/backend-app-api`, and the draft, marker, inbox and chat tables, `openDb` and the migrations live in `@conciv/backend-defaults`. Existing `conciv.db` and `home.db` files open unchanged: the migration files, their names and their order are the same.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The @tanstack/ai family moves to ai 1.7.0, ai-client 1.2.0, ai-solid 1.1.0, ai-event-client 1.1.0 and ai-persistence 1.1.0, so the metadata a tool result carries lands on its tool-call part.

- [#1192](https://github.com/conciv-dev/conciv/pull/1192) [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980) Thanks [@omridevk](https://github.com/omridevk)! - The `conciv-named-tab` header is gone: its only reader went with the refuse-and-retry path, so the CLI no longer sends it, the engine no longer parses it, and `@conciv/types` drops `CONCIV_NAMED_TAB_HEADER`.

- [#1147](https://github.com/conciv-dev/conciv/pull/1147) [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93) Thanks [@omridevk](https://github.com/omridevk)! - The trusted browsers file and the `.conciv` folder are read and written without blocking the engine.

- [#894](https://github.com/conciv-dev/conciv/pull/894) [`c729476`](https://github.com/conciv-dev/conciv/commit/c7294768a91be15b46ec52d21cfcb8da61d47d55) Thanks [@omridevk](https://github.com/omridevk)! - The webpack and Rspack plugins start the conciv engine only while the bundler watches (`webpack serve`, `rspack dev`, `--watch`). A production build (`webpack --mode production`, `rspack build`) no longer starts an engine or writes a new token to `.conciv/server.json`, and it exits once it has compiled. Closing the watcher stops the engine.

  When the `port` you set in `conciv({port})` is already taken, the webpack or Rspack dev server no longer crashes with `Error: listen EADDRINUSE`. It keeps running without an engine and prints one line: `conciv: port <port> is already in use, the engine did not start. Free the port or pass another port to conciv()`.

  A CommonJS webpack or Rspack config can now load the plugin: `require('@conciv/it/plugin/webpack')` (or `/plugin/rspack`) with `conciv.default()` used to fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`, which broke the configs `conciv init` writes for CommonJS projects.

  `conciv init` on a webpack or Rspack project no longer tells you to serve `@conciv/widget/global` and set `widgetUrl`; neither exists. Its card now says what is true today: the integration starts the engine but does not add the widget to your page, with a link to https://conciv.dev/docs/quick-start/webpack (or `/rspack`).

## 0.0.22

### Patch Changes

- [#749](https://github.com/conciv-dev/conciv/pull/749) [`11d67e1`](https://github.com/conciv-dev/conciv/commit/11d67e18038a54bc51b1c81e81e9e2f93ca463e4) Thanks [@omridevk](https://github.com/omridevk)! - The `conciv` CLI now reads its commands with `@bomb.sh/router` instead of citty. `conciv --version` and `conciv -v` print the CLI version. Help output has a new layout. Argument mistakes still come back as one JSON error with a suggested fix.

- [#756](https://github.com/conciv-dev/conciv/pull/756) [`146920e`](https://github.com/conciv-dev/conciv/commit/146920e36b9a58fab33341be2aab997dc80ff748) Thanks [@omridevk](https://github.com/omridevk)! - `conciv tools` builds every tool group from the running dev server's catalog, so a mounted extension's tools appear under their own name and the CLI no longer depends on any extension package. `npx @conciv/cli` installs 47 packages (49 MB) instead of 500 (681 MB). Without a running server, `conciv tools ...` and its `--help` print the "No conciv dev server" error instead of an offline list.

- [#775](https://github.com/conciv-dev/conciv/pull/775) [`7dc089b`](https://github.com/conciv-dev/conciv/commit/7dc089b47dc616da95bba7d6c328db957c3500e4) Thanks [@omridevk](https://github.com/omridevk)! - `conciv mcp` is now a group: `conciv mcp connect <agent>`, `conciv mcp disconnect <agent>` and `conciv mcp list` manage which agents (claude, codex, gemini-cli, opencode) can use your conciv tabs, and `conciv mcp serve --agent <agent>` is the MCP server each agent runs. `conciv init` offers to connect every detected agent that is not connected yet. Every connected agent can be disconnected from the widget, opencode included; conciv refuses a disconnected agent at once, and a disconnect from the widget or the terminal voids the Allow every open tab held, so each tab asks again. `conciv tools` run from inside an agent names that agent instead of a generic caller.

- [#765](https://github.com/conciv-dev/conciv/pull/765) [`2a0b55e`](https://github.com/conciv-dev/conciv/commit/2a0b55e7dc935a8a8d9bb9daca9a1f544f78c07a) Thanks [@omridevk](https://github.com/omridevk)! - Outside agents can use a conciv tab: `conciv mcp` is a hub any harness (Claude Code, Codex, Gemini CLI) can add as an MCP server, and the widget's "Connect agents" menu installs it with one click. The agent finds the open tabs with `external_tabs`, picks one with `external_use_tab`, and its calls run there after you allow them; they show in that tab's chat tagged "from <agent>" and survive a reload, and the launcher badges a closed panel while an agent waits for your Allow. `conciv tools` lists every open tab and acts on one with `--tab`. The composer's terminal launch menu and the terminal's "Open externally" button are gone.

- [#726](https://github.com/conciv-dev/conciv/pull/726) [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd) Thanks [@omridevk](https://github.com/omridevk)! - The engine now refuses every request from a browser it does not trust. A browser becomes trusted by entering the 6-digit code the dev server prints (or opening the printed link); the widget shows a locked launcher until then. Inside the Vite DevTools dock the widget is trusted through DevTools' own login. `conciv auth revoke [id] [--all]` lists and removes trusted browsers.

  Revoking a browser takes effect on the running engine without a restart. The open `/health` route now answers only `{ok, harness, engine: {stale}}`; the full staleness reading stays on the gated `meta.engine` RPC. When any engine call answers 401 the widget checks its login again and shows the locked launcher if the engine no longer trusts it; Retry on the unreachable screen does the same check. A revoke also closes every socket the browser opened (close code 1008), which locks an open tab right away. A missing session header now answers 400 BAD_REQUEST, so 401 only means the login gate refused.

  The launcher now drags like the TanStack Devtools trigger: drop it anywhere, throw it, pin it into a corner, or drag it off an edge to tuck it into a tab (click the tab to bring it back). Arrows move the focused launcher and Shift with an arrow sends it to a corner. The chat panel opens toward the free side of wherever the launcher sits, and the spot is remembered per browser.

- [#747](https://github.com/conciv-dev/conciv/pull/747) [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8) Thanks [@omridevk](https://github.com/omridevk)! - Packages now report their real release version, for future migrations; a version difference never breaks anything. `conciv` carries it as its `meta.version`, the Claude Code connect plugin is stamped with it instead of `0.0.0`, and every engine response carries an `x-conciv-version` header. Node rpc clients send their own version in the same header; browser requests send no new header, so a newer widget still reaches an older engine. When the engine is older than the widget (or predates versions), the panel shows a notice asking to update the @conciv packages. `conciv init` now also runs `claude plugin update`, so an install recorded at an earlier release moves onto the current one.
- Updated dependencies [[`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde), [`82fcd6a`](https://github.com/conciv-dev/conciv/commit/82fcd6a504661ad43f22d3b6a1d4b447e10e3805), [`b591c13`](https://github.com/conciv-dev/conciv/commit/b591c138b32b293a14f1d3f2dc92d5c58889402c), [`4c7cded`](https://github.com/conciv-dev/conciv/commit/4c7cdedfb8841a03edb84eecf2047e76f1269640), [`61a66bf`](https://github.com/conciv-dev/conciv/commit/61a66bfb44ebb179ddda4139443587bdda863bb3), [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8), [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2), [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`d1ac2b9`](https://github.com/conciv-dev/conciv/commit/d1ac2b9749d82f70effb017557605a301bc59986), [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09)]:
  - @conciv/protocol@0.0.22
  - @conciv/contract@0.0.22
  - @conciv/db@0.0.22
  - @conciv/harness-init@0.0.22

## 0.0.21

### Patch Changes

- [#650](https://github.com/conciv-dev/conciv/pull/650) [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee) Thanks [@omridevk](https://github.com/omridevk)! - New built-in design extension, mounted by `@conciv/it`: register a design image as the target of a route at a width, then `conciv tools design diff` compares the live page with it and ranks the components that differ, with the deltas and the source that sets them. `conciv tools design status` says when every registered width matches. The agent guide written by `conciv init` describes the loop.

- [#621](https://github.com/conciv-dev/conciv/pull/621) [`377d894`](https://github.com/conciv-dev/conciv/commit/377d894a25c2a83fa009b3240b64dc512e0eef95) Thanks [@omridevk](https://github.com/omridevk)! - New page capability `page_hmr` (`conciv tools page hmr`): after editing a file, wait until Vite's hot update has been applied in the browser before reading the page. `server reload` now waits on it as well and reports `applied` and `waitedMs`.

  `conciv init` adds a `CLAUDE.md` containing `@AGENTS.md` when the claude harness is chosen and no `CLAUDE.md` exists yet, can now wire vite configs written as a function (`defineConfig(() => ({...}))`, async functions, function bodies with a single return), and prints every command as `.conciv/bin/conciv ...` so it runs as written without `conciv` on PATH.

  The core dev server writes `.conciv/mcp-endpoint.json` when it boots, so the claude stdio MCP bridge works in headless runs.

- [#646](https://github.com/conciv-dev/conciv/pull/646) [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8) Thanks [@omridevk](https://github.com/omridevk)! - Remove test-only and unused exports from the package surfaces.
- Updated dependencies [[`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee), [`0d9fe32`](https://github.com/conciv-dev/conciv/commit/0d9fe3275ada18af5e0e65c37c79b8f3662c8d3a), [`377d894`](https://github.com/conciv-dev/conciv/commit/377d894a25c2a83fa009b3240b64dc512e0eef95), [`71a7483`](https://github.com/conciv-dev/conciv/commit/71a74838dd923c10f8559054495a770f9f8cc0c8), [`5b93081`](https://github.com/conciv-dev/conciv/commit/5b930812c5e4ff718da8799d3fddd1429dc6c7a3), [`62f5429`](https://github.com/conciv-dev/conciv/commit/62f5429329a717535efe3a9ec6c61f00cb2f1a61), [`f31c74a`](https://github.com/conciv-dev/conciv/commit/f31c74ad91e9ed4ee2def6b062a6f616dbef6ec1)]:
  - @conciv/protocol@0.0.21
  - @conciv/extension-page@0.0.21
  - @conciv/extension-design@0.0.21
  - @conciv/harness-init@0.0.21
  - @conciv/contract@0.0.21
  - @conciv/tools@0.0.21

## 0.0.20

### Patch Changes

- [#614](https://github.com/conciv-dev/conciv/pull/614) [`9e20b2a`](https://github.com/conciv-dev/conciv/commit/9e20b2a3c3eb225216daf54f5341cd66e167a650) Thanks [@omridevk](https://github.com/omridevk)! - The `conciv` CLI is friendlier to coding agents. Piped output no longer carries colour escape codes (set
  `FORCE_COLOR` to keep them). `conciv tools page --help` and `conciv tools react --help` list the built-in
  page capabilities even before your app is running. `conciv tools page eval` returns the value of a bare
  expression such as `document.title`, not only of code that uses `return`. A ref from an older `page snapshot`
  now fails as stale instead of silently pointing at a different element once the page has changed. The CLI
  finds the conciv engine by itself: it reads the port from `.conciv/server.json` (searching up from the
  current directory), with `CONCIV_PORT` as an override, and the engine records its port there however it was
  started.

- [#482](https://github.com/conciv-dev/conciv/pull/482) [`423f50d`](https://github.com/conciv-dev/conciv/commit/423f50d1c636dc0ac1be88748a95327e130949af) Thanks [@omridevk](https://github.com/omridevk)! - `conciv init` now teaches agents the MCP discovery workflow (`await external_catalog({})`) instead of a static AGENTS.md command list. It also offers an opt-in docs pack step during plan review, declined by default and never enabled by `--yes`, that adds `@conciv/skills` as a dev dependency and runs `@tanstack/intent install` for setup, extension-authoring, and debugging guidance.

  The interactive wizard was reworked to a single-pass flow, modeled on the TanStack CLI: it asks the harness, framework, and docs-pack questions once, renders one plan, and asks for one confirmation, and declining cancels outright instead of dropping into an edit loop. The execution phase now streams each step's live command output through clack's `taskLog`, instead of buffering it behind a spinner until the step settles.

- [#614](https://github.com/conciv-dev/conciv/pull/614) [`9e20b2a`](https://github.com/conciv-dev/conciv/commit/9e20b2a3c3eb225216daf54f5341cd66e167a650) Thanks [@omridevk](https://github.com/omridevk)! - The claude plugin installed by `conciv init` now ships a `conciv` skill that ranks the conciv CLI above a browser MCP for anything in the running app, and the AGENTS.md section init writes leads with the same CLI command guide before the MCP sandbox note.
- Updated dependencies [[`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`958dde7`](https://github.com/conciv-dev/conciv/commit/958dde7a862c8cfd735c2232ca13cef659b301f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`ee779f0`](https://github.com/conciv-dev/conciv/commit/ee779f0456f0c4aedb5c00d8c2d69229de7598a1), [`09f620a`](https://github.com/conciv-dev/conciv/commit/09f620a62d8d65e5721dd16eeaf7f2651225975e), [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`1cb8a51`](https://github.com/conciv-dev/conciv/commit/1cb8a51610a59d764ce064216a50b5209d28bde0)]:
  - @conciv/protocol@0.0.20
  - @conciv/tools@0.0.20
  - @conciv/contract@0.0.20
  - @conciv/extension-page@0.0.20
  - @conciv/harness-init@0.0.20

## 0.0.19

### Patch Changes

- Updated dependencies [[`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323), [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323)]:
  - @conciv/contract@0.0.19
  - @conciv/tools@0.0.19
  - @conciv/harness-init@0.0.19
  - @conciv/protocol@0.0.19

## 0.0.18

### Patch Changes

- [#259](https://github.com/conciv-dev/conciv/pull/259) [`e93318a`](https://github.com/conciv-dev/conciv/commit/e93318a331d3a7b695c08eb77d7c0b67c5ba68b0) Thanks [@omridevk](https://github.com/omridevk)! - The CLI keeps its scoped name `@conciv/cli`. npm rejects the unscoped name `conciv` as too similar to the existing `config` and `concat` packages, so install it with `npx @conciv/cli@latest init`. The command you run afterwards is still `conciv`.

- [#215](https://github.com/conciv-dev/conciv/pull/215) [`ce52c4f`](https://github.com/conciv-dev/conciv/commit/ce52c4ff059e2c701fa81d18b68a793df2b937e8) Thanks [@omridevk](https://github.com/omridevk)! - Every harness now declares init as a capability (`'files' | 'none'`), backed by a per-harness init
  contribution in the new dependency-light `@conciv/harness-init` package, which replaces
  `@conciv/claude-connect`. The `conciv` CLI derives detection and install steps from those
  contributions instead of a hand-listed marker table, and no longer depends on `@conciv/harness`, so
  `npx @conciv/cli@latest init` stops installing every runtime agent SDK. This also makes gemini-cli
  detectable and initializable like its sibling harnesses. `@conciv/harness` consumes
  `@conciv/harness-init` for its own harness contributions; the old `./claude-connect-files` and
  `./claude-connect-state` subpaths are gone.
- Updated dependencies [[`b687236`](https://github.com/conciv-dev/conciv/commit/b687236db6e3793f1ecb909ebafa7bf1ed02ff8f), [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`83272f7`](https://github.com/conciv-dev/conciv/commit/83272f77e201bfb76b958243f90d0ba884de844d), [`d019477`](https://github.com/conciv-dev/conciv/commit/d0194773d25aa4656a20e77f3e63049f351e43e5), [`0f4bb5e`](https://github.com/conciv-dev/conciv/commit/0f4bb5e713f5e09006f43bb951782b2a6ad853a0), [`ce52c4f`](https://github.com/conciv-dev/conciv/commit/ce52c4ff059e2c701fa81d18b68a793df2b937e8)]:
  - @conciv/tools@0.0.18
  - @conciv/protocol@0.0.18
  - @conciv/harness-init@0.0.18
  - @conciv/contract@0.0.18

## 0.0.17

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.17
  - @conciv/protocol@0.0.17

## 0.0.16

### Patch Changes

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/protocol@0.0.16
  - @conciv/contract@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.15
  - @conciv/protocol@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.14
  - @conciv/protocol@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13
  - @conciv/contract@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.12
  - @conciv/protocol@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.11
  - @conciv/protocol@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.10
  - @conciv/protocol@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.9
  - @conciv/protocol@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies [[`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf)]:
  - @conciv/contract@0.0.8
  - @conciv/protocol@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

- Updated dependencies [[`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139)]:
  - @conciv/protocol@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.1
