# @conciv/plugin source

The SDK is a port of opencode's plugin package (`/Users/omrikatz/Public/web/_ref/opencode/packages`, commit
`a1aa513`). Names, shapes and JSDoc are opencode's except for the lines below.

## Differences from opencode

### Files and exports

- `index.ts` mirrors `plugin/src/promise/index.ts`: `PluginOptions`, the storage types and the `Plugin` namespace; of the schema namespaces it re-exports only those conciv declares (`Location`, `Model`, `Rpc`, `Skill`), plus `Tool`, which opencode authors import from `@opencode/schema/tool` (conciv has no schema package).
- A namespace module joins opencode's schema file and promise file of the same name: `tool.ts` (`schema/src/tool.ts` + `promise/tool.ts`), `skill.ts` (`schema/src/skill.ts` + `promise/skill.ts`), `model.ts` (`schema/src/model.ts` + `promise/model.ts`), `permission.ts` (`src/permission.ts` + `promise/permission.ts`), `storage.ts` (`src/storage.ts` + `promise/storage.ts`), `rpc.ts` (`schema/src/rpc.ts` + `promise/rpc.ts` + the types of `client/src/promise/rpc.ts`), so the `Rpc` namespace also carries `RpcDomain`, `RpcClient`, `RpcApi` and the other caller and handler types.
- `rpc.ts` does not re-export itself as `Rpc` (source `schema/src/rpc.ts` does, and fallow reports that as a cycle): `index.ts` and `rpc-entry.ts`, the `./rpc` entry mirroring `plugin/src/rpc.ts`, export the namespace.
- Request and response types of the client API (`client/src/promise/generated/types.ts`) sit in the domain file that uses them; `generate.ts` holds `ExperimentalGenerateApi`.
- `domains.ts` holds `RequestOptions` and the conciv-only `HarnessDomain` (`ServerHarness` copied from the old extension package) and `BundlerDomain`.
- Effect Schema values become TypeScript types; the one runtime schema, `AssertInput`, is zod and is not exported until the engine host reads it.
- `Location.response` (an Effect Schema builder for HTTP response bodies) is not ported: conciv's transport is oRPC.
- `makeRpc` (`client/src/promise/rpc.ts`) is not ported: it builds the client over opencode's generated HTTP client; conciv's hosts build it over oRPC.
- `.fallowrc.json` `ignoreExports` exempts the namespace member names repeated across `packages/plugin/src` modules (opencode's names) from fallow's duplicate-export check.
- `conciv/banned-vocabulary` is off for `packages/plugin/src/**`: opencode's names use words the rule rejects.
- `no-shadow` is off for `packages/plugin/src/**`: opencode's type parameter names (`Input` in `RpcArguments<Input, Options>`) repeat names the same module declares.

### Finding a plugin's parts (`host.ts`, `experimental/host.ts`)

- `host.ts` ports `plugin/src/host.ts`; it does not re-export itself as `Host` (the `rpc.ts` rule above): callers import it as a namespace, `import * as Host from '@conciv/plugin/host'`.
- `Entrypoints` has `server`, `rpc` and `experimental` (source `gui`); no `tui`. Bundle file names are `plugin-experimental.*` and the package export is `./plugin-experimental`.
- A local directory without `exports` also resolves its app part from TypeScript source, `plugin-experimental.tsx` then `plugin-experimental.ts`, after the prebuilt `.cjs` and `.js` (spec: local plugins compile from source). A named package's `./plugin-experimental` must still be `.cjs` or `.js`.
- `resolveModule` and `importModule` (`util/src/runtime-import.ts`) are private functions of `host.ts`, ported from the Node runtime (`util/src/runtime/import.node.ts`); the Bun and workerd runtimes are dropped.
- An absolute specifier (a local directory's conventional file) resolves by a file lookup with the same extension list instead of Node's resolver: Node refuses every file under a `package.json` that does not parse, so source's Node runtime fails source's own "package.json that does not parse" case (its tests run on Bun, whose resolver finds the file).
- The manifest is read with zod (`name`, `exports`, both unknown); a `package.json` that is not a JSON object counts as missing. Error codes are read with zod instead of `"code" in error`.
- The source's `//` comments are dropped; `packageID` is `packageId`.
- `experimental/host.ts` ports `Entry` (`windowEntry` only; no `mainEntry`), `compose`, `EnableState`, `pluginEnabled`, `pluginIdAvailable` (reserved namespace `conciv`), `Installed` (no `tui`, no `unsupported`) and `shipsPluginGui` as `shipsPluginExperimental`, reading `features.experimental`. It re-exports `Scope`; `PluginContext`, `LifetimeContext`, `liveAccessor`, `PanelContext` and `DrawerContext` come with Task B8. `runsOn` is absent (no `os`); `Bridge`, `BridgeLayout`, `BridgeMessage`, `BridgeMenubarItem`, `BridgePluginGui`, `BridgePluginGuis` are absent (Electron bridge, no desktop main process). The file's header comment is dropped.

### Names and types

- `ID` is spelled `Id` (`sessionId`, `messageId`, `requestId`, `parentId`, `modelId`, `providerId`, `workspaceId`, `shellId`, `partId`).
- Branded ids (`Event.ID`, `Skill.ID`, `Skill.Name`, `Tool.CallID`, `Agent.ID`, `Model.ID`, `Provider.ID`, `Permission.ID`) are plain strings; session ids are conciv's `SessionId`.
- No `any`: `PluginOptions` values are `Json`; `Tool.Metadata` is `Readonly<Record<string, unknown>>`.
- `Types.Mutable` / `Types.DeepMutable` become a mapped type that drops `readonly` one level deep (the edited values are flat); `ModelEditor` hands out `Model.Info` as is.
- `Tool.Info.execute` uses method syntax, so a `Tool.Info<Input, Output>` is assignable to `Tool.Info` without `any`.
- `Tool.Info.input` and `output` take zod schemas; opencode also takes another library's Standard Schema and a plain JSON Schema object.
- `Tool.Error` is a plain object type `{_tag: 'Tool.Error', message, error?, metadata?}` built by `toolError()` and checked by `isToolError()` (no classes).
- `Tool.Freeform`, `Tool.FreeformFormat` and `Tool.Info.freeform` are absent: MCP takes JSON input only.
- `Tool.ToolContext.messageId` and the tool hooks' `messageId` are `string | undefined` (calls arrive from the CLI over MCP).
- `Permission` `source.messageId` accepts `undefined` for the same reason.
- `PluginFeatures`: `gui` is `experimental`; no `tui`.
- RPC schemas are zod: `PortableValueSchema` and the event schemas are `z.ZodType`, the plain JSON Schema branches (and their `EventInputData` / `EventData` cases) are dropped; `Input` / `Output` are `z.input` / `z.output`, and `HandlerOutput` is the input side (zod parses forward, as Standard Schema does in source).
- `Rpc.EventPayload` and `RpcEventPayload` write out the event envelope fields (`id`, `created`, `metadata`, `location`) instead of deriving them from `Event.Payload` and the generated event type, which are not ported; no `durable`.
- `RpcCallOptions` is `RequestOptions` (`{signal}`), without `location` (one project per engine).
- `ServerRef.client` is `ConcivClient`, which declares only `rpc` of opencode's `OpenCodeClient`.

### Context members

- Absent, not ours: `agent`, `aisdk`, `credential`, `integration`, `mcp`, `provider`, `reference`, `shell`, `vcs`, `websearch`, `worktree`, `experimental.terminal`, `experimental.artifact`.
- Absent: top-level `generate` (deprecated in source; `experimental.generate` replaces it).
- Added by ruling: `servers`, `harness`, `bundler`, `storage.directory`.
- `app` is `App | undefined`: the engine has no app version or channel to give.
- `plugin.list`, `skill.list`, `model.list`, `model.default`: no `location` input (one project per engine); every domain method's request options are `{signal}` only (no `headers`, no `onActivity`).

### Session

- `session.hook` is plain `Hooks`: `ModelHookOptions` and `ModelHooks` are absent (providers are not ours).
- `SessionHooks` has `experimental.idle` only; `fork`, `compaction`, `generate`, `title`, `experimental.model.resolve`, `model.request`, `http.request`, `http.response`, `experimental.ws.handshake`, `experimental.ws.send`, `experimental.ws.receive` and `retry` are not ours, with their event types.
- `SessionDomain` has no `move` (not ours: one directory per engine).
- The session list input has no `directory`, `project` or `subpath`, and the session create input no `location` (one project per engine).

### Model

- `Model` keeps `Ref`, `Info`, `Capabilities`, `Variant`, `Cost` and `Type`; `ID`, `VariantID`, `Family`, `Settings`, `Overlays`, `Compatibility` and `Event` are not ported.
- `Model.Info` has no `compatibility`, `package`, `settings`, `headers` or `body`, and `Model.Variant` no `settings`, `headers` or `body`: provider wire settings are not ours.
- `ModelEditor.provider` is absent: providers are not ours.

### Skill and servers

- `Skill.DirectorySource`, `Skill.UrlSource`, `Skill.EmbeddedSource`, `Skill.Source` and `Skill.Event` are not ported: conciv loads no skill folders or URLs, and the event domain is not available yet.

### Scope

- `experimental/scope.ts` ports `plugin/src/gui/scope.ts`.
- `Scope.make` carries its JSDoc on an explicit type of the `Scope` constant: `conciv/no-comments` keeps doc blocks above declarations and type members only, not above an object literal's property.
- The source's three `//` comments are gone (zero comments in code): the one above `Finalizer` is its JSDoc, the two inside `create` are dropped.
- `fork` returns early after closing a fork made on a closed scope instead of `if ... else` (repo law: no `else` where a guard works).

### App part (`experimental/`)

- Files follow `plugin/src/gui/`: `core.ts`, `declarations.ts`, `plugin.ts`, `context.ts`, `host-apis.ts`, `registries.ts`, `icon-name.ts`, `builtin.ts`; `index.ts` mirrors `gui/index.ts` without the `solid.js` and `reactive.js` lines, which Task B8 adds. `host-apis.ts` (about 1700 lines) stays one file, as in source.
- Package exports `./experimental` and `./experimental/builtin` (source keeps `builtin.ts` out of its published build; conciv's built-in plugins live in other workspace packages, so it is exported).
- `Json` and `PluginOptions` are the engine part's types, re-exported (same shape).
- `App` keeps the source's fields; JSDoc names conciv. `Context.app` is `App` (implemented), unlike the engine part's `App | undefined`.
- `Token` is `Contract<unknown>` only, `TokenValue` has no Ipc branch, `Live` and `Context.use` / `provide` speak of contracts only: no main process, so no `Ipc`, `IpcSpec`, `IpcClient`, `IpcImpl`, `IpcProvider`, `IpcMethod`, `IpcCallOptions`, `Caller`, `Ipc.define`, `Context.main`, `Definition.main`, `MainSetup`, `MainContext`.
- `BaseContext.client` is `ConcivClient` (the client of the plugin's own engine); no `t` or `plural`, and no `OS`, `Params`, `Messages`, `Catalog`, `Declarations.os`, `Declarations.i18n`.
- `Store` has three scopes, `global`, `project` (this repo, conciv's layered project settings) and `session`; `StoreDeclaration`, `BuiltinStoreDeclaration` and the `stores` handle take `project` as `global` (loaded before setup).
- Store schemas are zod object schemas (`z.ZodObject`). Source reads the value type as Effect's `Schema.Type`, whose struct fields are readonly; zod's output is not, so `StoreType<S>` (added) is zod's output made readonly all the way down, and `Persisted.update` still hands out a `Mutable` draft.
- `Store`, `Registry`, `Contract` and `BuiltinStore` carry their member JSDoc on an explicit type of the constant (the `Scope.make` rule above); the JSDoc on `update`'s `draft` parameter is dropped (the lint keeps doc blocks above declarations and members only).
- `Plugin.Definition` has `setup` only and `WithSetup` is `{setup}` (no `main`).
- `Context` members by `docs/specs/plugins-ctx-audit.md` Table 1 and the spec's "Host APIs on ctx" table: `layout`, `sessions`, `screen`, `storage`, `servers`, `tabs`, `links`, `ui`, `toast`, `appearance`, `router`, `app`, `keybinds` implemented; `desktop` is `Desktop | undefined` as in source; `dialogs`, `commands`, `system`, `attention` are `T | undefined` as whole members (the spec table wins over the audit, which marks `dialogs.open`, `dialogs.active` and `system.copy` "have it"); absent: `main`, `t`, `plural`, `embeds`, `locale`, `workspaces` (with `Embeds`, `EmbedProps`, `Locale`, `Workspaces`).
- `ServerRef` and `Servers` are `../servers.ts`, re-exported; the browser source adds no members beyond `data` (see Not available yet).
- `SessionRef.location` is `Location.Ref` (opencode's `LocationRef`).
- `Composer`: `text` and `focus` are implemented by the spec table ("`ctx.screen` (`composer.attach`, `composer.focus`, text)") where the audit says "concept fits"; `attach` takes `file`, `note` and `quote` (the audit's UNSURE quote row is settled by the spec's Attachments section). `commentID` is `commentId`, `ComposerModel.providerID` / `modelID` are `providerId` / `modelId`. Mentions of subagent sessions are dropped from the JSDoc (subagents run inside the CLI).
- `SessionScreen` has `composer` only: `file` (`Files`, `FileState`, `FileContent`, `FileNode`, `LineRange`) and `comment` (`Comments`, `Comment`) are not ours (audit rows `screen.file.*`, `screen.comment.*`).
- `MountedSession` keeps `visit` and `directory`; `local` is declared, not implemented; `background` and `BackgroundTask` are absent (subagents run inside the CLI); `listedProject` is absent (no sidebar; audit row `layout.sidebar.opened`); `project` is not available yet.
- `Layout`: `side` and `sidebar` are absent: conciv has no side region (`apps/conciv/src/pane/status-bar.tsx:48`, a panel replaces the chat; `apps/conciv/src/routes/panel-height.ts:8`). This settles the audit's UNSURE `layout.side.width` row and drops `side.menu` with `MenuItem`. `project` is absent (one directory per engine). `OpenOptions` and `PanelState` JSDoc no longer mention the side region or narrow screens.
- `Desktop`: no `os`, no `zoom`; `launch(path, position?)` takes a `{line, column?}` position in place of source's `app?` argument, backed by the engine's open-in-editor (`packages/contract/src/contract.ts:410`, `editor.open`).
- `StorageScope` keeps source's `{server, directory?}` scope; a conciv server is an engine, which runs in one project.
- `System.save` and `openExternal` JSDoc describe the web only (download, new tab).
- `Tabs.focus` is declared: the quick pane `focus` search param backs it (`apps/conciv/src/lib/quick-search.ts:15`), which settles the audit's UNSURE row; `Tabs.close` is declared by the spec table although the audit says "concept fits".
- `Ui` keeps every source component and prop type; examples use literal text in place of `ctx.t`, and conciv icon names.
- `IconName` is conciv's catalog, not opencode's: the 92 `lucide-solid/icons/<name>` names conciv imports today (`apps/conciv/src`, `packages/*/src`), since opencode's names (`bubble-5`, `outline-rotate-clockwise`, …) are its own artwork.
- `Command` JSDoc drops the command palette (conciv has none, audit Table 2); fields are source's.
- `Panel.region` is `'pane'` (ruling). Left out as side-column-only: `wide` (wider session minimum while the side region is open), `width` (side region width), `mobile` with `MobileView` (the narrow-screen switcher that stands in for the side region; a conciv panel already replaces the chat), `enter` (runs when the side region opens on the tab with its toggle).
- `SettingsPage.page` is `'general'` only and `group` is absent: conciv's settings have no Servers or About page (`apps/conciv/src/routes/panel.$sessionId_.settings.*.tsx`).
- `SlotMap` has five places: source's `session.header` and `window.bottom` (inputs verbatim), and conciv's `session.status` (`{screen, session}`), `window.connect` (`{origin, found(apiBase)}`, what the connect slot gets today: `ConnectHostApi`, `packages/extension/src/host-context.ts:9`) and `page.overlay` (`Record<string, never>`).
- Not ported (spec "Not ported" list and its brief): `MenuItem` and its three item types, `Server`, `ServerEntry`, `ServerRow`, `ServerState`, `ServerHealth`, `TitlebarItem`, `Style`, `Theme` and its colour types.
- `builtin.ts` keeps `BuiltinStoreFrom`, `BuiltinStoreDeclaration`, `BuiltinStore` (used by the host in Task B5) and adds the built-in `ToolCall` registry (ruling). `ToolCallProps` follows `CodeBlockProps`: `tool`, `id`, `input`, `result` (`success` with `output`, or `error`), `session`; it is what a finished call has in conciv's tool card props (`ToolCardProps`, `packages/protocol/src/tool-view-types.ts:43`, through `ToolCard`, `packages/extension/src/types.ts:55`), without the card's `ctx`, `addResult`, `durationMs` and `capture`. Not ported, no audit or spec verdict: `onIdle`, `BuiltinCommand`, `BuiltinPanel`, `BuiltinPanelTab`, `BuiltinSlotMap`, `BuiltinSlot`, `BuiltinStoreOptions`, `BuiltinStorage`, `BuiltinDesktop`, `BuiltinLayout`, `BuiltinLocale`, `BuiltinContext`, `builtinContext` (also a cast); absent: `MainStoreFrom`, `BuiltinMainStorage`, `Lifecycle`, `BuiltinMainContext`, `builtinMainContext`, `BuiltinCatalog`, `builtinCatalog` (no main process, no i18n).
- `gui/file.ts`, `gui/review.ts`, `gui/browser.ts`, `gui/updater.ts` are not ported: they are contracts of opencode's own built-in plugins, and the audit has no row for any of them.

## Declared, not implemented

Each is typed `| undefined` (or optional) and always undefined in this version.

- `Context.app`, `Context.experimental.generate`
- `model.transform`, `model.reload`
- `permission.hook`, `permission.assert`
- `session.generate`, `session.command`, `session.synthetic`
- `location.project.id`, `location.project.canonical`
- `Tool.ToolContext.messageId`, `messageId` in the tool hooks
- `Model.Ref.providerId`, `Model.Ref.variant`
- `Model.Info`: `providerId`, `canonical`, `type`, `family`, `capabilities`, `variants`, `time`, `cost`, `status`, `limit`
- session info: `parentId`, `fork`, `projectId`, `outcome`, `time.created`, `time.busy`, `time.idle`, `time.viewed`, `time.archived`, `subpath`, `metadata`, `permissions`, `revert`
- session list input: `order`, `parentId`, `archived`
- session create input: every field
- session update input: `metadata`, `permissions`, `archived`
- session compact: input `id`, `delivery`; result `id`, `delivery`
- session interrupt input: `resume`
- `SessionIdle.background`
- permission request: `resources`, `save`, `metadata`, `message`; permission reply input: `message`
- app part `Context`: `dialogs`, `commands`, `system`, `attention`
- `Desktop`: `reveal`, `installed`, `pick`
- `Layout`: `narrow`, `hide`, `scroll`
- `Composer`: `setText`, `quotable`, `update`, `detach`, `focused`
- `MountedSession.local`
- `Tabs.move`
- `Links.exists`

## Not available yet

Not declared: declaring them would mean inventing a conciv copy of an opencode type that conciv does not have.

- `Context.event` / `EventDomain` (`plugin/src/promise/plugin.ts:35`): no conciv event union.
- `Context.command` / `CommandDomain` (`plugin/src/promise/plugin.ts:33`): needs opencode's `PromptInput.Prompt` and `SessionInbox.Delivery` (`promise/command.ts:9-10`).
- the `prompt` and `context` session hooks (`plugin/src/promise/session.ts:200-201`): their event types need opencode's message and prompt types.
- `SessionDomain.prompt` and `SessionDomain.context` (`plugin/src/promise/session.ts:224,232`): same message and prompt types.
- `ServerRef.data` (`plugin/src/gui/host-apis.ts:25`): its type is opencode's Solid sync store of the whole server.
- `MountedSession.project` (`plugin/src/gui/host-apis.ts:721`): its type is opencode's `ProjectListOutput` entry with worktrees.
- `Slot` at `session.location.menu` and `session.panel.end` (`plugin/src/gui/registries.ts:885,894`): conciv's UI has no project menu slot and no side tab strip.
