# @conciv/plugin source

The SDK is a port of opencode's plugin package (`/Users/omrikatz/Public/web/_ref/opencode/packages`, commit
`a1aa513`). Names, shapes and JSDoc are opencode's except for the lines below.

## Differences from opencode

### Files and exports

- `index.ts` mirrors `plugin/src/promise/index.ts`: `PluginOptions`, the storage types and the `Plugin` namespace; of the schema namespaces it re-exports only those conciv declares (`Location`, `Model`, `Rpc`, `Skill`), plus `Tool`, which opencode authors import from `@opencode/schema/tool` (conciv has no schema package).
- A namespace module joins opencode's schema file and promise file of the same name: `tool.ts` (`schema/src/tool.ts` + `promise/tool.ts`), `skill.ts` (`schema/src/skill.ts` + `promise/skill.ts`), `model.ts` (`schema/src/model.ts` + `promise/model.ts`), `permission.ts` (`src/permission.ts` + `promise/permission.ts`), `storage.ts` (`src/storage.ts` + `promise/storage.ts`), `rpc.ts` (`schema/src/rpc.ts` + `promise/rpc.ts` + the types of `client/src/promise/rpc.ts`), so the `Rpc` namespace also carries `RpcDomain`, `RpcClient`, `RpcApi` and the other caller and handler types.
- Request and response types of the client API (`client/src/promise/generated/types.ts`) sit in the domain file that uses them; `generate.ts` holds `ExperimentalGenerateApi`.
- `domains.ts` holds `RequestOptions` and the conciv-only `HarnessDomain` (`ServerHarness` copied from the old extension package) and `BundlerDomain`.
- Effect Schema values become TypeScript types; the one runtime schema, `AssertInput`, is zod and is not exported until the engine host reads it.
- `Location.response` (an Effect Schema builder for HTTP response bodies) is not ported: conciv's transport is oRPC.
- `makeRpc` (`client/src/promise/rpc.ts`) is not ported: it builds the client over opencode's generated HTTP client; conciv's hosts build it over oRPC.
- `.fallowrc.json` `ignoreExports` exempts the namespace member names repeated across `packages/plugin/src` modules (opencode's names) from fallow's duplicate-export check.
- `conciv/banned-vocabulary` is off for `packages/plugin/src/**`: opencode's names use words the rule rejects.

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

## Not available yet

Not declared: declaring them would mean inventing a conciv copy of an opencode type that conciv does not have.

- `Context.event` / `EventDomain` (`plugin/src/promise/plugin.ts:35`): no conciv event union.
- `Context.command` / `CommandDomain` (`plugin/src/promise/plugin.ts:33`): needs opencode's `PromptInput.Prompt` and `SessionInbox.Delivery` (`promise/command.ts:9-10`).
- the `prompt` and `context` session hooks (`plugin/src/promise/session.ts:200-201`): their event types need opencode's message and prompt types.
- `SessionDomain.prompt` and `SessionDomain.context` (`plugin/src/promise/session.ts:224,232`): same message and prompt types.
- `ServerRef.data` (`plugin/src/gui/host-apis.ts:25`): its type is opencode's Solid sync store of the whole server.
