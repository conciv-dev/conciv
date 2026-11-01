# extension/src

## Overview

Source for the extension contract: defineExtension, defineTool and defineAttachment builders, Solid host-context hooks and mount components, client-side collectors, and a server-side oRPC tool registry that validates and dispatches server tools and forwards client tools to the page. Also RPC mount helpers for Hono (HTTP and WebSocket), an extension RPC client, and an authoring catalog, scaffold and validator.

## Interface

- `defineExtension` / `ExtensionBuilder` / `AnyExtension` / `ExtensionMeta` / `RegisterExtension` (`define-extension.ts`): chainable .client(factory) / .server(factory), parseConfig, useContext
- `defineTool` / `toolDefinition` (`define-tool.ts`): .server(execute), .client(execute?), .render(card)
- `toolError` / `isToolError` / `ToolError` (`define-tool.ts`)
- `ToolMeta`, `ToolDefinition`, `ToolBuilder`, `ToolBinding`, `ClientToolCtx`, `RegisteredTools`, `ToolNameProblem` (`define-tool.ts`)
- `TOOL_NAME_RULE` / `assertToolName` / `FORBIDDEN_TOOL_SEGMENTS` (`define-tool.ts`)
- `defineAttachment` / `AttachmentBuilder` (`define-attachment.ts`): by MIME with .card and .server(expand)
- `imageResult` (`image-result.ts`)
- `collectClientTools` / `collectClientEffects` / `collectToolRenderers` / `collectAttachmentCards` / `captureModeOf` (`collect-client.ts`)
- `getExtensionApi` (`extension-api.ts`)
- `getHostApi` / `HostApiProvider` (`hooks.tsx`, re-exported by `host.ts`): useRpc, useApiBase, useToast, useOpenEditor, useDialog, usePopover, useSessionId, useGrab, useComposerInsert, useComposerAttach, useNewSession, useViewLock, useLeaveView, useSlot, useConnect, useColorScheme
- `HostWiring` / `HostApiContext` / `use` / `useExtensionValue` (`host-context.ts`)
- `MountedExtension` / `MountedSurface` / `MountedView` (`mount-extension.tsx`)
- `ensureEffectsSurface` / `openSource` / `EFFECTS_SURFACE_ATTR` (`client-host.ts`)
- `makeExtRpcClient` (`ext-rpc.ts`): oRPC client at `${apiBase}/rpc/ext/<slug>`
- `subscriptionIterator` (`server-stream.ts`); `pageVerbError` / `isPageVerbError` (`page-errors.ts`)
- `buildCatalog` / `scaffold` / `validateSource` (`catalog.ts`)
- `createToolRegistry` / `ToolRegistry` / `TOOL_TRANSPORT_ERRORS` / `toInlineJsonSchema` (`tool-registry.ts`)
- `walkRegistryProcedures` (`registry-walk.ts`)
- `makeCompositeRpcRouter` / `rpcFetchMiddleware` / `rpcWebsocketRoute` / `RPC_PREFIX` ('/rpc') / `RPC_WS_PATH` ('/rpc-ws') (`rpc-mount.ts`)
- `ExtensionSlot` (`types.ts`): 'header' | 'footer' | 'composer' | 'empty' | 'status' | 'widget' | 'surface' | 'connect'; plus `ServerApi` and the shared contract types

## Invariants

- `parseExtensionConfig` (`define-extension.ts`): schema.parse(raw ?? {}) throws on invalid config; `makeSystemPrompt` gives no prompt when config fails
- `assertToolMeta` (`define-tool.ts`): meta.summary must be non-empty and differ from the tool name
- `assertUnbound` (`define-tool.ts`): binding a tool twice throws
- `assertToolName` (`define-tool.ts`): names must match /^[a-z][a-z0-9_]*$/
- `REGISTRY_TOOL_REQUIREMENTS` (`tool-registry.ts`): registered tools need meta, outputSchema, a binding, and no error codes clashing with TOOL_TRANSPORT_ERRORS
- `assertToolCosmetics` (`tool-registry.ts`): meta.icon must be in TOOL_ICON_KEYS; meta.positional must name an input field
- `toInlineJsonSchema` (`tool-registry.ts`): throws for non-zod schemas, cycles or `$defs`
- `registerTool` (`tool-registry.ts`): duplicate owners, empty or forbidden segments and overwrites throw
- `pageFailure` (`tool-registry.ts`): no-widget, timeout, unknown-verb, invalid-args, handler-error map to NO_PAGE_CLIENT, PAGE_TIMEOUT, UNKNOWN_TOOL, INVALID_ARGS, HANDLER_ERROR
- `catalogEntries` (`tool-registry.ts`): client tools are reachable only while a page is connected
- `makeCompositeRpcRouter` (`rpc-mount.ts`): throws on an extension slug collision
- `use` (`host-context.ts`): a hook used without its host wiring throws
- `collect-client.ts`: first registration wins by tool name or MIME; `captureModeOf` defaults mutating tools to 'after'
- `validateSource` (`catalog.ts`): error without `export default defineExtension(`

## Side Effects

- `ensureEffectsSurface` (`client-host.ts`): appends a fixed div with an open shadow root and a style element to document.body
- `openSource` (`client-host.ts`): calls rpc.editor.open / rpc.editor.openFromFrames
- `makeExtRpcClient` (`ext-rpc.ts`): HTTP RPC with the session header; reads global `location`
- `collectClientEffects` (`collect-client.ts`): console.warn on duplicate effect names
- `rpcWebsocketRoute` (`rpc-mount.ts`): closes the socket with 1011 on a rejected frame
- `forwardToolToPage` (`tool-registry.ts`): forwards client-tool calls to the connected page

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/extension && pnpm typecheck && pnpm lint`
