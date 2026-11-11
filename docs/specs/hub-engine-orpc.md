# Hub to engine over oRPC: typed calls, no text parsing

Status: approved (Omri, 2026-11-11). Owner: web-c0. Lands in PR #829 (page action queue), on top of `feat/page-action-queue`.

## Goal

The hub (`conciv mcp serve`, `packages/cli/src/hub.ts`) talks to each engine through the engine's oRPC contract
(`packages/contract`), with zod on both ends, the same way `conciv tools` already does (`packages/cli/src/request.ts:69`,
`makeRpcClient`). Nothing the hub reads from an engine is parsed out of text. The hub's outward face to Claude Code,
Codex and the rest stays MCP and does not change.

## Why

- No spec or commit ever chose MCP over oRPC for this leg. The hub spec's standing rule "Calls go through conciv's own
  `/api/mcp`. No tool is rewritten." (`docs/specs/conciv-mcp-hub.md:30`, 2026-11-03) made the hub a pass-through, and
  `createMCPClient` came with it (#765, 2a0b55e7d).
- As a result the hub reads engine replies by scanning MCP text parts and `JSON.parse`-ing them (`textsOf`,
  `parsedText`, `queueHandleIn`, `queueWaitIn`), and polls a queue by running a TypeScript string through
  `execute_typescript`. A script that returns `{queueId, actions}` looks like a queue; any reply format change silently
  breaks the MCP task push (seen live: one queue call came back plain, no push).
- Tab ownership is a plain Hono route outside the contract (`GET /api/tabs`, `packages/core/src/api/tabs.ts`), fetched
  and zod-parsed by hand in two places (`packages/cli/src/engine-origin.ts:82`, `packages/core/src/api/outside-tabs.ts:41`).
  AGENTS.md: RPC procedures declare `oc.input(...)` in `contract.ts`.

## Decided (Omri, 2026-11-11)

- Every hub-to-engine call moves to oRPC, `/api/tabs` included.
- The hub's MCP face stays: `execute_typescript` and `discover_tools` with the optional `tab` input (revision 5 and
  revision 7 of the hub spec stand).
