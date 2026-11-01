# core/src/api/rpc

## Overview

oRPC router that implements the `@conciv/contract` procedures for sessions, chat, drafts, markers, navigation, registry, captures, page, server, editor and meta. `mount.ts` defines the base `os` builder and a session-scoped middleware that resolves the caller's session from a header.

## Interface

- `makeRpcRouter(deps)` (`router.ts`): builds the full router
- RPC `sessions.list`, `.create`, `.resolve`, `.open`, `.restore`, `.rename`, `.delete`, `.model`, `.compact` (`sessions.ts`, `sessionsRouter`)
- RPC `chat.events` (streaming), `chat.hydrate`, `chat.stop`, `chat.permissionDecision`, `chat.uiReply` (`chat.ts`, `chatRouter`)
- RPC `drafts.get`, `drafts.set`, `markers.list`, `navigation.get`, `navigation.set`, `captures.list` (`router.ts`)
- RPC `registry.catalog`, `registry.call` (`router.ts`)
- RPC `page.symbolicate`, `page.changes`, `page.clearChanges`, `page.queries` (streaming), `page.reply` (`router.ts`)
- RPC `server.config`, `.resolve`, `.graph`, `.transform`, `.urls`, `.reload`, `.restart` (`router.ts`): each calls the matching `BUILTIN_SERVER_TOOLS` entry
- RPC `editor.open`, `editor.openFromFrames` (`router.ts`)
- RPC `meta.models`, `meta.commands`, `meta.tools`, `meta.engine` (`router.ts`)
- `PAGE_ERROR_NAME` (`router.ts`): PageErrorCode to NO_PAGE_CLIENT, PAGE_TIMEOUT, UNKNOWN_TOOL, INVALID_ARGS, HANDLER_ERROR
- `os`, `makeSessionOs`, `callerScope`, `RpcDeps`, `ChatContext`, `SessionOs`, `CompositeRpcRouter` (`mount.ts`)

## Invariants

- `headerSessionId` / `callerScope` (`mount.ts`): a malformed session header throws BAD_REQUEST; a missing one on a session-scoped procedure throws UNAUTHORIZED
- `registry.call` (`router.ts`): UNKNOWN_TOOL when the session has no such tool; page errors map through `PAGE_ERROR_NAME`
- `refuseUnapproved` (`router.ts`): skipped for widget-origin callers; tools with `approval: 'ask'` go through `plane.admitCall` and throw APPROVAL_DENIED on refusal (registry.call, server.reload, server.restart)
- `callTool` (`router.ts`): throws when a tool has no outputSchema and parses output with it; `NO_BUNDLER` maps to the NO_BUNDLER error
- `page.reply`, `chat.permissionDecision`, `chat.uiReply` (`router.ts`, `chat.ts`): UNKNOWN_REQUEST when nothing is pending
- `sessions.rename` / `sessions.model` (`sessions.ts`): NOT_FOUND without a row; `model` throws UNKNOWN_MODEL for a missing or disabled model
- `cleanTitle` (`sessions.ts`): strips control characters, collapses whitespace, truncates to 120 characters
- `sessions.create` (`sessions.ts`): ids are `conciv_<uuid>` validated with `SessionId.parse`

## Side Effects

- `drafts.set` (`router.ts`): upserts into the `drafts` table
- `sessions.*` (`sessions.ts`): writes `sessions` and `markers`; `delete` tombstones the row and deletes drafts, plane state, captures and page changes
- `sessions.list` (`sessions.ts`): reads harness transcript history
- `server.reload` / `server.restart` / `editor.open` (`router.ts`): reload or restart the dev server, or open an editor

## Verification

- Run: `cd packages/core && pnpm test`
- Typecheck and lint: `cd packages/core && pnpm typecheck && pnpm lint`
