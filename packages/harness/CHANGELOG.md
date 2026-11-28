# @conciv/harness

## 0.0.25

### Patch Changes

- [#1217](https://github.com/conciv-dev/conciv/pull/1217) [`74d3b55`](https://github.com/conciv-dev/conciv/commit/74d3b550f749a7beb5fade7d735d7a41caf8ad41) Thanks [@omridevk](https://github.com/omridevk)! - Every library builds with tsdown, as devframe builds its packages; Vite builds only the app bundles (the widget, the
  shell and the plugins' `./plugin-experimental` bundles). A library's `dependencies` and `peerDependencies` stay
  external, so some kits now import packages they used to bundle. `@conciv/unplugin` depends on `@conciv/protocol`.

- [#1203](https://github.com/conciv-dev/conciv/pull/1203) [`ffb91f8`](https://github.com/conciv-dev/conciv/commit/ffb91f8e745efb2bdac7a898fba1b597a3b527ee) Thanks [@omridevk](https://github.com/omridevk)! - The docs links conciv prints and ships (init hints, the conciv skill, the setup and debug skills) point at the new docs structure: bundlers, getting started, reference.

- [#1210](https://github.com/conciv-dev/conciv/pull/1210) [`1e1c3e5`](https://github.com/conciv-dev/conciv/commit/1e1c3e51d7e1adeb709b54136f5d3e3e2f8d3243) Thanks [@omridevk](https://github.com/omridevk)! - Every error conciv makes now comes from an evlog error catalog, with a stable code, a plain message and, where
  someone can act on it, a why and a fix. The core catalogs live in one new package, @conciv/errors, so packages
  compare codes without importing each other; each plugin keeps its own catalog, and the app provides @conciv/errors
  to plugins. Plugin.define accepts any Error, so a plugin fails its entry with its own catalog error; a plugin that
  fails to load reports its code, message and fix. Error screens, the run error row, toasts and plugin load errors show
  the fix when the error carries one, and the conciv-try CLI prints a failure as its code and message, then its why and
  fix only when they are set.

  Codes that reach agents and the widget change with it: an outside run without a tab answers `ai.NO_TAB` (was
  `NO_TAB`), a send to a deleted session fails with `session.DELETED` (was `session_deleted`), a code-mode tool error
  reaches the agent as `<code>: message` with its full catalog code, and the widget shows the engine's fix for an rpc
  error. The protocol's `ValueTooLargeError` is gone: an oversized instruction entry fails with
  `instructions.VALUE_TOO_LARGE`.

- [#1214](https://github.com/conciv-dev/conciv/pull/1214) [`1173bd1`](https://github.com/conciv-dev/conciv/commit/1173bd1df39283754eae2b9e3f420ba33777941a) Thanks [@omridevk](https://github.com/omridevk)! - Works on Node 22 and later (22.16 or newer, the first 22.x with the `node:sqlite` APIs the engine uses). Node code builds for node22, and `Promise.try` and `URL.parse`, which Node 22 lacks or added late, are not used.

- [#1212](https://github.com/conciv-dev/conciv/pull/1212) [`1237734`](https://github.com/conciv-dev/conciv/commit/1237734bce516783f7dbc4f40e6ef2c8fba4765d) Thanks [@omridevk](https://github.com/omridevk)! - Every package builds with Vite: one shared library build in `@internal/vite-config` (Vite environments, `rolldown-plugin-dts` for the declarations). tsdown and the separate `tsc` declaration step are gone. Libraries with several entries ship one file per module, so no declaration chunk sits outside `exports`. `experimental()` configures only the `client` environment.
- Updated dependencies [[`74d3b55`](https://github.com/conciv-dev/conciv/commit/74d3b550f749a7beb5fade7d735d7a41caf8ad41), [`ffb91f8`](https://github.com/conciv-dev/conciv/commit/ffb91f8e745efb2bdac7a898fba1b597a3b527ee), [`1e1c3e5`](https://github.com/conciv-dev/conciv/commit/1e1c3e51d7e1adeb709b54136f5d3e3e2f8d3243), [`1173bd1`](https://github.com/conciv-dev/conciv/commit/1173bd1df39283754eae2b9e3f420ba33777941a), [`9d9166b`](https://github.com/conciv-dev/conciv/commit/9d9166bd4cc8ca109b2df2bd734d04669d732b23), [`1237734`](https://github.com/conciv-dev/conciv/commit/1237734bce516783f7dbc4f40e6ef2c8fba4765d)]:
  - @conciv/errors@0.0.25
  - @conciv/home@0.0.25
  - @conciv/types@0.0.25

## 0.0.24

### Patch Changes

- Updated dependencies []:
  - @conciv/home@0.0.24
  - @conciv/types@0.0.24

## 0.0.23

### Patch Changes

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - A Codex provider table header with a trailing comment, such as `[model_providers.gateway] # gateway`, is still read, so `requires_openai_auth = true` under it keeps the login check.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - A harness can now say whether its CLI is logged in, through a `login` check its capabilities declare. Claude reads it from the Agent SDK's account info, the way opencode does, and Codex from `codex login status`. A turn sent to a CLI that is not logged in is refused before the CLI starts, with a chat error that says how to log in, and the model lists carry the same login state.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - A Claude Code that is not on the PATH is no longer probed. The login check answers "Claude Code is not installed. Install it, then run `claude auth login`." without starting anything, the model and slash-command lists fail with the same message, and a send is refused with it before anything is spawned. Each check looks at the PATH again, so a `claude` installed later is found and probed on the next check. The PATH lookup is the one core already uses to detect the other agent CLIs, now shared from `@conciv/harness`.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - Opening the model menu or switching a model or harness re-runs `codex login status` even after a logged-in answer, so a `codex logout` shows in the menu and refuses the next send without an engine restart. A send that runs still reads the held answer.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - The background re-check of a logged-out Claude login no longer follows the signal of the check that started it, only its own 30 second bound, so the re-check a refused send starts lands after the send has ended and the Retry runs.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - The Claude login status is held. A send reads it at once and never waits on a probe; only the very first check, before any answer is held, waits for the probe. A check that finds a logged-out answer starts one re-check in the background, shared by every caller, and its answer replaces the held one when it lands, so the menu open or the refused send after `claude auth login` makes the next send run.

- [#879](https://github.com/conciv-dev/conciv/pull/879) [`2a8657b`](https://github.com/conciv-dev/conciv/commit/2a8657b60f990eaa5ffdf4961b48a49dc2a85da3) Thanks [@omridevk](https://github.com/omridevk)! - The conciv section `conciv init` writes to AGENTS.md (and the Claude plugin's conciv skill) now teaches commands that run as written: `tools react find --name <ComponentName>` instead of `react find <ComponentName>`, and tracking as `tools react track --action start`, reproduce, `--action report [--name <ComponentName>]`, then `--action stop`, instead of `react track <selector>`. `react inspect` and `page eval` now show the argument each one needs. A project set up before this keeps the old text until you run `npx @conciv/cli@latest init` again, which replaces the marked conciv section.

  The dev server's `graph` method (`conciv plugin call server graph`) with a path relative to the project (`src/routes/index.tsx`) or a `/src/...` url now finds the module; before, only an absolute path did, and anything else answered an empty graph. A path that matches no module now fails with `no module for <file> in the dev server's module graph` instead of an empty success.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - An empty PATH entry counts as the working folder when checking whether a CLI is installed, as the spawn itself does, so a `claude` reached that way is no longer reported as not installed.

- [#1159](https://github.com/conciv-dev/conciv/pull/1159) [`2e92530`](https://github.com/conciv-dev/conciv/commit/2e925301ea3606940101b66bdfc0d6014d74f85f) Thanks [@omridevk](https://github.com/omridevk)! - Reading the Codex and opencode session stores no longer blocks the server, and a store that exists but cannot be read is now reported as an error instead of being treated as empty.

- [`90139c5`](https://github.com/conciv-dev/conciv/commit/90139c52626217d3a313e900d9d372dad4ed190d) Thanks [@omridevk](https://github.com/omridevk)! - The Claude harness waits up to an hour on an MCP tool call (was 150 s), so a permission card waits for the user instead of timing out.

- [#837](https://github.com/conciv-dev/conciv/pull/837) [`1feae4a`](https://github.com/conciv-dev/conciv/commit/1feae4aefa390212f63d656a9ad718d4b23a1be9) Thanks [@omridevk](https://github.com/omridevk)! - The Claude harness reads a session's model, token usage and cost from its transcript (`history.transcriptUsage({cwd, nativeId})`), looked up by the harness session id in the project folder first, then in every project folder.

- [#1171](https://github.com/conciv-dev/conciv/pull/1171) [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d) Thanks [@omridevk](https://github.com/omridevk)! - `conciv tools` builds every page command from the tool's own input schema, as for any plugin tool: the separate `conciv tools react` group is gone (its commands are `conciv tools page find|inspect|locate|override|track|tree`), an optional selector is the `--selector` flag (`conciv tools page text --selector h1`), and a tool with one required text field takes it as its argument (`conciv tools page find App`, `conciv tools page eval <expression>`). The agent guide `conciv init` writes uses these forms.

- [#885](https://github.com/conciv-dev/conciv/pull/885) [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f) Thanks [@omridevk](https://github.com/omridevk)! - The agent learns its code-mode tools from one catalog, grouped by namespace within a budget, with only the changes sent after the first turn; the MCP `execute_typescript` description carries the same catalog text.

  With no isolate driver, code mode is off as in opencode: every tool reaches the agent as its own direct tool and as its own MCP tool, and the catalog is in neither the system prompt nor the instruction state. `@conciv/ai/server` exports `loadIsolateDriver` and the `CodeDriver` type; `createChatServer` and `createChatPlane` take the `driver`.

- [#1165](https://github.com/conciv-dev/conciv/pull/1165) [`095ce22`](https://github.com/conciv-dev/conciv/commit/095ce22e610537e7adf1ab3243c9771453af6e3b) Thanks [@omridevk](https://github.com/omridevk)! - The codex harness reads config.toml with a real TOML parser, so inline tables, dotted keys and quoted strings set the provider, model and login gate. A config.toml that does not parse is logged and treated as the default OpenAI provider.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - A Codex whose `config.toml` selects a provider that does not use the stored OpenAI login (a `model_provider` other than `openai` whose `[model_providers.<id>]` table does not set `requires_openai_auth = true`) is no longer refused a turn because `codex login status` says not logged in.

- [#1143](https://github.com/conciv-dev/conciv/pull/1143) [`5303453`](https://github.com/conciv-dev/conciv/commit/53034538e2e840a75a0c890637744f9827202e34) Thanks [@omridevk](https://github.com/omridevk)! - Listing Codex sessions looks up the real location of the Codex home folder once per list instead of once for every session, and does it without blocking the engine. A Codex home reached through a symlink still lists its sessions, and a session whose transcript lies outside the home is still left out.

- [#992](https://github.com/conciv-dev/conciv/pull/992) [`b27ba9d`](https://github.com/conciv-dev/conciv/commit/b27ba9d3e787c376d7a90ed7eb3eb8f7616f9ccd) Thanks [@omridevk](https://github.com/omridevk)! - conciv writes .conciv/.gitignore so its machine state stays out of git; settings/ and harnesses.json stay shareable.

- [`11afc71`](https://github.com/conciv-dev/conciv/commit/11afc714a6250a51ba77019a4404f82ed07ef496) Thanks [@omridevk](https://github.com/omridevk)! - Delete dead code left from the old system across the harness, testkit, ai, cli, serve, it and tools packages.

- [#819](https://github.com/conciv-dev/conciv/pull/819) [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb) Thanks [@omridevk](https://github.com/omridevk)! - Drop the last local patches on the TanStack AI packages. conciv now keeps tool-call metadata, failed results and a stable message id in its own middleware, carries its own call ids on code-mode child calls, validates code-mode tool input and output itself, reads the Claude Code context window from `modelUsage`, and lets the local sandbox forget finished runs. The session's effort now reaches the harness as `HarnessChatDeps.effort`: the Claude harness runs the CLI with `CLAUDE_CODE_EFFORT_LEVEL`, so Claude 5 models get the picked effort too, and codex reads it for `model_reasoning_effort`.

- [#933](https://github.com/conciv-dev/conciv/pull/933) [`fea0ff2`](https://github.com/conciv-dev/conciv/commit/fea0ff2139caf552838a0ed4f4b2f8bf6fd3563d) Thanks [@omridevk](https://github.com/omridevk)! - Closing the dev server ends a harness's model listing that is still running and waits for it, up to a grace of 5 seconds. For OpenCode the listing (`opencode models --verbose`) runs in its own process group, which gets SIGTERM when the engine stops: a CLI that exits on SIGTERM is gone before the close resolves; a CLI that ignores SIGTERM gets SIGKILL when the grace runs out, so the close (which waits the same grace) can resolve just before it is gone, and the engine prints that the OpenCode listing did not end. Codex lists its models without a child process. Claude's model probe is ended by the Agent SDK on the SDK's own timers (its stdin is closed, SIGTERM follows about 2 s later and SIGKILL about 5 s after that), so that probe can outlive the close by up to those delays. A listing that does not settle within the grace (for example a `models` function that ignores the signal) no longer holds the close: the engine prints which harness's listing did not end and closes without it.

  For harness authors: a `models` function now receives `{signal}`, an `AbortSignal` the engine aborts when it stops. Pass it to whatever lists the models (a child process, a `fetch`, an SDK's abort controller) and settle once that child has exited. A `models` function that takes no parameter still type-checks, since a function with fewer parameters is assignable; if it never settles, it costs the close the full grace. `resolveHarnessModels(adapter, {signal})` now takes the signal and hands it on.

- [`671870f`](https://github.com/conciv-dev/conciv/commit/671870f6aa0332c4e2fde31cfe5f77c9ccfebefa) Thanks [@omridevk](https://github.com/omridevk)! - A Claude Code or Gemini command that asks now waits on its permission card through conciv's permission service instead of being refused and retried on the next turn: allow runs it, reject denies it with the reason. An ask ends with its run, and its card leaves every open widget when the run stops, the CLI gives up on the prompt, or a waiting caller leaves. Cards replay from the permission service's pending asks; the old per-session approval grants and the "Approved: ..." re-send are gone, and `chat.permissionDecision` answers `{ok: true}`.

- [`0480821`](https://github.com/conciv-dev/conciv/commit/048082189b83fa486d3863216a9cee6121763b77) Thanks [@omridevk](https://github.com/omridevk)! - Harnesses are factories of an Effect ConfigProvider: `claude`, `codex`, `opencode` and `pi` read `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `XDG_DATA_HOME` and `PI_CODING_AGENT_DIR` as Effect Config when they run, and `harnessRegistry(provider)` replaces the module-level registry. Core builds the registry once per engine from its `configProvider`.

- [#1147](https://github.com/conciv-dev/conciv/pull/1147) [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93) Thanks [@omridevk](https://github.com/omridevk)! - Finding the installed agent CLIs, checking the Claude plugin install and the Claude MCP bridge's endpoint lookup no longer block.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `HarnessHistory.observe` is removed, with the transcript handle types it returned (`TranscriptHandle`, `TranscriptChunk`, `TranscriptRevision`, `TranscriptFailure`, `TranscriptFailureReason`, `TRANSCRIPT_FAILURES`) and the shared `makeJsonlHandle` reader the adapters built it on. No product code read it; a session's history is read through `messages` and `tail`.

- [#1147](https://github.com/conciv-dev/conciv/pull/1147) [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93) Thanks [@omridevk](https://github.com/omridevk)! - Harness transcripts, session folders, model caches and the Claude plugin folder are read without blocking, and the context token count streams the transcript instead of reading it whole.

- [`8d8b81c`](https://github.com/conciv-dev/conciv/commit/8d8b81cdfd264b90071e9a6344d61f5427c32e55) Thanks [@omridevk](https://github.com/omridevk)! - `claudeInit.installed` reads `CLAUDE_CONFIG_DIR` as Effect Config under the project's optional `configProvider` (default `ConfigProvider.fromEnv({preserveEmptyStrings: true})`). The hub's agent CLI child runs with the env given to `makeChildRun(env)`; core passes the whole env it read from its ConfigProvider, and the default runner lets the child inherit the process env.

- [#1157](https://github.com/conciv-dev/conciv/pull/1157) [`f71d7f6`](https://github.com/conciv-dev/conciv/commit/f71d7f6fa3964698f7504b27c8b0e008b93fa759) Thanks [@omridevk](https://github.com/omridevk)! - The Claude install check reads a relative PATH entry, such as `.` or `bin`, against the folder the CLI runs in, the way the spawn does.

- [#1147](https://github.com/conciv-dev/conciv/pull/1147) [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93) Thanks [@omridevk](https://github.com/omridevk)! - The conciv home folder and its database files are checked and made private without blocking, once, before the home database opens.

- [#1185](https://github.com/conciv-dev/conciv/pull/1185) [`bbea2a1`](https://github.com/conciv-dev/conciv/commit/bbea2a1d9e492a6b2cd72d8fa97a6ed67605318b) Thanks [@omridevk](https://github.com/omridevk)! - Ids conciv makes have one format from one maker, opencode's: sessions are `ses_` plus a descending id (runs `run_`, markers `mrk_`, calls `call_`, hub tasks `tsk_`, engines `eng_`, ptys `pty_`, settings generations `gen_`, and every assistant message conciv streams `msg_`, whatever id the CLI gave it); an existing local database holds `conciv_` session ids that no longer validate, so reset it.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The engine starts faster: the Claude Agent SDK now loads the first time the Claude harness lists its models, its commands or its saved sessions, not when the engine starts.

- [#868](https://github.com/conciv-dev/conciv/pull/868) [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af) Thanks [@omridevk](https://github.com/omridevk)! - Names ending in "Of" are gone from conciv code: every function, type and member is named with a verb first that says what it does, and the `conciv/no-of-suffix` lint rule keeps it that way. Renamed public exports: `@conciv/types/chat-event-types` `approvalAskOf` is now `readApprovalAsk` and `approvalSettledOf` is now `readApprovalSettled`; `@conciv/extension` `ConfigOf` is now `InferConfig` and `SettingsOf` is now `InferSettings`; `@conciv/db` `modelOf` is now `readModel`; `@conciv/ui-kit-chat` `parentToolCallIdOf` is now `readParentToolCallId`, and `rowMarkOf` (`@conciv/ui-kit-chat/tools`) is now `resolveRowMark`; `@conciv/ui-kit-chat-tools` `patchTextOf` is now `readPatchText`. Renamed public members: `@conciv/ai/client` `ChatSession.harnessOf` is now `readHarness`, and the `@conciv/ai/server` `drizzleChatStores` option `harnessOf` is now `readHarness`; `@conciv/mascot-react` `MascotContextValue.claimOf` is now `readClaim`; `@conciv/ui-kit-system` `VirtualListProps` `sizeOf` and `keyOf` are now `readSize` and `readKey`.

- [#1192](https://github.com/conciv-dev/conciv/pull/1192) [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980) Thanks [@omridevk](https://github.com/omridevk)! - The opencode harness declares `permissionGate: 'none'`: it passes no permission callback, and opencode's own asks do not reach conciv.

- [#1146](https://github.com/conciv-dev/conciv/pull/1146) [`bd778bd`](https://github.com/conciv-dev/conciv/commit/bd778bd3959881b6a37247c3bf12465d5daf3a07) Thanks [@omridevk](https://github.com/omridevk)! - The opencode and codex session lists wait a moment for a busy database instead of coming back empty with "database is locked" when another program holds a short lock on it.

- [#915](https://github.com/conciv-dev/conciv/pull/915) [`9341c70`](https://github.com/conciv-dev/conciv/commit/9341c70f3c7c0255281d24ec92ed12879fd9396d) Thanks [@omridevk](https://github.com/omridevk)! - A tool a plugin adds or removes while a chat turn runs now shows up, or goes away, at the next step of that same turn. Before every model step the turn waits for a plugin reload in progress, then offers the tools as they are after it.

  If you build a `TurnPlan` yourself (the value `TurnHooks.plan` returns), the four tool fields `codeMode`, `search`, `asking` and `direct` move behind one async `tools()` function that returns them, for example `tools: async () => ({codeMode, search, asking, direct})`. It is called before every model step. `TurnHooks.plan` itself stays synchronous. The chat plane's `capabilities(sessionId)` now returns a promise.

  `HarnessChatDeps.hasTools` is removed, because the tools can change between steps of one turn. A harness that needs to know whether tools ride a model step reads that step's `options.tools` in its adapter's `chatStream`. Codex now does this: it auto-approves its tanstack MCP server for each step that offers tools.

- [#993](https://github.com/conciv-dev/conciv/pull/993) [`7596ab6`](https://github.com/conciv-dev/conciv/commit/7596ab6d8d314343585424f539198cd1d3ec5e5f) Thanks [@omridevk](https://github.com/omridevk)! - The agent's `server_reload` tool is removed, and with it the `conciv tools server reload <file>` command (the whole `conciv tools server` group is gone; the dev-server methods answer through `conciv plugin call server <method>`). Instead, save the file: the dev server's own watcher pushes the hot update, and the page plugin's hot update wait (`page_hmr`, `conciv tools page hmr`) reports when it landed.

  Removed published exports: `@conciv/protocol` loses `contract.server` (the `server.reload` procedure and its `NO_BUNDLER` error), so `RpcClient` and the `@conciv/backend-plugin-api` client no longer have a `server` group; `@conciv/tools/builtins` loses `BUILTIN_SERVER_TOOL`, `BUILTIN_SERVER_TOOLS`, `ServerToolContext`, `SERVER_TOOL_PREFIX` and `serverOperationOfTool`, and `builtinToolNames()` now answers only `tabs`. The agent guide no longer teaches `conciv tools server ...`. `BundlerBridge` (`@conciv/types/bundler-types`) loses `reload(file)`, and the Vite bridge from `@conciv/extension/vite` no longer implements it; a bridge keeps `restart`, and the hot update itself is the dev server's.

- [#952](https://github.com/conciv-dev/conciv/pull/952) [`1f5b893`](https://github.com/conciv-dev/conciv/commit/1f5b8933dc4ba2970371fa4b0c88f1a1426c05c3) Thanks [@omridevk](https://github.com/omridevk)! - The dev-server commands `conciv tools server config`, `urls`, `resolve`, `graph` and `transform`, and `conciv tools open`, are gone: use `conciv plugin call server <method>` with the input as `--data '<json>'`, for example `conciv plugin call server graph --data '{"file":"src/app.ts"}'` or `conciv plugin call server open --data '{"file":"src/app.ts","line":7}'`. `conciv tools server reload <file>` stays. `conciv tools server restart` is gone and nothing replaces it: the agent's `server_restart` tool asks first, and a person restarts their own dev server in their terminal. The engine's RPC procedures `server.config`, `server.urls`, `server.resolve`, `server.graph`, `server.transform`, `server.restart` and `editor.open` are removed; the same methods, except `restart`, answer through `plugin.call` with rpc id `server`. The agent's `server_*` tools and `open` now come from the engine's server plugin, and the agent guide teaches `conciv plugin call server graph` and `transform`.

  When a session's stored permissions cannot be read, an outside agent is no longer offered the server tools or `open`: they are plugin tools now and plugin tools are withheld in that state, as the skill tool already was.

- [#1191](https://github.com/conciv-dev/conciv/pull/1191) [`d0009c9`](https://github.com/conciv-dev/conciv/commit/d0009c9748360343de7a47802a75b4bd0264b13e) Thanks [@omridevk](https://github.com/omridevk)! - `@conciv/db` is gone; each owner holds its own tables. The per-user home registry (engines, hub connections) is the new package `@conciv/home`. The engine's database moves into the engine: the plugin host's tables (`sessions`, instructions, events, kv, saved permissions) live in `@conciv/backend-app-api`, and the draft, marker, inbox and chat tables, `openDb` and the migrations live in `@conciv/backend-defaults`. Existing `conciv.db` and `home.db` files open unchanged: the migration files, their names and their order are the same.

- [#987](https://github.com/conciv-dev/conciv/pull/987) [`c650fd7`](https://github.com/conciv-dev/conciv/commit/c650fd72a1b6435a9592d17f73556a4668b42cb0) Thanks [@omridevk](https://github.com/omridevk)! - The agent no longer has the `conciv_extensions` tool or the `conciv-extensions` skill. `concivExtensionsToolDef` is gone from `@conciv/tools/defs`, the `ExtensionsCard` is gone from `@conciv/tools/cards`, and code mode no longer binds `external_conciv_extensions`. Plugins are taught by the built-in conciv skill.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The chat system prompt now lives in core, in a module that imports nothing, so reading conciv's config no longer loads the whole Claude harness. `@conciv/harness/claude` no longer exports the unused `CHAT_SYSTEM_PROMPT`.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - The Claude probe takes `PATH`, `CLAUDE_CONFIG_DIR` and `ANTHROPIC_API_KEY` from the harness's config provider, over the process environment, so the claude it starts and the login it reads follow the harness's configuration.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - The Claude probe that lists the models and slash commands and checks the login now starts the same `claude` the turn runs, from PATH, instead of the copy bundled with the Agent SDK. A probe whose CLI never answers its start gives up after 30 seconds, the way opencode's does, so a turn never waits on it forever.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - Opening the model menu or switching a model or harness re-checks the Claude login in the background, whether the held answer says logged in or not, so a `claude auth logout` shows in the menu and refuses the next send without an engine restart. A send that runs still reads the held answer and starts nothing.

- [#1140](https://github.com/conciv-dev/conciv/pull/1140) [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d) Thanks [@omridevk](https://github.com/omridevk)! - The models listing and the harness menu now follow their request's cancel signal, so a cancelled request stops its lookups. The shared Claude probe is no longer tied to the first caller's signal, so a cancelled request never ends a probe other callers wait on; it ends at its own 30 s bound. `codex login status` gets the same 30 s bound.

- [#1147](https://github.com/conciv-dev/conciv/pull/1147) [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93) Thanks [@omridevk](https://github.com/omridevk)! - The trusted browsers file and the `.conciv` folder are read and written without blocking the engine.
- Updated dependencies [[`c24fe17`](https://github.com/conciv-dev/conciv/commit/c24fe171ca1c26648c3f4336f8656c2c800fc7a8), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`bbdb3ca`](https://github.com/conciv-dev/conciv/commit/bbdb3cad53c14631669b7e29f367df71e95b1344), [`29ee008`](https://github.com/conciv-dev/conciv/commit/29ee0087b9048df5b6f75ae69715b0c9b56b0643), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`4e7e593`](https://github.com/conciv-dev/conciv/commit/4e7e5931c68dbe82f82930e1f358ab252c484d23), [`1feae4a`](https://github.com/conciv-dev/conciv/commit/1feae4aefa390212f63d656a9ad718d4b23a1be9), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`b27ba9d`](https://github.com/conciv-dev/conciv/commit/b27ba9d3e787c376d7a90ed7eb3eb8f7616f9ccd), [`fcba070`](https://github.com/conciv-dev/conciv/commit/fcba07081e1a4646cd907549728417e88523b7b5), [`26d4021`](https://github.com/conciv-dev/conciv/commit/26d402137561bad75c633c8d51993b1da4ba1a82), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb), [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f), [`6d82c57`](https://github.com/conciv-dev/conciv/commit/6d82c5741fd8096c2b554286b7045511ac62a3db), [`fea0ff2`](https://github.com/conciv-dev/conciv/commit/fea0ff2139caf552838a0ed4f4b2f8bf6fd3563d), [`95a6136`](https://github.com/conciv-dev/conciv/commit/95a61369984b6c93529156d13ec8fdb73c2bc723), [`a3312e3`](https://github.com/conciv-dev/conciv/commit/a3312e303cb721b782442cdb952b10b5c348ec50), [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f), [`671870f`](https://github.com/conciv-dev/conciv/commit/671870f6aa0332c4e2fde31cfe5f77c9ccfebefa), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae), [`bbea2a1`](https://github.com/conciv-dev/conciv/commit/bbea2a1d9e492a6b2cd72d8fa97a6ed67605318b), [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af), [`8690874`](https://github.com/conciv-dev/conciv/commit/869087424d55eb15e5b623314569e7ecefbf6b5a), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`25ec2d8`](https://github.com/conciv-dev/conciv/commit/25ec2d81d4559a6afdf531b8fbae38d561eb9656), [`6d5d306`](https://github.com/conciv-dev/conciv/commit/6d5d306e1133aecf64d2ddb4351b7468e1f2d26b), [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d), [`e5d82a7`](https://github.com/conciv-dev/conciv/commit/e5d82a71473c2f99dd98428345607ad769c5cba1), [`93fa1ac`](https://github.com/conciv-dev/conciv/commit/93fa1acac79cf1e5610a4368d984dd81c52e0971), [`304b057`](https://github.com/conciv-dev/conciv/commit/304b0571d91cf3a814df3b735798530626ef8607), [`edc5e42`](https://github.com/conciv-dev/conciv/commit/edc5e42998d5dbd33ebe4b1aba7e4e72c4905390), [`215bcb7`](https://github.com/conciv-dev/conciv/commit/215bcb7ecefe54691fbadb1f8c547001a4266028), [`71a6bb9`](https://github.com/conciv-dev/conciv/commit/71a6bb92305b9b93f3a191c078295c0d4412df80), [`9341c70`](https://github.com/conciv-dev/conciv/commit/9341c70f3c7c0255281d24ec92ed12879fd9396d), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`7ef3472`](https://github.com/conciv-dev/conciv/commit/7ef3472787f26155c38128c2a1b8ffcec8ff5bf3), [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743), [`7596ab6`](https://github.com/conciv-dev/conciv/commit/7596ab6d8d314343585424f539198cd1d3ec5e5f), [`d0009c9`](https://github.com/conciv-dev/conciv/commit/d0009c9748360343de7a47802a75b4bd0264b13e), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`dde5705`](https://github.com/conciv-dev/conciv/commit/dde5705b3b869629ad135f58b438d5c9f5c0a070), [`bb8f33c`](https://github.com/conciv-dev/conciv/commit/bb8f33cb1ddb69d8453d6eb5f8366a04f37e1378), [`63da39e`](https://github.com/conciv-dev/conciv/commit/63da39e4cc44b03dae8923b3f6d2a50a736662be), [`adfc6d7`](https://github.com/conciv-dev/conciv/commit/adfc6d789db2a8f2f12c50eb850e030d112b6369), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`e4edcfb`](https://github.com/conciv-dev/conciv/commit/e4edcfbf56dea09af0261d74e30b85d4ddbadce4)]:
  - @conciv/types@0.0.23
  - @conciv/home@0.0.23

## 0.0.22

### Patch Changes

- [#711](https://github.com/conciv-dev/conciv/pull/711) [`6a9fd5b`](https://github.com/conciv-dev/conciv/commit/6a9fd5b1aeff3a7c628be188c570175dabcd71f9) Thanks [@omridevk](https://github.com/omridevk)! - The Claude model picker now lists the models your Claude account offers, read live from the Agent SDK (the same list as Claude Code's `/model`), instead of a hardcoded list. Core keeps the last list on disk, so the menu shows at once on later starts. The default model is now Opus. Pinned model ids are grouped under "Older versions".

  The model menu moved out of the composer's overflow menu onto the composer prompt: the prompt shows the current model (`opus ❯`) and opens a one-line-per-model menu, with older versions in a nested submenu.

  The model menu ends with an Effort row: pick the reasoning effort the model supports (low, med, high, xhigh, max, or default) per session; the prompt reads `opus 5.5 · high ❯`, and switching to a model without effort clears it.

  The context meter uses the context window Claude reports for each turn (1M for Haiku 5.5, Opus 5.5 and others), instead of guessing 200k, and effort now reaches Claude 5 models (Fable, Opus 5, Sonnet 5, the 5.5 aliases).

- [#730](https://github.com/conciv-dev/conciv/pull/730) [`5a5e82d`](https://github.com/conciv-dev/conciv/commit/5a5e82d134b88e40153ceeb94abd1516ac28d674) Thanks [@omridevk](https://github.com/omridevk)! - Codex models offer the effort levels Codex lists for them (Low through Max; Codex's own Ultra is left out), and a turn runs Codex at the effort picked for the session.

- [#712](https://github.com/conciv-dev/conciv/pull/712) [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f) Thanks [@omridevk](https://github.com/omridevk)! - Keep every Codex reply. Codex numbers its items from `item_0` again on each turn, so a later reply reused the id of an earlier one: the chat showed it in place of the earlier reply and the saved thread dropped it. Message and tool call ids from Codex are now scoped to their run, and messages read from a Codex transcript carry the session id.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - Harness history can list sessions across every project: `HarnessHistory.list` takes a scope (`{cwd}` or `{everywhere: true}`) and every `HarnessSessionMeta` carries the cwd the harness recorded for it.

- [#781](https://github.com/conciv-dev/conciv/pull/781) [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde) Thanks [@omridevk](https://github.com/omridevk)! - Every harness with transcript history now carries a resume command, so "Copy resume command" on a search hit from another project works for Codex, OpenCode and Pi sessions, not only Claude.

- [#712](https://github.com/conciv-dev/conciv/pull/712) [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f) Thanks [@omridevk](https://github.com/omridevk)! - One model menu for every installed harness: the composer prompt's model menu lists each harness's models, named with their harness ("Opus 5.5 (Claude)", "GPT-6.1-Sol (Codex)"), and picking another harness's model switches the chat to that harness on that model (with the same history confirm). The separate harness rows in the composer overflow are gone. `meta.harnesses` now returns every harness's model list in one answer, and `sessions.switchHarness` takes an optional `model`.

  OpenCode's model list now comes live from `opencode models --verbose` and its rows read like model names ("Claude Sonnet 4.5") instead of raw ids; `@conciv/ai/server` no longer exports `opencodeModels`.

  The model menu is searchable: typing in its search field filters every model of every harness by model name, id or harness name (older versions and long lists included), arrows and Enter pick, Escape clears the search and then closes. The effort row leads with Default, checked while the model runs on its own default effort and picked to go back to it. With an empty search each harness shows its main models and says how many more a search reaches. OpenCode lists one row per model (its region routes such as `us.`/`eu.`/`global.` collapse to one) (every model in its catalog, including providers without credentials); a harness with nothing usable says so, and an empty live model list now replaces the saved one instead of being treated as a failure.

- [#746](https://github.com/conciv-dev/conciv/pull/746) [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2) Thanks [@omridevk](https://github.com/omridevk)! - The session list is paged with a cursor and searchable on the server.

  - `sessions.list` takes `{cursor, limit}` and returns `{sessions, next}`. Each harness reads only the transcripts on the requested page instead of its newest 50. `sessions.get` returns one session.
  - `sessions.search` searches session titles and message text across every harness that has transcript history. The index is an in-memory Orama index held in a worker thread, built in the background after the first list. Nothing is written to disk. `sessions.changes` streams the index version: the current one on subscribe, then each new one; the picker keys its list and search queries on it, so they refetch when indexing lands.
  - Claude sessions are listed through the Claude Agent SDK and follow `CLAUDE_CONFIG_DIR`. Empty and continued sessions are hidden, as in `/resume`. Codex, OpenCode and Pi answer `meta` for a single session. Transcripts are read as streams.
  - Sessions show their transcript size instead of a message count.
  - The session picker is a virtual list that loads more as you scroll and searches as you type. The search input takes pointer clicks and keeps focus while results arrive, and Today and Yesterday split at local midnight.
  - A session whose native transcript is gone no longer appears in the list.

- [#795](https://github.com/conciv-dev/conciv/pull/795) [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6) Thanks [@omridevk](https://github.com/omridevk)! - Arrowing through the session picker no longer piles up previews. A preview waits for the highlight to settle even while one is already open, and an abandoned preview stops reading its transcript instead of folding the whole file before the one you landed on.

- [#796](https://github.com/conciv-dev/conciv/pull/796) [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09) Thanks [@omridevk](https://github.com/omridevk)! - Session previews read a native transcript from its end: `HarnessHistory.tail(cwd, id, {limit, before, signal})` returns one page and an opaque cursor for the page above, so a preview of a 124 MB Claude transcript reads a few hundred KB instead of the whole file. Claude and Codex message ids without a native id are now the byte offset of their opening line (`o<offset>`), so full reads and tails agree; a Codex session imported under the old positional ids re-imports once.

  `HarnessHistory.summary` and `HarnessSessionSummary` are removed (nothing called them), and Codex's `withinProject` reads only the first 64 KiB of a rollout for its `session_meta` cwd instead of the whole file.

- Updated dependencies [[`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679), [`c422d30`](https://github.com/conciv-dev/conciv/commit/c422d3005048cc46f2d47668f66b4cfe599abf1e), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`d255573`](https://github.com/conciv-dev/conciv/commit/d255573f14ff345fc58e68a9e1ffdcae48765b68), [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b), [`98cdf4c`](https://github.com/conciv-dev/conciv/commit/98cdf4c22884c1a3f3847eec655edb5deffae1ae), [`6d3deff`](https://github.com/conciv-dev/conciv/commit/6d3deff540f850ba33eb4b91f7ae7b5abb53758a), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c), [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd), [`9f0fdb3`](https://github.com/conciv-dev/conciv/commit/9f0fdb3d6d547c05e151798953e01ddc1cf49c04), [`a3cc212`](https://github.com/conciv-dev/conciv/commit/a3cc212ed205384193bdc7717c8b545a0b453ca7), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde), [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f), [`3983ead`](https://github.com/conciv-dev/conciv/commit/3983eada7d68d51872d11dc84290480dfd33006a), [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8), [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2), [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6), [`7ddd1e8`](https://github.com/conciv-dev/conciv/commit/7ddd1e895e55f56aea0091650f1bc6565b754e14), [`ae7b802`](https://github.com/conciv-dev/conciv/commit/ae7b802125ff5546f93cce4a0117ff34b442f501), [`f6844cc`](https://github.com/conciv-dev/conciv/commit/f6844cc3f908926362969d9efa3ad32690d56e6c), [`ec21e43`](https://github.com/conciv-dev/conciv/commit/ec21e435d972e60b317b56f8831ebf5286932a37), [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09)]:
  - @conciv/ai@0.0.22
  - @conciv/protocol@0.0.22
  - @conciv/harness-init@0.0.22

## 0.0.21

### Patch Changes

- [#625](https://github.com/conciv-dev/conciv/pull/625) [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c) Thanks [@omridevk](https://github.com/omridevk)! - New `@conciv/ai` package: the chat primitives conciv is built from, on top of TanStack AI. Three
  entries, with the message, part and event types living in `@conciv/protocol`:

  - `@conciv/ai/server`: `createChatServer`, which runs every turn through `chat()` with the library's
    persistence (`withPersistence`, streaming snapshots), locks, the local-process sandbox and its
    command policy, code mode with `discover_tools`, WebSocket and SSE delivery with resume, stop and
    hydrate; plus the CLI text adapters (`claudeCode`, `codex`, `opencode`, `acp`, `makeTextAdapter`).
    The patched `@tanstack/ai-sandbox` and `@tanstack/ai-code-mode` ship inside its dist.
  - `@conciv/ai/client`: `createChat` and `createChatSession`, the Solid chat session on the library's
    `useChat` (connection, hydration, stop, approvals). The widget's chat runs on it.
  - `@conciv/ai/testkit`: the story connection and chunk builders for stories and tests.

  `bippy` stays held at its current version.

  New `@conciv/chat` package: the conciv chat plane on top of `@conciv/ai/server` (`createChatPlane`):
  the Drizzle chat stores over `@conciv/db`'s tables, transcript import, compaction with a divider that
  keeps the history, boot recovery, approvals as the library's deny-and-retry flow with once and
  session grants, `conciv_ui` questions, and the code-mode capabilities with the result cap. Tools that
  need approval stay ordinary tool calls outside code mode. Core wires the plane and keeps sessions,
  slash commands and the session bus; `@conciv/core`, `@conciv/db`, `@conciv/harness` and
  `@conciv/protocol` no longer depend on `@tanstack/ai*`.

  The widget posts "Approved: <title>" after an approval and refreshes hydration on stop and on a run
  error. Approval tools called over RPC from outside the widget (the `conciv` CLI, curl) are refused
  with the same ask, and a retry after approving runs.

  The agent prompts and the `react-introspection` skill name `discover_tools`; `external_catalog` is
  gone. `@conciv/harness-testkit` builds on the `@conciv/ai` event types and chunk builders and reaches
  tools through `/api/mcp` with `discover_tools`. `discover_tools` carries each tool's
  output shape and declared error codes.

- Updated dependencies [[`187cbda`](https://github.com/conciv-dev/conciv/commit/187cbda9d7f171046795c0e1c4b5354c0d9571dd), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`0208423`](https://github.com/conciv-dev/conciv/commit/02084232ad633479dcbb7d6949700a31df1173ee), [`377d894`](https://github.com/conciv-dev/conciv/commit/377d894a25c2a83fa009b3240b64dc512e0eef95)]:
  - @conciv/ai@0.0.21
  - @conciv/protocol@0.0.21
  - @conciv/harness-init@0.0.21

## 0.0.20

### Patch Changes

- [#566](https://github.com/conciv-dev/conciv/pull/566) [`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3) Thanks [@omridevk](https://github.com/omridevk)! - The claude harness now disables the native `AskUserQuestion` tool. It resolves through a host-rendered dialog the CLI only offers over the Agent SDK control channel, which our adapter (a plain `claude -p` spawn) does not have, so the CLI failed closed and answered itself with "The user did not answer the questions" in about 400ms: the widget never showed anything and the agent carried on with an answer nobody gave. Asking now goes through the `conciv_ui` tool's existing `choices` kind, which gains `multiSelect` (the user picks several options, and the answer comes back as a list) and `allowOther` (a free-text row for an answer that is not on the list).

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - `claudeExecutable` now throws if the plugin directory path contains whitespace, instead of silently
  producing a broken spawn. `@tanstack/ai-claude-code` builds its argv by splitting the executable
  string on plain spaces with no quoting, so a plugin dir with a space in it would previously mangle
  the `claude` invocation.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Upgrade the @tanstack/ai family 0.43.1 → 0.48.0 in lockstep (ai-client 0.26.0, ai-solid 0.18.3,
  ai-code-mode 0.4.3, ai-isolate-node 0.1.51, ai-isolate-quickjs 0.3.1, ai-mcp 0.3.4, ai-sandbox 0.5.0,
  ai-sandbox-local-process 0.2.4, ai-claude-code/ai-codex 0.4.4, ai-opencode/ai-acp 0.3.4). Upstream
  moved every sibling package's peer range from an exact pin to a caret range, so the pnpm catalog
  comment explaining the old exact-pin poison is rewritten. Code Mode's dynamic binding hook was
  renamed `getSkillBindings` → `getSnippetBindings` upstream; a per-turn `RUN_FINISHED` token-usage
  chunk can now arrive as either the legacy `TokenUsage` shape or the new AG-UI spec `usage[]` array,
  so the run-log fold rebuilds it with `fromSpecTokenUsage` before turning it into a usage snapshot.

- [#616](https://github.com/conciv-dev/conciv/pull/616) [`00f3200`](https://github.com/conciv-dev/conciv/commit/00f32009789ed532dc6cd6f62b6b360c6e37d0c5) Thanks [@omridevk](https://github.com/omridevk)! - Codex's model list and default model now come from codex's own catalog (`~/.codex/models_cache.json`, listed models in codex's priority order) and config (`model` in `~/.codex/config.toml`), instead of a hardcoded `gpt-5.5` that ChatGPT-account codex rejects. The static `@tanstack/ai-codex` list stays as the fallback when the catalog is missing or unreadable.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Removed the unused Claude `attach` slot (`claudeAttach`, `parseLiveSessions`, `meetsReloadFloor`) and
  its `HarnessAttach`/`HarnessLiveSession`/`HarnessAttachInstall`/`HarnessAttachResult`/`HarnessAttachRemoval`
  protocol types. Nothing in the codebase called `harness.attach`, `candidates()`, `install()`, or
  `uninstall()` outside the deleted `claude/attach.ts` and its own test.

  Consolidated the duplicate `chatBusy`/`busyOf` check (identical bodies in `@conciv/ui-kit-chat` and
  `@conciv/client`) into a single `chatBusy` export from `@conciv/protocol/chat-busy`, which both
  packages already depend on.

  `@conciv/client`'s `stopping` state is now derived from the server-published run lifecycle phase
  (`runSource().lifecycle.phase === 'stopping'`) instead of a local 10s-timeout approximation; deleted
  the now-redundant `createStopState`/`isStopping` local timer and its `@solid-primitives/timer`
  dependency.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Bump the `@tanstack/ai` family from the 0.48 lockstep to 0.51 (catalog-only, see `pnpm-workspace.yaml`).
  Picks up upstream fix [#1248](https://github.com/TanStack/ai/pull/1248): the client `StreamProcessor`
  dropped the first `TEXT_MESSAGE_CONTENT` delta of an assistant turn that called a tool before
  replying, so every answer that followed a tool call lost its opening text (an opening code fence,
  most visibly).
- Updated dependencies [[`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6)]:
  - @conciv/protocol@0.0.20
  - @conciv/harness-init@0.0.20

## 0.0.19

### Patch Changes

- Updated dependencies []:
  - @conciv/harness-init@0.0.19
  - @conciv/protocol@0.0.19

## 0.0.18

### Patch Changes

- [#215](https://github.com/conciv-dev/conciv/pull/215) [`ce52c4f`](https://github.com/conciv-dev/conciv/commit/ce52c4ff059e2c701fa81d18b68a793df2b937e8) Thanks [@omridevk](https://github.com/omridevk)! - Every harness now declares init as a capability (`'files' | 'none'`), backed by a per-harness init
  contribution in the new dependency-light `@conciv/harness-init` package, which replaces
  `@conciv/claude-connect`. The `conciv` CLI derives detection and install steps from those
  contributions instead of a hand-listed marker table, and no longer depends on `@conciv/harness`, so
  `npx @conciv/cli@latest init` stops installing every runtime agent SDK. This also makes gemini-cli
  detectable and initializable like its sibling harnesses. `@conciv/harness` consumes
  `@conciv/harness-init` for its own harness contributions; the old `./claude-connect-files` and
  `./claude-connect-state` subpaths are gone.
- Updated dependencies [[`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`83272f7`](https://github.com/conciv-dev/conciv/commit/83272f77e201bfb76b958243f90d0ba884de844d), [`d019477`](https://github.com/conciv-dev/conciv/commit/d0194773d25aa4656a20e77f3e63049f351e43e5), [`0f4bb5e`](https://github.com/conciv-dev/conciv/commit/0f4bb5e713f5e09006f43bb951782b2a6ad853a0), [`ce52c4f`](https://github.com/conciv-dev/conciv/commit/ce52c4ff059e2c701fa81d18b68a793df2b937e8)]:
  - @conciv/protocol@0.0.18
  - @conciv/harness-init@0.0.18

## 0.0.17

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.17

## 0.0.16

### Patch Changes

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/protocol@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.14

## 0.0.13

### Patch Changes

- [#80](https://github.com/conciv-dev/conciv/pull/80) [`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c) Thanks [@omridevk](https://github.com/omridevk)! - Fix the context meter reading cumulative turn usage as context occupancy (issue [#78](https://github.com/conciv-dev/conciv/issues/78), e.g. 386% / 773K of 200K). `@tanstack/ai`'s `RUN_FINISHED` usage is a billing aggregate, not the live context size; each adapter feeds it differently (Claude sums every tool-loop request). Context occupancy is now a distinct `UsageSnapshot.contextTokens` field populated per-harness through a new optional `HarnessHistory.contextTokens(raw)` seam. The Claude harness derives it from the last non-sidechain assistant message's usage in the transcript (`input + cache_read + cache_creation`). The meter's ring/percent/bar render only when a harness reports real occupancy; otherwise the tracker shows honest turn billing totals with no percent-of-window framing.

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies []:
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
