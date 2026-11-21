# Plan: finish the test kits

Status: for the maintainer to read. Nothing in it is built. No code is written until he says go.

Branch `test/plugin-testkit-mounts`, head 4079f98b7. The kits today: `createEngine`, `mount` (happy-dom and browser
mode), `TestLLM` (`text`, `toolCall`, `failAfter`, `hangAfter`), `engine.gate()`, `engine.requests()`,
`session.send / approve / stop / tool`.

## How this list was made

1. Four lanes listed conciv's features from the product code and said which ones a clean test cannot reach.
2. A different lane tried to disprove each report. Of 464 claimed gaps: 242 confirmed, 94 wrong, 109 not kit gaps.
3. The orchestrator read both kits in full and opened the product lines.
4. The same three steps again for "what does opencode do, what is our interface, can it be done".

Sources: `kit-missing-verified.md` and `kit-interfaces-verified.md` in the orchestrator's scratchpad; the lane
reports they name.

One finding governs the whole plan: every sample test the lanes wrote was wrong (guessed labels, tests that never
open the chat, asserts that pass either way). An interface is known for each item below; a working clean test is
proven for none. So no item counts as done until a real test of it has run.

## Rulings (the maintainer's, 2026-11-21)

- Wherever opencode has an answer: same as opencode.
- The environment: as opencode. Isolate HOME, the XDG folders and the temp folder, filter secrets, keep PATH.
- Models and slash commands a test wants are plain data on the kit's own scripted harness. No test writes a harness
  adapter.
- `harnesses` is a data list. The harness testkit builds one scripted harness per entry; the plugin testkit forwards
  the option.
- `createEngine({directory})` runs the engine on an existing fixture project. No copy-and-link.
- The engine takes a clock, as opencode. This is a product change and it is approved.
- `mount` takes the host settings (the `conciv({...})` object) as plain data. No grab provider.
- Servers mode: `mount` with plugins and no engine starts on the connect screen, as the embed does; the engine can
  sit on a connect port.
- Browser controls (reduced motion, offline, downloads, popups) are Playwright in the `e2e/` apps.
- Failing, holding or dropping an engine answer is not in the kit.
- One mount per test; a reload is a real `page.reload()` in an `e2e/` app.
- All rulings first, then this plan, then building.

Settled from the code and opencode without a ruling:

- There is no failing "open in editor" in the product (the tool always answers ok), so the kit only shows what was
  opened.
- A one-line program is input data for the code tool, as opencode's code-mode test passes one.
- Two engines on one home need no product change once the kit can start an engine the way the dev server does.

## What a test must still look like

Kit calls, Testing Library queries by role, label or text, user-event, asserts. Allowed as input, as opencode: raw
chat events as a reply, a fixture plugin folder, a fixture project folder, a one-line program for the code tool, a
plain fetch to an engine route, vitest's own `page.viewport` in browser mode. Never: code or a plugin written as
strings, a private helper around the engine, polling, mocks, a harness written in the test, screenshots, reading
CSS or DOM structure.

## The items

Modes: N node, H happy-dom, B browser mode. In browser mode every kit call crosses as plain JSON.
Every option on `createEngine` is added to `createHarnessEngine` first and forwarded.

### Step 0: defects and the ground everything stands on

| Item                            | What changes                                                                                                                                                                                                                                                                                                              | Modes | Depends on                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------- |
| Environment                     | The kit's engine no longer reads the developer's real HOME; HOME, XDG and temp point into the test's folder; secrets and the `CONCIV_SESSION_ID`-style variables are filtered out; PATH is kept. `env` option to add variables. Readers of `os.homedir()` are isolated at the test runner, as opencode's test script does | N H B | nothing                         |
| Mount ready                     | `mount` waits for the app to be interactive (`Platform.onInteractive`), not for the "Open conciv chat" label, so it no longer hangs when the chat is open or the launcher is hidden                                                                                                                                       | H B   | nothing                         |
| `session.tool` and direct tools | A direct tool is called by its own name; say how a reply with several parts is returned                                                                                                                                                                                                                                   | N H B | nothing                         |
| Navigation API in happy-dom     | A `navigation` fill in the kit's happy-dom environment, beside its existing fills, including history push and replace                                                                                                                                                                                                     | H     | a run first: what happens today |

### Step 1: options the engine already takes

