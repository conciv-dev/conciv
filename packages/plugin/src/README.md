# @conciv/plugin source

The SDK is a port of opencode's plugin package (opencode at commit `a1aa513`; every opencode path below is relative
to its `packages/` folder). Names and shapes are opencode's except for the lines under "Differences from opencode".
The source keeps opencode's JSDoc only where a block carries at least one tag (`@param`, `@returns`, `@example`,
`@remarks` ...) above a declaration or member: those blocks stay whole, prose-only doc blocks are not kept
(`conciv/no-comments` with `keepDocComments`). A member marked as not implemented (below) carries only its `@remarks`
line.

## Entries

A plugin has up to three parts: an engine part (runs inside the conciv engine, adds tools, skills and RPC handlers),
an RPC contract shared by both sides, and a browser part (runs in the conciv widget, adds panels, slots, commands
and stores).

### `@conciv/plugin` (`promise/index.ts`)

The engine part. `Plugin.define({id, setup})` returns its argument typed; `setup(ctx)` may be async and may return
a cleanup. `ctx` is `Plugin.Context`: the `tool`, `skill`, `session`, `rpc`, `storage`, `permission`, `model`,
`agent`, `event`, `plugin`, `location`, `options`, `servers`, `harness` and `bundler` domains. The entry also exports
the `Agent`, `Tool`, `Skill`, `Model`, `Location` and `Rpc` namespaces and, by name, every exported type of the
engine-side files: the domain, editor, hook, caller and handler types (`ToolContext`, `SessionIdle`, `RpcClient` ...),
the client's request and response types (`SessionInfo`, `PluginInfo` ...), `ConcivClient`, `ConcivEvent`, `ServerRef`,
and what an engine host builds a plugin's context from (`Registration`, `Transform`, `Hooks`, `Rule`, `Ruleset`). Tool, RPC and store schemas
are any Standard Schema (zod, Valibot, ArkType ...) or a raw JSON Schema object, as opencode's (store schemas: Standard
Schema only).

```ts
import {z} from 'zod'
import {Plugin} from '@conciv/plugin'
import {Tanstack} from './rpc.js'

export default Plugin.define({
  id: 'tanstack',
  async setup(ctx) {
    await ctx.tool.transform((tools) => {
      tools.add({
        name: 'tanstack_routes',
        description: 'Count the app routes',
        input: z.object({}),
        output: z.object({count: z.number()}),
        execute: async () => ({output: {count: 1}}),
      })
    })
    const registration = await ctx.rpc.register(Tanstack, {routes: async () => ({routes: ['/']})})
    return () => registration.dispose()
  },
})
```

### `@conciv/plugin/rpc` (`rpc.ts`)

