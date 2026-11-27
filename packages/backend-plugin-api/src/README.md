# @conciv/backend-plugin-api source

The engine side of the conciv plugin API. The browser side is `@conciv/frontend-plugin-api`. The source keeps JSDoc
only where a block carries at least one tag (`@param`, `@returns`, `@example`, `@remarks` ...) above a declaration or member: those
blocks stay whole, prose-only doc blocks are not kept (`conciv/no-comments` with `keepDocComments`). A member marked as
not implemented (below) carries only its `@remarks` line.

## Entries

A plugin has up to three parts: an engine part (runs inside the conciv engine, adds tools, skills and RPC handlers),
an RPC contract shared by both sides (`Rpc.define` from `@conciv/protocol/schema/rpc`), and a browser part (runs in the
conciv widget, written against `@conciv/frontend-plugin-api`). This package holds the engine part.

### `@conciv/backend-plugin-api` (`promise/promise.ts`)

The engine part. `Plugin.define({id, setup})` returns its argument typed; `setup(ctx)` may be async and may return
a cleanup. `ctx` is `Plugin.Context`: the `tool`, `skill`, `session`, `rpc`, `storage`, `permission`, `model`,
`agent`, `event`, `plugin`, `location`, `options` and `servers` domains. The entry also exports
the `Agent`, `Tool`, `Skill`, `Model`, `Location` and `Rpc` namespaces and, by name, every exported type of the
engine-side files: the domain, editor, hook and handler types (`ToolContext`, `SessionIdle`, `RpcHandlers` ...), the
request and response types the domains use (`SessionInfo`, `GenerateTextInput` ...), and what an engine host builds a plugin's context from (`Registration`, `Transform`, `Hooks`, `Rule`, `Ruleset`). Tool and
RPC schemas are an Effect Schema, any Standard Schema (zod, Valibot, ArkType ...) or a raw JSON Schema object; store
schemas are Standard Schema only. A stored value that fails its store schema keeps every valid field; each failing field
takes the store's initial value.

```ts
import {z} from 'zod'
import {Plugin} from '@conciv/backend-plugin-api'
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

### `@conciv/backend-plugin-api/effect` (`effect/effect.ts`)

The engine part on Effect. `Plugin.define({id, effect})` returns its argument typed; `effect(ctx)` returns an `Effect` that runs in the plugin's scope, so what it registers is removed when the
scope closes. `ctx` has the same domains as the Promise `Plugin.Context`, each returning `Effect` or `Stream`;
`servers` keeps its Promise types for now. The entry also exports the storage types and the
`Agent`, `Location`, `Model`, `Provider`, `Rpc` and `Skill` namespaces. The subpaths `./effect/plugin`,
`./effect/permission`, `./effect/rpc`, `./effect/session` and `./effect/tool` carry the domain types the engine host
imports. `@conciv/backend-plugin-api/promise/adapter` holds `fromPromise`, which turns a Promise plugin into the Effect plugin
the host runs. The Effect Schema files are `@conciv/protocol`'s `./schema/<name>`. `effect` is a dependency of the SDK.

Rpc methods never ask. An operation that must ask is a tool, and gets no rpc method: the server plugin's restart
is the `server_restart` tool only. A plugin's contract module imports the namespace from `@conciv/protocol`:

```ts
import {z} from 'zod'
import * as Rpc from '@conciv/protocol/schema/rpc'

