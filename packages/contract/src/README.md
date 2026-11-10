# contract/src

## Overview

Defines the oRPC `contract` router between conciv core and its clients (sessions, drafts, markers, navigation, chat, registry, captures, page, server, editor, meta) and the zod row schemas those procedures use. It also provides two client factories: a plain fetch client and a browser client. The browser client keeps one connection, for the one engine the page talks to, in a `globalThis` slot, retries after a dropped connection, and reports reachability to subscribers. `index.ts` re-exports `rows.ts`, `contract.ts`, `client.ts` and `browser-transport.ts`.

## Interface

- `contract` (`contract.ts`): oRPC router with `auth{trust,exchange,requestCode}`, `sessions{list,search,changes,get,preview,create,resolve,open,restore,rename,delete,model,effort,compact,switchHarness}`, `drafts{get,set}`, `markers{list}`, `navigation{get,set}`, `chat{events,hydrate,stop,permissionDecision,uiReply}` (`events` and `sessions.changes` are eventIterators; `sessions.changes` yields `{version}`, the search index version, the current one first), `registry{catalog,call}`, `captures{list}`, `page{symbolicate,changes,clearChanges,queries,reply}` (`queries` is an eventIterator), `server{config,resolve,graph,transform,urls,reload,restart}`, `editor{open,openFromFrames}`, `meta{models,harnesses,commands,tools,engine}`.
- `ChatHydrationSchema` / `ChatHydration`, `ChatPendingApproval` (`contract.ts`): chat hydrate payload (messages, activeRun, lastRun, pendingApprovals, interrupts, and `page` when the input carried a `limit`). `chat.hydrate` input takes an optional `limit` (positive integer) and `before` (the `page.cursor` of the newer window); `ChatHistoryWindow` is that pair.
- `sessions.preview` (`contract.ts`): read-only window of a native transcript. Input `{harness, nativeId, cwd?, before: cursor | null, limit: 1-100}` (`cwd` is an all-projects hit's own project, this project when absent); output `{messages, earlier: cursor | null}`, newest window first, `earlier` is the `before` for the window above it. The cursor is an opaque string the harness minted; a window may hold a few more than `limit` messages, since it starts on a whole turn. A missing, empty or unreadable transcript is `NOT_FOUND`.
- `ToolCommandSignatureSchema` / `ToolCommandSignature` (`contract.ts`): registry catalog entry (name, path, binding `server|client`, icon from `TOOL_ICON_KEYS`, label, mutating/reachable, approval `'ask'`, input/output schema, errors).
- `RegistryCallErrorName` (`contract.ts`): `NO_PAGE_CLIENT`, `PAGE_TIMEOUT`, `UNKNOWN_TOOL`, `INVALID_ARGS`, `HANDLER_ERROR`, `APPROVAL_DENIED`.
- `EditorOpenInputSchema`, `EngineStalenessSchema` / `EngineStaleness` (`contract.ts`).
- `SessionMetaSchema` / `SessionMeta`, `SessionHitSchema` / `SessionHit` (`SessionMeta` plus `excerpt: string | null`, `matched: string[]`, `cwd: string | null` (the other project's cwd for a hit outside this project), `resume: string | null` (the shell command that resumes that hit in its own project) and `preview: NativeSessionRef | null` (the transcript the match came from, which after a harness switch is an earlier transcript, not the session's current `native`), the rows of a `sessions.search` page; `sessions.list` keeps `SessionMeta`), `PersistedAttachmentSchema`, `DraftRowSchema` / `DraftRow`, `MarkerKindSchema` (`'new' | 'compact'`), `MarkerRowSchema` / `MarkerRow`, re-exported `UsageSnapshotSchema` / `UsageSnapshot` (`rows.ts`).
- `makeRpcClient(apiBase, {headers?})` -> `RpcClient` (`client.ts`): oRPC client over `RPCLink` at `${apiBase}/rpc` using `abortableFetch`.
- `abortableFetch(request, init, {signal?})` (`client.ts`): fetch wrapper passing `signal ?? null`.
- `makeBrowserRpcClient(base | () => base | null, {session?})` -> `BrowserRpcClient {rpc, bound, bind, rebind, close}` (`client.ts`); types `RpcClient`, `RpcClientOptions`, `BrowserRpcClientOptions`, `BrowserRpcClient`.
- `browserRpcConnection(apiBase)`, `closeBrowserRpcConnection(apiBase)`, `resetBrowserRpcConnection(apiBase)` (`browser-transport.ts`): get, close or recreate the shared connection for a normalized api base.
- `dynamicBrowserRpcLink(currentApiBase, session?)` (`browser-transport.ts`): ClientLink that resolves the api base per call and puts `concivSessionId` in the call context.
- `subscribeRpcReachability(apiBase, listener)` -> unsubscribe (`browser-transport.ts`).
- `EngineTrust` on every `BrowserRpcConnection.trust` (`browser-transport.ts`): the one trust owner per api base. `isTrusted()`, `status()` (`checking | trusted | untrusted | revoked | unreachable`), `subscribe(listener)` (the listener gets the new and the previous status), `requestTrust(tokenSource?)` (stored token first, the token source only when it is missing or refused), `requestTrustWithToken(token)`, `requestTrustWithCode(code)` -> `{token} | {refused}`, `requestAuthCode({reissue?})`, `ensureTrusted()`.
- `readMagicLinkCode()` / `forgetMagicLinkCode()` (`browser-transport.ts`): read `#conciv_otp=` with `URLSearchParams`, and strip it from the URL only once the engine has answered the exchange (a reload before then keeps the code and retries it).
- `engineHeaders(apiBase)` / `engineWebSocket(apiBase)` (`browser-transport.ts`): the `Authorization: Bearer` header for raw browser fetches, and a `WebSocket` constructor whose sockets send `{type: SOCKET_TRUST_FRAME, token}` on open and mark the connection untrusted on a `REVOKED_SOCKET_CLOSE_CODE` (1008) close.
- `LOGIN_CODE_PATTERN`, `ExchangeResultSchema`, `SOCKET_TRUST_FRAME`, `SocketTrustFrameSchema`, `ENGINE_TOKEN_MAX_LENGTH` (`contract.ts`).
- `isRetryableRpcFailure(alive, error)` (`browser-transport.ts`): true only when the connection is alive, the error is not an `ORPCError` and not an `AbortError`.
- `RPC_UNBOUND_MESSAGE` = `'conciv core not connected yet'` (`browser-transport.ts`, re-exported from `client.ts`); types `RpcClientContext`, `SessionAccessor`, `BrowserRpcConnection`, `ReachabilityListener`.

## Invariants

- `sessions.rename` requires `title` of 1-120 characters and declares `NOT_FOUND`; `sessions.model` declares `NOT_FOUND` and `UNKNOWN_MODEL`; `sessions.effort` takes a `ReasoningEffortSchema` value or null and declares `NOT_FOUND` and `UNSUPPORTED_EFFORT`; `sessions.switchHarness` takes a non-empty `harnessId` and an optional non-empty `model` and declares `NOT_FOUND`, `UNKNOWN_HARNESS`, `UNKNOWN_MODEL` and `SESSION_RUNNING`; `meta.models` and `meta.commands` take a `sessionId`; `SessionMetaSchema` carries a nullable `effort` (`contract.ts`, `rows.ts`).
- `chat.stop` requires `runIds` to be non-empty strings; `chat.permissionDecision`, `chat.uiReply` and `page.reply` declare `UNKNOWN_REQUEST` (`contract.ts`).
- Every `server.*` procedure declares `NO_BUNDLER`; `server.reload` and `server.restart` also declare `APPROVAL_DENIED`; `restart.force` defaults to `false` (`contract.ts`).
- `registry.call` requires a non-empty `name` and `input` as `record<string, unknown>`, and declares the `registryCallErrors` set (`contract.ts`).
- `editor.open` requires `line` to be an integer >= 1 when present (`EditorOpenInputSchema`).
- `ToolCommandSignatureSchema` applies `.catch(undefined)` to `icon` and `label` (invalid values become `undefined`); `errors` defaults to `[]` (`contract.ts`).
- `StreamChunkSchema` checks only that a chunk is a non-null object, then casts it to `ChatEvent` (`contract.ts`).
- `DraftRowSchema` requires `selectionStart` / `selectionEnd` to be integers >= 0 and maps null `attachments` to `[]`; `drafts.set` input omits `updatedAt` (`rows.ts`, `contract.ts`). `MarkerRowSchema.afterMessageId` is the id of the message the marker follows, `null` before the first message (`rows.ts`).
- `BrowserRpcClient.bind` throws `conciv rpc client already bound` when a base is set and `conciv rpc cannot bind an empty api base` for `''` (`client.ts`).
- `dynamicBrowserRpcLink.call` throws `RPC_UNBOUND_MESSAGE` when the current api base is null (`browser-transport.ts`).
- Connections are keyed by `normalizeApiBase` (origin + pathname without trailing slash, resolved against `location.href` when present), so equivalent bases share one connection (`browser-transport.ts`).
- Retry policy: `CONNECTION_LOSS_RETRIES` = 12 with `CONNECTION_LOSS_RETRY_DELAY_MS` = 250, gated by `isRetryableRpcFailure`; a closed connection is not alive and stops retrying (`browser-transport.ts`).
- The token is stored under `conciv:engine-token:<normalized api base>` in localStorage; a 401 or a 1008 close for the token currently held forgets it and sets `untrusted`, a refusal for an older token is ignored (`browser-transport.ts`).

## Side Effects

- Holds the page's one engine connection in `globalThis.__concivBrowserRpcConnectionV4`, shared across bundle copies (`connectionEntry` in `browser-transport.ts`); asking for a different normalized api base closes the held connection and replaces it, and closing a base clears the slot only when it holds that base. Trust status and reachability votes are events on each connection's `EventTarget`; `subscribeRpcReachability` creates the connection for its base when none exists yet, and a vote only dispatches while its connection is still open.
- HTTP calls to `${apiBase}/rpc` through `RPCLink` (`makeRpcClient` in `client.ts`; `fetchLink` in `browser-transport.ts`).
- Adds the `CONCIV_SESSION_HEADER` header (from `@conciv/protocol/chat-types`) when the context has `concivSessionId` (`requestHeaders`, `browser-transport.ts`).
- Sends the fetch with `keepalive: true` when the call context has `keepalive: true` (`fetchLink`, `browser-transport.ts`), so a call made while the page unloads still reaches the engine.
- `makeRpcClient` is the node client and sends `CONCIV_VERSION_HEADER` (`x-conciv-version`, from `@conciv/protocol/rpc-types`) set to the contract package.json version; browser code uses the browser link (`makeBrowserRpcClient` / `dynamicBrowserRpcLink`), which carries no custom header an engine from before release versions would refuse in its CORS preflight.
- Reads `location.href` when defined (`normalizeApiBase`).
- Calls reachability listeners with `false` when a retry is scheduled and `true` when a retry succeeds (`retryPlugin`, `browser-transport.ts`).
- `rebind` / `close` remove the previous base's shared connection from the global registry, which affects every client sharing that base (`closeBrowserRpcConnection`).

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/contract` from the repo root (turbo builds the package and its dependencies first)