| Item                              | Interface                                                                                                                                                                                                                                                                                                                                                                         | Modes | Depends on          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------- |
| Timeouts                          | `timeouts: {firstChunkTimeoutMs, eventHeartbeatIntervalMs, stopGraceMs, pageReplyTimeoutMs, queuedActionTimeoutMs}`                                                                                                                                                                                                                                                               | N H B | nothing             |
| Policies                          | `policies`                                                                                                                                                                                                                                                                                                                                                                        | N H B | nothing             |
| Stale code                        | `staleness`                                                                                                                                                                                                                                                                                                                                                                       | N H B | nothing             |
| File watcher                      | `fs: {filewatcher: true}`, default off (opencode's name)                                                                                                                                                                                                                                                                                                                          | N H B | project folder      |
| System prompt, configured session | `systemPrompt`, `sessionId`; the engine's settings go through the product's own resolver                                                                                                                                                                                                                                                                                          | N H B | environment         |
| Models and commands               | `models`, `commands` as data on the scripted harness                                                                                                                                                                                                                                                                                                                              | N H B | nothing             |
| Several harnesses                 | `harnesses: [{id, models, commands}]`, one shared reply queue                                                                                                                                                                                                                                                                                                                     | N H B | models and commands |
| Whole model request               | `requests()` keeps the system prompts, each tool's input schema as JSON Schema, the options and the model, all as plain data. The exact field names are fixed in the step 1 plan. Turning a tool's schema into JSON Schema is done today only inside `@conciv/ai` (`packages/ai/src/server/model-request.ts:40`, not exported): this item needs that one export, a product change | N H B | nothing             |
| Project folder                    | `engine.root`; the test writes project files with plain file calls (vitest's own read and write in browser mode); the engine's own folder is off limits                                                                                                                                                                                                                           | N H B | nothing             |
| Fixture project                   | `directory`: the engine runs on that folder; its own state stays in the temp folder                                                                                                                                                                                                                                                                                               | N H B | project folder      |
| What the editor opened            | `engine.opened()`                                                                                                                                                                                                                                                                                                                                                                 | N H B | nothing             |
| Engine address                    | `engine.address` on the plugin testkit's engine too                                                                                                                                                                                                                                                                                                                               | N H B | nothing             |

### Step 2: new calls

| Item                     | Interface                                                                                                                                                       | Modes                  | Depends on     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------- |
| Outside-agent call       | `engine.mcp({session?, client?})` with `tools()` and `call(name, input)`, returning the raw reply; `hubAccess` option. The header guards are unit tests in core | N H B                  | environment    |
| Plugin rpc               | `engine.rpc.call(rpcId, method, input)` and `.failure(...)`                                                                                                     | N H B                  | nothing        |
| Wait for an engine event | `engine.event(type)` returning `{arrived}`                                                                                                                      | N H B                  | nothing        |
| Login                    | `mount({login: 'none' \| 'stale'})`, `engine.loginCode()`, `engine.revokeBrowsers()`                                                                            | calls N H B; mount H B | mount ready    |
| Host settings            | `mount({host: {...}})` (option name open)                                                                                                                       | H B                    | mount ready    |
| Restart                  | `engine.restart()`: same folder, same token; closes the served sockets so the app reconnects                                                                    | N H B                  | project folder |

### Step 3: an engine started the way the dev server starts it

| Item                  | Interface                                                                                                                               | Modes | Depends on                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------- |
| Announced engine      | an option that boots through the product's `start`; the kit keeps hub access and the system prompt as today                             | N H B | environment                   |
| Two engines, one home | `home` option and `engine.home`                                                                                                         | N H B | announced engine              |
| Servers mode          | `createEngine({port: 'connect', token})`; `mount({plugins})` with no engine                                                             | H B   | mount ready                   |
| Run the CLI           | `cli(args, {cwd, env})` returning `{stdout, stderr, exitCode}`, spawning the built bin with the isolated environment (opencode's shape) | N     | environment, announced engine |

### Step 4: product changes

| Item                  | Change                                                                                                                                                                                                                                                                                                                                                                                                       | Why                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Clock                 | The engine takes a clock; every engine read of the time goes through it; the kit gets one call to move it (name, unit and which timers it drives are fixed in the step 4 plan, as plain data for browser mode). First a read-only inventory of every time read in the engine. opencode gets this from Effect's `TestClock` in its test runtime, not from a server option, so the seam itself is conciv's own | approved                                                 |
| Engine version        | a version input on the engine that the response header reads (today hard-coded in `packages/core/src/lib/cors.ts:55-57`); opencode has it as `app.version` on its server options                                                                                                                                                                                                                             | as opencode                                              |
| Timers with no option | chat start limit (30 s), the page plugin's permission sync, retry and mask limits, the whiteboard binding wait, the recorder's start wait, lease and visibility limits, the ios pick limit. Each becomes an option, or moves onto the clock                                                                                                                                                                  | the standing rule that no test waits out a product timer |

### Not in the kit

- Fail, hold or drop an engine answer; a relay in front of the engine.
- A second mount as a reload.
- A grab provider or any other function written in the test.
- The bundler bridge, the host page with its shadow root, reduced motion, offline, downloads, the pop-out window:
  `e2e/` apps with Playwright Test.
- Unit-level rows (origin checks, config resolving, the pty store): plain node tests of the product function, no kit.

### `e2e/` helpers, after the kits

A git project, answering the init prompts, sending a signal to the CLI, reading the terminal's text, a stdio hub
client. Each belongs to `e2e-utils`, not to the vitest kits. Planned separately once the kits are done.

Every option and result in the tables above gets its literal TypeScript shape in its own step's plan (for example whether `session` is an id, what `{arrived}` holds, which connect port is taken). The tables name the capability, not the final type.

## Open points

1. The name of the host-settings option on `mount` (`host` is the suggestion; `createEngine` already uses `settings`
   for stored preferences). Still open.
2. Answered 2026-11-21: all missing kit pieces are written first, then the real tests. During the kit work each
   piece is proven by a throwaway test that is run and not committed.
3. An `e2e/` app can name a harness only by id today, so it cannot run scripted replies. Not needed for this plan;
   it decides what the `e2e/` apps can cover later.

## Still unproven (each needs one real run, done inside its item)

- What the missing Navigation API does to a happy-dom mount today.
- Whether waiting on `onInteractive` holds on a locked child route.
- Whether the app reconnects after `restart()`.
- That the test runner plugin really runs vitest from a fixture project.

## How the work runs

- One lane per item; items that touch the same file go one after another. Lanes are Opus.
- A lane reads opencode first, then writes the item, its README lines and a changeset, and proves it with a real run.
- The orchestrator reads every diff in full and runs the proof itself before reporting an item as done.
- Local commits only on this branch. One pull request at the end, with the kits and the tests.
- A lane that needs anything not in this plan stops and reports. Nothing is added without the maintainer's yes.
