# extension/src

## Overview

Source for the extension contract: defineExtension, defineTool and defineAttachment builders, Solid host-context hooks and mount components, client-side collectors, and a server-side oRPC tool registry that validates and dispatches server tools and forwards client tools to the page. Also RPC mount helpers for Hono (HTTP and WebSocket), an extension RPC client, and an authoring catalog, scaffold and validator.

## Interface

- `defineExtension` / `ExtensionBuilder` / `AnyExtension` / `ExtensionMeta` / `RegisterExtension` (`define-extension.ts`): chainable .client(factory) / .server(factory), parseConfig, useContext; optional `icon` (the extension's settings tab) and `settings`, a `z.object` of user settings (every field `.default()`, titled with `.meta({title, description})`), stored under the extension's name in the `project` and `global` scopes: `parseSettings(raw)`, `readSettings(store)` (`{all, onChange}` over one `SettingsStore`, parsed) and the client hook `useSettings()` (an accessor that follows both stores live and applies `mergeSettings(project, global)` over the defaults)
- `mergeSettings(project, global)` (`merge-settings.ts`): `defu` built with `createDefu`: the project value wins, nested records merge per key, `undefined`/`null`/missing keys fall through to the global value, and an array in the project replaces the global one (never concatenated); the one settings merge, also used by the app's settings page
- `defineTool` / `toolDefinition` (`define-tool.ts`): .server(execute), .client(execute?), .render(card)
- `toolError` / `isToolError` / `ToolError` (`define-tool.ts`)
- `ToolMeta`, `ToolDefinition`, `ToolBuilder`, `ToolBinding`, `ClientToolCtx`, `RegisteredTools`, `ToolNameProblem` (`define-tool.ts`)
- `TOOL_NAME_RULE` / `assertToolName` / `FORBIDDEN_TOOL_SEGMENTS` (`define-tool.ts`)
- `defineAttachment` / `AttachmentBuilder` (`define-attachment.ts`): by MIME with .card and .server(expand)
- `imageResult` (`image-result.ts`)
- `collectClientTools` / `collectClientEffects` / `collectToolRenderers` / `collectAttachmentCards` / `captureModeOf` (`collect-client.ts`)
- `getExtensionApi` (`extension-api.ts`)
- `useScope` (`use-scope.ts`): an `ExtensionScope` whose `settings` follow the engine over `settings.changes`; the stream closes on owner cleanup
- `getHostApi` / `HostApiProvider` (`hooks.tsx`, re-exported by `host.ts`): useRpc, useScope (namespaced `settings` mirrored from the engine over `settings.changes`, stream closed on owner cleanup), useApiBase, useToast, useOpenEditor, useDialog, usePopover, useSessionId, useGrab, useComposerInsert, useComposerAttach, useNewSession, useViewLock, useLeaveView, useSlot, useConnect, useColorScheme
- `HostWiring` / `HostApiContext` / `use` / `useExtensionValue` (`host-context.ts`)
- `MountedExtension` / `MountedSurface` / `MountedView` (`mount-extension.tsx`)
- `ensureEffectsSurface` / `openSource` / `EFFECTS_SURFACE_ATTR` (`client-host.ts`)
- `makeExtRpcClient` (`ext-rpc.ts`): oRPC client at `${apiBase}/rpc/ext/<slug>`
- `subscriptionIterator` (`server-stream.ts`); `pageVerbError` / `isPageVerbError` (`page-errors.ts`)
- `buildCatalog` / `scaffold` / `validateSource` (`catalog.ts`)
- `createToolRegistry` / `ToolRegistry` / `TOOL_TRANSPORT_ERRORS` / `toInlineJsonSchema` (`tool-registry.ts`)
- `walkRegistryProcedures` (`registry-walk.ts`)
- `makeViteBridge(server)` (`vite-bridge.ts`, the `./vite` export): a `BundlerBridge` over a Vite dev server (config, resolve, module graph, transform, urls, reload, restart) whose `subscribe` reports `build-error`, `hmr-update` and `request-trace` diagnostics; the first subscribe wraps the client hot channel, watches file changes and unshifts a request-trace middleware
- `makeCompositeRpcRouter` / `rpcFetchMiddleware` / `rpcWebsocketRoute` / `RpcSocketGate` / `RPC_PREFIX` ('/rpc') (`rpc-mount.ts`); the socket path is `RPC_WS_PATH` from `@conciv/protocol/rpc-types`
- `ExtensionCommand` / `ExtensionCommandContext` (`types.ts`): `{name, description, run(context)}`; the widget lists it in the `/` menu and calls `run({sessionId})` on pick or when `/<name>` alone is sent
- `createSettingsStore` (`settings-store.ts`): the `SettingsStore` surface (get, set, delete, all, onChange) over a lazily resolved `SettingsState`, shared by the engine and the client
- `createClientSettings(rpc, namespace, signal?)` (`settings-client.ts`): `{global, project}` stores that follow `settings.changes`, answer reads from the latest snapshot after the first one, run each store's calls in order, and ignore a snapshot older than the one held
- `ExtensionSlot` (`types.ts`): 'header' | 'footer' | 'composer' | 'empty' | 'status' | 'widget' | 'surface' | 'connect'; plus `ServerApi` (its `scope(namespace).settings` is the engine side of the settings contract, its `settings` reads the extension's own parsed settings), `ExtensionSettingsSchema`, `NoSettings`, `SettingsOf`, `SettingsReader`, `SettingsStore`, `Settings`, `SettingsRegistry` (declaration-merge it to type a namespace), `SettingsForNamespace`, `ExtensionScope`, `SettingsState` and the shared contract types

## Invariants

- `parseExtensionConfig` (`define-extension.ts`): schema.parse(raw ?? {}) throws on invalid config; `makeSystemPrompt` gives no prompt when config fails
- `lenientSettings` (`define-extension.ts`): settings parsing never throws; a missing or malformed field reads as its default, unknown keys drop, a non-object reads as all defaults
- `ExtensionSettingsSchema` (`types.ts`): a settings field without `.default()` is a type error
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
- `rpcHandlerOptions` (`rpc-mount.ts`): refuses a call with `UNAUTHORIZED` when the context's `socket` trust does not allow its path; merges the request headers over the context headers (a socket's context starts with its upgrade request's `user-agent`) and sets `clientVersion` from `x-conciv-version` when it is a semver string (zod; anything else leaves it unset), for the HTTP and the websocket handler alike
- `use` (`host-context.ts`): a hook used without its host wiring throws
- `collect-client.ts`: first registration wins by tool name or MIME; `captureModeOf` defaults mutating tools to 'after'
- `validateSource` (`catalog.ts`): error without `export default defineExtension(`

## Side Effects

- `ensureEffectsSurface` (`client-host.ts`): appends a fixed div with an open shadow root and a style element to document.body
- `openSource` (`client-host.ts`): calls rpc.editor.open / rpc.editor.openFromFrames
- `makeExtRpcClient` (`ext-rpc.ts`): HTTP RPC with the session header; the node path (no global `location`) also sends `x-conciv-version` (the extension package.json version), the browser path goes through `dynamicBrowserRpcLink` and sends no version header
- `collectClientEffects` (`collect-client.ts`): console.warn on duplicate effect names
- `rpcWebsocketRoute` (`rpc-mount.ts`): closes the socket with 1011 on a rejected frame; a `{type: 'conciv:trust', token}` frame never reaches oRPC, it goes to the optional per-connection `gate` (dropped when there is none)
- `forwardToolToPage` (`tool-registry.ts`): forwards client-tool calls to the connected page

## Verification

- Run: `pnpm exec turbo run test --filter=@conciv/extension` from the repo root (turbo builds the package and its dependencies first)
- Typecheck and lint: `cd packages/extension && pnpm typecheck && pnpm lint`
