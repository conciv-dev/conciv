# @conciv/core

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
