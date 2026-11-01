# @conciv/serve

## 0.0.21

### Patch Changes

- Updated dependencies [[`060d32a`](https://github.com/conciv-dev/conciv/commit/060d32a66de6929c085a431a9676ac3759e6ff4c)]:
  - @conciv/protocol@0.0.21

## 0.0.20

### Patch Changes

- Updated dependencies [[`ec28181`](https://github.com/conciv-dev/conciv/commit/ec28181dc8b49c979e6bd36284eb7148bee092f3), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d23d7c8`](https://github.com/conciv-dev/conciv/commit/d23d7c820af745fd87c4048a2d089c9d995f664a), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6), [`d07737b`](https://github.com/conciv-dev/conciv/commit/d07737b093afd7e373ca7abd7c918cc572bd83d6)]:
  - @conciv/protocol@0.0.20

## 0.0.19

### Patch Changes

- [#335](https://github.com/conciv-dev/conciv/pull/335) [`b329b47`](https://github.com/conciv-dev/conciv/commit/b329b47b889201093c5de042f389eac297caa249) Thanks [@omridevk](https://github.com/omridevk)! - Move the rpc mount seam (`makeCompositeRpcRouter`, `rpcFetchMiddleware`, `rpcWebsocketRoute`, `RPC_PREFIX`,
  `RPC_WS_PATH`) from `@conciv/core` into `@conciv/extension/rpc-mount`, so extension fixtures and test harnesses
  mount the same composite router over both transports instead of hand-rolling a second one. `@conciv/core`
  imports the seam from there; behavior is unchanged.

  `rpcWebsocketRoute(router, {upgrade, onError})` now takes its `upgradeWebSocket` adapter as an injected
  argument instead of importing `@hono/node-server` directly, so every caller (core's own mount, the test
  harnesses, extension fixtures) shares one `@hono/node-server` module instance for the upgrade — a second
  instance silently refuses the upgrade. `@conciv/serve` re-exports `upgradeWebSocket` as the one sanctioned
  source for that adapter; pass it (and an optional `onError` for rejected frames) at every call site.

- Updated dependencies []:
  - @conciv/protocol@0.0.19

## 0.0.18

## 0.0.17

## 0.0.16

## 0.0.15

## 0.0.14

## 0.0.13

## 0.0.12

## 0.0.11

## 0.0.10

## 0.0.9

## 0.0.8

### Patch Changes

- [#55](https://github.com/conciv-dev/conciv/pull/55) [`05dd101`](https://github.com/conciv-dev/conciv/commit/05dd101ff9401cbdfd5545cffa63f4bb3cfd2fbf) Thanks [@omridevk](https://github.com/omridevk)! - Client/server now talk over a single typed oRPC contract (`@conciv/contract`), with persistence extracted into `@conciv/db`; the remaining bespoke HTTP surface is limited to the MCP route and the terminal WebSocket.

  The server stack moved from h3/srvx to hono behind one `@conciv/serve` wrapper for `@hono/node-server`, and the extension bundler was split out of the vite plugin into a standalone `@conciv/extension-compiler`.

  The terminal gains a narrative activity rail (a resizable, open-by-default timeline of session activity), and the pty now spawns at the attaching client's fitted size instead of bouncing through a fixed geometry on every attach.
