# @conciv/contract

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

- [#485](https://github.com/conciv-dev/conciv/pull/485) [`958dde7`](https://github.com/conciv-dev/conciv/commit/958dde7a862c8cfd735c2232ca13cef659b301f3) Thanks [@omridevk](https://github.com/omridevk)! - Global engine-reachability handling: reachability seam + single rebindable rpc client factory in contract, router error boundary with /panel/latest sentinel, one standing offline notice per window context, composer send disabled while unreachable.

- [#556](https://github.com/conciv-dev/conciv/pull/556) [`09f620a`](https://github.com/conciv-dev/conciv/commit/09f620a62d8d65e5721dd16eeaf7f2651225975e) Thanks [@omridevk](https://github.com/omridevk)! - Fix a JS event listener leak in the browser RPC websocket's reconnect path: partysocket's `ReconnectingWebSocket` registers a dangling `error` listener on each discarded socket during its internal auto-reconnect loop and never removes it, so a persistently unreachable engine accumulated listeners without bound. The websocket now makes a single bounded connection attempt per cycle and reconnection is driven externally with capped exponential backoff, cutting the per-outage reconnect rate (and the leak with it) by more than an order of magnitude while preserving automatic recovery once the engine comes back.

- [#597](https://github.com/conciv-dev/conciv/pull/597) [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6) Thanks [@omridevk](https://github.com/omridevk)! - Bump the `@tanstack/ai` family from the 0.48 lockstep to 0.51 (catalog-only, see `pnpm-workspace.yaml`).
  Picks up upstream fix [#1248](https://github.com/TanStack/ai/pull/1248): the client `StreamProcessor`
  dropped the first `TEXT_MESSAGE_CONTENT` delta of an assistant turn that called a tool before
  replying, so every answer that followed a tool call lost its opening text (an opening code fence,
  most visibly).

- [#523](https://github.com/conciv-dev/conciv/pull/523) [`1cb8a51`](https://github.com/conciv-dev/conciv/commit/1cb8a51610a59d764ce064216a50b5209d28bde0) Thanks [@omridevk](https://github.com/omridevk)! - Export `ChatSendInput` so the rpc wire watcher asserts against the real `chat.send` schema instead of a looser copy.
- Updated dependencies [[`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6)]:
  - @conciv/protocol@0.0.20

## 0.0.19

### Patch Changes

- [#349](https://github.com/conciv-dev/conciv/pull/349) [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323) Thanks [@omridevk](https://github.com/omridevk)! - Browser rpc rides one websocket per (tab, apiBase).

  `makeBrowserRpcClient`, `makeDeferredRpcClient`, `makeRebindableRpcClient` and the browser form of
  `makeExtRpcClient` now resolve a shared connection from a versioned `globalThis` registry instead of
  building a fetch link each. The connection picks its transport once, at boot, by dialling `/rpc-ws`
  with a bounded open timeout and sticking to fetch/SSE when that fails; `widget.transport` pins either
  transport explicitly. `makeRpcClient` stays on fetch for the CLI, testkit and node integration tests.

  This removes the six-connection starvation that broke the widget from the third tab onwards.

- [#349](https://github.com/conciv-dev/conciv/pull/349) [`ea23bf6`](https://github.com/conciv-dev/conciv/commit/ea23bf6fa956703ba66399513c5de4af40770323) Thanks [@omridevk](https://github.com/omridevk)! - Closing a browser rpc connection no longer raises an unhandled error.

  A disposed connection now answers writes itself instead of letting them reach a dead socket: peer
  control frames (cancellations and client event-iterator payloads) are dropped, so oRPC's abort path
  runs to completion and closes the call it was cancelling, while a request frame still fails fast so a
  caller holding a stale link learns the connection is gone instead of hanging. Dispose delivers a
  close event only when partysocket's own `close()` emits none — it already dispatches one
  synchronously unless the socket never dialled or is already closing — so the peer observes exactly
  one terminal event.

  Unmounting the widget now releases the tab's connection: the socket is closed and the registry entry
  dropped, instead of leaving partysocket and its reconnect timers alive for the rest of the tab's
  life. A later mount re-creates the connection through the same registry, running the full transport
  probe again.

  `handle.rebind` now drops the old connection before tearing its consumers down, and rebinding to the
  base the widget is already on re-runs the probe rather than being a no-op, so a tab that fell back to
  fetch/SSE while the engine was unreachable can ride the websocket again once it recovers.

  A live connection reports partysocket's real state: open while open, connecting while it will
  reconnect, closed once it will not, so oRPC fails a send fast instead of waiting on a socket that is
  never coming back.

- Updated dependencies []:
  - @conciv/protocol@0.0.19

## 0.0.18

### Patch Changes

- Updated dependencies [[`cf49d70`](https://github.com/conciv-dev/conciv/commit/cf49d70082aae2cad1a885d499afa4f735b6bddd)]:
  - @conciv/protocol@0.0.18

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

- [#55](https://github.com/conciv-dev/conciv/pull/55) [`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf) Thanks [@omridevk](https://github.com/omridevk)! - Client/server now talk over a single typed oRPC contract (`@conciv/contract`), with persistence extracted into `@conciv/db`; the remaining bespoke HTTP surface is limited to the MCP route and the terminal WebSocket.

  The server stack moved from h3/srvx to hono behind one `@conciv/serve` wrapper for `@hono/node-server`, and the extension bundler was split out of the vite plugin into a standalone `@conciv/extension-compiler`.

  The terminal gains a narrative activity rail (a resizable, open-by-default timeline of session activity), and the pty now spawns at the attaching client's fitted size instead of bouncing through a fixed geometry on every attach.

- Updated dependencies []:
  - @conciv/protocol@0.0.8
