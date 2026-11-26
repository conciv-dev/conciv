# oRPC 2 Upgrade: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every `@orpc/*` package from 1.16.1 to one exact 2.x release in a single PR. Every engine, widget, CLI, plugin and simulation path keeps working, and no feature or test journey is lost.

**Architecture:** This is a mechanical port. The contract, router, links and fake engine keep their shape. One thing is rebuilt: the widget's engine socket in `@conciv/client`. It moves from v1's `StandardRPCLink` with a custom `StandardLinkClient` to v2's `StandardLink` with a custom `StandardLinkTransport`. Its peer moves from `@orpc/standard-server-peer` to `@standard-server/peer`. Our Effect socket, trust frame, idle watchdog and reachability machine stay.

**Tech Stack:** oRPC 2.0.0-beta.53 (`@orpc/client`, `contract`, `server`, `tanstack-query`), `@standard-server/peer` 0.16.0, Effect 4, zod 4, vitest node and browser mode, Playwright root `e2e/`.

**Sources:** All facts below were read on 2026-11-27 from the sources listed here.

- The oRPC repository at `github.com/middleapi/orpc` (the old name `unnoq/orpc` redirects). The `main` branch is the v2 line; commit `fa04b52cf` of 2026-11-26 has `packages/server/package.json` version `2.0.0-beta.53`. The `1.x` branch is the v1 line.
- The v1 to v2 migration guide: `apps/content/docs/migrations/from-v1.mdx` in that repo, called MIG below. It is published at `https://orpc.dev/docs/migrations/from-v1`.
- The npm registry.
- The published tarballs for 1.16.1 and 2.0.0-beta.53.

The v2 source paths quoted below (`client/src/...`, `server/src/...`, `contract/src/...`) are relative to `packages/` in that repo. `P/` is the `@standard-server/peer@0.16.0` tarball `dist/`.

## 1. What oRPC 2 is, and is it OK to adopt now

### Versions (npm registry, `npm view <pkg> dist-tags` and `time`)

| Package                      | v1 latest | v2 latest       | v2 dist-tag | v2 published         |
| ---------------------------- | --------- | --------------- | ----------- | -------------------- |
| `@orpc/server`               | 1.16.6    | 2.0.0-beta.53   | `beta`      | 2026-11-23T11:51:58Z |
| `@orpc/client`               | 1.16.6    | 2.0.0-beta.53   | `beta`      | 2026-11-23           |
| `@orpc/contract`             | 1.16.6    | 2.0.0-beta.53   | `beta`      | 2026-11-23           |
| `@orpc/tanstack-query`       | 1.16.6    | 2.0.0-beta.53   | `beta`      | 2026-11-23           |
| `@orpc/standard-server-peer` | 1.16.6    | **no 2.x**      | none        | n/a                  |
| `@standard-server/peer`      | n/a       | 0.16.0 (latest) | `latest`    | 2026-11-09           |
| `@orpc/publisher` (new)      | 1.14.11   | 2.0.0-beta.53   | `beta`      | 2026-11-23           |

Notes on the table:

- `latest` is still 1.16.6 (2026-11-25). v2 ships only under `beta`. The `next` tag is a commit snapshot, `0.0.0-next.47dbd93`.
- In v2 the peer, codec and fetch/node layers moved out to `@standard-server/*` packages. `@orpc/server@2.0.0-beta.53` depends on `@standard-server/{core,node,peer,fetch,fastify,aws-lambda} ~0.16.0`, and `@orpc/client` depends on `@standard-server/{core,peer,fetch}` (`npm view @orpc/server@beta dependencies`).
- v2 siblings no longer peer-pin each other. They depend on each other at the exact version (`"@orpc/client": "2.0.0-beta.53"`), so the catalog must still move all of them together.
- `@orpc/tanstack-query@2` adds a dependency on `@orpc/openapi`, which pulls in `@orpc/server`, `@orpc/json-schema` and `@openapi-spec/*`. The import is type-only (`tanstack-query/src/contract-utils.ts:4`), so it adds install weight but no bundle bytes.
- No v2 package has an `engines` field. The docs give Node 18 as the minimum and 22+ as recommended. No TypeScript minimum is documented; the oRPC repo itself builds with `typescript ^7.0.2` (`package.json:74`). Zod is not a peer dependency. `@orpc/contract` depends on `@standard-schema/spec ^1.1.0`. Our pins all meet these: Node >= 26, TS `^7.0.2`, zod `^4.6.7`, spec 1.1.0, query-core `^5.107.1` against a peer of `>=5.105.0`.

### Stability

- **Cadence:**
  - 2.0.0-beta.1 shipped on 2026-06-21, and beta.53 on 2026-11-23: 53 betas in five months.
  - From October on, a beta landed every 3 to 8 days (`npm view @orpc/server time`).
  - v1 is still maintained in parallel: 1.16.2 to 1.16.6 shipped between 2026-11-06 and 2026-11-25.