The `Rpc` namespace alone, for the contract module both parts import. `Rpc.define({id, methods, events})` returns
its argument typed and throws when an error name starts with `rpc.` (reserved). Method and event schemas are any
Standard Schema or a raw JSON Schema object (an event's with `type: 'object'`).

```ts
import {z} from 'zod'
import {Rpc} from '@conciv/plugin/rpc'

export const Tanstack = Rpc.define({
  id: 'tanstack',
  methods: {routes: {input: z.object({}), output: z.object({routes: z.array(z.string())})}},
  events: {buildError: {schema: z.object({message: z.string()})}},
})
```

### `@conciv/plugin/experimental` (`experimental/index.ts`)

The browser part. `Plugin.define({stores, setup})` has no id (the host gives it the engine part's id as `ctx.id`);
`setup` is synchronous and runs under the plugin's Solid owner. `ctx.add(Registry, item)` adds to a registry
(`Panel`, `Slot`, `Command`, `ComposerPill`, `LinkHandler`, `SettingsPage`, `Server`, `CodeBlock`, `CodeBlockAction`,
`NoteCard`), and
everything added is withdrawn when the plugin reloads or stops. Also exported: `Store` (`global`, `project`,
`session`), `Registry`, `Contract`, the host API types, `createKeyed`, `createLatest`, `createVisitState`,
`usePlugin`, `bindPlugin`, `usePanel` and `useDrawer`. `ctx.client.rpc(Definition)` calls the plugin's own engine
part; `ctx.servers.get(id)?.client.rpc(Definition)` calls another engine.

```tsx
import {z} from 'zod'
import {createLatest, Panel, Plugin, Slot, Store} from '@conciv/plugin/experimental'
import {Tanstack} from './rpc.js'

export default Plugin.define({
  stores: {prefs: Store.global(z.object({open: z.boolean()}), {open: false})},
  setup(ctx) {
    const routes = createLatest(
      () => ctx.id,
      (_id, signal) => ctx.client.rpc(Tanstack).routes({}, {signal}),
    )
    ctx.add(Slot, {at: 'session.status', render: () => <span>{routes.latest?.routes.length ?? 0} routes</span>})
    ctx.add(Panel, {id: 'routes', region: 'pane', list: () => [{id: 'routes', title: 'Routes'}], render: () => <p />})
  },
})
```

### `@conciv/plugin/experimental/vite` (`experimental/vite.ts`)

`experimental(options?)` returns the Vite plugins that build a browser part into one CommonJS bundle,
`dist/plugin-experimental.cjs` from `src/plugin-experimental.tsx` by default. The build fails on an import of a
`@conciv/*` or `solid-js/*` module the conciv app does not provide to plugins.

### `@conciv/plugin/experimental/builtin` (`experimental/builtin.ts`)

The first-party tier, for conciv's own plugins only: `onIdle` and the `ToolCall` registry, which fills the body of a
finished tool call's card (`ToolCallProps`).

### `@conciv/plugin/host` (`host.ts`)

For the engine-side host only: `resolve(target)` finds a plugin's `server`, `rpc` and `experimental` entry files,
`load(entrypoint)` imports one, `packageId(target)` names it. Import it as a namespace:
`import * as Host from '@conciv/plugin/host'`.

### `@conciv/plugin/experimental/host` (`experimental/host.ts`)

For the browser-side host only: `compose` merges built-in and installed entries, `pluginEnabled` and
`pluginIdAvailable` decide which run, `evaluatePluginBundle` runs a prebuilt bundle with the host's `require`,
`pluginSharedModules` and `pluginWindowModules` list what that `require` provides, `inertModule` and
`mainOnlyModule` stand in for Node built-ins, `Installed` and `shipsPluginExperimental` describe installed plugins,
and `Scope` plus the Solid contexts (`PluginContext`, `LifetimeContext`, `PanelContext`, `DrawerContext`,
`liveAccessor`) are what the host mounts a plugin with.

## Differences from opencode

### Files and exports

- One opencode file is one conciv file, same name and folder. opencode's `plugin/src` is `src` (`gui/` is `experimental/`); the files conciv ports from opencode's `schema`, `client` and `util` packages sit in `src/schema/`, `src/client/` and `src/util/` (conciv has no such packages): `schema/` holds `agent`, `event`, `location`, `model`, `permission`, `rpc`, `skill`, `tool`; `client/` holds `shared-events.ts` and `promise/` (`index`, `api`, `rpc`, `generated/types`, `generated/client`); `util/` holds `runtime-import.ts` and `runtime/import.node.ts`. The src root keeps opencode's root files: the entries `rpc.ts` and `host.ts`, and `app.ts`, `options.ts`, `permission.ts`, `storage.ts`, whose types `.` exports by name.
- Not ported files: `schema/src/session-event.ts` (`SessionDeleted` is the generated client type of that name) and `schema/src/token-usage.ts` (`TokenUsage` is the generated client's `TokenUsageInfo`); opencode's other `schema`, `client` and `util` files are not used by the plugin package.
- `promise/index.ts` mirrors `plugin/src/promise/index.ts`: `PluginOptions`, the storage types and the `Plugin` namespace; of the schema namespaces it re-exports only those conciv declares (`Agent`, `Location`, `Model`, `Rpc`, `Skill`), plus `Tool`, which opencode authors import from `@opencode/schema/tool` (conciv has no schema package).
- `promise/index.ts` also exports by name every exported type of the engine-side files that no namespace carries: `promise/*.ts`, `client/promise/*.ts` (with `generated/`), `client/shared-events.ts` and the root `app.ts`, `options.ts`, `permission.ts`, `storage.ts`. opencode authors import these from `@opencode/plugin/promise/*` (its `./*` export) and `@opencode/client`; conciv has no `./*` subpaths. `promise/tool.ts`'s `Info` (the Promise tool, whose `execute` takes `ToolContext`) is `Info` at the root; the names `promise/tool.ts` re-exports from `schema/tool.ts` stay `Tool.*`.
- `promise/index.ts` exports `Registration`, `Transform` and `Hooks` (`promise/registration.ts`) and `Rule` and `Ruleset` (`schema/permission.ts`) by name: the engine host builds a plugin's context from them. `ToolHooks` stays private to `promise/tool.ts`, as in source.
- `schema/tool.ts` declares `Context` (sessionId, agent, messageId, id, signal, progress; `signal` stands where source's has Effect's `cancel`, as the Promise `ToolContext` does) and `Info` without Effect, so `Tool.Info` is the full tool type; `promise/tool.ts` adds the Promise `ToolContext` (`signal`, a Promise `progress`) and its `Info`.
- `./rpc` (`rpc.ts`) is opencode's schema namespace only: `RpcApi`, `RpcArguments`, `RpcCallContext`, `RpcCallOptions`, `RpcClient`, `RpcDomain`, `RpcEventPayload`, `RpcHandlers` and `RpcRegistration` are on `.`.
- `schema/rpc.ts` does not re-export itself as `Rpc` (source does, and fallow reports that as a cycle): `promise/index.ts` and `rpc.ts`, the `./rpc` entry mirroring `plugin/src/rpc.ts`, export the namespace.
- `client/promise/api.ts` holds `ExperimentalGenerateApi` only: source's other `*Api` types alias its generated HTTP client, which conciv does not have; the domain types inline those signatures.
- `client/promise/generated/types.ts` holds the request and response types of the client API that the domains use; `generated/client.ts` holds `RequestOptions` only.
- `promise/harness.ts` (`HarnessDomain`, `ServerHarness` copied from the old extension package), `promise/bundler.ts` (`BundlerDomain`) and `promise/servers.ts` (`ServerRef`, `Servers`, for `Plugin.Context.servers`) are conciv-only.
- `experimental/core.ts` declares its own `Json` and `PluginOptions`, as source `gui/core.ts` does. `client/promise/generated/types.ts` reads `Json` from it, which makes a type-only import cycle (`experimental/core.ts`, `client/promise/index.ts`, `client/promise/rpc.ts`, `client/promise/generated/types.ts`); source avoids it with the generated client's own mutable `JsonValue`.
- `Plugin.Context.servers` is conciv's (opencode's `plugin/src/promise/plugin.ts` has no `servers`), so `ServerRef` and `Servers` live in the engine file `promise/servers.ts`, which imports nothing from `experimental/`; `experimental/host-apis.ts` re-exports them. The declarations of `.`, `./rpc` and `./host` import neither `solid-js` nor `vite` (a test walks them).
- Effect Schema values become TypeScript types. `AssertInput`, `Source` (`schema/permission.ts`) and `Tool.Error` are hand-written types, so no emitted `.d.ts` imports zod; the runtime schemas are the private zod check behind `isToolError`, held to `Tool.Error` with `satisfies`, and the private zod check of the `PLUGIN_RPC` error in `makeRpc`. `AssertInput` and `Source` have no runtime schema: source parses `permission.assert` input in the host, which conciv's engine host will do.
- `Location.response` (an Effect Schema builder for HTTP response bodies) is not ported: conciv's transport is oRPC.
- `makeRpc` (`client/promise/rpc.ts`, exported by name from `.`) takes the contract client's `plugin.call` and `plugin.events` (`@conciv/contract`) in place of opencode's generated HTTP client and its event stream. A call sends `{rpcId, method, input}` with `{signal}` (no `location`, no `headers`) and returns what the procedure answers (oRPC has no `{output}` wrapper). A failure is recognised as the contract's defined `PLUGIN_RPC` error by a private zod check, in place of `isRpcError` / `isRpcInternalError`, and rejects with its `{type, message, data?}` as source does. A subscription asks the engine for `{rpcId, types: [name]}` and keeps source's type filter. The event generator and the `on` loop are named inner functions in place of source's two IIFEs; the input cast is dropped (the wire input is `unknown`); the two remaining casts keep source's, without its `SAFETY` comments and oxlint directives.
- `.fallowrc.json` `ignoreExports` exempts the namespace member names repeated across `packages/plugin/src` modules (opencode's names) from fallow's duplicate-export check.
- `conciv/banned-vocabulary` is off for `packages/plugin/src/**` because opencode's names are kept exactly: it rejects `Composer.attach` (`experimental/host-apis.ts`, opencode `plugin/src/gui/host-apis.ts:639`).

### Finding a plugin's parts (`host.ts`, `experimental/host.ts`)

- `host.ts` ports `plugin/src/host.ts`; it does not re-export itself as `Host` (the `schema/rpc.ts` rule above): callers import it as a namespace, `import * as Host from '@conciv/plugin/host'`.
- `Entrypoints` has `server`, `rpc` and `experimental` (source `gui`); no `tui`. Bundle file names are `plugin-experimental.*` and the package export is `./plugin-experimental`.
- A local directory without `exports` also resolves its app part from TypeScript source, `plugin-experimental.tsx` then `plugin-experimental.ts`, after the prebuilt `.cjs` and `.js` (spec: local plugins compile from source). A named package's `./plugin-experimental` must still be `.cjs` or `.js`.
- `resolveModule` and `importModule` are `util/runtime/import.node.ts` (the Node runtime), re-exported by `util/runtime-import.ts`; the Bun and workerd runtimes and the runtime switch are dropped. No package export reaches them.
- An absolute specifier (a local directory's conventional file) resolves by a file lookup with the same extension list instead of Node's resolver: Node refuses every file under a `package.json` that does not parse, so source's Node runtime fails source's own "package.json that does not parse" case (its tests run on Bun, whose resolver finds the file).
- A resolved specifier must be a regular file; anything else is a miss, so the next candidate is tried (a package without `exports` that has a `server/` directory gives its root `index.js` as `server`). Source runs on Bun, where the resolver finds the file; on Node, which conciv runs on, the same code returns the directory and loading fails later (opencode `util/src/runtime/import.node.ts:32`).
- The manifest is read with zod (`name`, `exports`, both unknown); a `package.json` that is not a JSON object counts as missing. Error codes are read with zod instead of `"code" in error`; `host.ts` and `util/runtime/import.node.ts` each keep their own guard, as source inlines one in each.
- The source's `//` comments are dropped; `packageID` is `packageId`.
- `experimental/host.ts` ports `Entry` (`windowEntry` only; no `mainEntry`; `stores` is `Declarations.stores`, no `BuiltinStoreDeclaration`), `compose`, `EnableState`, `pluginEnabled`, `pluginIdAvailable` (reserved namespace `conciv`), `Installed` (no `tui`, no `unsupported`) and `shipsPluginGui` as `shipsPluginExperimental`, reading `features.experimental`. It re-exports `Scope`, `pluginSharedModules`, `pluginWindowModules` and `PluginModule` from `modules.ts` and, as source does, `DrawerContext`, `LifetimeContext`, `liveAccessor`, `PanelContext` and `PluginContext` from `internal.ts`. `runsOn` is absent (no `os`); `Bridge`, `BridgeLayout`, `BridgeMessage`, `BridgeMenubarItem`, `BridgePluginGui`, `BridgePluginGuis` are absent (Electron bridge, no desktop main process). The file's header comment is dropped.

### Evaluating a bundle (`experimental/host.ts`, `experimental/modules.ts`)

- `PluginBundle` has `definition` and `setup` (no `main`); `definition` carries `stores` only (no `os`, no `i18n`).
- `PluginBundleHost` has `require` only: `process` (`'window' | 'main'`) is absent, since it only tells the two processes apart and nothing reads it in the evaluator.
- `evaluatePluginBundle` checks the definition with zod (`stores` entries need a `global`, `project` or `session` scope and a Standard Schema, a value whose `~standard.validate` is a function, where source checks `Schema.isSchema`; `setup` must be a function) and puts `z.prettifyError`'s field path in the message where source puts Effect's `Cause.pretty`. Its texts are source's with the entry name and package: "A plugin's ./plugin-experimental bundle must default-export a `Plugin.define` from `@conciv/plugin/experimental`: <problem>" and "A plugin's ./plugin-experimental bundle must have a window `setup`" (source: "A plugin's GUI must have a window `setup`, a `main` setup, or both").
- A type guard over the zod check stands in for source's `Schema.is` plus its two `SAFETY` casts; source's `//` comments are dropped.
- `mainOnlyModule` and `inertModule` are kept: the page's `require` gives a bundle an inert placeholder for Node built-ins, as opencode's window does. `mainOnlyModule` no longer counts `electron` (no desktop app). JSDoc speaks of the browser in place of the window and main processes.
- `modules.ts` keeps source's split: `pluginSharedModules` is `@conciv/plugin/experimental`, `@conciv/plugin/rpc`, `zod`; `pluginWindowModules` is `solid-js`, `solid-js/web`, `solid-js/store` (the spec's list for outside plugins). With no main process the split only separates Solid from the rest. Absent: `effect`, `@opencode/plugin/gui/main`, `@opencode/schema/rpc` (conciv's contract module is `@conciv/plugin/rpc`), `@opencode/client`, `@opencode/client/effect`, `@opencode/client/solid`, and the `gui/file`, `gui/review`, `gui/browser` contract modules (not ported).

### Building an app part (`experimental/vite.ts`)

- `experimental/vite.ts` ports `plugin/src/gui/vite.ts`: `gui()` is `experimental()`, `GuiOptions` is `ExperimentalOptions`, the Vite plugin is `conciv-experimental`, and the defaults are `src/plugin-experimental.tsx` and `dist/plugin-experimental.cjs`. The package export is `./experimental/vite`.
- `electron` is not kept external: conciv has no desktop app.
- The build fails on `@conciv/*` and `solid-js/*` modules outside the provided list; source's `effect/` prefix has no conciv counterpart (no Effect). So `@conciv/ui-kit*` fails here: `experimental()` is the outside-plugin build.
- An installable plugin never imports the UI kit; it uses `ctx.ui`. `experimental()` has no first-party mode: any `@conciv/*` import outside the provided list fails the build, as in opencode. Only the built-in plugins compiled into the app import `@conciv/ui-kit*` directly.
- The error reads "<module> is not a module the conciv app provides to plugins: <list>" (source: "<module> is not a module the OpenCode app provides to plugin GUIs: <list>").
- The `//` comment above `provided` is dropped.

### Reactive helpers and bindings (`experimental/reactive.ts`, `solid.ts`, `internal.ts`)

- `internal.ts` ports `gui/internal.ts`; the live-accessor symbol is `Symbol.for('conciv.plugin.live')`. Its header comment is dropped.
- `reactive.ts` ports `gui/reactive.ts` with the same algorithms. In place of source's two `SAFETY` casts to `KeyedValue<S>`, `createKeyed` hands its callbacks to a private `keyed` as methods taking `unknown` (method parameters are bivariant), and the `Live` or plain memo is built by a private `activeRun` with a guard instead of a ternary (lint `solid/reactivity`). Source's `//` comments are dropped.
- JSDoc examples and text drop `ctx.t`, `Ipc` and the "goes Home and back" wording (conciv has no Home view).
- `usePlugin` is two overloads (`usePlugin(): Context`, `usePlugin<D>(): SetupContext<D>`) in place of source's conditional return type `[D] extends [never] ? Context : SetupContext<D>` and its `SAFETY` cast; callers see the same types.
- `PanelFrame.placement` is `'pane' | 'mobile'` (source `'side' | 'mobile'`; Panel ruling). Side-column-only parts are absent: `PanelFrame.reserve`, `PanelFrame.sidebar` and `PanelSidebar`.
- These files use `createSignal`, `createRenderEffect`, `createMemo` and `createRoot` as the SDK's sanctioned wrappers; no lint rule bans those imports (the ban is a review law in `AGENTS.md`), so no lint exemption was added.
- `test/plugin.browser.test.tsx` runs in a `browser` vitest project (headless Chromium, `@vitest/browser-playwright`, `vite-plugin-solid`), copied from `packages/ui-kit-system/vitest.config.ts`; the `node` project runs `test/plugin.test.ts` with `environment: 'node'`.

### Names and types

- `ID` is spelled `Id` (`sessionId`, `messageId`, `requestId`, `parentId`, `modelId`, `providerId`, `workspaceId`, `shellId`, `partId`).
- Branded ids (`Event.ID`, `Skill.ID`, `Skill.Name`, `Tool.CallID`, `Agent.ID`, `Agent.Name`, `Model.ID`, `Provider.ID`, `Permission.ID`) are plain strings; session ids are conciv's `SessionId`.
- No `any`: `PluginOptions` values are `Json`; `Tool.Metadata` is `Readonly<Record<string, unknown>>`. `Tool.ValueSchema`, `InputValue` and `OutputValue` keep source's `any` (`schema/src/tool.ts:61-76`).
- `Types.Mutable` / `Types.DeepMutable` become a mapped type that drops `readonly` one level deep (the edited values are flat); `ModelEditor` hands out `Model.Info` as is.
- `Tool.Info.execute` uses method syntax, so a `Tool.Info<Input, Output>` is assignable to `Tool.Info` without `any`.
- `Tool.ValueSchema` is `StandardSchemaV1<any, A> | JsonSchema` (`@standard-schema/spec`, a dependency): source's `schema/src/tool.ts:61` without its `Schema.Codec` member, and `InputValue` / `OutputValue` (`:63-76`) without their `Schema.Codec` branches (no Effect). So `Tool.Info.input` and `output` and RPC method, error and event schemas take any Standard Schema or a raw JSON Schema object, where opencode takes each; a JSON Schema infers what source gives (`unknown` for execute's input, `any` for its output; `unknown` for an RPC method's input and output; `Readonly<Record<string, unknown>>` for event data). zod 4 schemas are Standard Schemas. Store schemas are Standard Schemas only: opencode's store bound is an Effect codec (`plugin/src/gui/core.ts:458`) and takes no JSON Schema.
- `JsonSchema` is a private interface `{[x: string]: unknown}` in `schema/tool.ts` and `schema/rpc.ts`, the two files where source imports Effect's `JsonSchema.JsonSchema`; it is structurally equal to Effect 4.1.0's (`effect/src/JsonSchema.ts:33-35`).
- `Tool.Error` is a plain object type `{_tag: 'Tool.Error', message, error?, metadata?}` (no classes): `toolError({message, error?, metadata?})` takes the same input as opencode's `new Tool.Error({...})` (`schema/src/tool.ts:78-82`), so a tool error carries its cause in `error`, and `isToolError()` checks it.
- `Tool.Freeform`, `Tool.FreeformFormat` and `Tool.Info.freeform` are absent: MCP takes JSON input only.
- `Tool.Context.messageId`, `ToolContext.messageId` and the tool hooks' `messageId` are `string | undefined` (calls arrive from the CLI over MCP).
- `Permission` `source.messageId` accepts `undefined` for the same reason.
- `PluginFeatures`: `gui` is `experimental`; no `tui`.
- RPC schemas: `PortableValueSchema` is `StandardSchemaV1<unknown, unknown> | JsonSchema` (`schema/src/rpc.ts:19`), the event schemas are `StandardSchemaV1<unknown, EventDataObject> | (JsonSchema & {readonly type: 'object'})` (`:30-36`, without the `Schema.Codec` member), and `EventInputData` / `EventData` (`:144-149`) keep their JSON Schema case. `Input` / `Output` (`:62-72`) drop their `Schema.Top` branch, and `HandlerOutput` (`:75`) is the input side (Standard Schema parses forward, as in source); a JSON Schema gives `unknown`, as in source.
- `Rpc.EventPayload` builds on `PayloadBase` (`schema/src/event.ts`, private there, exported from `schema/event.ts` for it) in place of `Event.Payload`, which is not ported; no `durable` (RPC events are ephemeral). `RpcEventPayload` derives from the `rpc.*` member of `ConcivEvent`, as source derives it from `OpenCodeEvent`.
- `RpcCallOptions` is `RequestOptions` (`{signal}`), without `location` (one project per engine).
- `ServerRef.client` is `ConcivClient`, conciv's full engine client as opencode's is the full `OpenCodeClient`: the typed client of the core contract (`RpcClient`, `@conciv/contract`) plus `rpc: RpcApi`. `@conciv/contract` is a dependency for that type.

### Context members

- Absent, not ours: `aisdk`, `credential`, `integration`, `mcp`, `provider`, `reference`, `shell`, `vcs`, `websearch`, `worktree`, `experimental.terminal`, `experimental.artifact`. Also absent: top-level `generate` (deprecated in source; `experimental.generate` replaces it).
- Added by ruling: `servers`, `harness`, `bundler`, `storage.directory`.
- `harness` (conciv-only, no opencode counterpart) carries what the terminal plugin needs to run the session's CLI itself: `get(sessionId)` (the CLI and its terminal command), `resumeToken` / `recordToken` (the CLI's own session id, as the old `ServerApi.sessions` had them) and `mcpUrl` (the engine's MCP endpoint under its agent-token base path; the base path itself is not exposed). `mcpUrl` is `string | undefined`, read each time: the engine's port is known only after it listens (`packages/core/src/start.ts:223` runs `makeApp`, which sets plugins up, before `servePort` at `:227` and the port at `:233`), and that loopback address is the one the engine already gives the CLI (`start.ts:239`, `claudeConnectEndpointFile`); a host without a port (`makeApp` alone) has none. Behaviour difference: today's terminal builds the address per request from the origin the browser called the engine on (`packages/extensions/terminal/src/server.ts:68-70`), so behind a proxy or tunnel the CLI now gets the engine's loopback address instead of the proxied one; the RPC handler context has no origin field, as opencode's `RpcCallContext` has none. The session's model is `session.get(...).model`.
- `app` is `App | undefined`: the engine has no app version or channel to give.
- `plugin.list`, `skill.list`, `model.list`, `model.default`: no `location` input (one project per engine); every domain method's request options are `{signal}` only (no `headers`, no `onActivity`).

### Agent and events

- `agent` is ported for permission rules only (ruling; conciv runs one agent per session): `AgentDomain` has `transform` alone, without `AgentApi`'s `list` and `get` and without `reload`; `AgentEditor` has `list` alone, without `get`, `default`, `update` and `remove`.
- `Agent.Info` has `id`, `name` and `permissions`; the other agent settings are the CLI's and absent: `model`, `request`, `system`, `description`, `mode`, `hidden`, `color`, `steps`. `Agent.Color`, `Agent.Info.default` and `Agent.Event` (`agent.updated`) are not ported.
- The agent editor's `Types.DeepMutable<Agent.Info>` is a mapped type that drops `readonly` from the info and from each permission rule.
- `ConcivEvent` is opencode's `OpenCodeEvent` (`protocol/src/groups/event.ts:82`) cut to the events conciv emits: `session.deleted` (`schema/src/session-event.ts:182`, by ruling: the page plugin drops an attachment when its session is deleted) and the `rpc.*` event; every other server event is absent (conciv's session stream `sessions.changes` carries only an index `version`, `packages/contract/src/contract.ts:73`).
- `server.connected` is absent (conciv's engine sends no connect frame), so `EventDomain`'s event type excludes nothing.
- `SessionDeleted.durable` is `DurableEnvelope` (`schema/src/event.ts:34`): `aggregateID` is `aggregateId`, the branded `Seq` and `Version` are numbers; `seq` carries the not-implemented marker.
- `SubscribeOptions` has no `onActivity` (request options are `{signal}` only).

### Session

- `session.hook` is plain `Hooks`: `ModelHookOptions` and `ModelHooks` are absent (providers are not ours).
- `SessionHooks` has `experimental.idle` only; `fork`, `compaction`, `generate`, `title`, `experimental.model.resolve`, `model.request`, `http.request`, `http.response`, `experimental.ws.handshake`, `experimental.ws.send`, `experimental.ws.receive` and `retry` are not ours, with their event types.
- `experimental.idle` does not run after a stopped or failed run, as in opencode; no second hook exists (ruling: whiteboard drafts from such a turn stay drafts).
- `SessionDomain` has no `move` (not ours: one directory per engine).
- The session list input has no `directory`, `project` or `subpath`, and the session create input no `location` (one project per engine).

### Model

- `Model` keeps `Ref`, `Info`, `Capabilities`, `Variant`, `Cost` and `Type`; `ID`, `VariantID`, `Family`, `Settings`, `Overlays`, `Compatibility` and `Event` are not ported.
- `Model.Info` has no `compatibility`, `package`, `settings`, `headers` or `body`, and `Model.Variant` no `settings`, `headers` or `body`: provider wire settings are not ours.
- `ModelEditor.provider` is absent: providers are not ours.

### Skill and servers

- `Skill.DirectorySource`, `Skill.UrlSource`, `Skill.EmbeddedSource`, `Skill.Source` and `Skill.Event` are not ported: conciv loads no skill folders or URLs and emits no skill events.

### Scope

- `experimental/scope.ts` ports `plugin/src/gui/scope.ts`.
- `Scope.make` carries its JSDoc on an explicit type of the `Scope` constant: `conciv/no-comments` keeps tagged doc blocks above declarations and type members only, not above an object literal's property.
- The source's three `//` comments are gone (zero comments in code).
- `fork` returns early after closing a fork made on a closed scope instead of `if ... else` (repo law: no `else` where a guard works).
- `close` orders the finalizers with `[...finalizers].toReversed()` where source calls `.reverse()` on the same fresh copy (lint `unicorn/no-array-reverse`); same order.

### App part (`experimental/`)

- Files follow `plugin/src/gui/`: `core.ts`, `declarations.ts`, `plugin.ts`, `context.ts`, `host-apis.ts`, `registries.ts`, `icon-name.ts`, `builtin.ts`; `index.ts` mirrors `gui/index.ts`. `host-apis.ts` (about 1700 lines) stays one file, as in source.
- Package exports `./experimental` and `./experimental/builtin` (source keeps `builtin.ts` out of its published build; conciv's built-in plugins live in other workspace packages, so it is exported).
- `Json` and `PluginOptions` are declared in `core.ts`, as in source (the same shape as the engine part's).
- `App` keeps the source's fields. `Context.app` is `App` (implemented), unlike the engine part's `App | undefined`.
- `Token` is `Contract<unknown>` only, `TokenValue` has no Ipc branch, `Live` and `Context.use` / `provide` speak of contracts only: no main process, so no `Ipc`, `IpcSpec`, `IpcClient`, `IpcImpl`, `IpcProvider`, `IpcMethod`, `IpcCallOptions`, `Caller`, `Ipc.define`, `Context.main`, `Definition.main`, `MainSetup`, `MainContext`.
- `BaseContext.client` is `ConcivClient` (the client of the plugin's own engine); no `t` or `plural`, and no `OS`, `Params`, `Messages`, `Catalog`, `Declarations.os`, `Declarations.i18n`.
- `Store` has three scopes, `global`, `project` (this repo, conciv's layered project settings) and `session`; `StoreDeclaration` and the `stores` handle take `project` as `global` (loaded before setup).
- Store schemas are Standard Schemas whose output is an object (`StandardSchemaV1<unknown, object>`, source `Schema.ConstraintCodec<object, unknown>`). Source reads the value type as Effect's `Schema.Type`, whose struct fields are readonly; a Standard Schema's output need not be, so `StoreType<S>` (added) is the schema's output made readonly all the way down, and `Persisted.update` still hands out a `Mutable` draft.
- `Store`, `Registry` and `Contract` carry their member JSDoc on an explicit type of the constant (the `Scope.make` rule above); the JSDoc on `update`'s `draft` parameter is dropped (the lint keeps tagged doc blocks above declarations and members only).
- `Plugin.Definition` has `setup` only and `WithSetup` is `{setup}` (no `main`).
- `Context` members by `docs/specs/plugins-ctx-audit.md` Table 1 and the spec's "Host APIs on ctx" table: `layout`, `sessions`, `screen`, `storage`, `servers`, `tabs`, `links`, `ui`, `toast`, `appearance`, `router`, `app`, `keybinds` implemented; `desktop` is `Desktop | undefined` as in source; `dialogs` is implemented with `open` and `active` (audit: have it) while `confirm`, `alert`, `prompt` and `select` are `T | undefined`; `system` is implemented with `copy` (ruling) while `save` and `openExternal` are `T | undefined`; `commands` and `attention` are `T | undefined` as whole members; absent: `main`, `t`, `plural`, `embeds`, `locale`, `workspaces` (with `Embeds`, `EmbedProps`, `Locale`, `Workspaces`).
- `ServerRef` and `Servers` are declared in `promise/servers.ts` (source: `gui/host-apis.ts`) and re-exported by `host-apis.ts`, so the engine part's types need no Solid; the browser source adds no members beyond `data` (see Not available yet).
- `SessionRef.location` is `Location.Ref` (opencode's `LocationRef`).
- `Composer`: `text` and `focus` are implemented by the spec table ("`ctx.screen` (`composer.attach`, `composer.focus`, text)") where the audit says "concept fits"; `attach` takes `file`, `note` and `quote` (the audit's UNSURE quote row is settled by the spec's Attachments section). `commentID` is `commentId`, `ComposerModel.providerID` / `modelID` are `providerId` / `modelId`. Mentions of subagent sessions are dropped from the JSDoc (subagents run inside the CLI).
- `SessionScreen` has `composer` only: `file` (`Files`, `FileState`, `FileContent`, `FileNode`, `LineRange`) and `comment` (`Comments`, `Comment`) are not ours (audit rows `screen.file.*`, `screen.comment.*`).
- `MountedSession` keeps `visit` and `directory`; `local` is declared, not implemented; `background` and `BackgroundTask` are absent (subagents run inside the CLI); `listedProject` is absent (no sidebar; audit row `layout.sidebar.opened`); `project` is not available yet.
- `Layout`: `side` and `sidebar` are absent: conciv has no side region (`apps/conciv/src/pane/status-bar.tsx:48`, a panel replaces the chat; `apps/conciv/src/routes/panel-height.ts:8`). This settles the audit's UNSURE `layout.side.width` row and drops `side.menu` with `MenuItem`. `project` is absent (one directory per engine).
- `Desktop`: no `os`, no `zoom`; `launch(path, position?)` takes a `{line, column?}` position in place of source's `app?` argument, backed by the engine's open-in-editor (`packages/contract/src/contract.ts:410`, `editor.open`).
- `StorageScope` keeps source's `{server, directory?}` scope; a conciv server is an engine, which runs in one project.
- `System.save` and `openExternal` JSDoc describe the web only (download, new tab).
- `Tabs.focus` is declared: the quick pane `focus` search param backs it (`apps/conciv/src/lib/quick-search.ts:15`), which settles the audit's UNSURE row; `Tabs.close` is declared by the spec table although the audit says "concept fits".
- `Ui` keeps every source component and prop type; examples use literal text in place of `ctx.t`, and conciv icon names.
- `IconName` is conciv's catalog, not opencode's: the 92 `lucide-solid/icons/<name>` names conciv imports today (`apps/conciv/src`, `packages/*/src`), since opencode's names (`bubble-5`, `outline-rotate-clockwise`, …) are its own artwork.
- `Command` JSDoc drops the command palette (conciv has none, audit Table 2); fields are source's.
- `Panel.region` is `'pane'` (ruling). Left out as side-column-only: `wide` (wider session minimum while the side region is open), `width` (side region width), `enter` (runs when the side region opens on the tab with its toggle). `mobile` and `MobileView` are declared (audit: have it).
- `SettingsPage.page` is `'general'` only and `group` is absent: conciv's settings have no Servers or About page (`apps/conciv/src/routes/panel.$sessionId_.settings.*.tsx`).
- `SlotMap` has four places: source's `session.header` and `window.bottom` (inputs verbatim), and conciv's `session.status` (`{screen, session}`) and `page.overlay` (`Record<string, never>`). The connect screen is no slot: try-it draws it as its `Server` entry's `cover` (see Server registry).
- The native ios app opens and closes the conciv widget and learns its open state and launcher position through the widget's existing page-facing events (the open/close commands and `conciv:panel-toggled`, `packages/extensions/ios/src/client.tsx:113`), which stay as they are: nothing is added to the plugin API for this and there is no `ctx.widget` (ruling). `Layout.hide` keeps opencode's meaning (it hides the pane of a visible panel tab) and does not open or close the widget.
- A `page.overlay` `Slot` item carries the conciv-only field `hides` (the widget hides while the overlay is up), because the host owns focus and layers as in opencode and this is the one thing a plugin states about its overlay; the plugin API has no layer registration, focus yielding or suppression.
- The `NoteCard` registry is conciv-only, shaped like `CodeBlock` (`plugin/src/gui/registries.ts:719`), so a plugin can draw the inside of its own composer notes (a recording as a player); it is keyed by the note's existing `origin` field (`origins`, as `CodeBlock` lists `languages`), so the note type gains no field.
- Not ported (spec "Not ported" list and its brief): `MenuItem` and its three item types, `TitlebarItem`, `Style`, `Theme` and its colour types.
- `builtin.ts` ports `onIdle` and adds the built-in `ToolCall` registry (ruling). `ToolCallProps` follows `CodeBlockProps`: `tool`, `id`, `input`, `result` (`success` with `output`, or `error`), `session`; it is what a finished call has in conciv's tool card props (`ToolCardProps`, `packages/protocol/src/tool-view-types.ts:43`, through `ToolCard`, `packages/extension/src/types.ts:55`), without the card's `ctx`, `addResult`, `durationMs` and `capture`. Not ported: the legacy-key migration helpers `BuiltinStoreFrom`, `BuiltinStoreDeclaration`, `BuiltinStore`, `BuiltinCommand`, `BuiltinPanel`, `BuiltinPanelTab`, `BuiltinSlotMap`, `BuiltinSlot`, `BuiltinStoreOptions`, `BuiltinStorage`, `BuiltinDesktop`, `BuiltinLayout`, `BuiltinLocale`, `BuiltinContext`, `builtinContext` (conciv has no shipped plugin keys to migrate), so `Entry.stores` is `Declarations.stores`; absent: `MainStoreFrom`, `BuiltinMainStorage`, `Lifecycle`, `BuiltinMainContext`, `builtinMainContext`, `BuiltinCatalog`, `builtinCatalog` (no main process, no i18n).
- `gui/file.ts`, `gui/review.ts`, `gui/browser.ts`, `gui/updater.ts` are not ported: they are contracts of opencode's own built-in plugins, and the audit has no row for any of them.

### Server registry

- `Server`, `ServerEntry` and `ServerState` are ported (ruling) so a plugin can offer an engine: try-it's pre-boot probe reports through `Server.ready` and an entry's `state` and `http.url` (today `connectGate.preflight`, `packages/embed/src/mount-impl.tsx:322`), and a later find updates the same entry (today `found(apiBase)`, `apps/conciv/src/routes/panel.connect.tsx:34`).
- ios re-points the widget through its entry: a new `http.url` while `ready`, and `reconnect` resolving the next address after the old connection drops (today the `conciv:rebind` event, `packages/extensions/ios/src/client.tsx:106`); `incompatible` is its `onIncompatible`.
- `ServerEntry.cover` is built: the host draws it while the entry is not `ready` (opencode `app/src/runtime/plugin/server-shell.tsx:34,63-71`), and try-it draws its connect pane through it (today the `connect` slot, `packages/extensions/try-it/src/client.tsx:21`); the page origin the pane shows is the browser part's own `window.location.origin`. Its input's `tab` is `string | undefined`: no tab is routed while the widget has no engine.
- `ServerEntry.connect` is declared, not implemented: opencode's host calls it when the user signs in to a server that waits for it (`app/src/session/server-unavailable-panel.tsx:57`, `app/src/runtime/plugin/servers.tsx:191`); try-it has no such action, its probe runs on its own (`packages/extensions/try-it/src/client/use-core-probe.ts:48`).
- `ServerEntry.row`, `ServerRow` and `ServerHealth` are absent: they draw a row on a Servers settings page, which conciv does not have (`SettingsPage.page` is `'general'` only).
- `http.password` JSDoc drops the fixed user name.

## Declared, not implemented

Each is typed `| undefined` (or optional) and always undefined in this version. The source marks each with the JSDoc
tag line `@remarks Not implemented yet. Always undefined in this version.`, and this list matches those lines.

- `Context.app`, `Context.experimental.generate`
- `model.transform`, `model.reload`
- `permission.hook`
- `session.generate`, `session.command`
- `location.project.id`, `location.project.canonical`
- `Tool.ToolContext.messageId`, `messageId` in the tool hooks
- `Model.Ref.providerId`, `Model.Ref.variant`
- `Model.Info`: `providerId`, `canonical`, `type`, `family`, `capabilities`, `variants`, `time`, `cost`, `status`, `limit`
- session info: `parentId`, `fork`, `projectId`, `outcome`, `time.created`, `time.busy`, `time.idle`, `time.viewed`, `time.archived`, `subpath`, `metadata`, `revert`
- session list input: `order`, `parentId`, `archived`
- session create input: every field
- session update input: `metadata`, `archived`
- session compact: input `id`, `delivery`; result (`SessionInboxCompaction`) `id`, `delivery`
- session interrupt input: `resume`
- `SessionIdle.background`
- permission request: `message`; permission reply input: `message`
- `SessionDeleted.durable.seq`
- app part `Context`: `commands`, `attention`
- `System`: `save`, `openExternal`
- `Dialogs`: `confirm`, `alert`, `prompt`, `select`
- `Desktop`: `reveal`, `installed`, `pick`
- `Layout`: `narrow`, `scroll`
- `Composer`: `setText`, `quotable`, `update`, `detach`, `focused`
- `MountedSession.local`
- `Tabs.move`
- `Links.exists`
- `Server.order`; `ServerEntry`: `label`, `listed`, `http.password`, `connect`, `remove`; `cover`'s `tab`; `reconnect`'s `password`

## Not available yet

Not declared: declaring them would mean inventing a conciv copy of an opencode type that conciv does not have.

- `Context.command` / `CommandDomain` (`plugin/src/promise/plugin.ts:33`): needs opencode's `PromptInput.Prompt` and `SessionInbox.Delivery` (`promise/command.ts:9-10`).
- the `prompt` and `context` session hooks (`plugin/src/promise/session.ts:200-201`): their event types need opencode's message and prompt types.
- `SessionDomain.prompt` and `SessionDomain.context` (`plugin/src/promise/session.ts:224,232`): same message and prompt types.
- `ServerRef.data` (`plugin/src/gui/host-apis.ts:25`): its type is opencode's Solid sync store of the whole server.
- `MountedSession.project` (`plugin/src/gui/host-apis.ts:721`): its type is opencode's `ProjectListOutput` entry with worktrees.
- `Slot` at `session.location.menu` and `session.panel.end` (`plugin/src/gui/registries.ts:885,894`): conciv's UI has no project menu slot and no side tab strip.
