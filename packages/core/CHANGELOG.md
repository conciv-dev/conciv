# @conciv/core

## 0.0.8

### Patch Changes

- [#55](https://github.com/conciv-dev/conciv/pull/55) [`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf) Thanks [@omridevk](https://github.com/omridevk)! - Client/server now talk over a single typed oRPC contract (`@conciv/contract`), with persistence extracted into `@conciv/db`; the remaining bespoke HTTP surface is limited to the MCP route and the terminal WebSocket.

  The server stack moved from h3/srvx to hono behind one `@conciv/serve` wrapper for `@hono/node-server`, and the extension bundler was split out of the vite plugin into a standalone `@conciv/extension-compiler`.

  The terminal gains a narrative activity rail — a resizable, open-by-default timeline of session activity — and the pty now spawns at the attaching client's fitted size instead of bouncing through a fixed geometry on every attach.

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
