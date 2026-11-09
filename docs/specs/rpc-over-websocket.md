# Every browser oRPC call over one reconnecting WebSocket

Status: approved direction (Omri, 2026-11-05 in the engine-login work: "no reason to have HTTP as well"; 2026-11-09:
"B you send agent to do in a new PR"). Branch `feat/rpc-over-websocket`, off `main`.

## Goal

The browser talks to the engine over exactly one WebSocket per engine `apiBase`. Every oRPC procedure (one-shot calls
and event-iterator streams like `settings.changes`, `sessions.changes`) goes through it. The socket reconnects on its
own (partysocket `ReconnectingWebSocket`, already a dependency of `@conciv/client`), and streams that were open resume
after a reconnect, so a page never goes quiet after an engine restart or a laptop sleep.

## Today

- `packages/contract/src/browser-transport.ts`: the browser RPC client is `@orpc/client/fetch` `RPCLink` over HTTP,
  with a `ClientRetryPlugin` (12 retries x 250 ms on connection loss) and the bearer-token trust state.
- `packages/client/src/push-channel.ts`: a separate partysocket socket for chat push frames.
- `packages/extension/src/rpc-mount.ts`: the server side already mounts `@orpc/server/websocket` handlers for extension
  routers.
- `engineWebSocket(apiBase)` in browser-transport.ts builds the socket constructor the terminal and chat use.

## Design

- Client: `@orpc/client/websocket` `RPCLink` over a partysocket `ReconnectingWebSocket` built with `engineWebSocket`.
  One socket per `apiBase`, shared by every client created for that base (same ref-counting idea as
  `acquirePushChannel`).
- Server: core mounts the main router on a WebSocket route with `@orpc/server/websocket` `RPCHandler`, beside the
  existing HTTP handler.
- Trust: follows the engine-login shape (Devframe's): trust is per connection, set by the first auth call on that socket
  (see `_ref/devframe/packages/devframe/src/client/rpc-live.ts` and `node/auth/*` for the shape; Devframe uses birpc,
  we use oRPC, so copy the flow, not the code). On every reconnect the client re-sends its auth before any queued call.
  A revoked token closes with `REVOKED_SOCKET_CLOSE_CODE` and the client stops reconnecting.
- Streams across reconnects: use oRPC's own mechanism (`ClientRetryPlugin` event-iterator retry with `lastEventId`)
  so an open `changes` stream re-subscribes after the socket comes back; no hand-rolled resubscribe loop.
- Reachability (`unreachable` status, the vote listener) keys off the socket's open/close state instead of fetch
  failures.
- HTTP stays for what cannot be a socket call: the `/rpc` HTTP handler stays mounted for node clients (CLI, tests,
  `makeRpcClient`), the widget bundle and static assets, and the WebSocket upgrade itself. The browser stops using it.
- Whether the chat push channel folds into the same socket: investigate and report; do not merge them in this PR unless
  oRPC streams can carry the push frames without a protocol change.

## Out of scope

- Settings-specific behaviour. The settings stack (#778-#780) adds a stream-only retry rule to the fetch link's
  `ClientRetryPlugin`; this PR replaces that link, so carry the rule's intent (streams keep retrying while the page is
  open) into the socket transport and delete the fetch-specific version if it has landed on main by then.
