# contract/src

## Overview

Defines the oRPC `contract` router between conciv core and its clients (sessions, drafts, markers, navigation, chat, registry, captures, page, server, editor, meta) and the zod row schemas those procedures use. It also provides two client factories: a plain fetch client and a browser client. The browser client shares one connection per api base through `globalThis` registries, retries after a dropped connection, and reports reachability to subscribers. `index.ts` re-exports `rows.ts`, `contract.ts`, `client.ts` and `browser-transport.ts`.

## Interface

- `contract` (`contract.ts`): oRPC router with `sessions{list,create,resolve,open,restore,rename,delete,model,compact}`, `drafts{get,set}`, `markers{list}`, `navigation{get,set}`, `chat{events,hydrate,stop,permissionDecision,uiReply}` (`events` is an eventIterator), `registry{catalog,call}`, `captures{list}`, `page{symbolicate,changes,clearChanges,queries,reply}` (`queries` is an eventIterator), `server{config,resolve,graph,transform,urls,reload,restart}`, `editor{open,openFromFrames}`, `meta{models,commands,tools,engine}`.
- `ChatHydrationSchema` / `ChatHydration`, `ChatPendingApproval` (`contract.ts`): chat hydrate payload (messages, activeRun, lastRun, pendingApprovals, interrupts).
- `ToolCommandSignatureSchema` / `ToolCommandSignature` (`contract.ts`): registry catalog entry (name, path, binding `server|client`, icon from `TOOL_ICON_KEYS`, label, mutating/mirrors/reachable, approval `'ask'`, input/output schema, errors).
- `RegistryCallErrorName` (`contract.ts`): `NO_PAGE_CLIENT`, `PAGE_TIMEOUT`, `UNKNOWN_TOOL`, `INVALID_ARGS`, `HANDLER_ERROR`, `APPROVAL_DENIED`.
- `EditorOpenInputSchema`, `EngineStalenessSchema` / `EngineStaleness` (`contract.ts`).
- `SessionMetaSchema` / `SessionMeta`, `PersistedAttachmentSchema`, `DraftRowSchema` / `DraftRow`, `MarkerKindSchema` (`'new' | 'compact'`), `MarkerRowSchema` / `MarkerRow`, re-exported `UsageSnapshotSchema` / `UsageSnapshot` (`rows.ts`).
- `makeRpcClient(apiBase, {headers?})` -> `RpcClient` (`client.ts`): oRPC client over `RPCLink` at `${apiBase}/rpc` using `abortableFetch`.
- `abortableFetch(request, init, {signal?})` (`client.ts`): fetch wrapper passing `signal ?? null`.
- `makeBrowserRpcClient(base | () => base | null, {session?})` -> `BrowserRpcClient {rpc, bound, bind, rebind, close}` (`client.ts`); types `RpcClient`, `RpcClientOptions`, `BrowserRpcClientOptions`, `BrowserRpcClient`.
- `browserRpcConnection(apiBase)`, `closeBrowserRpcConnection(apiBase)`, `resetBrowserRpcConnection(apiBase)` (`browser-transport.ts`): get, close or recreate the shared connection for a normalized api base.
- `dynamicBrowserRpcLink(currentApiBase, session?)` (`browser-transport.ts`): ClientLink that resolves the api base per call and puts `concivSessionId` in the call context.
- `subscribeRpcReachability(apiBase, listener)` -> unsubscribe (`browser-transport.ts`).
- `isRetryableRpcFailure(alive, error)` (`browser-transport.ts`): true only when the connection is alive, the error is not an `ORPCError` and not an `AbortError`.
- `RPC_UNBOUND_MESSAGE` = `'conciv core not connected yet'` (`browser-transport.ts`, re-exported from `client.ts`); types `RpcClientContext`, `SessionAccessor`, `BrowserRpcConnection`, `ReachabilityListener`.

## Invariants

- `sessions.rename` requires `title` of 1-120 characters and declares `NOT_FOUND`; `sessions.model` declares `NOT_FOUND` and `UNKNOWN_MODEL` (`contract.ts`).
- `chat.stop` requires `runIds` to be non-empty strings; `chat.permissionDecision` and `chat.uiReply` declare `UNKNOWN_REQUEST` (`contract.ts`).
- Every `server.*` procedure declares `NO_BUNDLER`; `server.reload` and `server.restart` also declare `APPROVAL_DENIED`; `restart.force` defaults to `false` (`contract.ts`).
- `registry.call` requires a non-empty `name` and `input` as `record<string, unknown>`, and declares the `registryCallErrors` set (`contract.ts`).
- `editor.open` requires `line` to be an integer >= 1 when present (`EditorOpenInputSchema`).
- `ToolCommandSignatureSchema` applies `.catch(undefined)` to `icon` and `label` (invalid values become `undefined`); `errors` defaults to `[]` (`contract.ts`).
- `StreamChunkSchema` checks only that a chunk is a non-null object, then casts it to `ChatEvent` (`contract.ts`).
- `DraftRowSchema` requires `selectionStart` / `selectionEnd` to be integers >= 0 and maps null `attachments` to `[]`; `drafts.set` input omits `updatedAt` (`rows.ts`, `contract.ts`). `MarkerRowSchema.afterTurn` is an integer >= 0 (`rows.ts`).
- `BrowserRpcClient.bind` throws `conciv rpc client already bound` when a base is set and `conciv rpc cannot bind an empty api base` for `''` (`client.ts`).
- `dynamicBrowserRpcLink.call` throws `RPC_UNBOUND_MESSAGE` when the current api base is null (`browser-transport.ts`).
- Connections are keyed by `normalizeApiBase` (origin + pathname without trailing slash, resolved against `location.href` when present), so equivalent bases share one connection (`browser-transport.ts`).
- Retry policy: `CONNECTION_LOSS_RETRIES` = 12 with `CONNECTION_LOSS_RETRY_DELAY_MS` = 250, gated by `isRetryableRpcFailure`; a closed connection is not alive and stops retrying (`browser-transport.ts`).
- Only the active connection for a key may report reachability: `voteReachability` ignores votes whose connectionId differs from `activeConnections()` (`browser-transport.ts`).

## Side Effects

- Creates `globalThis.__concivBrowserRpcRegistryV1`, `__concivRpcReachabilityListenersV1` and `__concivRpcReachabilityActiveV1` Maps on first use, shared across bundle copies (`registry`, `reachabilityListeners`, `activeConnections` in `browser-transport.ts`).
- HTTP calls to `${apiBase}/rpc` through `RPCLink` (`makeRpcClient` in `client.ts`; `fetchLink` in `browser-transport.ts`).
- Adds the `CONCIV_SESSION_HEADER` header (from `@conciv/protocol/chat-types`) when the context has `concivSessionId` (`sessionHeaders`, `browser-transport.ts`).
- Reads `location.href` when defined (`normalizeApiBase`).
- Calls reachability listeners with `false` when a retry is scheduled and `true` when a retry succeeds (`retryPlugin`, `browser-transport.ts`).
- `rebind` / `close` remove the previous base's shared connection from the global registry, which affects every client sharing that base (`closeBrowserRpcConnection`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/contract` from the repo root (turbo builds the package and its dependencies first)