- The link is `@orpc/client/fetch` `RPCLink` through the existing `makeRpcClient` (`packages/contract/src/client.ts`)
  against the engine's `/rpc/*` HTTP handler. Every adapter in the installed oRPC 1.16.1 was weighed:

  | Adapter                                    | Verdict                                                                                                                                                                                                                                                                                 |
  | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `createRouterClient` (in-process)          | No: hub and engine are separate processes.                                                                                                                                                                                                                                              |
  | `@orpc/client/message-port`                | No: no shared MessagePort between a harness-started hub and a vite-started engine.                                                                                                                                                                                                      |
  | `@orpc/client/standard` (custom link base) | No: nothing to build; the fetch link covers it.                                                                                                                                                                                                                                         |
  | `@orpc/client/websocket` (`/rpc-ws`)       | No: its gate is browser trust (`rpcSocketGate`), a dropped socket on engine restart needs reconnect and resend rules (resending a page action is what we avoid), and no push is needed since Claude Code polls `tasks/get`. Localhost HTTP keep-alive costs ~1 ms, so it buys no speed. |
  | `@orpc/client/fetch` (`/rpc/*`)            | Yes: stateless, per-call headers and abort signal (#826), token already in `apiBase`, already used by `conciv tools`.                                                                                                                                                                   |

  `@orpc/openapi-client` is not installed and targets REST-shaped OpenAPI routes, not the RPC contract.

## Contract additions (`packages/contract/src/contract.ts`)

All inputs and outputs zod. Session routing and hub admission come from the headers the hub already sends
(`CONCIV_ORIGIN_HEADER: 'hub'`, `CONCIV_CLIENT_HEADER`, `CONCIV_SESSION_HEADER`) through the existing
`makeHubAdmission` middleware (`packages/core/src/api/rpc/mount.ts:89`). Procedures that act on a session take
`sessionId` in their input, so `admitHubCaller` runs consent exactly as it does today.

- `tabs.list` → `TabsSchema` (today's `GET /api/tabs` listing, moved as is: project, root, branch, page per tab).
- `tabs.get({sessionId})` → `TabOpenSchema` (`{open, instructions}`; today's `?session=` answer, feeds the hub greeting).
- `code.describe` → `{execute: string, discover: string}`: the descriptions the hub serves for its two tools, built from
  the same `CodeRunner` the engine's `/api/mcp` uses (replaces `client.tools()` in `startupDescriptions`).
- `code.execute({sessionId, typescriptCode})` → `CodeExecuteResultSchema`:
  `{ok: true, result: unknown, logs: string[], queued: QueueHandle[], finished: PageQueueResult[]}` or
  `{ok: false, error: {message, code?}, logs: string[], queued: QueueHandle[], finished: PageQueueResult[]}`.
  - `queued`: every queue the script started that is still playing when the script returns (an
    `external_page_queue_async` call, or an `external_page_queue` call that outlasted its bound), from the engine's
    own queue store, never from the script's return value. A sync queue that finished in-call is not listed, and
    no queue is in both `queued` and `finished`.
  - `finished`: the finished, undelivered queues for this caller (today's next-reply path, `mcp.ts`
    `withFinishedQueues`), marked delivered by this call.
  - Same transcript mirroring, call trace and result cap as `/api/mcp` `runExecute`.
- `code.discover({sessionId, toolNames})` → the typed signatures `runDiscover` returns today.
- `page.queue.wait({sessionId, queueId, waitMs})` → `PageQueueResultSchema | PageQueueProgressSchema`
  (discriminated on `status`). The queue store's internal `wait` (no agent tool calls it); a returned result is marked delivered.

`/api/mcp` stays for direct MCP clients (the Claude connect bridge, `packages/harness-init/src/claude`). It and
`code.execute` call one shared engine function for running code, discovering, delivering finished queues and mirroring,
so the two cannot drift. No logic is duplicated between them.

## Hub (`packages/cli/src/hub.ts`)

- One `makeRpcClient(row.apiBase, ...)` per engine, headers per call (oRPC passes them per request), replacing the
  per-tab `createMCPClient` cache (`hub.ts:594` comment's reason goes away).
- `execute_typescript` → `code.execute`. The hub turns the typed result into MCP `content` for its caller (result JSON
  text part, logs, finished-queue notices as leading text parts, greeting on first call per tab) — formatting only, no
  parsing.
- MCP task: the hub answers as a task when the client negotiated the tasks extension and `queued` is non-empty. One task
  per call; `taskId` is the hub's own id mapping to the call's `queued` list.
- `tasks/get` → `page.queue.wait({waitMs: 0})` per queued id; `completed` when all are final, with the typed results
  formatted as MCP content. A transport failure keeps the task and reports `working` (it is read-only; retrying is
  safe). An engine that answers NO_QUEUE restarted and lost the queue: the task ends `failed` with a `statusMessage`
  naming the lost queue and saying its actions may have partly run.
- `discover_tools` → `code.discover`. Descriptions → `code.describe`.
- Tab ownership → `tabs.get` on each healthy engine (the dead-engine rules of #829 stand: process alive, root exists,
  answers). `external_tabs` across engines (`packages/core/src/api/outside-tabs.ts`) → `tabs.list` per engine.
- Deleted: `textsOf`, `parsedText`, `queueHandleIn`, `queueWaitIn`, `QueueHandleSchema`, `QueueWaitSchema`,
  `ContentReplySchema`, the TypeScript-string poll, the `/api/tabs` Hono route and both hand fetches of it.
- Kept: `withTaskName`. It works around `@tanstack/ai-mcp`'s stdio bridge dropping `taskId` from the `Mcp-Name`
  header on the hub's outward side; unrelated to the engine leg. A `ponytail:` line names the upstream bug and says to
  delete it when ai-mcp fixes it; the implementer files the upstream issue and links it in the PR.

## Version skew

An installed hub can meet an older or newer engine. A missing procedure or an output that fails the contract is
reported once per engine as `engine too old; upgrade its @conciv packages` (the existing `TOO_OLD` text), and that engine
is skipped. `x-conciv-version` is already sent by `makeRpcClient`.

## Not in this change

- No new MCP tools on the hub's outward face.
- The browser's oRPC transport (`heldBrowserRpcLink`) is untouched.
- Per-tool typed outputs for `registry.call` (`z.unknown()` today).

## Tests (existing files only, no mocks)

- `packages/cli/test/cli.test.ts`, describe "hub over oRPC":
  - a tasks-capable client queuing through `execute_typescript` gets a task every time, in both call orders seen live
    (discover first; snapshot first then a failed queue then a valid one);
  - a script that returns `{queueId: 'x', actions: 1}` without queuing does not become a task;
  - `tasks/get` reports `working` then `completed` with every outcome; a poll against a stopped engine keeps the task
    `working`;
  - `tasks/get` ends `failed`, naming the lost queue, once the engine holding the tab restarted without it;
  - a sync `page_queue` that finished in-call, and an async queue that finished before the script returned, get a plain
    reply (the finished notice exactly once), never a task;
  - a client without tasks gets the plain reply, and the finished result leads its next reply exactly once;
  - an engine without the new procedures is listed as too old and skipped; a healthy engine still answers.
- `packages/core/test/core-api.it.test.ts`: `code.execute` and `/api/mcp` `execute_typescript` give the same result for
  the same script (shared path); `queued` lists queues the script started; `tabs.list` / `tabs.get` match the old route's
  answers.

## Acceptance (Fable runs live)

- Claude Code CLI through the hub on the tanstack-start example: three queues in a row from a fresh hub, each pushed back
  as a task, with the call orders that failed before.
- `claude -p`: result on the next reply and through the wait tool.
- `external_tabs({})` with a stale engine row present lists the live tabs.

## Changeset

`@conciv/cli`, `@conciv/core`, `@conciv/contract`: patch. "The hub talks to engines over the typed oRPC contract."
