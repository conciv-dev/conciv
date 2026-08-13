# @conciv/core

## 0.0.19

### Patch Changes

- [#357](https://github.com/conciv-dev/conciv/pull/357) [`c6aa92c`](https://github.com/conciv-dev/conciv/commit/c6aa92c53847d9f811eafebf414492335864955b) Thanks [@omridevk](https://github.com/omridevk)! - The configured engine port is a preference on the Vite dev server: when it is already taken the
  engine falls back to a free port, logs the address it actually bound, and the page is stamped with
  that address, so two dev servers can run at once instead of the second dying on EADDRINUSE. The
  Next.js integration and the generic webpack/rspack plugin still bind their port exactly, because
  both hand the client a fixed address before the engine ever boots.

- [#343](https://github.com/conciv-dev/conciv/pull/343) [`78977f0`](https://github.com/conciv-dev/conciv/commit/78977f03328d09224602b6162b9178c48b4e04a9) Thanks [@omridevk](https://github.com/omridevk)! - Detect and announce a stale engine. The engine builds its staleness probe as its own modules are first imported, fingerprinting the contents of every published entry of the server packages it loaded, and re-hashes them on demand — so a rebuild that lands on disk under a running dev server stops being invisible — and a re-link or cache extraction that only moves mtimes with identical bytes does not raise a false alarm. `/health` gains an `engine` field (`stale`, `changed`, `tracked`, `bootedAt`, `fingerprint`), a new `meta.engine` RPC carries the same reading to the widget, and the MCP server folds a warning into its `instructions` when the loaded code is behind the disk. The widget raises a standing danger notice naming what actually moved: the server code on disk is newer than the running engine, restart the dev server. The notice is keyed by fingerprint, so it clears itself when the engine is restarted, stays down once dismissed for that same stamp, and speaks up again after a further rebuild.

- [#319](https://github.com/conciv-dev/conciv/pull/319) [`af72648`](https://github.com/conciv-dev/conciv/commit/af72648838bd828477102f87f78d457d17ebec41) Thanks [@omridevk](https://github.com/omridevk)! - Serve one composite oRPC router (core procedures plus `ext.<slug>` extension routers) over both a fetch mount at `/rpc` and a new additive WebSocket mount at `/rpc-ws`. Per-call request headers are now derived from the oRPC standard request by a single shared root interceptor, so session-scoped calls behave identically on both transports. `@conciv/serve` gains an explicit `maxPayload`, a graceful socket close that only terminates after a deadline, and a `fetch` type that accepts the server env argument. Existing `/rpc` and `/rpc/ext/<slug>` URLs are unchanged.

- Updated dependencies [[`e628f93`](https://github.com/conciv-dev/conciv/commit/e628f93ed9d4067c6ad164a2af0369e543abd62f), [`39c6072`](https://github.com/conciv-dev/conciv/commit/39c6072687cdedeabc42dabe798d88fa10dc716b), [`23f62c9`](https://github.com/conciv-dev/conciv/commit/23f62c9ad8a810cdf177a53701a1516b191436fe), [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323), [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323), [`b329b47`](https://github.com/conciv-dev/conciv/commit/b329b47b889201093c5de042f389eac297caa249)]:
  - @conciv/ui-kit-chat@0.0.19
  - @conciv/contract@0.0.19
  - @conciv/extension@0.0.19
  - @conciv/serve@0.0.19
  - @conciv/extension-page@0.0.19
  - @conciv/tools@0.0.19
  - @conciv/db@0.0.19
  - @conciv/harness@0.0.19
  - @conciv/protocol@0.0.19
  - @conciv/solid-diffs@0.0.19

## 0.0.18

### Patch Changes

- [#212](https://github.com/conciv-dev/conciv/pull/212) [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd) Thanks [@omridevk](https://github.com/omridevk)! - Clean-room rewrite of the chat stack: the client rides `@tanstack/ai` subscribe/send/stop with server-stamped runIds, core rebuilds around six small chat modules with a MESSAGES_SNAPSHOT-led wire, and the composer moves into ui-kit-chat with draft persistence and refresh. The old bridge/epoch/adopt machinery is deleted and banned from the codebase by lint.

- [#212](https://github.com/conciv-dev/conciv/pull/212) [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd) Thanks [@omridevk](https://github.com/omridevk)! - Track in-flight chat runs and drain them when the app is disposed, so a shutdown no longer races a
  turn's teardown (leftover harness temp files, writes against a closed database). `makeApp` now
  returns a single `dispose()` that drains runs, runs extension disposers, and closes the sqlite
  handle, replacing the separate `disposers`/`closeDb` pair callers could forget. The MCP route also
  closes its per-request server and transport instead of leaking one per POST.
- Updated dependencies [[`b687236`](https://github.com/conciv-dev/conciv/commit/b687236db6e3793f1ecb909ebafa7bf1ed02ff8f), [`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd), [`1e1b01b`](https://github.com/conciv-dev/conciv/commit/1e1b01b36c3b5c282d51a6689b8a18810a330fc2), [`90ed432`](https://github.com/conciv-dev/conciv/commit/90ed432ccf967c05f1858c8c13d15ee57c33fb6c), [`42a0ad0`](https://github.com/conciv-dev/conciv/commit/42a0ad0273cbf8b1b48d197c363f4f77da75dc69), [`32b49c3`](https://github.com/conciv-dev/conciv/commit/32b49c36a2c62210391449a1b2f01095d8ece57f), [`ce52c4f`](https://github.com/conciv-dev/conciv/commit/ce52c4ff059e2c701fa81d18b68a793df2b937e8)]:
  - @conciv/tools@0.0.18
  - @conciv/protocol@0.0.18
  - @conciv/extension@0.0.18
  - @conciv/db@0.0.18
  - @conciv/extension-page@0.0.18
  - @conciv/harness@0.0.18
  - @conciv/contract@0.0.18
  - @conciv/serve@0.0.18

## 0.0.17

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.17
  - @conciv/db@0.0.17
  - @conciv/extension@0.0.17
  - @conciv/harness@0.0.17
  - @conciv/protocol@0.0.17
  - @conciv/serve@0.0.17
  - @conciv/tools@0.0.17

## 0.0.16

### Patch Changes

- [#126](https://github.com/conciv-dev/conciv/pull/126) [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b) Thanks [@omridevk](https://github.com/omridevk)! - Tool cards render on every harness, and code-mode calls surface as real nested tool cards. Three fixes plus the phase-2 extension-owned cards: (1) tool names are normalized to their registered names before parts reach the widget — claude's `probe_ping`, opencode's `tanstack_probe_ping`, and transcript `mcp__<server>__` forms all map losslessly back to the registered dotted name, so a card written once matches everywhere. (2) codex bridged tools finally execute under `workspace-write`: codex was cancelling MCP tool calls awaiting an unanswerable approval prompt, fixed narrowly with `mcp_servers.tanstack.default_tools_approval_mode = "approve"` scoped to conciv's own bridge (conciv's approval gate still guards `approval: 'ask'` tools). (3) every extension tool invoked through code-mode `execute_typescript` now emits a real per-tool part carrying `metadata.parentToolCallId`, and the chat activity view nests those parts under the script run in a collapsible tool group — denies and throws render as errors, never green. New extension-owned cards: CanvasOpCard (op-aware `canvas.*` with thumbnails, count chips, red destructive ops), CommentOpCard (`comment.*` + `pin.setState`), RecordingToolCard (`recording_start/stop/pull` with action-log summary), and inline rows for `element.reference` / `anchor.resolve`.

- Updated dependencies [[`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b), [`85ad5da`](https://github.com/conciv-dev/conciv/commit/85ad5da09b83fa1a263578620d9ad2054b6eea1b)]:
  - @conciv/extension@0.0.16
  - @conciv/protocol@0.0.16
  - @conciv/tools@0.0.16
  - @conciv/contract@0.0.16
  - @conciv/db@0.0.16
  - @conciv/harness@0.0.16
  - @conciv/serve@0.0.16

## 0.0.15

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.15
  - @conciv/db@0.0.15
  - @conciv/extension@0.0.15
  - @conciv/harness@0.0.15
  - @conciv/protocol@0.0.15
  - @conciv/serve@0.0.15
  - @conciv/tools@0.0.15

## 0.0.14

### Patch Changes

- Updated dependencies [[`8370fd9`](https://github.com/conciv-dev/conciv/commit/8370fd9ef1156296236d4a9e22f5453ca817d9f3)]:
  - @conciv/extension@0.0.14
  - @conciv/tools@0.0.14
  - @conciv/contract@0.0.14
  - @conciv/db@0.0.14
  - @conciv/harness@0.0.14
  - @conciv/protocol@0.0.14
  - @conciv/serve@0.0.14

## 0.0.13

### Patch Changes

- [#80](https://github.com/conciv-dev/conciv/pull/80) [`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c) Thanks [@omridevk](https://github.com/omridevk)! - Fix the context meter reading cumulative turn usage as context occupancy (issue [#78](https://github.com/conciv-dev/conciv/issues/78), e.g. 386% / 773K of 200K). `@tanstack/ai`'s `RUN_FINISHED` usage is a billing aggregate, not the live context size; each adapter feeds it differently (Claude sums every tool-loop request). Context occupancy is now a distinct `UsageSnapshot.contextTokens` field populated per-harness through a new optional `HarnessHistory.contextTokens(raw)` seam. The Claude harness derives it from the last non-sidechain assistant message's usage in the transcript (`input + cache_read + cache_creation`). The meter's ring/percent/bar render only when a harness reports real occupancy; otherwise the tracker shows honest turn billing totals with no percent-of-window framing.

- Updated dependencies [[`73c451e`](https://github.com/conciv-dev/conciv/commit/73c451e8d4175732a0e3f421300bda19b8dcf45c)]:
  - @conciv/protocol@0.0.13
  - @conciv/harness@0.0.13
  - @conciv/contract@0.0.13
  - @conciv/db@0.0.13
  - @conciv/extension@0.0.13
  - @conciv/tools@0.0.13
  - @conciv/serve@0.0.13

## 0.0.12

### Patch Changes

- [#66](https://github.com/conciv-dev/conciv/pull/66) [`450fc46`](https://github.com/conciv-dev/conciv/commit/450fc463b7bce804ac1c75e3c6a398d1b9f9491e) Thanks [@omridevk](https://github.com/omridevk)! - Adapter streams that emit a RUN_ERROR chunk (stub harnesses, acp adapters) now settle the run with a visible error instead of finishing silently with an empty message. Runs whose harness produces no output at all (missing binary, unauthenticated CLI stuck on an interactive prompt) are now bounded by a first-chunk deadline: after 30s of silence the child is killed and the run settles with a visible "produced no output" error instead of spinning forever.

- Updated dependencies []:
  - @conciv/contract@0.0.12
  - @conciv/db@0.0.12
  - @conciv/extension@0.0.12
  - @conciv/harness@0.0.12
  - @conciv/protocol@0.0.12
  - @conciv/serve@0.0.12
  - @conciv/tools@0.0.12

## 0.0.11

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.11
  - @conciv/db@0.0.11
  - @conciv/extension@0.0.11
  - @conciv/harness@0.0.11
  - @conciv/protocol@0.0.11
  - @conciv/serve@0.0.11
  - @conciv/tools@0.0.11

## 0.0.10

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.10
  - @conciv/db@0.0.10
  - @conciv/extension@0.0.10
  - @conciv/harness@0.0.10
  - @conciv/protocol@0.0.10
  - @conciv/serve@0.0.10
  - @conciv/tools@0.0.10

## 0.0.9

### Patch Changes

- Updated dependencies []:
  - @conciv/contract@0.0.9
  - @conciv/db@0.0.9
  - @conciv/extension@0.0.9
  - @conciv/harness@0.0.9
  - @conciv/protocol@0.0.9
  - @conciv/serve@0.0.9
  - @conciv/tools@0.0.9

## 0.0.8

### Patch Changes

- [#55](https://github.com/conciv-dev/conciv/pull/55) [`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf) Thanks [@omridevk](https://github.com/omridevk)! - Client/server now talk over a single typed oRPC contract (`@conciv/contract`), with persistence extracted into `@conciv/db`; the remaining bespoke HTTP surface is limited to the MCP route and the terminal WebSocket.

  The server stack moved from h3/srvx to hono behind one `@conciv/serve` wrapper for `@hono/node-server`, and the extension bundler was split out of the vite plugin into a standalone `@conciv/extension-compiler`.

  The terminal gains a narrative activity rail (a resizable, open-by-default timeline of session activity), and the pty now spawns at the attaching client's fitted size instead of bouncing through a fixed geometry on every attach.

- [#38](https://github.com/conciv-dev/conciv/pull/38) [`fce6e80`](https://github.com/conciv-dev/conciv/commit/fce6e80e818460ca950b08ac75bccd94a1a72931) Thanks [@omridevk](https://github.com/omridevk)! - Harness turns now run on the TanStack AI stack: every harness is a `chatConfig` returning a published `@tanstack/ai-*` text adapter (claude on `claudeCodeText`, codex on `codexText`, opencode on `opencodeText`, gemini-cli on `acpCompatible`), executed through `chat()` with a local-process sandbox and the conciv permission gate as middleware. The bespoke spawn/decode pipeline, the PreToolUse hook route, and the per-harness arg builders are gone.

- Updated dependencies [[`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf)]:
  - @conciv/contract@0.0.8
  - @conciv/db@0.0.8
  - @conciv/serve@0.0.8
  - @conciv/extension@0.0.8
  - @conciv/tools@0.0.8
  - @conciv/harness@0.0.8
  - @conciv/protocol@0.0.8

## 0.0.7

### Patch Changes

- [#30](https://github.com/conciv-dev/conciv/pull/30) [`bbdfc69`](https://github.com/conciv-dev/conciv/commit/bbdfc6940e7c4a45d4a20fb04e12d8e407154bfb) Thanks [@omridevk](https://github.com/omridevk)! - Add homepage metadata (conciv.dev) and repository fields across manifests, and
  publish the terminal packages (@conciv/ui-kit-terminal, @conciv/extension-terminal).
- Updated dependencies []:
  - @conciv/harness@0.0.7
  - @conciv/protocol@0.0.7
  - @conciv/tools@0.0.7

## 0.0.6

### Patch Changes

- Updated dependencies []:
  - @conciv/harness@0.0.6
  - @conciv/protocol@0.0.6
  - @conciv/tools@0.0.6

## 0.0.5

### Patch Changes

- [`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139) Thanks [@omridevk](https://github.com/omridevk)! - new version with fixed deps

- Updated dependencies [[`8cb9336`](https://github.com/conciv-dev/conciv/commit/8cb9336039f829d66166a2bb0635d97b84454139)]:
  - @conciv/harness@0.0.5
  - @conciv/protocol@0.0.5
  - @conciv/tools@0.0.5

## 0.0.4

### Patch Changes

- Updated dependencies []:
  - @conciv/harness@0.0.4
  - @conciv/protocol@0.0.4
  - @conciv/tools@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies []:
  - @conciv/harness@0.0.3
  - @conciv/protocol@0.0.3
  - @conciv/tools@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @conciv/harness@0.0.2
  - @conciv/protocol@0.0.2
  - @conciv/tools@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies []:
  - @conciv/harness@0.0.1
  - @conciv/protocol@0.0.1
  - @conciv/tools@0.0.1
