# @conciv/skills

## 0.0.23

### Patch Changes

- [#1061](https://github.com/conciv-dev/conciv/pull/1061) [`aa03dba`](https://github.com/conciv-dev/conciv/commit/aa03dba9033d935292509f863ae20775d4fc6cb4) Thanks [@omridevk](https://github.com/omridevk)! - The old terminal extension package is deleted: the terminal is built into core. The skills drop it from their package map, and conciv-develop drops the extension-API examples that quoted it.

- [#816](https://github.com/conciv-dev/conciv/pull/816) [`564dd14`](https://github.com/conciv-dev/conciv/commit/564dd148e0dd2f8b7b7b252211f00b5349bab101) Thanks [@omridevk](https://github.com/omridevk)! - The widget bundles are now small classic-script loaders over shared, code-split ES chunks in `dist/widget/`, so mermaid, katex, shiki grammars, xterm and the chat highlight worker load only when used, and the IIFE source maps are gone (the embed `dist` drops from 152 MB to about 30 MB). Serve `dist/widget/` next to `conciv-widget.global.js`; the native page serves it automatically.

- [`671870f`](https://github.com/conciv-dev/conciv/commit/671870f6aa0332c4e2fde31cfe5f77c9ccfebefa) Thanks [@omridevk](https://github.com/omridevk)! - A Claude Code or Gemini command that asks now waits on its permission card through conciv's permission service instead of being refused and retried on the next turn: allow runs it, reject denies it with the reason. An ask ends with its run, and its card leaves every open widget when the run stops, the CLI gives up on the prompt, or a waiting caller leaves. Cards replay from the permission service's pending asks; the old per-session approval grants and the "Approved: ..." re-send are gone, and `chat.permissionDecision` answers `{ok: true}`.

- [#849](https://github.com/conciv-dev/conciv/pull/849) [`46b08a3`](https://github.com/conciv-dev/conciv/commit/46b08a3c40ca19bfd6bbc0cd81ec0c5a5335a7b9) Thanks [@omridevk](https://github.com/omridevk)! - An agent CLI that takes more than 10 seconds to print its first line (a cold start, a loaded machine) now finishes its turn instead of failing with "cannot attach to run ... delivered no bytes within 10000ms". The chat server no longer writes a run journal: the agent's output is read straight from its process, so the 30 second first-output limit ("the agent produced no output within 30s") is the only one. When that limit fails a turn, or the server is killed mid-run, the agent no longer keeps running in the background.

  `createChatServer` takes `sandbox: {dir}` (no `journalDir`), and `createChatPlane` no longer takes `stateRoot`.

- [`6d5d306`](https://github.com/conciv-dev/conciv/commit/6d5d306e1133aecf64d2ddb4351b7468e1f2d26b) Thanks [@omridevk](https://github.com/omridevk)! - A page tool that asks, called from outside the widget, now waits on its card until the user answers it instead of being refused with a retry; a widget call runs with the click as its approval, and `Permission.Unattended` settles asks that nobody is present to answer.

  A permission answer is opencode's reply, `once`, `always` or `reject`, in place of approve or deny with a session scope. The "Allow for session" button is gone: a card offers Approve and Deny, plus "Always allow" (a saved project rule) only when the ask can be saved. A call for a missing or deleted session is refused with `session "<id>" does not exist` before the tab check.

- [#915](https://github.com/conciv-dev/conciv/pull/915) [`9341c70`](https://github.com/conciv-dev/conciv/commit/9341c70f3c7c0255281d24ec92ed12879fd9396d) Thanks [@omridevk](https://github.com/omridevk)! - A tool a plugin adds or removes while a chat turn runs now shows up, or goes away, at the next step of that same turn. Before every model step the turn waits for a plugin reload in progress, then offers the tools as they are after it.

  If you build a `TurnPlan` yourself (the value `TurnHooks.plan` returns), the four tool fields `codeMode`, `search`, `asking` and `direct` move behind one async `tools()` function that returns them, for example `tools: async () => ({codeMode, search, asking, direct})`. It is called before every model step. `TurnHooks.plan` itself stays synchronous. The chat plane's `capabilities(sessionId)` now returns a promise.

  `HarnessChatDeps.hasTools` is removed, because the tools can change between steps of one turn. A harness that needs to know whether tools ride a model step reads that step's `options.tools` in its adapter's `chatStream`. Codex now does this: it auto-approves its tanstack MCP server for each step that offers tools.

- [`a8887eb`](https://github.com/conciv-dev/conciv/commit/a8887eb3b2775ceb567a8506fec66ba441590f0b) Thanks [@omridevk](https://github.com/omridevk)! - The develop skill's RPC reference cites the test runner's current follow module, and the debug, harness and setup skills cite the files that hold the code they describe now.

- [#1136](https://github.com/conciv-dev/conciv/pull/1136) [`6664a1e`](https://github.com/conciv-dev/conciv/commit/6664a1e59b7e11930cd783b8c77e777a9f56b811) Thanks [@omridevk](https://github.com/omridevk)! - The conciv-develop skill describes the test kits as they are now: `createEngine` from `@conciv/plugin-testkit/node`, `mount` from `@conciv/plugin-testkit/browser`, and the `conciv()` test projects run by `conciv-test`, in place of the removed core-kit and widget-suite entries.

- [#924](https://github.com/conciv-dev/conciv/pull/924) [`15948fb`](https://github.com/conciv-dev/conciv/commit/15948fb9085c220eac6f914dc1de28c916b35ef4) Thanks [@omridevk](https://github.com/omridevk)! - The conciv-develop skill no longer points at an example file that was removed.

- [`85f9ba1`](https://github.com/conciv-dev/conciv/commit/85f9ba173a0d02d0b2baaff8218b1fffaa179daa) Thanks [@omridevk](https://github.com/omridevk)! - The conciv-debug and conciv-harness skills describe the current permission flow: every ask waits on the user's card through `permission.assert`, ends with its run, and replays from the permission service's pending list. The deleted approval store, `gatedTools` and the refuse-and-retry path are no longer taught, and stale source paths and line references are corrected.

- [#1116](https://github.com/conciv-dev/conciv/pull/1116) [`59bf4aa`](https://github.com/conciv-dev/conciv/commit/59bf4aab5d42c6efc10d8fa9ac024029b60f4288) Thanks [@omridevk](https://github.com/omridevk)! - The conciv-develop skill teaches plugins (Plugin.define, Rpc.define, the browser part, @conciv/plugin-testkit) in place of the removed extension API, and conciv-setup and conciv-debug no longer mention extensions.

## 0.0.22

No changes in this release.

## 0.0.21

### Patch Changes

- [#632](https://github.com/conciv-dev/conciv/pull/632) [`28155f7`](https://github.com/conciv-dev/conciv/commit/28155f74825e2c2ef01b22180c0f7aaff1a3854b) Thanks [@omridevk](https://github.com/omridevk)! - Point the conciv-develop tool contract reference at the consolidated extension test file.

- [#643](https://github.com/conciv-dev/conciv/pull/643) [`897350a`](https://github.com/conciv-dev/conciv/commit/897350a87c01d7159ba7ff5f1274c6478435ad84) Thanks [@omridevk](https://github.com/omridevk)! - Skills reference moved to the merged tanstack test helpers file.

## 0.0.20

No changes in this release.

## 0.0.19

### Patch Changes

- [#419](https://github.com/conciv-dev/conciv/pull/419) [`47732b4`](https://github.com/conciv-dev/conciv/commit/47732b46e486526e5faacef18523cd1ea61b964c) Thanks [@omridevk](https://github.com/omridevk)! - New `@conciv/skills` package ships first-party agent skills for conciv (setup, extension
  development, harness adapters, debugging) discoverable via `@tanstack/intent`, plus a CI-checked
  drift script that keeps skill citations in sync with the source they describe.
