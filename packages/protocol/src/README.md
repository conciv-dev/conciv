# protocol/src

## Overview

Zod schemas and TypeScript types for the conciv wire protocol: chat sessions and content, AG-UI custom chat events, page tool errors and queue handles, element captures, terminal control messages, bundler config and module-graph schemas, and harness types. A few runtime helpers: a CustomEvent event bus, a node sanitizer, path and port helpers, and a payload budget. No RPC method names are defined here.

## Interface

- Paths and headers (`chat-types.ts`): CHAT_HISTORY_PAGE_SIZE 50, CONCIV_SESSION_HEADER 'conciv-session-id', CONCIV_CLAUDE_SESSION_HEADER, MAX_ATTACHMENT_RAW_BYTES, CODE_MODE_TIMEOUT_MS 150000 (the code-mode execute timeout)
- Chat schemas (`chat-types.ts`): ChatContentPartSchema, SessionId, HarnessSessionId, SessionRecordSchema (with a nullable `effort` and nullable `permissions`, a list of PermissionRuleSchema `{action, resource, effect}`, and nullable `metadata`, a record of JSON values, its type `SessionMetadata`), ReasoningEffortSchema (`low` `medium` `high` `xhigh` `max`), HarnessModelSchema (optional `efforts`), PermissionDecisionSchema, NavigationStateSchema, ChatModelsSchema, HarnessMetaSchema, HarnessMenuEntrySchema (a harness with its `models`, `defaultModel` and `modelsFailed`), ChatHarnessesSchema, ChatCommandsSchema, ChatToolsSchema and more, with `isSessionId` / `isHarnessSessionId`
- Chat events (`chat-event-types.ts`): `defineChatEvent`; 'approval-requested', 'conciv.run-lifecycle', 'conciv.session-run', 'conciv.idle-failed' (`{runId}`: the run's `experimental.idle` hook failed and its record now carries the error); `readApprovalAsk`, `isRunPhaseTerminal`; `CONTEXT_OVERFLOW_CODE` (re-exported from `@tanstack/ai`) and `SESSION_DELETED_CODE` (`'session_deleted'`, the `code` of a turn or compaction refused because its session is deleted), each a `RUN_ERROR` / `Error` `code`
- Chat messages (`chat-message-types.ts`): @tanstack/ai aliases, `toModelMessages`, `CompactionMetadataSchema`, `OutsideCallMetadataSchema` (the `{conciv: {origin: 'hub', client, run}}` marker an outside agent's call carries), `isContentParts`, and `imagesIn` / `withoutImages` / `imageBlocks` (find image parts anywhere in a value, replace them with a stub, and turn them into MCP image blocks)
- `chatBusy` (`chat-busy.ts`); `ChatTool` / `defineTool` (`chat-tool-types.ts`)
- Page protocol (`page-types.ts`): PAGE_ERROR_CODES, SymbolicateSchema, OpenSourceResultSchema, `pageFailure`, PageQueueHandleSchema (`{queueId, actions}`), PAGE_QUEUE_ASYNC_TOOL, PAGE_QUEUE_SYNC_MS (`CODE_MODE_TIMEOUT_MS` minus 30 s)
- UI markers (`ui-types.ts`): PLUGIN_OVERLAY_ATTR. Every plugin overlay host (`ctx.overlay`) carries it, so page captures and selection skip all of them.
- Terminal control (`terminal-types.ts`): TtyClientControlSchema (resize, inject), TtyServerControlSchema (exit, busy, error)
- UI input (`ui-types.ts`): UiInputSchema, UiAnswerSchema, `aguiSnapshotFor`
- Usage helpers (`usage-types.ts`)
- Bundler (`bundler-types.ts`): BundlerConfigSchema, ModuleNodeSchema (the bridge itself is `@conciv/plugin/schema/bundler`)
- Harness contracts (`harness-types.ts`): HarnessCapabilities, HarnessInit
- RPC (`rpc-types.ts`): WS_MAX_PAYLOAD_BYTES (16 MiB), WS_RPC_PAYLOAD_BUDGET_BYTES, `CONCIV_VERSION_HEADER` (`'x-conciv-version'`), `RPC_WS_PATH` (`'/rpc-ws'`), RpcContext (with optional `clientVersion` and `socket`, the per-connection `RpcSocketTrust` `{allows(path), admit(token)}` a socket-served call carries, and `replied`, a per-request promise that resolves true once that call's reply has gone out and false when it did not), `rpcHeader`
- Event bus (`event-bus.ts`): `createEventBus`, `createEventBusClient`, DISPATCH_EVENT, CONNECT_EVENT, GLOBAL_EVENT, PANEL_PLUGIN_ID
- Config (`config-types.ts`): ConcivConfig, ConcivSettingsInit, ExtensionRegistry, `defineConfig`
- Tool views (`tool-view-types.ts`): ToolCardProps, ToolCardEntry, ToolUIComponent; TOOL_ICON_KEYS (`tool-icon-types.ts`)
- Ports and state (`connect-ports.ts`, `state-types.ts`): CONNECT_FIRST_PORT 4732 to CONNECT_LAST_PORT 4741, CONCIV_STATE_DIR '.conciv', `concivStateDir`

## Invariants

- `SessionId` (`chat-types.ts`): /^ses_[A-Za-z0-9_-]{1,128}$/ (validator only; ids are made by `@conciv/plugin/schema/session-id`); `HarnessSessionId` /^[A-Za-z0-9_-]{1,128}$/
- `ChatContentPartSchema` (`chat-types.ts`): image and document payloads must be non-empty valid base64 within the base64 length of MAX_ATTACHMENT_RAW_BYTES
- `RenameSessionSchema` (`chat-types.ts`): title at most 120 chars; `PermissionDecisionSchema` carries opencode's reply: `once`, `always` (saves a project rule, offered only for an ask with `save`) or `reject`
- `defineChatEvent` (`chat-event-types.ts`): create() throws on invalid input; parse() returns null on mismatch
- `isRunPhaseTerminal` (`chat-event-types.ts`): completed, failed and aborted are terminal
- `TtyClientControlSchema` (`terminal-types.ts`): cols and rows 2..500; inject text 1..4096 chars
- `SymbolicateSchema` (`page-types.ts`): 1..32 frames
- `aguiSnapshotFor` (`ui-types.ts`): throws unless the chunk is a MESSAGES_SNAPSHOT
- `createEventBusClient` (`event-bus.ts`): queues events until the connect handshake succeeds; retries every 300ms up to 5 times, then 'failed'

## Side Effects

- `sharedEventTarget` (`event-bus.ts`): uses window, or creates globalThis.**CONCIV_EVENT_BUS_TARGET**
- `createEventBus` / `createEventBusClient` (`event-bus.ts`): add DOM listeners, dispatch CustomEvents, start retry timers

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/protocol` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/protocol && pnpm typecheck && pnpm lint`