- **Breaking changes are still landing.** Ten of the 13 v2 betas from 2026-10-01 to 2026-11-23 have a "Breaking Changes" section in their GitHub release (`gh api repos/middleapi/orpc/releases`). Examples that hit code like ours:
  - beta.52 renamed the WebSocket reconnect options to `maxAttempts`, `maxTotalAttempts` and `totalAttempts`.
  - beta.53 made `ORPCError.code` and `data` readonly.
  - beta.53 made WebSocket and MessagePort links reject with `ConnectionClosedError` when the connection closes, instead of `AbortError` (release `v2.0.0-beta.53`, PRs #2523, #2525 and #2533).
- **The maintainer's own words** (beta.53 release notes): "oRPC v2 is close to stable". Feedback before stable is gathered in discussion #2446, "oRPC v2 migration feedback: what hurt, and what should change before stable?", opened 2026-11-07.
  - The repository has no milestones (`gh api repos/middleapi/orpc/milestones` returns none).
  - No stable date is published.
- **Open issues:**
  - 41 are open. None carries the `bug` label (`gh issue list -R middleapi/orpc --state open`).
  - The open ones marked v2 are enhancements: #2547 (`COMMON_ERROR_STATUS_MAP` naming), #1689 and #2500 (OpenAPI query styles).
- **Closed bugs since 2026-10-01:** 12. One touches our v1 code: #2548, "ClientRetryPlugin (1.x) waits the whole retry delay after the call's signal aborts". It is fixed in 1.16.6 (PR #2549, release `v1.16.6`). We use `ClientRetryPlugin` with a custom `retryDelay` in `packages/client/src/connection/engine-connection.ts:448`.

### Verdict (answer to "not fully stable but still ok?")

Adopting now is acceptable, as one PR pinned to the exact `2.0.0-beta.53`. The cost of adopting now is that the code must be touched again on the way to 2.0.0.

- **Nothing blocks the port.**
  - Every API we use exists in v2 or has a named replacement (section 3).
  - No third-party package in our lockfile depends on `@orpc/*` (section 4).
- **The risk is churn, not breakage.**
  - Betas still rename options and change error types, so expect one or two follow-up edits before 2.0.0.
  - The wire format changed: a v1 client cannot talk to a v2 server (MIG:48-55). The engine, widget, CLI and packed apps therefore all move in one release. A widget bundle cached in a host page, or an older globally installed CLI, against a new engine fails until it is upgraded. That is acceptable pre-release (v0, no external users) but must go in the changeset.
- **Lower-risk alternative:** bump to 1.16.6 now and port to 2.x when 2.0.0 ships. That is a one-line catalog change that also fixes #2548. Section 7 says when to fall back to it.

## 2. Our use of oRPC today

The catalog is in `pnpm-workspace.yaml:31-35`: `@orpc/client`, `contract`, `server`, `standard-server-peer` and `tanstack-query`, all at 1.16.1. The comment at `pnpm-workspace.yaml:13-16` explains the lockstep.

The oxlint ban that keeps `@orpc/tanstack-query` out of every package except `@conciv/client` stays (`.oxlintrc.json:144,281,323`).

### Packages that depend on `@orpc/*` (`git grep '"@orpc/' -- '**/package.json'`)

| Package                                      | `@orpc/*` deps                                                                                             |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@conciv/protocol`                           | client, contract                                                                                           |
| `@conciv/client`                             | client, contract, standard-server-peer, tanstack-query                                                     |
| `@conciv/backend-defaults`                   | client, server                                                                                             |
| `@conciv/serve`                              | server                                                                                                     |
| `@conciv/simulation`                         | client, contract, server                                                                                   |
| `@internal/test-utils`                       | client, contract, server                                                                                   |
| `@conciv/cli`                                | client                                                                                                     |
| `@internal/frontend-defaults`                | client                                                                                                     |
| `@internal/frontend-app-api`                 | client                                                                                                     |
| `@conciv/plugin-terminal`                    | client                                                                                                     |
| `@conciv/unplugin`                           | server                                                                                                     |
| `e2e/vite-react-packed`, `e2e/nextjs/packed` | resolved from the registry through `fixture-lock.yaml` (`@orpc/*@1.16.1` at lines 924-969 of the vite one) |

No plugin builds an `oc` contract of its own. Plugin rpc rides the core contract's `plugin.call` and `plugin.experimental*`. `@conciv/protocol` re-exports no oRPC symbol.

### Import sites by API

- **Contract (`oc`, `eventIterator`, `Schema`):**
  - `packages/protocol/src/contract.ts:1-2`. `eventIterator` is used at :35, 446, 499, 509, 564, 608 and 627. Five error entries carry `status`, at :262, 267, 295, 303 and 419.
  - `packages/protocol/src/simulation.ts:1`, with `eventIterator` at :464 and 471.
  - No chain calls `.input` or `.output` twice. None uses `.route`, `.meta`, `.$meta` or `.$route`.
- **Engine router and middleware:**
  - `backend-defaults/src/engine/api/rpc/mount.ts:3,108,134,142,199,234`: `implement(contract).$context`, the `Implementer` type, `os.use`, and `plainOs.$context().middleware`.
  - `router.ts:3,49,159,302,384,390`: `ORPCError`, `withEventMeta`, `Router<typeof contract.x, Ctx>`, and router-level `os.use(makeHubAdmission)`.
  - `jobs.ts:1`, `tabs.ts:1`, `sessions.ts:5` and `engine-router.ts:1`: `Router<...>` types.
  - `backend-defaults/src/ai/delivery.ts:10,90`: `withEventMeta` with `{id: offset}`.
- **HTTP and WebSocket handlers:** `packages/serve/src/rpc.ts:2-7`.
  - The fetch `RPCHandler` sits at `/rpc`.
  - The WebSocket `RPCHandler` on `/rpc-ws` handles each frame with `handler.message(peer, frame, {context})`.
  - Its `rootInterceptors` and `clientInterceptors` add the revoke signal, version, tracing, the trust gate (`UNAUTHORIZED`), and the slow-consumer guard (`SLOW_CONSUMER`).
- **The browser's engine socket:** `packages/client/src/connection/engine-connection.ts:1-21,154,172-174,304-315,348-361,439-527`. It is built from:
  - our Effect socket;
  - `experimental_ClientPeerWithoutCodec` with `encodeRequestMessage`, `decodeResponseMessage` and `MessageType` from `@orpc/standard-server-peer`;
  - `StandardRPCLink` with a custom `StandardLinkClient`;
  - `ClientRetryPlugin` with `retryDelay` and `shouldRetry`;
  - an ordered `StandardLinkPlugin` (`eventStreamEnd`);
  - `mapEventIterator`, and `getContractRouter`, `isContractProcedure` and `getEventIteratorSchemaDetails` to detect streaming calls;
  - the 401 check `error.status === 401`.
- **Fetch link:** `packages/client/src/connection/rpc-client.ts:1-4,23-46,49`: `RPCLink` with a full `url` and a `Request`-taking `fetch`, `ResponseValidationPlugin`, and `ValidationError`.
- **TanStack Query utils:**
  - `packages/client/src/client.ts:39,44,96`: `createTanstackQueryUtils`, `RouterUtils`, and `safe` with `.isDefined`.
  - `experimental_liveOptions` is called at `frontend-defaults/src/composer/hub-connections.ts:18`, `composer/session-selector.tsx:157` and `settings/create-preferences.ts:30`, and named in `packages/client/skills/client/solid-query/SKILL.md:46,53` and `frontend-defaults/src/composer/README.md:31`.
- **Fake engine** (`@internal/test-utils`):
  - `fakes/fake-connection.ts:1,35,78,90,99`: `call`, `isProcedure`, `error.status === 401`, and an in-memory `ClientLink`.
  - `fakes/fake-router.ts:1-2,41,52`: `implement`, `isContractProcedure`, `AnyContractRouter`, and `new ORPCError(code, {defined: true, status, ...})`.
  - `fakes/fake-types.ts:1`: `ContractProcedure`, `InferSchemaInput` and `InferSchemaOutput`.
  - `fakes/fake-{chat,plugins,sessions,tabs}.ts`: `ORPCError`.
  - `test-utils.ts:1`: `createORPCClient`.
- **Worker threads (MessagePort):**
  - `backend-defaults/src/ai/quickjs-thread.ts:5-6` and `quickjs-worker.ts:2-4` (code mode).
  - `backend-defaults/src/engine/sessions/search-index-worker.ts:5-6`, which uses `Procedure` with 6 type parameters.
  - `session-search.ts:10-12,90,94,275`, which uses `EventPublisher`.
- **Simulation:**
  - `simulation/src/control-server.ts:1-2,86,91,99`: `RPCHandler` from `@orpc/server/ws`, `Router<Record<never,never>, Ctx>`, and `handler.upgrade`.
  - `driver.ts:1-3`, `frontend.ts:1-3,53` and `test/utils/websocket.ts:1-2`: `new RPCLink({websocket})`.
  - `backend/simulated-{provider,ui}.ts:1`: `implement`.
- **Errors only (`ORPCError`, `.code`, unchanged in v2):**
  - `cli/src/engine-read.ts`, `cli/src/hub.ts` and `cli/src/request.ts`. `request.ts:36,87,109-111` also reads `status` through `RemoteSchema` and `safe().isDefined`.
  - `frontend-app-api/src/persistence/settings-storage.ts`.
  - `frontend-defaults/src/data/app-data.ts` and `routes/panel.$sessionId.tsx`.
  - `plugins/terminal/src/terminal-driver.ts`, and `terminal-transport.ts`, which uses `getEventMeta`.
  - `unplugin/src/core/vite-bridge.ts`.
  - `frontend-defaults/src/runtime/plugin/host-apis.tsx:20`: `createORPCClient`.
  - `frontend-defaults/src/pane/trigger-sources.ts:15`: `InferClientOutputs`.
- **Status reads outside `@orpc` imports:** `packages/engine-kit/src/outside.ts:9`, where `AnsweredErrorSchema` requires `status: z.number()`.

### Browser to engine traffic: every path is oRPC over the `/rpc-ws` socket

1. Chat streams: `chat.send`, `chat.join` and `chat.events` are event iterators with `withEventMeta` ids for resume (`router.ts:49-60`, `delivery.ts:90`).
2. The push feed: `event.subscribe` is an event iterator. The client turns its end into a drop (`eventStreamEnd`).
3. Live queries: `sessions.changes`, `settings.changes` and `meta.hubAgents` through `experimental_liveOptions`.
4. Plugin calls from the widget to the engine: `plugin.call`, `plugin.list`, `plugin.experimental` and `plugin.experimentalChunk`, through `host-apis.tsx` `createORPCClient({call})` over the connection link.
5. Engine to page: the host Effect Request over the same socket (ruling of 2026-11-18). `tabs.open` is a held call, and page commands are keyed by tab id.
6. The terminal pty: `experimental.persistentPty.*` streams with `getEventMeta` (`terminal-transport.ts:36`).
7. Auth: `auth.trust`, `auth.exchange` and `auth.requestCode` on the same link, plus the plain JSON `SOCKET_TRUST_FRAME`, which `serve/rpc.ts:253` intercepts before oRPC sees the frame.

Over fetch `/rpc`: `makeRpcClient` (the CLI, `engine-kit` outside agents, and the hub CLI). Over MessagePort: the code-mode QuickJS thread and the search-index worker. Over the simulation sockets: the driver and the engine's `ui` endpoint.

## 3. Breaking changes in 2.x that touch us

Every row was checked against the v2 source or a tarball d.ts. "Alias" means v2 keeps the old name as a deprecated alias. The plan still renames these, so no deprecated name stays in the tree.

| #   | Change (source)                                                                                                                                                                                                                                                                                                                                   | Our files                                                                                                                                                                                                  | Exact rewrite                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `@orpc/standard-server-peer` has no 2.x release. The peer is `@standard-server/peer` 0.16.0. Messages are objects `{id, kind, ...}`, not tuples (`P/index.d.ts:8`, `P/types.d.ts:95-108,191-195`)                                                                                                                                                 | `client/package.json:48`, `engine-connection.ts:14-21,154,304-315,348-361`                                                                                                                                 | Swap the dependency. `experimental_ClientPeerWithoutCodec` becomes `ClientPeer`. `encodeRequestMessage(id,type,payload)` becomes `await encodePeerMessage(message)`, which returns `string \| Uint8Array<ArrayBuffer>`, so `frame()` goes. `MessageType.ABORT_SIGNAL` becomes `message.kind === 'cancel'`, and `MessageType.REQUEST` becomes `message.kind === 'request'`. `decodeResponseMessage(raw)` becomes the synchronous `decodePeerMessage(raw)`, which returns `{matched, message}`, then `if (matched && isServerPeerSendMessage(message)) peer.message(message)`. `peer.close({reason})` becomes `peer.close(reason)`. The per-id `peer.close({id, reason})` at :314 goes: v2's `ClientPeer` closes or aborts the call itself when `send` throws (`P/client.js:42-86`).                                                                 |
| 2   | `StandardRPCLink` and `StandardLinkClient` were removed. The link is `new StandardLink(codec, transport, options)` (`client/src/adapters/standard/link.ts:55-68`, `transport.ts:11-20`, `rpc-link-codec.ts:24-34,91-98`)                                                                                                                          | `engine-connection.ts:2,476-508`                                                                                                                                                                           | `new StandardLink(new RPCLinkCodec({headers: sessionHeaders}), socketTransport, {interceptors, plugins})`, where `socketTransport: StandardLinkTransport<RpcClientContext> = {send: async (request, _path, options) => {...; return peer.request(request)}}`. v2's `peer.request` already returns a `StandardLazyResponse`, so the `body: async () => response.body` wrapper goes. The codec `url` defaults to `/` and must start with `/`, so `SOCKET_LINK_URL = 'http://orpc'` goes.                                                                                                                                                                                                                                                                                                                                                             |
| 3   | The link plugin contract changed: `order` is gone, plugins sort by `name`, `before` and `after`, and `init` must **return** the options (`standard/plugin.ts:12-34,40-52`, `shared/src/plugin.ts:9-21`)                                                                                                                                           | `engine-connection.ts:462-474`                                                                                                                                                                             | `eventStreamEnd = {name: 'conciv-event-stream-end', init: (options) => ({...options, interceptors: [...(options.interceptors ?? []), endedInterceptor]})}`. Mutating the options and returning nothing breaks the link.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 4   | The retry plugin now puts its interceptor **first** (outermost), where v1 appended it (`client/src/plugins/retry.ts:264`; v1 `plugins/index.mjs:275`)                                                                                                                                                                                             | `engine-connection.ts:489-507`                                                                                                                                                                             | Our 401-mapping interceptor would now run inside retry, on every attempt, and for streams `streamRetriable` would dispatch `unauthorized` twice. Move the mapping into a named plugin `{name: 'conciv-unauthorized', after: ['~retry'], init}` that puts its interceptor **before** the existing ones, so it stays outside retry as in v1. Check the retry plugin's `name` in `retry.ts` before writing `after`.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 5   | `ClientRetryPlugin`, `ClientRetryPluginContext` and `ClientRetryPluginAttemptOptions` become `RetryLinkPlugin`, `RetryLinkPluginContext` and `RetryLinkPluginAttemptOptions`. The first two keep aliases; the third has none (`plugins/index.ts`, `retry.ts:14-84,125-140`). Callback types are fixed to `RetryLinkPluginContext`                 | `engine-connection.ts:3-7,55,439-453,519-524`                                                                                                                                                              | Rename all three. `RpcClientContext = RetryLinkPluginContext & {concivSessionId?: string}`. Type the callbacks with `RetryLinkPluginAttemptOptions<RetryLinkPluginContext>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 6   | `mapEventIterator` was removed. The replacement is `wrapAsyncIteratorPreservingEventMeta(iterator, {mapError})` (`client/src/async-iterator-object.ts:5-49`)                                                                                                                                                                                      | `engine-connection.ts:1,496-499`                                                                                                                                                                           | `wrapAsyncIteratorPreservingEventMeta(output, {mapError: (error) => refused(error, current().token)})`. `refused` must return `ThrowableError`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 7   | `ORPCError.status` was removed from server and client errors, and from `.errors({...})` maps. HTTP status is now the handler's `errorStatusMap`, and codes missing from it fall back to **400** instead of 500 (MIG:387-423; `client/src/error.ts:51-125`; `server/src/adapters/standard/rpc-handler-codec.ts:52,64,113`)                         | `contract.ts:262,267,295,303,419`; `engine-connection.ts:84,172-174`; `fake-connection.ts:35`; `fake-router.ts:52`; `cli/src/request.ts:36,109-111`; `engine-kit/src/outside.ts:9`; `serve/rpc.ts:150,229` | Delete the 5 `status` fields. In `serve/rpc.ts`, pass `errorStatusMap: {...COMMON_ERROR_STATUS_MAP, PLUGIN_RPC_INTERNAL: 500, PLUGIN_NOT_FOUND: 404, PLUGIN_CHUNK_NOT_FOUND: 404, PTY_NOT_FOUND: 404, HANDLER_ERROR: 500, TOOL_FAILED: 500, SLOW_CONSUMER: 500}` to both handlers. Read the final code list from `contract.ts` and `git grep "new ORPCError('"`; a 4xx code stays at the 400 default. The unauthorized check becomes `error instanceof ORPCError && error.code === 'UNAUTHORIZED'`, which also covers the mid-stream revoke at `serve/rpc.ts:244`. `cli/request.ts` `RemoteSchema` and `engine-kit/outside.ts` `AnsweredErrorSchema` drop `status` and judge by `code`: "rejected by server" means any `ORPCError` code that is not a transport failure. `@orpc/server` exports `COMMON_ERROR_STATUS_MAP` (`server/src/index.ts`). |
| 8   | `defined` can no longer be passed to `ORPCError`. v2 marks an error as defined when its code is in the procedure's map and its data validates; status is no longer matched (MIG:425-449, `contract/src/error-utils.ts:21-73`)                                                                                                                     | `fake-router.ts:52`                                                                                                                                                                                        | Rethrow the error unchanged: v2 defines it. A plain `ORPCError('PTY_NOT_FOUND')` was undefined in v1 for lack of a 404 and is now defined. That changes nothing for us, because every client check reads `.code`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 9   | The `safe()` tuple changed: index 2 is `definedError \| null`, a fourth element `isSuccess` was added, and `.isDefined` is gone (MIG:451-481, `client/src/utils.ts:25-40`)                                                                                                                                                                        | `client/src/client.ts:96`, `cli/src/request.ts:87`                                                                                                                                                         | `answer.definedError?.code === 'UNKNOWN_REQUEST'`; `if (result.definedError) throw rpcFailure(result.definedError)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 10  | `Router<TContract, TCtx>` now takes only the context. The contract-typed router is `ContractedRouter<TContract, TCtx>` (`server/src/router.ts:14-22`). Not in MIG                                                                                                                                                                                 | `router.ts:49,384`, `jobs.ts`, `tabs.ts`, `sessions.ts:295`, `engine-router.ts:5`; `simulation/src/control-server.ts:86`                                                                                   | `ContractedRouter<typeof contract.x, RpcContext>` from `@orpc/server`; `Router<Context>` in control-server.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 11  | `Implementer` takes 2 type parameters, and `Procedure` drops its 6th (meta) parameter (`server/src/implementer.ts:11`, `procedure.ts:98-104`)                                                                                                                                                                                                     | `mount.ts:108`, `search-index-worker.ts:58-65`                                                                                                                                                             | `Implementer<typeof contract, RpcContext>`; `Procedure<Ctx, Ctx, In, Out, Errors>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 12  | `isProcedure`, `isContractProcedure`, `getEventIteratorSchemaDetails` and `ContractProcedure` were removed. `outputSchema` became the array `outputSchemas`, because `.output` stacks (`server/src/procedure.ts:128`, `contract/src/procedure.ts:21-58`, `schema-built-in.ts:84-110`, MIG:224-237)                                                | `fake-connection.ts:1,78`; `fake-router.ts:2,41`; `fake-types.ts:1,13,18,25`; `engine-connection.ts:8-13,149-152`                                                                                          | `x instanceof Procedure`; `node instanceof ProcedureContract`; `getAsyncIteratorObjectSchemasDetails(procedure['~orpc'].outputSchemas) !== undefined`; `ProcedureContract<I, O, E>` (3 parameters). Check the `undefined` versus empty result of the details function in `schema-built-in.ts` before writing the test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 13  | Contract names, all with aliases: `eventIterator` becomes `asyncIteratorObject`, `ContractRouterClient` becomes `RouterContractClient`, `AnyContractRouter` becomes `RouterContract`, `getContractRouter` becomes `getRouterContract`, `ResponseValidationPlugin` becomes `ResponseValidationLinkPlugin` (MIG:1004-1018, `contract/src/index.ts`) | `contract.ts`, `simulation.ts`, `engine-connection.ts`, `rpc-client.ts:3-4,15`, `plugin-info.ts`, `driver.ts`, `frontend.ts`, `fake-router.ts`                                                             | Rename to the v2 names. The `ChatEventStream` interface at `contract.ts:31-35` keeps its type.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 14  | A response-validation failure is now `ORPCError('INTERNAL_SERVER_ERROR', {cause: ValidationError})`, not a bare `ValidationError` (`contract/src/plugins/response-validation.ts:56-75`; v1 `plugins/index.mjs:64`)                                                                                                                                | `rpc-client.ts:49` `engineTooOld`                                                                                                                                                                          | `(error instanceof ORPCError && error.cause instanceof ValidationError) \|\| (error instanceof ORPCError && error.code === 'NOT_FOUND')`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 15  | `RPCLink` (fetch) splits `url` into `origin` plus a path `url`, and a custom `fetch` receives a URL string, not a `Request`. v2 sets `init.signal` itself, and `redirect: 'manual'` is no longer set (MIG:803-870, `client/src/adapters/fetch/transport.ts:37-108`)                                                                               | `rpc-client.ts:23-46`                                                                                                                                                                                      | `const target = new URL(`${apiBase}/rpc`)`, set the token on `target.searchParams`, then `new RPCLink({origin: target.origin, url: `${target.pathname}${target.search}`, headers, interceptors, plugins})`. Delete `abortableFetch` and its export, after `git grep abortableFetch` shows its users.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 16  | `@orpc/server/ws` was removed. One `@orpc/server/websocket` adapter remains. `handler.message()` resolves to `{matched}`, `handler.close()` returns a Promise, and `MinimalWebsocket` is now `WebSocketLike = {send(data: string \| Uint8Array<ArrayBuffer>)}` (MIG:705-729, `server/src/adapters/websocket/handler.ts:19-21,63-147`)             | `serve/rpc.ts:4,199-204,259-271`; `simulation/src/control-server.ts:2,91,99`                                                                                                                               | Import `RPCHandler` from `@orpc/server/websocket` in control-server; `upgrade(socket, {context})` keeps its call. `peerSocket` returns `{send: (data) => held.socket?.send(data)}` and drops `addEventListener`. Check that hono's `WSContext.send` accepts a `Uint8Array<ArrayBuffer>`; not checked, the worktree has no `node_modules`. A malformed frame now resolves `{matched: false}` instead of rejecting, so `rpc.ts:259-267` closes with 1011 and logs on `!matched` as well as on rejection. That keeps today's behaviour.                                                                                                                                                                                                                                                                                                               |
| 17  | Handler options: `rootInterceptors` becomes `routingInterceptors`, whose options are `{context, prefix, request: StandardLazyRequest}`. Handler `clientInterceptors` keeps its name. `StandardRPCHandlerOptions` was removed (MIG:575-593, `server/src/adapters/standard/handler.ts:67-105`, `rpc-handler-codec.ts:20-52`)                        | `serve/rpc.ts:7,100-139`                                                                                                                                                                                   | Type it as `StandardHandlerOptions<RpcContext> & RPCHandlerCodecOptions<RpcContext>` from `@orpc/server/standard`, and rename `rootInterceptors` to `routingInterceptors`. The `request.signal` and `request.headers` reads keep working on `StandardLazyRequest`; check that before relying on it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 18  | The WebSocket `RPCLink` takes a `connect` factory and has built-in `reconnect` (MIG:896-917, `client/src/adapters/websocket/transport.ts:110-336`)                                                                                                                                                                                                | `simulation/src/driver.ts`, `frontend.ts:53`, `simulation/test/utils/websocket.ts`                                                                                                                         | `new RPCLink({connect: () => socket})`, with no `reconnect` (a dropped simulation socket is a test failure).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 19  | `EventPublisher` was removed. The replacement is `MemoryPublisher` in the new `@orpc/publisher` package, and `publish` is async (MIG:519-541, `publisher/src/adapters/memory.ts:36`, `publisher.ts:63,103-127`)                                                                                                                                   | `backend-defaults/src/engine/sessions/session-search.ts:12,90,94,275`                                                                                                                                      | Use an Effect `PubSub`, already a dependency of `backend-defaults`, and expose `changes(signal)` as an async iterable through `Stream.fromPubSub` and `Stream.toAsyncIterable`. That avoids a new package (ladder rung: already installed). The other option is `@orpc/publisher@2.0.0-beta.53` `MemoryPublisher` with `void publisher.publish(...)`. **Decision for the maintainer: (A) Effect PubSub (recommended) or (B) `@orpc/publisher`.**                                                                                                                                                                                                                                                                                                                                                                                                   |
| 20  | tanstack-query: `experimental_liveOptions` becomes `liveOptions`, with **no alias**. `experimental_streamedOptions` becomes `streamedOptions`, the `path` option becomes `prefix`, and `experimental_defaults` becomes `scoped` (MIG:1190-1229, `tanstack-query/src/procedure-utils.ts:618`)                                                      | `hub-connections.ts:18`, `session-selector.tsx:157`, `create-preferences.ts:30`, `client/skills/client/solid-query/SKILL.md:46,53`, `frontend-defaults/src/composer/README.md:31`                          | `.liveOptions(...)`. We use no `path`, `streamed` or `defaults` option.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 21  | `ClientLink.call` takes `path: string[]` (v1: `readonly string[]`) (`client/src/types.ts:42-44`)                                                                                                                                                                                                                                                  | `fake-connection.ts:99-101`, `engine-connection.ts:149,511`, `rpc-client.ts:59`                                                                                                                            | Adjust the parameter types where tsc asks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 22  | Wire format: the RPC serializer and the error body changed, so v1 and v2 cannot talk to each other (MIG:48-55)                                                                                                                                                                                                                                    | every link and handler                                                                                                                                                                                     | One PR, one changeset that says it: an older widget bundle or CLI needs the new release.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 23  | The handler accepts `POST, PUT, PATCH, DELETE` by default, so GET is rejected (MIG:545-570, `rpc-matcher.ts:22,45,79`)                                                                                                                                                                                                                            | none                                                                                                                                                                                                       | None of our links sends GET: the codec defaults to POST, and the peer sends `method: undefined`, which the server reads as POST (`P/client.js:54`, `P/server.js:57`). No change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 24  | Middleware dedupe was removed (MIG:359-383)                                                                                                                                                                                                                                                                                                       | `router.ts:390` (router level), `mount.ts:133-146` (procedure level)                                                                                                                                       | No change. They are different middleware, and v1 dedupe never fired. Router middleware still runs before input validation (`server/src/router-utils.ts:228-240`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 25  | `EventMeta.id` must be a string (`@standard-server/core` `event-stream/types.d.ts`)                                                                                                                                                                                                                                                               | `delivery.ts:90` (`{id: offset}`), `router.ts:302` (`String(cursor)`)                                                                                                                                      | Check that `offset` is typed `string`; wrap it in `String()` if tsc asks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 26  | Error and connection types (beta.53, #2533): WebSocket and MessagePort links reject with `ConnectionClosedError` on close, and timeouts reject with `TimeoutError`                                                                                                                                                                                | `quickjs-worker.ts`, `session-search.ts`, simulation links                                                                                                                                                 | `git grep AbortError` in those files. None of them branches on `AbortError` from a link today; confirm this while porting.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

Unchanged and verified in v2: `oc`, `Schema`, `implement`, `.$context`, `os.use`, `.middleware((opts, input) => ...)`, `ORPCError(code, {message, data, cause})`, `errors.X()`, `withEventMeta`, `getEventMeta`, `call`, `createORPCClient`, `AsyncIteratorClass`, `InferClientOutputs`, `InferSchemaInput/Output`, `toORPCError`, `createTanstackQueryUtils`, `RouterUtils`, and the MessagePort `RPCHandler` and `RPCLink({port})`, with the same subpaths.

## 4. Third-party dependencies that pin oRPC 1.x

None. Every lockfile snapshot that mentions `@orpc/` belongs to an `@orpc/*` package (`awk` over the `snapshots:` section of `pnpm-lock.yaml`). The only importers are the 11 workspace packages listed in section 2. TanStack AI and the other libraries have no oRPC dependency. `@orpc/interop`, `@orpc/shared` and `@orpc/standard-server-*` are transitive deps of `@orpc/*` 1.16.1 and leave with it.

## 5. Tasks

**How the work runs:**

- One lane, one worktree, branch `feat/orpc-2` off `origin/main`.
- The agent writes code and runs only typecheck, build and lint. It commits locally and never pushes.
- The orchestrator reads the full diff against this table, runs the tests (section 6), and pushes.
- The tasks touch disjoint files, so Tasks 3 to 8 may be split over two writers after Task 1, one writer per file set.

**Global constraints:**

- No comments in TS/JS. Functions, not classes (our code subclasses nothing from oRPC). No `Of` suffix. oxfmt style.
- Every deprecated v1 alias is renamed to its v2 name in the same PR, and nothing is left on a deprecated name. Proof: `git grep -nE "eventIterator\b|ContractRouterClient|AnyContractRouter|getContractRouter|ClientRetryPlugin|ResponseValidationPlugin\b|experimental_liveOptions"` returns nothing.
- No new test unless a path has no journey. Each task names the existing journeys that prove it.

### Task 1: Catalog bump and dependency swap

**Files:** `pnpm-workspace.yaml:13-16,31-35`, `packages/client/package.json:46-49`, `pnpm-lock.yaml` (regenerated by `pnpm install`, never hand-edited), and `backend-defaults/package.json` only if decision 19B is chosen.

- [ ] Set the catalog to `'@orpc/client': 2.0.0-beta.53`, `'@orpc/contract': 2.0.0-beta.53`, `'@orpc/server': 2.0.0-beta.53` and `'@orpc/tanstack-query': 2.0.0-beta.53`. Remove `'@orpc/standard-server-peer'` and add `'@standard-server/peer': 0.16.0`. Exact versions, no caret.
- [ ] Rewrite the comment at `pnpm-workspace.yaml:13-16` for v2: siblings depend on each other at the exact version, so one catalog version must cover all of them, and `@standard-server/peer` must match the `~0.16.0` that `@orpc/client` uses.
- [ ] In `packages/client/package.json`, replace `@orpc/standard-server-peer` with `@standard-server/peer: catalog:`.
- [ ] Run `pnpm install` in the worktree. `minimumReleaseAge: 2880` (`pnpm-workspace.yaml:281`) is met, since beta.53 is from 2026-11-23. A newer beta would need two days first.
- [ ] Check: `pnpm why @orpc/client` shows only 2.0.0-beta.53.

### Task 2: Contract (`@conciv/protocol`)

**Files:** `packages/protocol/src/contract.ts`, `packages/protocol/src/simulation.ts`.

- [ ] `eventIterator` becomes `asyncIteratorObject` (rows 13), at contract.ts:1,35,446,499,509,564,608,627 and simulation.ts:1,464,471.
- [ ] Delete `status` at contract.ts:262,267,295,303,419 (row 7). Task 4 records the codes in `errorStatusMap`.
- [ ] **Tests:** `protocol/test/unit/simulation.unit.test.ts`. Every engine and widget journey also consumes the contract.

### Task 3: Engine router types and the session-search publisher (`backend-defaults`)

**Files:** `src/engine/api/rpc/{mount,router,jobs,tabs,sessions,engine-router}.ts`, `src/engine/sessions/{search-index-worker,session-search}.ts`, and `src/ai/delivery.ts` if row 25 requires it.

- [ ] `Router<typeof contract.x, RpcContext>` becomes `ContractedRouter<...>` (row 10). `Implementer<typeof contract, RpcContext>` (row 11). `Procedure` with 5 type parameters (row 11).
- [ ] Replace `EventPublisher` as decided in row 19.
- [ ] Code mode and the search worker over MessagePort need no API change (rows 26 and "Unchanged").
- [ ] **Tests:**
  - `backend-defaults/test/it/router.it.test.ts` (outside agents, tool registry, terminal access);
  - `sessions.it.test.ts` ("a past CLI session is found by what was said in it", which covers the search worker and the `changes` stream);
  - `code-mode.it.test.ts` (the QuickJS MessagePort link);
  - `session.it.test.ts` (sessions and events);
  - `event-subscribe.it.test.ts` (the heartbeat on the event feed);
  - `rpc.it.test.ts` (plugin rpc from an outside client).

### Task 4: HTTP and WebSocket handlers (`@conciv/serve`)

**Files:** `packages/serve/src/rpc.ts`.

- [ ] Type the options as `StandardHandlerOptions<RpcContext> & RPCHandlerCodecOptions<RpcContext>`, and rename `rootInterceptors` to `routingInterceptors` (row 17).
- [ ] Add `errorStatusMap` to `rpcHandlerOptions` with the 5xx and 404 codes (row 7), so both handlers share it.
- [ ] `peerSocket` returns a `WebSocketLike`. Handle `handler.message`'s `{matched}`: on `!matched`, log and close with 1011, the same as a rejection (row 16). Await `handler.close(peer)` or `void` it.
- [ ] **Tests:**
  - `backend-defaults/test/it/untrusted-socket.it.test.ts` (the trust gate `UNAUTHORIZED` before and after login);
  - `http.it.test.ts` (health, an untokened route refused, foreign origin);
  - `engine-login.it.test.ts` (login code);
  - `client.it.test.ts` ("the stream connects, comes back after the engine restarts, reopens when it goes silent", which covers revoke, reconnect and idle).
  - Status codes have no journey of their own. Fold one assertion into `http.it.test.ts` "health answers, an untokened route is refused...": an unknown plugin over fetch `/rpc` answers 404 (`PLUGIN_NOT_FOUND`). That pins `errorStatusMap`.

### Task 5: The browser engine socket (`@conciv/client`)

**Files:** `packages/client/src/connection/engine-connection.ts`, `rpc-client.ts`, `src/client.ts`, `src/plugin/plugin-info.ts`, and `skills/client/solid-query/SKILL.md`.

- [ ] Peer (row 1): `ClientPeer` from `@standard-server/peer`. The send callback takes a `ClientPeerSendMessage`, encodes it with `encodePeerMessage`, waits for `settled` unless `kind === 'cancel'`, and writes. Delete `frame()`.
- [ ] Delivery (row 1): synchronous `decodePeerMessage`. `!matched` keeps the existing log and `peer.close(error)`.
- [ ] Link (rows 2-6): replace `StandardRPCLink` and `socketClient` with `StandardLink(new RPCLinkCodec({headers: sessionHeaders}), socketTransport, {...})`. `eventStreamEnd` becomes a named plugin whose `init` returns the options. The 401 mapping moves into the `conciv-unauthorized` plugin, ordered outside retry (row 4). `RetryLinkPlugin` with the same `retryDelay` and `shouldRetry`. `mapEventIterator` becomes `wrapAsyncIteratorPreservingEventMeta`.
- [ ] `unauthorized()` checks `code === 'UNAUTHORIZED'`; delete `UNAUTHORIZED_STATUS` (row 7). `isStreamingCall` uses `getRouterContract`, `instanceof ProcedureContract` and `getAsyncIteratorObjectSchemasDetails(...outputSchemas)` (row 12).
- [ ] `rpc-client.ts`: the origin and url split, delete `abortableFetch`, `ResponseValidationLinkPlugin`, and the `engineTooOld` cause check (rows 14-15).
- [ ] `client.ts:96`: `definedError` (row 9). `RouterContractClient` everywhere (row 13). Update `SKILL.md:46,53` to `liveOptions`.
- [ ] **Tests:**
  - `backend-defaults/test/it/client.it.test.ts`, the whole journey: connect, engine restart, idle reopen. This is the one test of retry order, stream end as a drop, and reconnect.
  - `client/test/e2e/session.e2e.test.ts`: a refresh racing a send, and a burst of streamed chunks. This covers chat stream delivery and event meta.
  - `backend-defaults/test/it/untrusted-socket.it.test.ts`: the 401 then trust, then calls pass.
  - `client/test/unit/engine-connection-machine.unit.test.ts`: the machine is unchanged and must stay green.
  - `cli/test/it/request.it.test.ts` and `hub.it.test.ts`: `makeRpcClient` over fetch.
  - The auth-refusal path has no node journey that asserts the `unauthorized` signal fires once. Fold one assertion into `client.it.test.ts`: after a token is revoked, the trust status goes `trusted` to `untrusted` exactly once, using the existing `trust.subscribe` listener.

### Task 6: Widget, CLI, terminal, engine-kit and unplugin call sites

**Files:**

- `frontend-defaults/src/composer/hub-connections.ts:18`, `composer/session-selector.tsx:157`, `settings/create-preferences.ts:30`, and `composer/README.md:31`;
- `cli/src/request.ts:36,87,109-111`;
- `engine-kit/src/outside.ts:9`;
- `plugins/terminal/src/*` (no API change; tsc only);
- `unplugin/src/core/vite-bridge.ts` (no change; tsc only).

- [ ] `experimental_liveOptions` becomes `liveOptions` (row 20).
- [ ] `cli/request.ts`: `definedError`, and `RemoteSchema` judges by `code` (rows 7 and 9). `engine-kit/outside.ts`: drop `status` from `AnsweredErrorSchema`.
- [ ] **Tests:**
  - `frontend-defaults/test/e2e/composer.e2e.test.tsx` and `sessions.e2e.test.tsx` (the session picker and its `sessions.changes` live query);
  - `settings.e2e.test.tsx` (`settings.changes`);
  - `cli/test/it/{request,hub,tools,run}.it.test.ts`;
  - `plugins/terminal/test/e2e/terminal.e2e.test.tsx` (pty streams with `getEventMeta`, and a restart);
  - `unplugin/test/unit/vite-bridge.unit.test.ts`;
  - the `engine-kit` outside-agent calls through `backend-defaults/test/it/router.it.test.ts` "outside agents".

### Task 7: Fake engine (`@internal/test-utils`)

**Files:** `packages/test-utils/src/fakes/{fake-connection,fake-router,fake-types}.ts`.

- [ ] `instanceof Procedure`, `instanceof ProcedureContract`, `RouterContract`, and `ProcedureContract<I, O, E>` (row 12).
- [ ] `fake-connection.ts:35`: `code === 'UNAUTHORIZED'`. `fake-router.ts:52`: rethrow the error, with no `defined` or `status` (row 8). `ClientLink` path types (row 21).
- [ ] **Tests:** every `frontend-defaults/test/e2e/*.e2e.test.tsx`, which render on the fake engine, plus the plugin e2e suites that use `renderTestApp` with the fake engine, such as `plugins/terminal/test/e2e/terminal.e2e.test.tsx`. `frontend-defaults/test/unit/rpc-error-message.unit.test.ts` pins error messages.

### Task 8: Simulation (`@conciv/simulation`)

**Files:** `src/control-server.ts`, `src/driver.ts`, `src/frontend.ts`, and `test/utils/websocket.ts`.

- [ ] `@orpc/server/websocket` `RPCHandler` and `Router<Context>` (rows 10 and 16). `new RPCLink({connect: () => socket})` (row 18). `RouterContractClient`.
- [ ] Check that the `ws` package socket satisfies the v2 handler's `upgrade` type (`Pick<WebSocket, 'send' | 'addEventListener' | 'removeEventListener'>`, `server/src/adapters/websocket/handler.ts:123-147`; `apps/content/docs/adapters/websocket.mdx:17-41` shows `ws` used this way).
- [ ] **Tests:**
  - `simulation/test/it/control-server.it.test.ts`, all of it: drivers leaving, the byte bound, the handshake, the ui role, and "the driver on the engine ui endpoint", which covers the drive mode relay to the widget;
  - `simulation/test/unit/*`;
  - every `@conciv/backend-test-utils` `createEngine` test, through the simulation's scripted model.

### Task 9: Changeset and docs

- [ ] Add `.changeset/orpc-2.md`, a patch for `@conciv/client` (fixed group). It says the engine, widget and CLI speak oRPC 2 and must run the same release, and that an older widget bundle or CLI cannot talk to a newer engine.
- [ ] Update the folder READMEs that name moved symbols:
  - `packages/client/README.md`;
  - `backend-defaults/src/engine/api/rpc/README.md`;
  - `backend-defaults/src/engine/sessions/README.md`;
  - `backend-defaults/src/ai/README.md`.
  - Change the purpose and invariants text only, with no export lists.
- [ ] Leave `docs/specs/rpc-over-websocket.md` and `hub-engine-orpc.md` as historical specs. Add one dated line at the top of each that points to this plan.

### Task 10: Packed fixture locks

- [ ] `e2e/vite-react-packed/fixture-lock.yaml` and `e2e/nextjs/packed/fixture-lock.yaml` must be refreshed from CI, never by hand (`e2e/e2e-utils/src/pack.ts:345-354`).
  1. Push.
  2. Let the Packed workflow fail on lock drift.
  3. `gh run download <run-id> -n packed-fixture-locks -D e2e`.
  4. Check that the diff holds only `@orpc/*` and `@standard-server/*` changes, plus the removal of `@orpc/{interop,standard-server*}`.
  5. Commit.

## 6. Verification

The orchestrator runs these. Agents do not.

1. Typecheck and build: `TURBO_CONCURRENCY=70% turbo run typecheck --filter=...@conciv/protocol` (the leading form selects every dependent), and the same with `build`.
2. Node tests, one package at a time:
   - `turbo run test --filter=@conciv/backend-defaults`
   - `--filter=@conciv/client`
   - `--filter=@conciv/simulation`
   - `--filter=@conciv/cli`
   - `--filter=@conciv/protocol`
   - `--filter=@conciv/unplugin`
3. Browser mode (Chromium): `--filter=@internal/frontend-defaults`, `--filter=@conciv/plugin-terminal`, `--filter=@conciv/app` (mount), and each plugin package whose `test/e2e` uses the fake or real engine (`pnpm test:affected` lists them).
4. Root `e2e/`, after `pnpm turbo run build --filter=@conciv/app`:
   - the e2e host app;
   - `vite-react-packed` and `nextjs/packed`, which resolve oRPC from the registry, so they are the only proof that the published `2.0.0-beta.53` tarballs (and not workspace sources) work in a host;
   - one framework app (`vite-react`).
5. Guards:
   - `pnpm exec fallow audit --changed-since main --format json`, with nothing introduced;
   - `pnpm conciv-publish check-changesets --require-coverage --base origin/main`;
   - `check-dependency-loops`;
   - `check-catalog` and `check-typecheck-coverage`;
   - `pnpm --filter @internal/frontend-defaults test:perf` (chat plane).
6. By hand in the real widget (dev server, our own browser, never port 3000):
   - **Chat stream reconnect:** send a long reply, restart the engine mid-stream, and see the reply resume from its last event id with no duplicate chunk. Leave the widget idle past the idle timeout and see it reopen.
   - **Trust:** revoke the browser and see the login card appear once. Log in and see calls flow.
   - **Plugin rpc both ways:** a page plugin tool call from the agent runs in the tab (engine to page), and a plugin panel read goes widget to engine.
   - **Terminal:** open the terminal, type, restart the CLI.
   - **Hub:** `conciv` CLI hub lists the open tabs and runs a tool. An outside agent call that needs permission waits for the card.
   - **Error status:** `curl -i -X POST .../rpc/plugin/call` with an unknown plugin answers 404, and `curl -i -X GET .../rpc/...` answers 405 or 400 (GET now refused; nothing of ours sends GET).

## 7. Risks and fallback

| Risk                                                                                                                         | Watch                                                                           | Fallback                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A later beta renames or breaks again (10 of the last 13 betas did)                                                           | `gh api repos/middleapi/orpc/releases` before any later bump                    | Stay pinned at exactly `2.0.0-beta.53` and bump only to the 2.0.0 stable release, as one follow-up PR. Never take a caret range or the `beta` tag.                                                                                                                                                  |
| beta.53 regresses on one of our paths (for example peer cancel ordering, or `ConnectionClosedError` where we expect a retry) | `client.it.test.ts`, `control-server.it.test.ts`, the packed e2e                | Search `middleapi/orpc` issues first. If the bug is ours to work around, the PR stops: revert the single squash commit, then move the catalog to `1.16.6` (this also fixes #2548), which stays maintained on the `1.x` branch. Wait for 2.0.0 stable, announced in a release marked non-prerelease. |
| Wire break with cached clients (an older widget bundle or a global CLI against a new engine)                                 | Changeset text                                                                  | None needed pre-release. All `@conciv/*` ship in lockstep (`fixed` changesets).                                                                                                                                                                                                                     |
| The retry plugin's new outermost position changes 401 or retry timing                                                        | `client.it.test.ts` plus the one folded assertion (the trust status flips once) | Row 4's named plugin with `after: ['~retry']`. If v2 offers no stable plugin name for retry, wrap `RetryLinkPlugin.init` output ordering in our plugin's `init`. Check before writing.                                                                                                              |
| The 400 fallback changes HTTP statuses that the CLI or hub show                                                              | `http.it.test.ts` folded 404 assertion, `cli/test/it/*`                         | `errorStatusMap` in `serve/rpc.ts` (row 7).                                                                                                                                                                                                                                                         |
| hono `WSContext.send` or the `ws` types do not match `WebSocketLike` or the `upgrade` type                                   | tsc in Tasks 4 and 8                                                            | A typed adapter function in `serve/rpc.ts` or `control-server.ts`, with no cast.                                                                                                                                                                                                                    |

## Open decisions (for the maintainer)

1. Adopt `2.0.0-beta.53` now (this plan), or bump to `1.16.6` now and port at 2.0.0 stable (section 1, verdict).
2. Row 19: the session-search change feed, on (A) Effect `PubSub` (recommended; no new package) or (B) `@orpc/publisher` `MemoryPublisher`.
3. Out of scope, named so it is not lost: `@orpc/effect` (Effect handlers and clients, `packages/effect` in the oRPC repo) could later replace our promise bridges in `engine-connection.ts`. It is not part of this PR.