export const Tanstack = Rpc.define({
  id: 'tanstack',
  methods: {routes: {input: z.object({}), output: z.object({routes: z.array(z.string())})}},
  events: {buildError: {schema: z.object({message: z.string()})}},
})
```

### `@conciv/backend-plugin-api/host` (`host.ts`)

For the engine-side host only: `resolve(target)` finds a plugin's `server`, `rpc` and `experimental` entry files,
`load(entrypoint)` imports one, `packageId(target)` names it. Import it as a namespace:
`import * as Host from '@conciv/backend-plugin-api/host'`.

## Details

### Files and exports

- The browser part of the API is `@conciv/frontend-plugin-api`. The client pieces (the contract client, `makeRpc`, the shared event stream and its feed, `ConcivClient`, `ConcivEvent`, `ServerRef`) are `@conciv/client`'s `src/plugin/` (see that package's README); the schema files are `@conciv/protocol`'s `src/schema/`; `util/` holds `runtime-import.ts` and `runtime/import.node.ts`. `effect/` holds the entry files for the domains conciv declares (list in "Effect entry" below). The src root keeps `host.ts` (an entry) and `app.ts`, `permission.ts`, `storage.ts`, whose types `.` exports by name; `PluginOptions` is `@conciv/protocol/options`.
- `promise/promise.ts` also exports by name every exported type of `promise/*.ts` and the root `app.ts`, `permission.ts`, `storage.ts` that no namespace carries; there are no `./*` subpaths. `promise/generate.ts` and `promise/session-info.ts` hold the request and response types the domains use, hand-written (no contract procedure serves them). `promise/tool.ts`'s `Info` (the Promise tool, whose `execute` takes `ToolContext`) is `Info` at the root; the names `promise/tool.ts` re-exports from `@conciv/protocol` `schema/tool.ts` stay `Tool.*`.
- `@conciv/protocol` `schema/rpc.ts` does not re-export itself as `Rpc` (fallow would report that as a cycle): `promise/promise.ts` exports the namespace, and a contract module imports the file as a namespace. There is no `./rpc` entry.
- `Plugin.Context.servers` lists the running engines; `ServerRef` and `Servers` are `@conciv/client`'s. The engine side's list is `provideServersSource` (`packages/backend-defaults/src/engine/runtime/servers-source.ts`): the conciv home database's engine rows after a health check, refreshed when that database changes and every 10 s, built on a plugin's first read of `servers`. The declarations of `.` and `./host` import neither `solid-js` nor `vite`.
- `TokenUsage` is the generated client's `TokenUsageInfo`; there is no token usage schema file.
- `promise/promise.ts` exports `PluginOptions`, the storage types and the `Plugin` namespace; of the schema namespaces it re-exports only those conciv declares (`Agent`, `Location`, `Model`, `Rpc`, `Skill`), plus `Tool` (there is no separate schema package to import it from).
- `promise/promise.ts` exports `Registration`, `Transform` and `Hooks` (`promise/registration.ts`) and `Rule` and `Ruleset` (`@conciv/protocol` `schema/permission.ts`) by name: the engine host builds a plugin's context from them. `ToolHooks` stays private to `promise/tool.ts`.
- `@conciv/protocol` `schema/tool.ts` holds the Effect tool `Context`, with Effect's `progress` and `cancel`; `promise/tool.ts` adds the Promise `ToolContext` (without those two, plus `signal` and a Promise `progress`) and its `Info`.
- `@conciv/protocol` `schema/bundler.ts` holds the one declaration of a dev server diagnostic and of `BundlerBridge`, the dev server seam the engine reads (`defineBundlerBridge` throws without an id), and the `bundler.diagnostic` server event the engine publishes for each diagnostic of the attached dev server. `bundler.status` says whether one is attached; the bundler is fixed for the engine's life, so the host starts each plugin event subscription that asks for `bundler.status` with the current one, as each subscription starts with `server.connected`. Like `@conciv/protocol` `schema/rpc.ts` it does not re-export itself; callers import it as a namespace.
- Schema values are Effect Schema: `AssertInput` (root `permission.ts`) is a struct, and `Tool.Error` is an Effect Schema with `isToolError = Schema.is(Error)`; the Promise `permission.assert` takes `AssertInput`'s encoded form. The one zod check left is the private one of the `PLUGIN_RPC` and `PLUGIN_RPC_INTERNAL` errors in `makeRpc`.
- `AssertInput` has `fallback?: 'ask'` (ruling), on the Effect and the Promise `permission.assert` alike. It is the tool's own ask, a default just above the agent's built-in rules: the engine adds, for each resource of the call on its own, the rule `{action, resource: <that resource>, effect: 'ask'}` after the agent's rules only when the agent's answer for that action and resource is an allow from a rule whose action is `*` (the built-in allow-all of `Agent.Info.default`). Any rule that names the action (an agent rule a plugin or config pushes, a session rule, a saved "always allow" answer) beats it in either direction, a deny from anywhere still denies, an agent that does not exist still denies everything, and a plugin's `permission.hook('evaluate')` deny, which runs after every rule, still wins. The server plugin's `server_restart` passes `fallback: 'ask'` and pushes no agent rule, so the ask cannot go missing while plugins reload. A blanket rule `{action: '*', effect: 'allow'}` does not switch the tool's own ask off, because it cannot be told apart from the built-in allow-all; a user switches it off by naming the action, as in `{action: 'server_restart', resource: '*', effect: 'allow'}`. Before, it pushed `{action: 'server_restart', resource: '*', effect: 'ask'}` onto every agent from the `post` phase, last among the agent rules, so an agent rule for `server_restart` pushed by any other plugin never switched the ask off and an agent deny asked instead of denying; now that rule is obeyed (a gain, not a regression).
- `conciv/banned-vocabulary` is off for `packages/backend-plugin-api/src/**` (`.oxlintrc.json`) because the API's names are kept as they are, including terms that rule bans elsewhere.

### Effect entry (`effect/`, `promise/adapter.ts`)

- `effect/` holds `agent`, `event`, `model`, `permission`, `plugin`, `registration`, `rpc`, `session`, `skill`, `storage`, `tool` and the entry `effect`. Not declared: `aisdk`, `artifact`, `command`, `integration`, `mcp`, `provider`, `reference`, `shell`, `vcs`, `websearch`, `worktree` (domains conciv does not declare).
- Each domain declares inline the members conciv implements, or takes them from `@conciv/client` (`EffectRpcApi`, `EffectRpcClient`, `src/plugin/effect-rpc.ts`). So `agent` has no `reload`; `model` is `list` and `default` only (no `ModelEditor`, `transform`, `reload`); `skill` inlines `list`; `permission` inlines `list`, `get`, `reply`; `event` builds its output from the server events plus an `rpc.*` event.
- `plugin.ts` `Context` has only the declared domains (no `aisdk`, `command`, `credential`, `integration`, `mcp`, `generate`, `provider`, `reference`, `shell`, `vcs`, `websearch`, `worktree`, `experimental.terminal`, `experimental.artifact`) and adds conciv's `servers` with its Promise types. `session.ts` keeps the `prompt`, `context`, `compaction` and `experimental.idle` hooks and types its domain from the Promise client types. `storage.ts` adds `directory`. `effect.ts` re-exports the schema namespaces conciv has: `Agent`, `Location`, `Model`, `Provider`, `Rpc`, `Skill`.
- `promise/adapter.ts` encodes events as one union of the server events and a generic `rpc.*` event, with conciv's rpc event fields (`created`; `location` an optional `Location.Ref`), while the Effect `EventDomain` in `effect/event.ts` types an rpc event's `location` as `Location.PublicRef`, so for rpc events the type and the wire differ.
- OPEN: Widget first load grows 267 KB gzip; the way to get it back is subpath imports in the SDK schema files so effect's root loads lazily (measured path, not built). First load is 1,887,640 bytes gzip before and 2,161,184 after.

### Finding a plugin's parts (`host.ts`)

- `host.ts` does not re-export itself as `Host` (the `@conciv/protocol` `schema/rpc.ts` rule above): callers import it as a namespace, `import * as Host from '@conciv/backend-plugin-api/host'`.
- `Entrypoints` has `server`, `rpc` and `experimental`; no `tui`. Bundle file names are `plugin-experimental.*` and the package export is `./plugin-experimental`.
- A local plugin's own TypeScript loads on Node (`@conciv/backend-app-api` `src/plugin/source.node.ts`): Node's own type stripping loads its `.ts`, `.mts` and `.cts` files, so syntax that needs a transform (enums, namespaces with runtime code, parameter properties, import aliases) and `.tsx` files do not load: the plugin fails to load, and the engine log carries Node's error. Once Node's resolver fails, a relative import resolves by Bun's documented order for a local ESM `import` (https://bun.sh/docs/runtime/modules), less the `.tsx` and `.jsx` forms Node cannot load: `./x.js` to `x.ts`, `./x.mjs` to `x.mts`, then the path with `.mts`, `.ts`, `.mjs`, `.js`, `.cts`, `.cjs`, `.json` appended (an extensionless `./helper` too), then a folder's `index` with the same extensions. As on Bun, `./x.cjs` never maps to `x.cts`. Imports inside `node_modules` and the engine's own modules resolve as Node does.
- `resolveModule` and `importModule` are `util/runtime/import.node.ts` (the Node runtime), re-exported by `util/runtime-import.ts`; there is no Bun or workerd runtime and no runtime switch. No package export reaches them.
- An absolute specifier (a local directory's conventional file) resolves by a file lookup with the same extension list instead of Node's resolver: Node refuses every file under a `package.json` that does not parse, and the file lookup still finds the file.
- A resolved specifier must be a regular file; anything else is a miss, so the next candidate is tried (a package without `exports` that has a `server/` directory gives its root `index.js` as `server`). On Node, which conciv runs on, the resolver can return the directory, and loading would fail later.
- The manifest is read with zod (`name`, `exports`, both unknown); a `package.json` that is not a JSON object counts as missing. Error codes are read with zod instead of `"code" in error`; `host.ts` and `util/runtime/import.node.ts` each keep their own guard.
- The engine serves a plugin's `./plugin-experimental` as the text it read when it loaded the plugin, under the revision hashed from that text (`@conciv/backend-app-api` `src/core/plugin/module.ts`, `src/core/plugin.ts`), so a fetch between an edit and its reload never gets new code under the old revision. An edited bundle reaches the app once its reload has hashed its new revision.

### Names and types

- `ID` is spelled `Id` (`sessionId`, `messageId`, `requestId`, `parentId`, `modelId`, `providerId`, `workspaceId`, `shellId`, `partId`), and `packageId`.
- Branded ids (`Event.Id`, `Skill.Id`, `Skill.Name`, `Tool.CallId`, `Agent.Id`, `Agent.Name`, `Model.Id`, `Provider.Id`, `Permission.Id`) are Effect Schema brands, built with the schema's makers (`Skill.Id.make('deploy')`); session ids check the `ses_` prefix and `Session.Id.create()` makes one (`ses_` + descending).
- No `any`: `PluginOptions` values are `Json`; `Tool.Metadata` is `Readonly<Record<string, unknown>>`. `Tool.ValueSchema`, `InputValue` and `OutputValue` keep an `any`.
- `Types.Mutable` / `Types.DeepMutable` become a mapped type that drops `readonly` one level deep (the edited values are flat); `ModelEditor` hands out `Model.Info` as is.
- `Tool.Info.execute` uses method syntax, so a `Tool.Info<Input, Output>` is assignable to `Tool.Info` without `any`.
- `Tool.ValueSchema` is `Schema.Codec<A, any> | StandardSchemaV1<any, A> | JsonSchema.JsonSchema`, so `Tool.Info.input` and `output` and RPC method, error and event schemas take an Effect Schema, any Standard Schema or a raw JSON Schema object. Store schemas are Standard Schemas only.
- `Tool.Error` is an Effect Schema tagged struct; `toolError({message, error?, metadata?})` returns an `Error` carrying those fields, so a thrown tool error keeps its message and metadata in the host and carries its cause in `error`; `isToolError()` checks it.
- A failed tool call's `metadata` stays in the host and the model gets the message, but the session's recorded failure carries no metadata (as a successful result's metadata today). The recorded tool result has no slot a server tool can fill.
- `Tool.Freeform`, `Tool.FreeformFormat` and `Tool.Info.freeform` are absent: MCP takes JSON input only.
- `Tool.Context.messageId`, `ToolContext.messageId` and the tool hooks' `messageId` are `string | undefined` (calls arrive from the CLI over MCP).
- `Tool.Context.origin` (and `ToolContext.origin`), type `Tool.Origin` (`'hub' | 'chat'`), is conciv's: the engine sets `'hub'` for a call an outside (hub) agent made, from the call trace, and `'chat'` otherwise.
- `Permission` `source.messageId` accepts `undefined` for the same reason.
- RPC schemas (`@conciv/protocol` `schema/rpc.ts`): methods and events take `Tool.ValueSchema`, Effect Schema included; the `Portable*` types leave Effect Schema out.
- `Rpc.EventPayload` builds on `PayloadBase` (exported from `@conciv/protocol` `schema/event.ts` for it); there is no `Event.Payload` and no `durable` (RPC events are ephemeral). `RpcEventPayload` derives from the `rpc.*` member of `ConcivEvent`.
- `RpcCallOptions` is `RequestOptions` (`{signal}`), without `location` (one project per engine).
- `Conciv.make(raw, {server})` (`@conciv/client`, `src/plugin/client.ts`) is the one client builder, and `ConcivClient` is its return type. `ServerRef.client` and `BaseContext.client` are `ConcivClient`. It takes the contract client (`RpcClient`, built by `@conciv/client`: `makeRpcClient` over fetch, or the widget's WebSocket connection). It returns a plain object: the contract's 18 groups written out and checked against the contract at compile time (oRPC's client is a Proxy, so `{...raw}` would copy nothing), `rpc` as `Object.assign(makeRpc(raw, events, options.server), {call: raw.plugin.invoke})`, and `event`, `SharedEvents.make` over the contract's `event.subscribe`. `server` names the engine the client talks to (the widget passes its api base, the engine list each engine's): every rpc method's query key carries it as `['plugin', {server}, id, method, input?]`, so two engines never share a cached read; the engine's own in-process client uses `in-process`. oRPC hides its keepalive frames, so `onActivity` is called once per event received (ruling). The return type is written out (`Omit<RpcClient, 'event'> & {rpc, event}`) because the inferred one names contract types `tsc` cannot emit. `@conciv/protocol` is a dependency for the contract and its type.
- The shared stream has no reconnect loop of its own: it uses the transport `@conciv/client` already has. Over the engine socket oRPC's `RetryLinkPlugin` reopens `event.subscribe` once the socket is open again (each new subscription starts with `server.connected`), waits for trust after an `UNAUTHORIZED` refusal, and the socket driver drops a socket that sends no frame for 45 s while a stream is open. The status has three values, read through `ConcivClient.connection` (`status()` plus `on(listener)`); the idle timeout is the socket's `idleTimeoutMs` timing, not a `Conciv.make` option.
- One of those groups is `experimental`, which holds the session terminal: `ctx.client.experimental.persistentPty.create` opens the session's terminal (or returns the one already open), `remove` closes it, `output` streams it (replay from a cursor, a meta frame with the absolute cursor, then live output), and `write`, `resize` and `inject` drive it.
- The one cast in the plugin client's conciv-written code: `@conciv/client`'s `src/plugin/client.ts` yields each received envelope `as ConcivEvent`: the contract validates the envelope, the precise union is the SDK's type (ruling). No lint rule flags it, so it carries no directive.
- `ServerRef` fields: `name` is the folder name of the engine's project root; `url` is the engine's bare origin and there is no `password`: the engine's client carries the engine token from the home database row itself; `local` is always true (an engine binds 127.0.0.1 only); `connected` is whether the last health check reached the engine; `compatible` is true until a call to that engine fails because the engine is too old for this contract (a missing procedure or an answer outside the contract, `engineTooOld` in `@conciv/client`), then false until that engine's home database row changes, e.g. it restarts.

### Context members

- Absent, not ours: `aisdk`, `credential`, `integration`, `mcp`, `provider`, `reference`, `shell`, `vcs`, `websearch`, `worktree`, `experimental.terminal`, `experimental.artifact`. Also absent: top-level `generate` (`experimental.generate` replaces it).
- Added by ruling: `servers`, `storage.directory`.
- `servers` (engine side) lists every running conciv engine on the machine; `get(id)` is `undefined` for an id not listed, and the same ref for the same id. Before the first health check after a plugin's first read, `list()` is empty.
- `app` is typed `App | undefined`; the engine always sets it: `name` is `conciv`, `version` is the `@conciv/backend-defaults` package version, `channel` is `unknown` (`packages/backend-defaults/src/engine/runtime/plugin-runtime.ts` `provideApp`, `App.make`).
- `plugin.list`, `skill.list`, `model.list`, `model.default`: no `location` input (one project per engine); every domain method's request options are `{signal}` only (no `headers`, no `onActivity`).

### Agent and events

- `agent` is declared for permission rules only (ruling; conciv runs one agent per session): `AgentDomain` has `transform` alone, without `list`, `get` and `reload`; `AgentEditor` has `list` alone, without `get`, `default`, `update` and `remove`.
- `Agent.Info`, `Agent.Color`, `Agent.Info.default` and `Agent.Event` (`agent.updated`) are declared in full; conciv's engine reads only `id`, `name` and `permissions` (the other agent settings are the CLI's).
- The agent editor's `Types.DeepMutable<Agent.Info>` is a mapped type that drops `readonly` from the info and from each permission rule.
- `ConcivEvent` is what conciv's bus publishes plus `server.connected` and `rpc.*`: `agent.updated`, `skill.updated`, `plugin.updated`, `bundler.diagnostic` (conciv's own: each diagnostic of the attached dev server), `bundler.status` (conciv's own: whether a dev server is attached), `permission.asked`, `permission.replied`, `session.created`, `session.renamed`, `session.deleted`, `session.execution.started`, `.succeeded`, `.failed` and `.interrupted`, `session.instructions.updated`, each a generated member type, with field names and values as the engine sends them (`session.execution.failed` carries `error` as a string, the host's `schema/session-event.ts`): `sessionID` on session events, `sessionId` / `requestId` on permission events (the host's `@conciv/protocol` `schema/permission.ts`). `id` is a string, `metadata` `Record<string, unknown>`, the durable members carry `durable: {aggregateID, seq, version: 2}`.
- `server.connected` is in `ConcivEvent` as `V2EventServerConnected`; `EventDomain`'s event type excludes it.
- The engine's event stream (`event.subscribe`) carries what conciv's bus publishes: `agent.updated`, `session.created`, `session.renamed`, `session.deleted`, `session.instructions.updated`, `session.inbox.enqueued`, `session.inbox.delivered`, `session.execution.started`, `.succeeded`, `.failed` and `.interrupted`, `permission.asked`, `permission.replied`, `plugin.updated`, `skill.updated`, `rpc.*`, plus `server.connected` first and a `server.heartbeat` frame every 15 s by default, which the client counts as activity and never hands to a reader. These server events are not carried yet, each added when its feature publishes it: `location.shutdown`, `models-dev.refreshed`, `credential.updated`, `credential.switched`, `integration.updated`, `provider.updated`, `model.updated`, `session.agent.selected`, `session.model.selected`, `session.moved`, `session.metadata.updated`, `session.permissions`, `session.viewed`, `session.archived`, `session.unarchived`, `session.usage.updated`, `session.forked`, `session.synthetic`, `session.skill.activated`, `session.shell.*`, `session.step.*`, `session.text.*`, `session.reasoning.*`, `session.tool.*`, `session.retry.scheduled`, `session.compaction.*`, `session.revert.*`, `session.status`, `session.idle`, `filesystem.changed`, `reference.updated`, `project.updated`, `worktree.updated`, `worktree.resolved`, `command.updated`, `config.updated`, `pty.*`, `persistent-pty.*`, `shell.*`, `form.*`, `websearch.updated`, `artifact.updated`, `tui.*`, `installation.updated`, `installation.update-available`, `vcs.branch.updated`, `mcp.status.changed`, `mcp.resources.changed`, `experimental.mcp.event`. `session.viewed`, `.archived`, `.unarchived` and `.synthetic` have definitions in the host but no publisher yet, and `session.inbox.cancelled` and `session.inbox.delivery.changed` have their definitions and projectors, published by the inbox's `cancel`, `steer` and `queue`, which nothing calls yet.
- `SubscribeOptions` has `onActivity`, and `@conciv/client`'s `src/plugin/shared-events.ts` holds `SharedEvents.make`; `Conciv.make` wires it as `client.event`.

### Session

- `session.hook` is `ModelHooks<SessionHooks>` with `ModelHookOptions` (`providerId`).
- `SessionHooks` has `prompt`, `context`, `compaction` and `experimental.idle` only; `fork`, `generate`, `title`, `experimental.model.resolve`, `model.request`, `http.request`, `http.response`, `experimental.ws.handshake`, `experimental.ws.send`, `experimental.ws.receive` and `retry` are not ours, with their event types.
- `experimental.idle` runs when a run completes and no session inbox input is waiting (waiting input, such as a finished page queue's `session.synthetic` notice, wakes the session, whose completion runs it instead); it does not run after a stopped or failed run; a failing hook is shown to the user as an error after the completed answer (the run stays completed and its answer stays), the plugin is not disabled, the later `experimental.idle` callbacks of that trigger are skipped, the next run triggers again; no second hook exists (ruling: whiteboard drafts from such a turn stay drafts). A hook that waits on its own session (`ctx.session.wait({sessionId})`) waits until that session is stopped or the engine closes: the run it is the end of is still running; Stop (and `ctx.session.interrupt`) then interrupts the hook and answers that it stopped something, and an interrupted hook is not a failure (the run stays completed with no error).
- `prompt` (`SessionPrompt`) runs once per new user message (a resent message whose id is already stored does not run it again), after `Plugin.awaitActivation`, before the message is stored and before the agent is called; hooks run in registration order, one after the other, on one event. When the hooks leave the event equal in value to the one they were given (compared deep, by value, against a copy taken before the first hook; no hook registered counts as unchanged), the user message is stored and sent exactly as it arrived, part for part, part metadata included. When a hook changed it, the event they leave is rebuilt into the stored user message: one text part with `prompt.text` (the message's text parts joined with newlines), then one part per file; part metadata is not carried over, and files are `data:` URIs only. Its `PromptInput` types (`PromptInput`, `PromptInputFileAttachment`, `PromptInputSkillAttachment`, `PromptAgentAttachment`, `PromptFileSource`) are plain TypeScript and already mutable. `messageId` is a `string`: conciv's message ids are the client's, without a `msg_` prefix. Stopping the turn while a hook still runs ends it with nothing stored.
- Members of `prompt`'s event conciv does not fill: `prompt.files[].name`, `source`, `description` and `mention` (a composer attachment reaches the engine as a bare `image` or `document` part with a `data:` URI, its file name stays in the browser), `prompt.agents` and `prompt.skills` (the composer names neither on the wire: a message carries only text, image and document parts), and `delivery`, which is always `'queue'` (the widget sends a message after the running turn ends; a value a hook sets is not read). `metadata` is filled: it is the user message's metadata as the client sent it (absent when it sent none; a message sent with notes carries `displayText`, `comments` and `attachments` keys at its top level), and when a hook changed the event, the `metadata` it leaves is stored on the user message.
- A file a hook adds must be a `data:<mime>;base64,<payload>` URI: an image mime becomes an `image` part, any other a `document` part, checked against the chat part schema. Any other URI (`file:`, `media:`) fails the prompt with `Unsupported attachment URI`: there is no file reading, size cap, mime sniffing or image resizing.
- `context` and `compaction` (`SessionContext`, `SessionCompaction`) run before every model request of a turn (TanStack AI's `beforeModel` config phase, once per model call of `chat()`), after `Plugin.awaitActivation`, hooks in registration order on one event; `compaction` for a compact turn, `context` for every other turn. The event is the request the turn hands the adapter: `system` (one `SystemPart` per system prompt: the configured system prompt, the plugin instructions and the code-mode preface), `messages` (the provider messages, TanStack AI's `ModelMessage`, through `@conciv/protocol/chat-message-types`), `options` (the harness's `modelOptions`, a fresh copy per request), `tools` (each offered tool's `description` and JSON Schema `input`, keyed by name), `model` (the adapter's model, the harness id as `providerId`, the session's effort as `variant`) and `agent`. What the hooks leave is what the adapter gets: the system prompts, the provider messages (the stored conversation is not changed), the `modelOptions`, and the tools, matched to the offered tool by identity, then by name; a definition that matches neither is dropped, a moved definition renames its tool, an edited `description` or `input` replaces the tool's (an unchanged `input` keeps the tool's own schema and its validation), and a removed tool is neither offered nor run (the agent loop runs only the tools of the request). Each request starts again from the turn's own values, so edits do not pile up across the model calls of one turn. A stop interrupts the hooks as `prompt`'s: an Effect hook is interrupted, a Promise hook is abandoned and runs on until it settles, the harness is not called, and the run ends stopped, not failed. `SystemPart` is a plain interface, with no `cache` and no `SystemPart.make` static: a plugin pushes `{type: 'text', text}`; a part's `metadata` does not reach the request. `options` is `Record<string, unknown>`; the hook option `providerId` is not read. `SessionCompaction.result`: a compaction hook that sets it replaces the compaction model request; the harness is not called, `summary` is stored as the compaction's assistant text (the run's one message, stamped as the compaction), and `tokens` (`TokenUsageInfo`) are recorded as the run's usage. The engine carries the result in that model call's own config and the wrapped adapter answers it (`packages/backend-defaults/src/ai/model-request.ts` `answeredAdapter`). The result has no `native` (a provider replacement window; conciv's CLIs keep their own transcripts) and no `metadata` (the stored message keeps only TanStack's and conciv's stamps, so it would be dropped). For the CLI harnesses (Claude Code, Codex, OpenCode, the ACP ones) the request is one CLI run, which runs its own agent loop: the hooks run once per run, not before the CLI's own model calls; `system` reaches the CLI as its appended system prompt (Claude Code) or as text before the prompt (the others); `tools` are the TanStack tools the adapter bridges to the CLI over MCP, so a removed tool is not listed to the CLI; `messages` reach the CLI as its prompt, and a resumed CLI session is sent only from the last user message; `options` reach the adapter as `modelOptions`, which each adapter reads by its own keys (`permissionMode`, `sessionId`, ...) and ignores otherwise.
- `SessionIdle.background` is always empty: the engine runs the idle hooks with `background: []` (`packages/backend-defaults/src/engine/app.ts:644`), even while the session has background jobs (`ctx.job`).
- `session.create` fails with `session.AGENT_NOT_FOUND` (its `internal.sessionId` the session id) for an agent other than `build`, and with `Session.NotFoundError` for a model the session's harness does not list (or lists disabled, or without the given `variant`), as `switchAgent` and `switchModel` do; nothing is created. The errors' `sessionId` is the supplied `id`, or the id the call minted for the new session.
- `session.create`'s `id` is `string | undefined` (a `null` id is rejected). The Promise adapter decodes the `id` only, with the host's Session id schema, and passes the rest of the input through untouched, so a bad id fails the call before the session key's `create` runs (there is no schema for the rest). An `id` naming a live session returns that session unchanged. An `id` naming a deleted session is refused with `Session.NotFoundError` (the same error `session.get` answers for it), and the deleted session is left as it was, so it can still be restored; an `id` naming no session at all creates a new session under that id.
- The other session calls (`list`, `get`, `remove`, `switchAgent`, `switchModel`, `compact`, `interrupt`, `update`, `wait`, `instructions.entry.list`, `put`, `remove`) validate their input at the Promise adapter: the session id with the host's Session id schema, and each field the call reads with its schema (`list` `limit` a positive whole number, `search` a string, `archived` a boolean; `switchAgent` `agent`; `switchModel` `model` a model reference; `compact` `id` a message id; `interrupt` `resume` a boolean; `update` `title` a string, `metadata` JSON values by key, `permissions` a permission ruleset, `archived` a boolean; an instruction entry's `key` and JSON `value`). A bad value fails the call with a `SchemaError` before the session key runs; keys a call does not declare pass through untouched. Not validated, because conciv has no schema for them: `list`'s `order`, `parentId` (an id or null) and `cursor` (conciv's cursor is its own JSON, which the key refuses with `session.INVALID_LIST_CURSOR`), and `compact`'s `delivery`; the key reads none of them except `cursor`. The SDK types are wider than these checks: a `limit` that is not a positive whole number and a compact `id` that does not start with `msg_` are typed `number` and `string` but refused.
- `SessionDomain` has no `move` (not ours: one directory per engine).
- The session list input has no `directory`, `project` or `subpath`, and the session create input no `location` (one project per engine).
- `interrupt`'s `resume` is accepted and does nothing more than the stop: conciv has no steering inbox, so `resume` has nothing to wake.

### Model

- `Model` keeps `Id`, `VariantId`, `Ref`, `Family`, `Type`, `Settings`, `Overlays`, `Capabilities`, `Cost`, `Variant` and `Info`; there is no `Event`, and `Compatibility` is not exported (it types `Info.compatibility` only).
- `Model.Ref.providerId` is the session's harness id (`claude`, `codex` ...), as `Model.Info.providerId` and `SessionInfo.model` are (a model's provider is the harness); it is typed `string | undefined`. `Model.Ref.variant` is the session's reasoning effort, absent when none is set (`packages/backend-defaults/src/engine/runtime/plugin-sessions.ts`). A `Model.Ref` whose `providerId` is not the session's harness answers not-found.
- `Model.Info` declares `compatibility`, `package`, `settings`, `headers` and `body`; conciv fills none of them (provider wire settings are not ours).
- `Model.Variant` types its records `Record<string, unknown>`; conciv fills only `settings.effort` today, from the harness's efforts (`packages/backend-defaults/src/engine/runtime/plugin-runtime.ts`, `variants` from `model.efforts`).
- `ModelEditor.provider` is absent: providers are not ours.

### Skill and servers

- `Skill.DirectorySource`, `Skill.UrlSource`, `Skill.EmbeddedSource`, `Skill.Source` and `Skill.Event` are declared; a plugin adds skills through `ctx.skill.transform` and never names a source.
- Where skills come from, besides plugins: the engine's `conciv.config.skill` plugin scans `skill/` and `skills/` in conciv's home and in the project's `conciv/` folder, in that order, so a project skill replaces a home skill of the same id. A skill is a folder holding `SKILL.md` (searched six folders deep) or a loose `*.md` at the root of one of those folders; its id is the folder (or file) name. Frontmatter `name`, `description`, `disable-model-invocation` and `metadata["conciv/autoinvoke"]` are read, with `js-yaml`. A change in a watched folder rescans after 100 ms. Without the native watcher binding, a change inside an existing skills folder is not seen until the engine restarts; adding the folder is seen.
- Built-in skills: the engine's `conciv.skill` plugin adds `conciv` (points the agent at conciv's documentation) and `report` (how to report a conciv issue with the GitHub CLI), at `skill://conciv/SKILL.md` and `skill://report/SKILL.md`. Their text is conciv's own, kept in `skill/conciv.md` and `skill/report.md` beside the plugin. The report skill ends with a snapshot taken when it is registered: conciv's version, Node, the OS and the configured plugins (sorted, or `None found in config`); it has no terminal or shell lines (they would read environment variables, and the snapshot reads none), and no harness line (the harness is chosen per session).
- Skills are not found by a walk up from the project to more `conciv/` folders, in a managed system directory, or through a `skills` config key (paths and URLs), and nothing rescans on `config.updated` (conciv has no config service). `.claude/skills` and `.agents/skills` are not scanned: the agent CLIs conciv runs load those folders themselves, so listing them again would offer every such skill twice.

### Files outside this package

- TanStack's code mode runs programs, so `toolExpression` (`packages/backend-defaults/src/codemode/tool-runtime.ts`) answers `external_x_y`: in TanStack's code mode a tool is a global function and there is no `tools` object.
- A discovered plugin's mtime leaves its browser bundle out (`packages/backend-app-api/src/core/config/plugin/source.ts`), so a bundle edit reloads the browser part only.

## Declared, not implemented

Each is typed `| undefined` (or optional) and always undefined in this version. Each carries the JSDoc tag line
`@remarks Not implemented yet. Always undefined in this version.`, and this list matches those lines.

- `Context.experimental.generate`
- `model.transform`, `model.reload`
- `permission.hook`
- `session.generate`, `session.command`
- `Tool.ToolContext.messageId`, `messageId` in the tool hooks
- `Model.Info`: `canonical`, `type`, `family`
- session info: `parentId`, `fork`, `projectId`, `outcome`, `time.busy`, `time.idle`, `time.viewed`, `time.archived`, `subpath`, `revert`
- session list input: `order`, `parentId`, `archived`
- session create input: `parentId`
- session update input: `archived`
- session compact: input `id`, `delivery`; result (`SessionInboxCompaction`) `id`, `delivery`
- permission request: `message`; permission reply input: `message`

## Not available yet

Not declared: each needs a type conciv does not have.

- `Context.command` / `CommandDomain`: needs a `PromptInput.Prompt` and a `SessionInbox.Delivery` type.
- `SessionDomain.prompt` and `SessionDomain.context`: the same message and prompt types.
- `ServerRef.data`: its type would be a Solid sync store of the whole server.
