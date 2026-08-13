# @conciv/contract

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
