# types/src

## Overview

Zod schemas and TypeScript types for the conciv wire protocol: chat sessions and content, AG-UI custom chat events, terminal control messages, bundler config and module-graph schemas, and harness types. A few runtime helpers: a CustomEvent event bus, path and port helpers, and a payload budget. No RPC method names are defined here.

## Interface

- One file per concern, one `package.json` subpath per file: chat (`chat-*.ts`), harness contracts (`harness-types.ts`), rpc paths and headers (`rpc-types.ts`, `RPC_WS_PATH` is `'/rpc-ws'`), engine trust (`engine-trust.ts`), the CustomEvent event bus (`event-bus.ts`), config (`config-types.ts`), terminal control (`terminal-types.ts`), UI input and markers (`ui-types.ts`), ports and the state dir (`connect-ports.ts`, `state-types.ts`).

## Invariants

- `SessionId` (`chat-types.ts`): /^ses_[A-Za-z0-9_-]{1,128}$/ (validator only; ids are made by `@conciv/protocol/schema/session-id`); `HarnessSessionId` /^[A-Za-z0-9_-]{1,128}$/
- `ChatContentPartSchema` (`chat-types.ts`): image and document payloads must be non-empty valid base64 within the base64 length of MAX_ATTACHMENT_RAW_BYTES
- `PermissionDecisionSchema` (`chat-types.ts`) carries opencode's reply: `once`, `always` or `reject`
- `defineChatEvent` (`chat-event-types.ts`): create() throws on invalid input; parse() returns null on mismatch
- `isRunPhaseTerminal` (`chat-event-types.ts`): completed, failed and aborted are terminal
- `TtyClientControlSchema` (`terminal-types.ts`): cols and rows 2..500; inject text 1..4096 chars
- `aguiSnapshotFor` (`ui-types.ts`): throws unless the chunk is a MESSAGES_SNAPSHOT
- `createEventBusClient` (`event-bus.ts`): queues events until the connect handshake succeeds; retries every 300ms up to 5 times, then 'failed'

## Side Effects

- `createEventBus` / `createEventBusClient` (`event-bus.ts`): the caller passes the `EventTarget` (`target`); the browser passes `window`
- `createEventBus` / `createEventBusClient` (`event-bus.ts`): add DOM listeners, dispatch CustomEvents, start retry timers

## Verification

- Typecheck and lint: `cd packages/types && pnpm typecheck`, then `pnpm lint` at the repo root
