# protocol/src

## Overview

Zod schemas and TypeScript types for the conciv wire protocol: chat sessions and content, AG-UI custom chat events, push WebSocket frames, page queries and replies, element captures, terminal control messages, bundler and framework adapter contracts, and harness types. A few runtime helpers: a CustomEvent event bus, a node sanitizer, path and port helpers, and a payload budget. No RPC method names are defined here.

## Interface

- Paths and headers (`chat-types.ts`): CHAT_WS_PATH '/chat-ws', CHAT_SSE_PATH '/chat-sse', CHAT_HISTORY_PAGE_SIZE 50, CONCIV_SESSION_HEADER 'conciv-session-id', CONCIV_CLAUDE_SESSION_HEADER, CHAT_DELIVERY_HEADERS, MAX_ATTACHMENT_RAW_BYTES, CODE_MODE_TIMEOUT_MS 150000 (the code-mode execute timeout)
- Chat schemas (`chat-types.ts`): ChatContentPartSchema, SessionId, HarnessSessionId, SessionRecordSchema (with a nullable `effort` and nullable `permissions`, a list of PermissionRuleSchema `{action, resource, effect}`), ReasoningEffortSchema (`low` `medium` `high` `xhigh` `max`), HarnessModelSchema (optional `efforts`), PermissionDecisionSchema, NavigationStateSchema, ChatModelsSchema, HarnessMetaSchema, HarnessMenuEntrySchema (a harness with its `models`, `defaultModel` and `modelsFailed`), ChatHarnessesSchema, ChatCommandsSchema, ChatToolsSchema, ChatSessionsSchema, RenameSessionSchema and more, with `isSessionId` / `isHarnessSessionId`
- Chat events (`chat-event-types.ts`): `defineChatEvent`; 'approval-requested', 'conciv.run-lifecycle', 'conciv.session-run'; `readApprovalAsk`, `isRunPhaseTerminal`
- Chat messages (`chat-message-types.ts`): @tanstack/ai aliases, `toModelMessages`, `toChatMessages`, `CompactionMetadataSchema`, `OutsideCallMetadataSchema` (the `{conciv: {origin: 'hub', client, run}}` marker an outside agent's call carries), `isContentParts`, and `imagesIn` / `withoutImages` / `imageBlocks` (find image parts anywhere in a value, replace them with a stub, and turn them into MCP image blocks)
- `chatBusy` (`chat-busy.ts`); `ChatTool` / `defineTool` (`chat-tool-types.ts`)
- Push frames (`push-types.ts`): PUSH_WS_PATH '/push-ws', PUSH_SESSION_PARAM 'sessionId', PushFrameSchema (channels ready, page, chat), PageServingFrameSchema (client to server: 'page-serving' with `serving`)
- Page protocol (`page-types.ts`): PageQuerySchema, PageReplySchema, PAGE_ERROR_CODES, SymbolicateSchema, OpenSourceResultSchema, `pageFailure`, PageQueueHandleSchema (`{queueId, actions}`), PAGE_QUEUE_TOOL, PAGE_QUEUE_ASYNC_TOOL, PAGE_QUEUE_SYNC_MS (`CODE_MODE_TIMEOUT_MS` minus 30 s)
- Element captures (`element-capture-types.ts`): ELEMENT_CAPTURE_KINDS, TOOL_CAPTURE_MODES, ElementCaptureSchema, PageCaptureBundleSchema
- Terminal control (`terminal-types.ts`): TtyClientControlSchema (resize, inject), TtyServerControlSchema (exit, busy, error)
- UI input (`ui-types.ts`): UiInputSchema, UiAnswerSchema, `aguiSnapshotFor`
- `EditorOpenSchema` (`editor-types.ts`); usage helpers (`usage-types.ts`)
- Bundler (`bundler-types.ts`): BundlerBridge, `defineBundlerBridge`; framework (`framework-types.ts`): FrameworkAdapter surfaces, `defineFrameworkAdapter`
- Harness contracts (`harness-types.ts`): HarnessCapabilities, HarnessInit, TranscriptHandle, TRANSCRIPT_FAILURES
- RPC (`rpc-types.ts`): WS_MAX_PAYLOAD_BYTES (16 MiB), WS_RPC_PAYLOAD_BUDGET_BYTES, `CONCIV_VERSION_HEADER` (`'x-conciv-version'`), `RPC_WS_PATH` (`'/rpc-ws'`), RpcContext (with optional `clientVersion` and `socket`, the per-connection `RpcSocketTrust` `{allows(path), admit(token)}` a socket-served call carries), `rpcHeader`
- Event bus (`event-bus.ts`): `createEventBus`, `createEventBusClient`, DISPATCH_EVENT, CONNECT_EVENT, GLOBAL_EVENT, PANEL_PLUGIN_ID
- Sanitizer (`element-capture-sanitize.ts`): `neutralizeSubtree`, `isDangerousTag`, `isDroppableAttribute`, `decodeEntities`
- Config (`config-types.ts`): ConcivConfig, ConcivSettingsInit, ExtensionRegistry, `defineConfig`
- Tool views (`tool-view-types.ts`): ToolCardProps, ToolCardEntry, ToolUIComponent; TOOL_ICON_KEYS (`tool-icon-types.ts`)
- Ports and state (`connect-ports.ts`, `state-types.ts`): CONNECT_FIRST_PORT 4732 to CONNECT_LAST_PORT 4741, CONCIV_STATE_DIR '.conciv', `concivStateDir`

## Invariants

- `SessionId` (`chat-types.ts`): /^conciv_[A-Za-z0-9_-]{1,128}$/; `HarnessSessionId` /^[A-Za-z0-9_-]{1,128}$/
- `ChatContentPartSchema` (`chat-types.ts`): image and document payloads must be non-empty valid base64 within the base64 length of MAX_ATTACHMENT_RAW_BYTES
- `RenameSessionSchema` (`chat-types.ts`): title at most 120 chars; `PermissionDecisionSchema` scope defaults to 'once'
- `defineChatEvent` (`chat-event-types.ts`): create() throws on invalid input; parse() returns null on mismatch
- `isRunPhaseTerminal` (`chat-event-types.ts`): completed, failed and aborted are terminal
- `TtyClientControlSchema` (`terminal-types.ts`): cols and rows 2..500; inject text 1..4096 chars
- `SymbolicateSchema` (`page-types.ts`): 1..32 frames
- `defineBundlerBridge` (`bundler-types.ts`): throws without an id
- `aguiSnapshotFor` (`ui-types.ts`): throws unless the chunk is a MESSAGES_SNAPSHOT
- `isDroppableAttribute` / `isDangerousTag` (`element-capture-sanitize.ts`): drop on* handlers, unsafe styles and non-local URLs; reject iframe, object, embed, script, link, style, meta
- `createEventBusClient` (`event-bus.ts`): queues events until the connect handshake succeeds; retries every 300ms up to 5 times, then 'failed'

## Side Effects

- `sharedEventTarget` (`event-bus.ts`): uses window, or creates globalThis.**CONCIV_EVENT_BUS_TARGET**
- `createEventBus` / `createEventBusClient` (`event-bus.ts`): add DOM listeners, dispatch CustomEvents, start retry timers
- `neutralizeSubtree` (`element-capture-sanitize.ts`): mutates the node tree in place

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/protocol` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/protocol && pnpm typecheck && pnpm lint`
