# @conciv/harness-testkit

## 0.0.24

### Patch Changes

- Updated dependencies []:
  - @conciv/backend-app-api@0.0.24
  - @conciv/backend-plugin-api@0.0.24
  - @conciv/harness@0.0.24
  - @conciv/protocol@0.0.24
  - @conciv/types@0.0.24

## 0.0.23

### Patch Changes

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A kit turn's `send` reads the finish reason where @tanstack/ai puts it on a model call's RUN_FINISHED (`metadata.tanstack.finishReason`), so a turn with tool steps resolves at the end of the run instead of after its first model call.

- [#1171](https://github.com/conciv-dev/conciv/pull/1171) [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d) Thanks [@omridevk](https://github.com/omridevk)! - A built-in plugin takes its options from its config entry, as any plugin does: `plugins: [['conciv.page', {pageReplyTimeoutMs: 1000}]]` reaches the page plugin's `ctx.options` in the engine, and the plugin list carries those options to the plugin's window part, as a package plugin's bundle does. The window part of the page plugin now has the id `conciv.page`, the same as its engine part. The engine's own `pageReplyTimeoutMs` and `queuedActionTimeoutMs` start options, the test engine's timeouts of the same names, the app's `timings.page` and the kit's `mount({timings})` are gone.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The engine takes a clock: `start` and `makeApp` accept a `clock` layer provided under the whole plugin host, and the event heartbeat, the page source-map fetch and queued page plays run on it. The test kits gain `clock: 'test'` with `engine.clock.advance(call)` and `engine.clock.drain()`, opencode's stepped test clock.

- [#1149](https://github.com/conciv-dev/conciv/pull/1149) [`95a6136`](https://github.com/conciv-dev/conciv/commit/95a61369984b6c93529156d13ec8fdb73c2bc723) Thanks [@omridevk](https://github.com/omridevk)! - The engine token now travels one way only: as `?conciv_auth_token=<token>` on the connect URL, checked once at connect like Devframe's static tokens. Every plain HTTP request carries it on its own URL; the rpc socket reads it from its upgrade URL when it opens, and the engine token then trusts that socket for its life. The `/t/<token>` path prefix and the `Authorization: Bearer` header are gone. The MCP url the engine hands its harnesses is `<origin>/api/mcp?conciv_auth_token=<token>`; the conciv home db keeps each engine's bare origin and its token in separate columns, and `makeRpcClient(apiBase, {token})` and `makeBrowserRpcClient(apiBase, {token})` put the token on the URL.

  A plugin server entry's `http.password` is now the server's credential: the widget connects to `http.url` with it as the engine token. The try-it plugin hands its pairing token that way, and its probe keeps only the engine that token opens.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `makeApp` takes `app: {version}`, the version the engine reports in its `x-conciv-version` header, on every route and on a refused (401) request. Without it the engine reports the core package version, as before. The test kits pass `app` through, so a test can start an engine that reports an older version and see the widget's "the conciv engine is older" notice.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The limit for an agent that never starts is an option: `makeApp` takes `firstStartTimeoutMs`, handed to the chat server beside `firstChunkTimeoutMs`. Without it the limit stays 30 seconds and the turn still fails with "the agent did not start within 30s". The test kits take it in `timeouts`, so a test can see that failure in half a second.

- [`671870f`](https://github.com/conciv-dev/conciv/commit/671870f6aa0332c4e2fde31cfe5f77c9ccfebefa) Thanks [@omridevk](https://github.com/omridevk)! - A Claude Code or Gemini command that asks now waits on its permission card through conciv's permission service instead of being refused and retried on the next turn: allow runs it, reject denies it with the reason. An ask ends with its run, and its card leaves every open widget when the run stops, the CLI gives up on the prompt, or a waiting caller leaves. Cards replay from the permission service's pending asks; the old per-session approval grants and the "Approved: ..." re-send are gone, and `chat.permissionDecision` answers `{ok: true}`.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The `./login` entry is removed. Its engine-URL and login-code helpers moved into the private e2e utilities, their only user.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `@conciv/simulation` now has one export, `createHarnessEngine`, which starts the real engine itself with a scripted chat for a given harness or a fake one, and the `./until`, `./rpc-mounts` and `./node` entries are gone along with the older helpers; `@conciv/plugin-testkit` builds its `createEngine` on it.

- [`1629ad3`](https://github.com/conciv-dev/conciv/commit/1629ad3c23eec138d979d6d0d7a82645d8ea4f02) Thanks [@omridevk](https://github.com/omridevk)! - A `./node` entry gives harness tests vitest `test.extend` fixtures: a scripted chat (reply, hold, release, everything released at teardown), a fake CLI, a temp folder, the fake harness and the booted kit. A test's config values go in the `env` option and reach the engine as an Effect `ConfigProvider` (`BootEnv.configProvider`), with the fake CLI folder first on its `PATH`; the kit never reads or writes `process.env`.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - Tests started from inside an agent shell (Claude Code, Codex, Gemini CLI, opencode) no longer pass that agent's variables to the test engine, so an outside call is not refused as coming from a disconnected agent.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `conciv-test` runs vitest in its own process group, sends a stop signal to that whole group, and removes its temporary home only once every process of the run is gone, so a test worker that outlives vitest after a stop no longer writes into a home that was already removed.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `cli()` takes the test's `engine` and reaches it by its address, and a call given no engine, folder or port gets a closed local port, so it never reaches a real dev server on 5173.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A node test runs the conciv CLI: `cli(args, {cwd?, env?})` from `@conciv/simulation` and `@conciv/plugin-testkit/node` runs the built `@conciv/cli` in a fresh, isolated home and resolves with what it printed and its exit code, even when the command fails. Pass `CONCIV_PORT` and `CONCIV_TOKEN` from the engine's address to reach the test's engine. A CLI that gives no result within 60 seconds is killed and the call is refused with a plain message. `@conciv/cli` is a new peer of `@conciv/simulation`.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The engine clock's advance loop lives once, in the new `@conciv/simulation/clock` entry: the node clock and the browser-mode clock both run it, each with its own step.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A tool called through code mode (`session.tool(name).call` on a code-mode tool, `engine.outside().call`) must have a plain identifier for a name (letters, digits and `_`, not starting with a digit): any other name is refused with a plain message before the `external_<name>` program is built.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `createEngine(config, start)` and `createHarnessEngine(config, start)`: the first argument is the product's own `ConcivConfig`, the second only what is not product config. `engine.reply`, `engine.write`, `engine.stale` and `engine.version` replace the `replies`, `files`, `staleness` and `app` options.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A test waits for an engine event: `await engine.event(type)` resolves once the engine's event stream is live, and its `arrived` gives the first event of that type as `{type, data}`, with no polling. A wait still open when the engine stops is refused with "the engine stopped", and one nobody awaits stays silent.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `engine.home` is the engine's conciv home, `createEngine(config, {home})` starts a second engine on it, and `cli(args, {engine})` runs on that home.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The test engine takes `policies`, `systemPrompt` and `sessionId`. A configured session id goes through core's own resolver, so an id that is not a conciv id is refused, and the engine opens on that session. Without them the engine keeps no policies, an empty system prompt and `'project'` hub access.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The test engine starts through core's `start`, the way the dev server does: it takes the product's config defaults, writes `server.json` and the connect file in its temp root, and registers in its own home, so the CLI finds it.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `engine.event(type, {data})` waits for the first event of that type whose data matches the given partial data, in node and browser mode.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `engine.event('server.connected')` is refused at once with a plain message instead of waiting until the engine stops: the engine sends that event only as the first frame of each event subscription, so a wait could never see one.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `TestLLM.failAfter(error)` keeps the error's `code` on the run's RUN_ERROR, so a test can script a context overflow, and a failed `engine.session.send` carries that code.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The kit's scripted model is TanStack AI's `fakeText`, one per engine. `engine.reply` takes only `TestLLM` replies: `TestLLM.text(value)` (no message id), `TestLLM.toolCall(id, name, input)`, `TestLLM.failAfter(error)` and `TestLLM.hang()`, which replaces `hangAfter`. Raw chat-event arrays and Effect `Stream` replies are gone. `start.tokensPerSecond` paces every reply's text.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A test can turn the engine's file watcher on with `fs: {filewatcher: true}` (opencode's option name). It stays off by default.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A Stop while a reply is held by `engine.gate()` ends that run without a release, and the gate holds no later request.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `createEngine(config, {git: true})` makes the temp project a git repository with a first commit, and `engine.commit(message)` commits an edit.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - In browser mode `engine.reply` takes `TestLLM.hang()`: it crosses to the engine as a marker and becomes `hang()` there.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - Models, commands and several harnesses are data a test gives: `models` and `commands` set what the kit's harness lists, and `harnesses` runs several scripted harnesses (the first is the engine's), all answering from the one `replies` queue. The engine refuses, before it starts, a repeated harness id, an empty `harnesses`, and options that would be ignored together (`harnesses` with `harness`, `models` or `commands`; `models` or `commands` with a `harness` adapter).

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The test engine no longer reads the developer's environment: provider keys, secrets and every `CONCIV_*` variable are taken out, and `HOME`, the XDG folders and `TMPDIR` point inside the engine's own state folder. A test adds or replaces variables with the new `env` option.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A test logs a browser in and out: `engine.loginCode()` issues a login code, `engine.revokeBrowsers()` revokes every trusted browser, and `mount({login: 'none'})` opens the app logged out.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A test sees what the engine opened in the editor: `engine.opened()` lists each file asked for (with its line and column when given), in the order asked, in node, happy-dom and browser mode.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `engine.outside({client?, tab?})` makes an outside agent's call the way the conciv hub does, over the engine's `code.*` rpc, and answers with the hub's own reply; `hubAccess` sets the engine's outside-agent access.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `@conciv/plugin-testkit/vitest` exports `testProjects()`, the kit's three vitest projects, which now set their own timeouts, poll settings, pre-bundle list, worker cap and Testing Library cleanup. Neither kit needs `@internal/vitest-config` or `@internal/tsconfig` any more: both are dev dependencies.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A test calls a plugin's own rpc: `engine.rpc.call(rpcId, method, input?)`, and `engine.rpc.failure(...)`, which answers the plugin rpc failure as `{type, message, data?}` and rejects when the call answers instead.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The test engine carries its project folder as `root` (the real path), and `directory` runs it on an existing fixture project instead of a fresh folder. The engine's state stays in the kit's own temp folder, so stopping it never touches the fixture. `directory` cannot be given with `files`.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The engine's default scripted harness is now a quick harness: it lists a fixed set of models (a `Claude` group and an `Older versions` group, with efforts), the `model` and `deploy` slash commands, and a terminal that is a plain bash shell, so the app's model picker, slash command and terminal journeys run without any CLI. `TestLLM.failAfter` gives a reply that fails part-way, as in opencode's test model, and a session's `send` now rejects with the run's error when the run fails.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - Test replies take the reply shapes of opencode's test model. `replies` is a list of `TestLLM` replies (`TestLLM.text`, `TestLLM.toolCall`, `TestLLM.hangAfter`) instead of strings, a request with no reply left fails the run instead of getting a fallback answer, and `engine.gate()` holds the next model request until the test releases it. plugin-testkit's `createEngine` also takes a `harness` option, a real adapter from `@conciv/harness`, which it passes straight to the engine.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The test engine records what each model request was given (`engine.requests()`: messages, and each tool's name and description), and a session can stop its live run (`session.stop()`, the chat stop the widget's Stop button sends), in node and browser mode alike.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - An `engine.event()` wait opened before `engine.restart()` stays open and resolves from the restarted engine; `stop()` still ends it.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A test restarts the engine: `engine.restart()` stops it and boots it again on the same project folder, state, token and address, so the open chat loses the engine and reconnects.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A package whose tests call the kit's `cli()` gets `@conciv/cli` built before its tests run.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `mount` takes `plugins` by name, as the config does, and with no engine opens the app in servers mode on its connect panel, as the embed does. `createEngine(config, {port: 'connect', token})` starts the engine on the first free connect port (4732 to 4741) with that token. The app opens its event stream only once an engine is bound, so a servers-mode app no longer logs that the core is not connected.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The test engine can report stale code: `staleness` (an `EngineStaleness` value) becomes the engine's stale-code report. Without it the product's own check stays.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - engine.session.stop() stops the runs the test started without first reading the session, so a stop while a turn still prepares its prompt no longer waits on that turn.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `TestLLM` imports in browser mode too: `import {createEngine, TestLLM} from '@conciv/plugin-testkit/node'` is the same line in node, happy-dom and browser mode. It comes from the new browser-safe `@conciv/simulation/test-llm` entry.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `conciv-test` (a bin of `@conciv/plugin-testkit`) runs vitest with a home of its own: a fresh folder as `HOME`, the XDG folders and `TMPDIR`, and none of the developer's secrets or `CONCIV_*` variables, removed when vitest exits. It keeps the developer's Playwright browsers folder: `PLAYWRIGHT_BROWSERS_PATH` if set, otherwise the folder Playwright would use with the real home. Code that reads `os.homedir()` directly, and browser-mode engines that start in vitest's own process, no longer see the developer's home.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `TestLLM.thinking(value, answer)` scripts a reply that reasons before it answers.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The test engine takes the product's `timeouts` (`firstChunkTimeoutMs`, `eventHeartbeatIntervalMs`, `stopGraceMs`, `pageReplyTimeoutMs`, `queuedActionTimeoutMs`), so a test can shorten a limit instead of waiting it out.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A scripted harness takes `contextWindow` and `contextTokens`, so a test can show the pane's context meter.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A test call to a tool that adds a note for the model answers with the tool's result again, not with the model-facing text parts.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `TestLLM.toolCalls(...calls)` scripts one reply with several tool calls.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `session.tool(name).call` now reaches a direct tool (a plugin tool with `codemode: false`): when the engine lists a tool by that name on `/api/mcp`, the kit calls it by its own name instead of through `execute_typescript`, and returns its reply as the tool gave it.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `start.timeouts` takes any one timeout (`Partial<Pick<StartOpts, ...>>`). `check-turbo-depends-on` now counts a dist read through another package's built types, so a kit consumer's typecheck waits for every dist the kit's types import.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `requests()` keeps the whole model request: the system prompts, each tool with its JSON Schema input, the model, the effort and the model options, as plain data in node, happy-dom and browser mode. The kit's own harness now takes the system prompt (`systemPrompt: 'flag'`), so the prompt reaches the model.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The testkits are leaves: every `@conciv/*` package they need is a peer dependency, so a workspace package can list a kit in its devDependencies without a build cycle. Each kit's `build` is tsdown alone, and its types come from a separate `build:types` step that waits for the packages whose types it reads.

- [`6d5d306`](https://github.com/conciv-dev/conciv/commit/6d5d306e1133aecf64d2ddb4351b7468e1f2d26b) Thanks [@omridevk](https://github.com/omridevk)! - A page tool that asks, called from outside the widget, now waits on its card until the user answers it instead of being refused with a retry; a widget call runs with the click as its approval, and `Permission.Unattended` settles asks that nobody is present to answer.

  A permission answer is opencode's reply, `once`, `always` or `reject`, in place of approve or deny with a session scope. The "Allow for session" button is gone: a card offers Approve and Deny, plus "Always allow" (a saved project rule) only when the ask can be saved. A call for a missing or deleted session is refused with `session "<id>" does not exist` before the tab check.

- [#1063](https://github.com/conciv-dev/conciv/pull/1063) [`bdcc01b`](https://github.com/conciv-dev/conciv/commit/bdcc01b10d6b0ca494c59017ded2eed3f929c42c) Thanks [@omridevk](https://github.com/omridevk)! - The plugin testkit and the harness testkit are published to npm.

- [#1122](https://github.com/conciv-dev/conciv/pull/1122) [`27f21fb`](https://github.com/conciv-dev/conciv/commit/27f21fbd77493f033e239804ab020446af409341) Thanks [@omridevk](https://github.com/omridevk)! - `serveExtensionRpc` is gone from `@conciv/simulation/rpc-mounts`; serve a router with `serveRpcRouter`, and the testkit no longer depends on `@conciv/extension`.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - A scripted harness takes past sessions as plain data (`sessions`), so the engine lists, searches and previews them and offers their resume command.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The harness engine reads a run's finish reason through `readFinishReason` from `@conciv/ai/server`.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - `@conciv/unplugin` and both testkits write their type declarations with tsdown's isolated-declarations output instead of `tsc`, so their `build:types` reads no other package's build and waits only for the package's own build. A package that lists unplugin or a kit as a devDependency no longer waits for the widget bundle or the app to build before its typecheck and tests. `tsc` still checks every file in each package's `typecheck` task.
- Updated dependencies [[`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`7bfb99c`](https://github.com/conciv-dev/conciv/commit/7bfb99c468f737ffae382409e22986aa6db26079), [`c24fe17`](https://github.com/conciv-dev/conciv/commit/c24fe171ca1c26648c3f4336f8656c2c800fc7a8), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`ccfe318`](https://github.com/conciv-dev/conciv/commit/ccfe318b5134ec42592bcb6d6509b6212c30f29d), [`bbdb3ca`](https://github.com/conciv-dev/conciv/commit/bbdb3cad53c14631669b7e29f367df71e95b1344), [`b78417a`](https://github.com/conciv-dev/conciv/commit/b78417ad8f8cf6cbb0f20e4a685b248b7bb01747), [`90e849a`](https://github.com/conciv-dev/conciv/commit/90e849ae6b799ed97a0e46e6f2a0be472ecae42a), [`84ea7e3`](https://github.com/conciv-dev/conciv/commit/84ea7e3fe676a4c875535e2f20ca3bc6ffa84c93), [`cc04ace`](https://github.com/conciv-dev/conciv/commit/cc04ace2f556300a1823a2654c8f82209f1e6d68), [`1e6166c`](https://github.com/conciv-dev/conciv/commit/1e6166cfcf4e11647cf3c55434aaee4cf9e35513), [`24194eb`](https://github.com/conciv-dev/conciv/commit/24194ebbf4b1aed52608e021e597111e44e686de), [`a80cf98`](https://github.com/conciv-dev/conciv/commit/a80cf986cfd6e4c48b2d78f5e328884046444df5), [`b866898`](https://github.com/conciv-dev/conciv/commit/b866898d65e4c61d16887aa6030ec7ce9e03ccf2), [`db061b8`](https://github.com/conciv-dev/conciv/commit/db061b8fc2e27041b3b892ae0177133da05056b0), [`262fc4a`](https://github.com/conciv-dev/conciv/commit/262fc4ac1a99cf81cf9eae2567e804e5fe35a811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`29ee008`](https://github.com/conciv-dev/conciv/commit/29ee0087b9048df5b6f75ae69715b0c9b56b0643), [`64c2f50`](https://github.com/conciv-dev/conciv/commit/64c2f5051d0558d7d1a7cb43a9e68f3970709c6b), [`9d9a594`](https://github.com/conciv-dev/conciv/commit/9d9a59474837ae21a337599aeebd7f9e8486a61b), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`eb49d7d`](https://github.com/conciv-dev/conciv/commit/eb49d7d8cbdc756157a270f4b564db346bf4dc39), [`2a8657b`](https://github.com/conciv-dev/conciv/commit/2a8657b60f990eaa5ffdf4961b48a49dc2a85da3), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`2e92530`](https://github.com/conciv-dev/conciv/commit/2e925301ea3606940101b66bdfc0d6014d74f85f), [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d), [`eef6c59`](https://github.com/conciv-dev/conciv/commit/eef6c59029f654011fedfdc691021d0cc6502e20), [`4e7e593`](https://github.com/conciv-dev/conciv/commit/4e7e5931c68dbe82f82930e1f358ab252c484d23), [`90139c5`](https://github.com/conciv-dev/conciv/commit/90139c52626217d3a313e900d9d372dad4ed190d), [`1feae4a`](https://github.com/conciv-dev/conciv/commit/1feae4aefa390212f63d656a9ad718d4b23a1be9), [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d), [`d0009c9`](https://github.com/conciv-dev/conciv/commit/d0009c9748360343de7a47802a75b4bd0264b13e), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`095ce22`](https://github.com/conciv-dev/conciv/commit/095ce22e610537e7adf1ab3243c9771453af6e3b), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`5303453`](https://github.com/conciv-dev/conciv/commit/53034538e2e840a75a0c890637744f9827202e34), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`b27ba9d`](https://github.com/conciv-dev/conciv/commit/b27ba9d3e787c376d7a90ed7eb3eb8f7616f9ccd), [`bfae073`](https://github.com/conciv-dev/conciv/commit/bfae07385c698871a067d334ba673e53d4bd5094), [`fcba070`](https://github.com/conciv-dev/conciv/commit/fcba07081e1a4646cd907549728417e88523b7b5), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`26d4021`](https://github.com/conciv-dev/conciv/commit/26d402137561bad75c633c8d51993b1da4ba1a82), [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d), [`15b1cae`](https://github.com/conciv-dev/conciv/commit/15b1caea3e7e068f96815f193a34a297648d59f5), [`11afc71`](https://github.com/conciv-dev/conciv/commit/11afc714a6250a51ba77019a4404f82ed07ef496), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`6ce2a3b`](https://github.com/conciv-dev/conciv/commit/6ce2a3b90edaebce61a9cafc93dfd6e530b16ddf), [`15cc7ed`](https://github.com/conciv-dev/conciv/commit/15cc7ed773ab889319370b8070426756d6cf98bb), [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f), [`69c4117`](https://github.com/conciv-dev/conciv/commit/69c4117dff5620c1f9588902f41204a51f03fffb), [`f653740`](https://github.com/conciv-dev/conciv/commit/f653740c66d2679792e6cea44e091013e3cea813), [`a0f5c5e`](https://github.com/conciv-dev/conciv/commit/a0f5c5e24e29d085ad972de89a6cc2eda894cf00), [`6d82c57`](https://github.com/conciv-dev/conciv/commit/6d82c5741fd8096c2b554286b7045511ac62a3db), [`2c3306b`](https://github.com/conciv-dev/conciv/commit/2c3306b72cc0e3fa4513505572676611eb885654), [`fea0ff2`](https://github.com/conciv-dev/conciv/commit/fea0ff2139caf552838a0ed4f4b2f8bf6fd3563d), [`95a6136`](https://github.com/conciv-dev/conciv/commit/95a61369984b6c93529156d13ec8fdb73c2bc723), [`e503d38`](https://github.com/conciv-dev/conciv/commit/e503d381e9567fa739fed2b5ff84daadeeb646b3), [`ebcc567`](https://github.com/conciv-dev/conciv/commit/ebcc5679266560e4e9fc65c46bd1c6e797c617ac), [`8a2be86`](https://github.com/conciv-dev/conciv/commit/8a2be866cd08e706a587b56345db6a0b666f787c), [`a3312e3`](https://github.com/conciv-dev/conciv/commit/a3312e303cb721b782442cdb952b10b5c348ec50), [`23d0787`](https://github.com/conciv-dev/conciv/commit/23d078759618f08b80223d26187abb7b2fc5843f), [`8e93070`](https://github.com/conciv-dev/conciv/commit/8e93070d77c46635e4ab1c2e239783a83bcd99de), [`fe5b3cc`](https://github.com/conciv-dev/conciv/commit/fe5b3ccddb071fbf5021a1f1e2312edcd92c2fec), [`8ba04d3`](https://github.com/conciv-dev/conciv/commit/8ba04d3c02c5c34680508f2ff6fdbf8227049e4f), [`671870f`](https://github.com/conciv-dev/conciv/commit/671870f6aa0332c4e2fde31cfe5f77c9ccfebefa), [`0480821`](https://github.com/conciv-dev/conciv/commit/048082189b83fa486d3863216a9cee6121763b77), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`8d8b81c`](https://github.com/conciv-dev/conciv/commit/8d8b81cdfd264b90071e9a6344d61f5427c32e55), [`f71d7f6`](https://github.com/conciv-dev/conciv/commit/f71d7f6fa3964698f7504b27c8b0e008b93fa759), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`2fc1fef`](https://github.com/conciv-dev/conciv/commit/2fc1fefe38cc24c32910598d627745a6d2f2f48f), [`33345d3`](https://github.com/conciv-dev/conciv/commit/33345d3bbc25419086a899a36f96991ae37a59ae), [`bbea2a1`](https://github.com/conciv-dev/conciv/commit/bbea2a1d9e492a6b2cd72d8fa97a6ed67605318b), [`2aaf2e0`](https://github.com/conciv-dev/conciv/commit/2aaf2e0fc45adec0a73f74050b6b4d7ebcf7a580), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`15948fb`](https://github.com/conciv-dev/conciv/commit/15948fb9085c220eac6f914dc1de28c916b35ef4), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`fad5a3c`](https://github.com/conciv-dev/conciv/commit/fad5a3cf2f02e10db265c7bf5cebdef0ef97f6af), [`89834e4`](https://github.com/conciv-dev/conciv/commit/89834e40b9208aa87bcabe9f36dbf1cea50477ac), [`8690874`](https://github.com/conciv-dev/conciv/commit/869087424d55eb15e5b623314569e7ecefbf6b5a), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`25ec2d8`](https://github.com/conciv-dev/conciv/commit/25ec2d81d4559a6afdf531b8fbae38d561eb9656), [`af1bdad`](https://github.com/conciv-dev/conciv/commit/af1bdad60c8f8e1456ec683e7092fcd74e22943a), [`6d5d306`](https://github.com/conciv-dev/conciv/commit/6d5d306e1133aecf64d2ddb4351b7468e1f2d26b), [`12efaf7`](https://github.com/conciv-dev/conciv/commit/12efaf7353df1cb30daa997936516fec2ed0b390), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`bd778bd`](https://github.com/conciv-dev/conciv/commit/bd778bd3959881b6a37247c3bf12465d5daf3a07), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`4a710d4`](https://github.com/conciv-dev/conciv/commit/4a710d475e8975be8162a2740884c69d1e03231d), [`e5d82a7`](https://github.com/conciv-dev/conciv/commit/e5d82a71473c2f99dd98428345607ad769c5cba1), [`93fa1ac`](https://github.com/conciv-dev/conciv/commit/93fa1acac79cf1e5610a4368d984dd81c52e0971), [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d), [`d18632b`](https://github.com/conciv-dev/conciv/commit/d18632b46c6d333c784f2d35887b8f74743c870f), [`9d7ef70`](https://github.com/conciv-dev/conciv/commit/9d7ef700e1f0519e3f5cc5352086c013ed9b8760), [`304b057`](https://github.com/conciv-dev/conciv/commit/304b0571d91cf3a814df3b735798530626ef8607), [`edc5e42`](https://github.com/conciv-dev/conciv/commit/edc5e42998d5dbd33ebe4b1aba7e4e72c4905390), [`4921829`](https://github.com/conciv-dev/conciv/commit/4921829346d609e82f306f3bbd2436d4d5831045), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`215bcb7`](https://github.com/conciv-dev/conciv/commit/215bcb7ecefe54691fbadb1f8c547001a4266028), [`4a6de53`](https://github.com/conciv-dev/conciv/commit/4a6de539af0f65bde769fe45963db28570327e99), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`6308150`](https://github.com/conciv-dev/conciv/commit/6308150f3f7988fbfce42836257fb3e14eef066c), [`7fc5f00`](https://github.com/conciv-dev/conciv/commit/7fc5f00651f9314e0a909b8cde111ac357c678c2), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`4b12a07`](https://github.com/conciv-dev/conciv/commit/4b12a07ebbe330348aca0b98d5a2be928d311a50), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`d08d543`](https://github.com/conciv-dev/conciv/commit/d08d5433c414a82c56dd3fb17548aa0c18982a95), [`d08d543`](https://github.com/conciv-dev/conciv/commit/d08d5433c414a82c56dd3fb17548aa0c18982a95), [`6308150`](https://github.com/conciv-dev/conciv/commit/6308150f3f7988fbfce42836257fb3e14eef066c), [`c005c2e`](https://github.com/conciv-dev/conciv/commit/c005c2ecfe2c897508f21c7019594fcfcbef8932), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`07a518f`](https://github.com/conciv-dev/conciv/commit/07a518f38c9e5ce21c71129221720879c173ab9c), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`71a6bb9`](https://github.com/conciv-dev/conciv/commit/71a6bb92305b9b93f3a191c078295c0d4412df80), [`5e458e2`](https://github.com/conciv-dev/conciv/commit/5e458e22a4ea4d1db8dec128a78a815ff6df89af), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`09c7e51`](https://github.com/conciv-dev/conciv/commit/09c7e5196067b83bce0e1b6b8f6b3940796d1afa), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`7e4d195`](https://github.com/conciv-dev/conciv/commit/7e4d195d46ab43964a08db8143705a54e1e76c31), [`144a4c5`](https://github.com/conciv-dev/conciv/commit/144a4c53163a9aa1cea68f700bf055b2fe5029b8), [`59f52f9`](https://github.com/conciv-dev/conciv/commit/59f52f98639ac1be6cbd3c4e079f7a167538dfde), [`c1ac99d`](https://github.com/conciv-dev/conciv/commit/c1ac99d99cbf549fce4fd98905a51736e01fcd00), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`dc69f23`](https://github.com/conciv-dev/conciv/commit/dc69f2341dfdf218db07e9e81a3c9b1cb4469bfa), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`50e1c33`](https://github.com/conciv-dev/conciv/commit/50e1c33b2124e758ff3996ff568937f3388d3abd), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`9dad84c`](https://github.com/conciv-dev/conciv/commit/9dad84ca01ea9fe7dd5c4b549ad8eab45a6bd462), [`9341c70`](https://github.com/conciv-dev/conciv/commit/9341c70f3c7c0255281d24ec92ed12879fd9396d), [`414d5ea`](https://github.com/conciv-dev/conciv/commit/414d5eaeb08da91e21aa142f107c8949fcb475e4), [`5e18dc9`](https://github.com/conciv-dev/conciv/commit/5e18dc919a580ac83886299274caa30ca931048a), [`549f445`](https://github.com/conciv-dev/conciv/commit/549f445f364067d88cbd1f92f36d4569e2cd0145), [`4d05601`](https://github.com/conciv-dev/conciv/commit/4d05601bb1b5a30bcb5d96574da8e0aa3af449e9), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`42d787a`](https://github.com/conciv-dev/conciv/commit/42d787a6cfa7e2ba6354291998665637d0813580), [`220dab3`](https://github.com/conciv-dev/conciv/commit/220dab307d5c7dcd8048c97d54fae6773c3852ad), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`f556a2d`](https://github.com/conciv-dev/conciv/commit/f556a2de74b771b144329a88d9270a1ed4a2a2ae), [`cba0682`](https://github.com/conciv-dev/conciv/commit/cba0682d62058e28428ebbfc64a3a1422ba6bf77), [`7ef3472`](https://github.com/conciv-dev/conciv/commit/7ef3472787f26155c38128c2a1b8ffcec8ff5bf3), [`47ac866`](https://github.com/conciv-dev/conciv/commit/47ac866d2795a8e9c24af42d3be7a408b880db99), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`eaa4b2a`](https://github.com/conciv-dev/conciv/commit/eaa4b2a94f44bbfeb14b6a85b343cd16a9c2d743), [`04f0bba`](https://github.com/conciv-dev/conciv/commit/04f0bbac10263804c3a2c2de2a4a15e3097fe9af), [`1f5b893`](https://github.com/conciv-dev/conciv/commit/1f5b8933dc4ba2970371fa4b0c88f1a1426c05c3), [`7596ab6`](https://github.com/conciv-dev/conciv/commit/7596ab6d8d314343585424f539198cd1d3ec5e5f), [`af50473`](https://github.com/conciv-dev/conciv/commit/af504731bbddafebe1ee51b4e2a9fc93a9961a30), [`1f5b893`](https://github.com/conciv-dev/conciv/commit/1f5b8933dc4ba2970371fa4b0c88f1a1426c05c3), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`2c69bca`](https://github.com/conciv-dev/conciv/commit/2c69bca8cb40a8c71c13ee780abb9ca31900b328), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`92026f6`](https://github.com/conciv-dev/conciv/commit/92026f613d22741b24b08e55a4376d795f988994), [`7925199`](https://github.com/conciv-dev/conciv/commit/79251997f75892d7b445f3dbebb1dbb5109aac53), [`b0cd4e4`](https://github.com/conciv-dev/conciv/commit/b0cd4e40d59112f024787685f1b0f0c1c74d9524), [`d0009c9`](https://github.com/conciv-dev/conciv/commit/d0009c9748360343de7a47802a75b4bd0264b13e), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`502471e`](https://github.com/conciv-dev/conciv/commit/502471e1ab0cbd0cc3cc8eca2df1f6a056720563), [`c650fd7`](https://github.com/conciv-dev/conciv/commit/c650fd72a1b6435a9592d17f73556a4668b42cb0), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`f9a91b4`](https://github.com/conciv-dev/conciv/commit/f9a91b4fb3565fdf2b3ef46833c4c7d3f36b826c), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`43df79d`](https://github.com/conciv-dev/conciv/commit/43df79d6adcac74792f8b989615001a7844cfe0d), [`4838e56`](https://github.com/conciv-dev/conciv/commit/4838e56446c33acb7f8e9005e02be9f307bda980), [`7a0d8ab`](https://github.com/conciv-dev/conciv/commit/7a0d8abc8a8b619c90db51376b289b450381d8f6), [`dde5705`](https://github.com/conciv-dev/conciv/commit/dde5705b3b869629ad135f58b438d5c9f5c0a070), [`bb8f33c`](https://github.com/conciv-dev/conciv/commit/bb8f33cb1ddb69d8453d6eb5f8366a04f37e1378), [`dd953b7`](https://github.com/conciv-dev/conciv/commit/dd953b7fe85e21fed054cc81ca54967f342ee53b), [`b5af8c2`](https://github.com/conciv-dev/conciv/commit/b5af8c249622a66cf1dd35b0d1b121f1881bd877), [`cd708e4`](https://github.com/conciv-dev/conciv/commit/cd708e453045126e0aea89bbfa24de045643292b), [`38352bb`](https://github.com/conciv-dev/conciv/commit/38352bbc7a11064277a16894ac6e0f3358ab3557), [`63da39e`](https://github.com/conciv-dev/conciv/commit/63da39e4cc44b03dae8923b3f6d2a50a736662be), [`adfc6d7`](https://github.com/conciv-dev/conciv/commit/adfc6d789db2a8f2f12c50eb850e030d112b6369), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`4c8bdd8`](https://github.com/conciv-dev/conciv/commit/4c8bdd83a42886282e64a379adb10e4570d1190d), [`4d05601`](https://github.com/conciv-dev/conciv/commit/4d05601bb1b5a30bcb5d96574da8e0aa3af449e9), [`26a5892`](https://github.com/conciv-dev/conciv/commit/26a58920ba1d6a87eae3f3220fcfa52c8ca86c93), [`147931d`](https://github.com/conciv-dev/conciv/commit/147931d44d6cad974adc48cc8e3dab23f825ec05), [`bf9bac4`](https://github.com/conciv-dev/conciv/commit/bf9bac4966a6425d51a0367af435906cad9d857f), [`e4edcfb`](https://github.com/conciv-dev/conciv/commit/e4edcfbf56dea09af0261d74e30b85d4ddbadce4), [`20dc3b3`](https://github.com/conciv-dev/conciv/commit/20dc3b3f642e988f0472e5de5ebd69ef8365ec15)]:
  - @conciv/harness@0.0.23
  - @conciv/protocol@0.0.23
  - @conciv/types@0.0.23
  - @conciv/backend-plugin-api@0.0.23
  - @conciv/backend-app-api@0.0.23

## 0.0.22

### Patch Changes

- [#726](https://github.com/conciv-dev/conciv/pull/726) [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd) Thanks [@omridevk](https://github.com/omridevk)! - The engine now refuses every request from a browser it does not trust. A browser becomes trusted by entering the 6-digit code the dev server prints (or opening the printed link); the widget shows a locked launcher until then. Inside the Vite DevTools dock the widget is trusted through DevTools' own login. `conciv auth revoke [id] [--all]` lists and removes trusted browsers.

  Revoking a browser takes effect on the running engine without a restart. The open `/health` route now answers only `{ok, harness, engine: {stale}}`; the full staleness reading stays on the gated `meta.engine` RPC. When any engine call answers 401 the widget checks its login again and shows the locked launcher if the engine no longer trusts it; Retry on the unreachable screen does the same check. A revoke also closes every socket the browser opened (close code 1008), which locks an open tab right away. A missing session header now answers 400 BAD_REQUEST, so 401 only means the login gate refused.

  The launcher now drags like the TanStack Devtools trigger: drop it anywhere, throw it, pin it into a corner, or drag it off an edge to tuck it into a tab (click the tab to bring it back). Arrows move the focused launcher and Shift with an arrow sends it to a corner. The chat panel opens toward the free side of wherever the launcher sits, and the spot is remembered per browser.

- [#781](https://github.com/conciv-dev/conciv/pull/781) [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde) Thanks [@omridevk](https://github.com/omridevk)! - Every harness with transcript history now carries a resume command, so "Copy resume command" on a search hit from another project works for Codex, OpenCode and Pi sessions, not only Claude.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - The session picker previews the highlighted session beside the list: a read-only thread of its transcript, newest messages first with earlier pages loading on scroll, the search words marked, `Alt+ArrowRight` to read it and `Alt+ArrowLeft` back to the search, Escape closing the preview before the picker. Core serves it through the read-only `sessions.preview` procedure. Search marks now come from Ark `Highlight` and zag `highlightWord`, and keyboard hints share one ui-kit-system `Kbd`. `Thread.Messages` takes `readOnly`, which leaves the assistant action bar with Copy only; the preview sets it. With All projects on, another project's hit previews too: `sessions.preview` takes that hit's `cwd`, and the preview header copies its resume command through the same `createResumeCopy` as the row, so both show Copied together. `ClipboardCopyButton` can reflect a shared `ClipboardCopy` instead of its own. Previewing a session from a folder the search index does not cover yet adds that folder to the index in the background. The preview opens after 600 ms, closes when its session leaves the results, and its header copy button keeps its own Copied state with a 44px hit area. Typing in the search closes the preview. `TooltipIconButton` takes `keepOpenOnClick`, and `ClipboardCopyButton` uses it so its Copied tooltip stays visible after the click.

- [#776](https://github.com/conciv-dev/conciv/pull/776) [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c) Thanks [@omridevk](https://github.com/omridevk)! - Session search can cover every project. The picker's search area gains an "All projects" switch; a hit from another project shows that project's folder, and selecting it copies the command that resumes it there instead of opening it here. The search term and the switch live in the URL, so closing the picker or reloading keeps them. `sessions.search` takes `everywhere`, and each hit carries `cwd` and `resume`.
- Updated dependencies [[`5af74ae`](https://github.com/conciv-dev/conciv/commit/5af74ae55b8e53b0b0e51c598d8d05a3b477b679), [`c422d30`](https://github.com/conciv-dev/conciv/commit/c422d3005048cc46f2d47668f66b4cfe599abf1e), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`d255573`](https://github.com/conciv-dev/conciv/commit/d255573f14ff345fc58e68a9e1ffdcae48765b68), [`0ff249d`](https://github.com/conciv-dev/conciv/commit/0ff249d2a4fd84fb3325d150ce48b061bfdcbe0b), [`98cdf4c`](https://github.com/conciv-dev/conciv/commit/98cdf4c22884c1a3f3847eec655edb5deffae1ae), [`6d3deff`](https://github.com/conciv-dev/conciv/commit/6d3deff540f850ba33eb4b91f7ae7b5abb53758a), [`68087cd`](https://github.com/conciv-dev/conciv/commit/68087cdb0a6ed0e42e454315dba7b6c99f2e7127), [`4e903c0`](https://github.com/conciv-dev/conciv/commit/4e903c099601d586c7ecb904f5172f71dd5a3d3c), [`bbc5760`](https://github.com/conciv-dev/conciv/commit/bbc57606fd20f68b991cb04690fa42ce99c7cafd), [`9f0fdb3`](https://github.com/conciv-dev/conciv/commit/9f0fdb3d6d547c05e151798953e01ddc1cf49c04), [`da45a1a`](https://github.com/conciv-dev/conciv/commit/da45a1a1f2e660be14090c8c8234cfc3a0479a3e), [`6a9fd5b`](https://github.com/conciv-dev/conciv/commit/6a9fd5b1aeff3a7c628be188c570175dabcd71f9), [`a3cc212`](https://github.com/conciv-dev/conciv/commit/a3cc212ed205384193bdc7717c8b545a0b453ca7), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`550d871`](https://github.com/conciv-dev/conciv/commit/550d8718dc7aa496bc2c42dd7495a5dd6436abde), [`b591c13`](https://github.com/conciv-dev/conciv/commit/b591c138b32b293a14f1d3f2dc92d5c58889402c), [`1da442c`](https://github.com/conciv-dev/conciv/commit/1da442c752ed9bb8e446eb086000da89d90b473f), [`3983ead`](https://github.com/conciv-dev/conciv/commit/3983eada7d68d51872d11dc84290480dfd33006a), [`238ccf4`](https://github.com/conciv-dev/conciv/commit/238ccf4fca0ff9e135bf130f1a32f537cad416a8), [`bd41ba7`](https://github.com/conciv-dev/conciv/commit/bd41ba79644530696274de010e230b6adcdf30b1), [`2721b7c`](https://github.com/conciv-dev/conciv/commit/2721b7cb943e4bfdedc5ae12024d2ed0f6c60ca2), [`ef77625`](https://github.com/conciv-dev/conciv/commit/ef7762536509fb2eb2000908ae91ca98f50a9ab6), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`913bf6e`](https://github.com/conciv-dev/conciv/commit/913bf6e383d82ac9b96df4e723909bde74a5a41c), [`d1ac2b9`](https://github.com/conciv-dev/conciv/commit/d1ac2b9749d82f70effb017557605a301bc59986), [`7ddd1e8`](https://github.com/conciv-dev/conciv/commit/7ddd1e895e55f56aea0091650f1bc6565b754e14), [`ae7b802`](https://github.com/conciv-dev/conciv/commit/ae7b802125ff5546f93cce4a0117ff34b442f501), [`f6844cc`](https://github.com/conciv-dev/conciv/commit/f6844cc3f908926362969d9efa3ad32690d56e6c), [`ec21e43`](https://github.com/conciv-dev/conciv/commit/ec21e435d972e60b317b56f8831ebf5286932a37), [`6d78e3d`](https://github.com/conciv-dev/conciv/commit/6d78e3d61a2daaa2f27d27c7be5c0634a9d37b09), [`26576dc`](https://github.com/conciv-dev/conciv/commit/26576dc0dd99d34892ba238a6d0c550c40ab312f)]:
  - @conciv/ai@0.0.22
  - @conciv/protocol@0.0.22
  - @conciv/contract@0.0.22
  - @conciv/extension@0.0.22
  - @conciv/serve@0.0.22

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

- Updated dependencies [[`187cbda`](https://github.com/conciv-dev/conciv/commit/187cbda9d7f171046795c0e1c4b5354c0d9571dd), [`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c), [`0d9fe32`](https://github.com/conciv-dev/conciv/commit/0d9fe3275ada18af5e0e65c37c79b8f3662c8d3a), [`f0ffc0b`](https://github.com/conciv-dev/conciv/commit/f0ffc0b076d88de8ebd93655d980629e29889937)]:
  - @conciv/ai@0.0.21
  - @conciv/protocol@0.0.21
  - @conciv/contract@0.0.21
  - @conciv/extension@0.0.21
  - @conciv/serve@0.0.21

## 0.0.20

### Patch Changes

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Upgrade the @tanstack/ai family 0.43.1 → 0.48.0 in lockstep (ai-client 0.26.0, ai-solid 0.18.3,
  ai-code-mode 0.4.3, ai-isolate-node 0.1.51, ai-isolate-quickjs 0.3.1, ai-mcp 0.3.4, ai-sandbox 0.5.0,
  ai-sandbox-local-process 0.2.4, ai-claude-code/ai-codex 0.4.4, ai-opencode/ai-acp 0.3.4). Upstream
  moved every sibling package's peer range from an exact pin to a caret range, so the pnpm catalog
  comment explaining the old exact-pin poison is rewritten. Code Mode's dynamic binding hook was
  renamed `getSkillBindings` → `getSnippetBindings` upstream; a per-turn `RUN_FINISHED` token-usage
  chunk can now arrive as either the legacy `TokenUsage` shape or the new AG-UI spec `usage[]` array,
  so the run-log fold rebuilds it with `fromSpecTokenUsage` before turning it into a usage snapshot.
- Updated dependencies [[`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`958dde7`](https://github.com/conciv-dev/conciv/commit/958dde7a862c8cfd735c2232ca13cef659b301f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`4e1e430`](https://github.com/conciv-dev/conciv/commit/4e1e430dd7e67e8f817d0bcfc0c3132782537767), [`e1a0c8b`](https://github.com/conciv-dev/conciv/commit/e1a0c8b982297279cc8ac4cab0c2d8d26a139dd1), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`09f620a`](https://github.com/conciv-dev/conciv/commit/09f620a62d8d65e5721dd16eeaf7f2651225975e), [`6699828`](https://github.com/conciv-dev/conciv/commit/669982843b265d397771ca9bfd607aa5976a8ff3), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`1cb8a51`](https://github.com/conciv-dev/conciv/commit/1cb8a51610a59d764ce064216a50b5209d28bde0)]:
  - @conciv/protocol@0.0.20
  - @conciv/extension@0.0.20
  - @conciv/contract@0.0.20
  - @conciv/serve@0.0.20

## 0.0.19

### Patch Changes

- Updated dependencies [[`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323), [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323), [`b329b47`](https://github.com/conciv-dev/conciv/commit/b329b47b889201093c5de042f389eac297caa249)]:
  - @conciv/contract@0.0.19
  - @conciv/extension@0.0.19
  - @conciv/serve@0.0.19
  - @conciv/protocol@0.0.19

## 0.0.18

### Patch Changes

- Updated dependencies [[`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd)]:
  - @conciv/protocol@0.0.18
  - @conciv/contract@0.0.18
  - @conciv/serve@0.0.18

## 0.0.17

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.17
  - @conciv/protocol@0.0.17
  - @conciv/serve@0.0.17

## 0.0.16

### Patch Changes

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/protocol@0.0.16
  - @conciv/contract@0.0.16
  - @conciv/serve@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.15
  - @conciv/protocol@0.0.15
  - @conciv/serve@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.14
  - @conciv/protocol@0.0.14
  - @conciv/serve@0.0.14

## 0.0.13

### Patch Changes

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13
  - @conciv/contract@0.0.13
  - @conciv/serve@0.0.13

## 0.0.12

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.12
  - @conciv/protocol@0.0.12
  - @conciv/serve@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.11
  - @conciv/protocol@0.0.11
  - @conciv/serve@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.10
  - @conciv/protocol@0.0.10
  - @conciv/serve@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.9
  - @conciv/protocol@0.0.9
  - @conciv/serve@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies [[`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf)]:
  - @conciv/contract@0.0.8
  - @conciv/serve@0.0.8
  - @conciv/protocol@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies []:
  - @conciv/protocol@0.0.7
