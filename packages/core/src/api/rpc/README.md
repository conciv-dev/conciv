# core/src/api/rpc

## Overview

oRPC router that implements the `@conciv/contract` procedures for sessions, chat, drafts, markers, navigation, registry, captures, page, server, editor and meta. `mount.ts` defines the base `os` builder and a session-scoped middleware that resolves the caller's session from a header.

## Interface

- `makeRpcRouter(deps)` (`router.ts`): builds the full router
- RPC `sessions.list`, `.create`, `.resolve`, `.open`, `.restore`, `.rename`, `.delete`, `.model`, `.effort`, `.compact`, `.switchHarness` (`sessions.ts`, `sessionsRouter`)
- RPC `chat.events` (streaming), `chat.hydrate`, `chat.stop`, `chat.permissionDecision`, `chat.uiReply` (`chat.ts`, `chatRouter`)
- RPC `drafts.get`, `drafts.set`, `markers.list`, `navigation.get`, `navigation.set`, `captures.list` (`router.ts`)
- RPC `registry.catalog`, `registry.call` (`router.ts`)
- RPC `page.symbolicate`, `page.changes`, `page.clearChanges`, `page.queries` (streaming), `page.reply` (`router.ts`)
- RPC `server.config`, `.resolve`, `.graph`, `.transform`, `.urls`, `.reload`, `.restart` (`router.ts`): each calls the matching `BUILTIN_SERVER_TOOLS` entry
- RPC `editor.open`, `editor.openFromFrames` (`router.ts`)
- RPC `meta.models` and `meta.commands` (per session: the session's harness), `meta.harnesses` (the available set, each harness with its models and default model, and the default harness), `meta.tools`, `meta.engine` (`router.ts`)
- `PAGE_ERROR_NAME` (`router.ts`): PageErrorCode to NO_PAGE_CLIENT, PAGE_TIMEOUT, UNKNOWN_TOOL, INVALID_ARGS, HANDLER_ERROR
- `os`, `makeSessionOs`, `callerScope`, `RpcDeps`, `ChatContext`, `SessionOs`, `CompositeRpcRouter` (`mount.ts`)

## Invariants

- `headerSessionId` / `callerScope` (`mount.ts`): a malformed session header throws BAD_REQUEST; a missing one on a session-scoped procedure throws BAD_REQUEST too, so a 401 only ever means the login gate refused
- `registry.call` (`router.ts`): UNKNOWN_TOOL when the session has no such tool; page errors map through `PAGE_ERROR_NAME`
- `refuseUnapproved` (`router.ts`): skipped for widget-origin callers; tools with `approval: 'ask'` go through `plane.admitCall` and throw APPROVAL_DENIED on refusal (registry.call, server.reload, server.restart)
- `callTool` (`router.ts`): throws when a tool has no outputSchema and parses output with it; `NO_BUNDLER` maps to the NO_BUNDLER error
- `page.reply`, `chat.permissionDecision`, `chat.uiReply` (`router.ts`, `chat.ts`): UNKNOWN_REQUEST when nothing is pending
- `sessions.rename` (`sessions.ts`): NOT_FOUND without a row; `sessions.model` / `sessions.effort` create the row first (`ensureRow`, as a turn does), so a session that has not run a turn can switch; `model` throws UNKNOWN_MODEL for a missing or disabled model and resets the session effort to null when the new model does not list it; `sessions.effort` throws UNSUPPORTED_EFFORT unless the session's model (row model, else the harness default, else the first listed) lists the effort, and null always clears it
- `cleanTitle` (`sessions.ts`): strips control characters, collapses whitespace, truncates to 120 characters
- `sessions.create` (`sessions.ts`): ids are `conciv_<uuid>` validated with `SessionId.parse`; the row takes the boot (default) harness
- `sessions.switchHarness` (`sessions.ts`): NOT_FOUND without a row, UNKNOWN_HARNESS outside the available set, a no-op for the current harness (an optional `model` is ignored then), SESSION_RUNNING while a run is active, UNKNOWN_MODEL when `model` is not an enabled model of the target harness; otherwise one transaction sets the harness and the given model (else null), clears the native id and effort, and drops the transcript anchor
- `harnessMenuEntryOf` (`sessions.ts`): a harness whose model list throws is logged and listed with no models, `defaultModel` from the adapter (else null) and `modelsFailed: true`; the others still answer
- `ChatContext.harnessFor` (`mount.ts`): the session row's harness when it is available, else the default harness

## Side Effects

- `drafts.set` (`router.ts`): upserts into the `drafts` table
- `sessions.*` (`sessions.ts`): writes `sessions` and `markers`; `delete` tombstones the row and deletes drafts, plane state, captures and page changes
- `sessions.list` (`sessions.ts`): reads the transcript history of every available harness with `transcriptHistory`; a harness whose listing throws is logged and contributes nothing. It never reads the search index; once the first list has answered it calls `search.listed()`, which starts the background index build.
- `sessions.search` (`sessions.ts`): `{term, includeHidden?, cursor?, limit}`, the same pipeline and output as `sessions.list`; native sessions come from the in-memory Orama index (`sessions/session-search.ts`) and conciv-only rows match on `title LIKE`; the search answers from the index at once and queues one background refresh
- `sessions.changes` (`sessions.ts`): streams the search index's `indexed` events (`search.changes(signal)`)
- `server.reload` / `server.restart` / `editor.open` (`router.ts`): reload or restart the dev server, or open an editor

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/core` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
