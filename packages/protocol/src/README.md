# protocol/src

## Overview

Defines the oRPC `contract` router between the engine and its clients (auth, sessions, settings, drafts, markers,
chat, registry, code, meta, skill, agent, fs, plugin, experimental, event) and the zod row schemas
those procedures use.

- `contract.ts`: the router. `event.subscribe` is opencode's `event.subscribe`: an eventIterator of
  `EventEnvelopeSchema`, the engine's one event stream; its envelope is not a typed union, the precise union is the
  SDK's type.
- `rows.ts`: the session, draft and marker row schemas.
- `source-location.ts`: the one declaration of the source-location types.
- `code-reply.ts`: the one formatter from a code execution result to MCP content, used by the engine's MCP endpoint (`packages/backend-defaults/src/engine/api/mcp.ts`) and the CLI hub (`packages/cli/src/hub.ts`).
- `schema/`: the event, session, message, permission, tool and plugin schemas ported from opencode.
- `execute-schemas.ts`: the `execute_typescript` tool's input and output schemas.
- `simulation.ts`: the drive contract (`uiContract`) the widget serves in drive mode.
- `protocol.ts`: the `.` entry, re-exports `rows.ts`, `source-location.ts`, `contract.ts` and `code-reply.ts`.

## Invariants

- `sessions.rename` requires `title` of 1-120 characters and declares `NOT_FOUND`; `sessions.model` declares `NOT_FOUND` and `UNKNOWN_MODEL`; `sessions.effort` takes a `ReasoningEffortSchema` value or null and declares `NOT_FOUND` and `UNSUPPORTED_EFFORT`; `sessions.switchHarness` takes a non-empty `harnessId` and an optional non-empty `model` and declares `NOT_FOUND`, `UNKNOWN_HARNESS`, `UNKNOWN_MODEL` and `SESSION_RUNNING`; `SessionMetaSchema` carries a nullable `effort` and `lastRunAt: number | null`, the start of the session's newest run (null until it has run) (`contract.ts`, `rows.ts`).
- `chat.stop` requires each of `runIds` to be a non-empty string; `chat.permissionDecision` and `chat.uiReply` declare `UNKNOWN_REQUEST` (`contract.ts`).
- `registry.call` requires a non-empty `name` and `input` as `record<string, unknown>`, and declares the `registryCallErrors` set (`contract.ts`).
- `ToolCommandSignatureSchema.errors` defaults to `[]` (`contract.ts`).
- `StreamChunkSchema` checks only that a chunk is a non-null object, then casts it to `ChatEvent` (`contract.ts`).
- `DraftRowSchema` requires `selectionStart` / `selectionEnd` to be integers >= 0 and maps null `attachments` to `[]`; `drafts.set` takes the whole row, `updatedAt` included, which the engine stores as sent (`rows.ts`, `contract.ts`). `MarkerRowSchema.afterMessageId` is the id of the message the marker follows, `null` before the first message (`rows.ts`).
- `code-reply.ts`: every text is capped at `RESULT_CAP_CHARS` (50000) characters to a `conciv:truncated` envelope keeping the first 4000.

## Side Effects

- None: schemas and pure formatters.

## Verification

- `pnpm typecheck` in `packages/protocol`, and `pnpm lint` at the repo root
