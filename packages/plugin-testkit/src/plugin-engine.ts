import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import {dirname, join, resolve} from 'node:path'
import {openDb} from '@conciv/db'
import {SqliteClient} from '@effect/sql-sqlite-node'
import {Effect, FileSystem, Layer, type PlatformError, Ref, Schema, Stream} from 'effect'
import {AbsolutePath} from '@conciv/plugin/schema/schema'
import {Tool as ToolSchema} from '@conciv/plugin/schema/tool'
import {
  Agent,
  Bus,
  ConfigAgentPlugin,
  ConfigPlugin,
  ConfigPluginSource,
  ConfigPolicy,
  Database,
  type Event,
  Global,
  Instance,
  Instructions,
  type LayerNode,
  InstructionEntry,
  Location,
  ManagedPolicy,
  Model as HostModel,
  Node,
  Permission,
  Plugin,
  PluginHost,
  PluginSupervisor,
  Rpc,
  Session,
  SessionErrors,
  SessionEvent,
  SessionInbox,
  SessionSchema,
  SessionSynthetic,
  SkillInstructions,
  Tool,
} from '@conciv/plugin-host'
import {pluginDirectory} from './plugin-directory.js'

export * as PluginEngine from './plugin-engine.js'

export interface Options {
  readonly plugins?: readonly ConfigPlugin.Plugin[]
  readonly permissions?: Permission.Ruleset
  readonly policies?: readonly ConfigPolicy.Info[]
  readonly directory?: string
}

type CreateInput = Omit<Parameters<Session.Interface['create']>[0], 'location' | 'parentId'>

export interface ToolFailure {
  readonly tool: string
  readonly message: string
}

export interface EngineTool {
  readonly call: (input?: unknown) => Effect.Effect<unknown, ToolSchema.Error, Instance.Services>
  readonly failure: (input?: unknown) => Effect.Effect<ToolFailure, never, Instance.Services>
}

export interface EngineSession {
  readonly id: SessionId
  readonly tool: (name: string) => EngineTool
}

type SessionInfo = Effect.Success<ReturnType<Session.Interface['get']>>

type Compaction = Effect.Success<ReturnType<Session.Interface['compact']>>

type SessionId = SessionInfo['id']

const DEFAULT_PAGE_SIZE = 30

const MODEL = HostModel.Info.default(
  HostModel.Info.fields.providerId.make('test'),
  HostModel.Info.fields.id.make('test-model'),
)

const models = Layer.succeed(
  HostModel.Service,
  HostModel.Service.of({available: () => Effect.succeed([MODEL]), default: () => Effect.succeed(MODEL)}),
)

const sessionsLayer = (directory: string) =>
  Layer.effect(
    Session.Service,
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const inbox = yield* SessionInbox.Service
      const rows = yield* Ref.make<ReadonlyMap<SessionId, SessionInfo>>(new Map())
      const get = (sessionId: SessionId) =>
        Ref.get(rows).pipe(
          Effect.flatMap((all) => {
            const found = all.get(sessionId)
            return found === undefined
              ? Effect.fail(SessionErrors.makeNotFoundError({sessionId}))
              : Effect.succeed(found)
          }),
        )
      const update = (sessionId: SessionId, change: (session: SessionInfo) => SessionInfo) =>
        get(sessionId).pipe(
          Effect.flatMap((session) =>
            Ref.update(rows, (all) =>
              new Map(all).set(sessionId, {...change(session), time: {...session.time, updated: Date.now()}}),
            ),
          ),
        )
      const synthetic = SessionSynthetic.make({get}, inbox, () => Effect.void)
      return Session.Service.of({
        get,
        list: (input) =>
          Ref.get(rows).pipe(
            Effect.map((all) => {
              const term = input?.search?.trim().toLowerCase() ?? ''
              const data = [...all.values()]
                .filter((session) => term === '' || (session.title ?? '').toLowerCase().includes(term))
                .toSorted((left, right) => right.time.updated - left.time.updated)
                .slice(0, input?.limit ?? DEFAULT_PAGE_SIZE)
              return {data, cursor: {}}
            }),
          ),
        create: Effect.fn('PluginTest.sessions.create')(function* (input) {
          const id = input.id ?? SessionSchema.Id.create()
          const known = (yield* Ref.get(rows)).get(id)
          if (known !== undefined) return known
          if (input.agent !== undefined && input.agent !== null && input.agent !== Agent.defaultId)
            return yield* Effect.fail(
              SessionErrors.makeAgentNotFoundError({sessionId: id, agent: Agent.Id.make(input.agent)}),
            )
          const now = Date.now()
          const session: SessionInfo = {
            id,
            projectId: undefined,
            agent: Agent.defaultId,
            model: {id: MODEL.id, providerId: MODEL.providerId},
            cost: 0,
            tokens: {input: 0, output: 0, reasoning: 0, cache: {read: 0, write: 0}},
            time: {created: now, updated: now},
            location: {directory: AbsolutePath.make(directory)},
            ...(input.title === undefined || input.title === null ? {} : {title: input.title}),
            ...(input.metadata === undefined || input.metadata === null ? {} : {metadata: input.metadata}),
            ...(input.permissions === undefined || input.permissions === null ? {} : {permissions: input.permissions}),
          }
          yield* Ref.update(rows, (all) => new Map(all).set(id, session))
          yield* bus.publish(
            SessionEvent.Created,
            session.title === undefined ? {sessionID: id} : {sessionID: id, title: session.title},
          )
          return session
        }),
        remove: (sessionId) =>
          get(sessionId).pipe(
            Effect.andThen(Ref.update(rows, (all) => new Map([...all].filter(([id]) => id !== sessionId)))),
            Effect.andThen(bus.publish(SessionEvent.Deleted, {sessionID: sessionId})),
            Effect.asVoid,
          ),
        switchAgent: ({sessionId, agent}) =>
          get(sessionId).pipe(
            Effect.andThen(
              agent === Agent.defaultId
                ? Effect.void
                : Effect.fail(SessionErrors.makeAgentNotFoundError({sessionId, agent: Agent.Id.make(agent)})),
            ),
          ),
        switchModel: ({sessionId, model}) => update(sessionId, (session) => ({...session, model})),
        rename: ({sessionId, title}) =>
          update(sessionId, (session) => ({...session, title})).pipe(
            Effect.andThen(bus.publish(SessionEvent.Renamed, {sessionID: sessionId, title})),
            Effect.asVoid,
          ),
        setMetadata: ({sessionId, metadata}) => update(sessionId, (session) => ({...session, metadata})),
        setPermissions: ({sessionId, permissions}) => update(sessionId, (session) => ({...session, permissions})),
        compact: (input) =>
          get(input.sessionId).pipe(
            Effect.as<Compaction>({
              id: undefined,
              sessionId: input.sessionId,
              time: {created: Date.now()},
              type: 'compaction',
              payload: {},
              delivery: undefined,
            }),
          ),
        synthetic,
        wait: (sessionId) => get(sessionId).pipe(Effect.asVoid),
        interrupt: () => Effect.succeed(false),
      })
    }),
  )

const sessionsNode = (directory: string) =>
  Node.makeLocationNode({
    service: Session.Service,
    layer: sessionsLayer(directory),
    deps: [Bus.node, SessionInbox.node],
  })

const permissionSessionsNode = Node.makeLocationNode({
  service: Permission.PermissionSessions,
  layer: Layer.effect(
    Permission.PermissionSessions,
    Effect.map(Session.Service, (sessions) =>
      Permission.PermissionSessions.of({
        get: (sessionId) =>
          sessions.get(sessionId).pipe(
            Effect.map((session) => ({
              agent: Agent.Id.make(session.agent ?? Agent.defaultId),
              permissions: session.permissions,
            })),
            Effect.orElseSucceed(() => undefined),
          ),
      }),
    ),
  ),
  deps: [Session.node],
})

const instructionEntriesNode = Node.makeLocationNode({
  service: InstructionEntry.Service,
  layer: Layer.effect(
    InstructionEntry.Service,
    Effect.gen(function* () {
      const entries = yield* Ref.make<ReadonlyMap<string, InstructionEntry.Info>>(new Map())
      const id = (sessionId: SessionId, key: InstructionEntry.Key) => `${sessionId}:${key}`
      return InstructionEntry.Service.of({
        list: (sessionId) =>
          Ref.get(entries).pipe(
            Effect.map((all) =>
              [...all].filter(([entry]) => entry.startsWith(`${sessionId}:`)).map(([, info]) => info),
            ),
          ),
        put: ({sessionId, key, value}) =>
          Ref.update(entries, (all) => new Map(all).set(id(sessionId, key), {key, value})),
        remove: ({sessionId, key}) =>
          Ref.update(entries, (all) => new Map([...all].filter(([entry]) => entry !== id(sessionId, key)))),
      })
    }),
  ),
  deps: [],
})

function locate(target: string): string {
  const external = target.startsWith('-') || target.includes('*') || target.startsWith('conciv.')
  return external ? target : pluginDirectory(target)
}

function locatePlugin(entry: ConfigPlugin.Plugin): ConfigPlugin.Plugin {
  if (typeof entry === 'string') return locate(entry)
  return [locate(entry[0]), entry[1]]
}

const locationNode = (directory: string) =>
  Node.makeLocationNode({
    service: Location.Service,
    layer: Layer.succeed(
      Location.Service,
      Location.Service.of(
        Schema.decodeSync(Location.Info)({directory, project: {id: directory, directory, canonical: directory}}),
      ),
    ),
    deps: [],
  })

const instance = Effect.fn('PluginEngine.instance')(function* (options: Options) {
  const files = yield* FileSystem.FileSystem
  const root = yield* files.makeTempDirectoryScoped({prefix: 'conciv-plugin-test-'})
  const directory = options.directory === undefined ? join(root, 'project') : resolve(options.directory)
  yield* files.makeDirectory(directory, {recursive: true})
  const db = yield* openDb(join(root, 'state'))
  return Instance.layer({
    replacements: [
      Location.node.replace(locationNode(directory)),
      Global.node.replace(
        Global.layerWith({
          cache: join(root, 'home', 'cache'),
          config: join(root, 'home'),
          state: join(root, 'home', 'state'),
          log: join(root, 'home', 'log'),
        }),
      ),
      Database.node.replace(Database.configuredClient(Layer.succeed(SqliteClient.SqliteClient, db.$client))),
      ConfigPluginSource.configuredNode.replace(
        Layer.succeed(ConfigPluginSource.ConfiguredPlugins, (options.plugins ?? []).map(locatePlugin)),
      ),
      ConfigAgentPlugin.configuredNode.replace(
        Layer.succeed(ConfigAgentPlugin.ConfiguredPermissions, options.permissions ?? []),
      ),
      ManagedPolicy.configuredNode.replace(Layer.succeed(ManagedPolicy.ConfiguredPolicies, options.policies ?? [])),
      PluginHost.serversNode.replace(Layer.succeed(PluginHost.ServersSource, {list: () => [], get: () => undefined})),
      PluginHost.bundlerNode.replace(Layer.succeed(PluginHost.BundlerSource, undefined)),
      PluginHost.editorNode.replace(Layer.succeed(PluginHost.EditorSource, () => undefined)),
      HostModel.node.replace(models),
      Session.node.replace(sessionsNode(directory)),
      Permission.sessionsNode.replace(permissionSessionsNode),
      InstructionEntry.node.replace(instructionEntriesNode),
    ],
  })
})

export function layer(options: Options = {}): Layer.Layer<Instance.Services, LayerNode.Error<typeof Instance.graph>> {
  return PluginSupervisor.layer.pipe(
    Layer.provideMerge(Layer.unwrap(instance(options).pipe(Effect.orDie, Effect.provide(NodeFileSystem.layer)))),
  )
}

const callTool = Effect.fn('PluginEngine.tool')(function* (sessionId: SessionId, name: string, input: unknown) {
  yield* Plugin.awaitActivation
  const tools = yield* Tool.Service
  const snapshot = yield* tools.snapshot()
  const agent = Agent.defaultId
  const id = ToolSchema.CallId.make(`call_${crypto.randomUUID()}`)
  const context = {sessionId, agent, messageId: undefined, id, progress: () => Effect.void}
  const result =
    snapshot.codeMode?.tools.has(name) === true
      ? yield* snapshot.codeMode.execute(name, input, context)
      : yield* snapshot.execute({sessionId, agent, messageId: undefined, call: {type: 'tool-call', id, name, input}})
  return result.output ?? result.content
})

const failedTool = <R>(name: string, call: Effect.Effect<unknown, ToolSchema.Error, R>) =>
  call.pipe(
    Effect.matchEffect({
      onSuccess: (output) =>
        Effect.die(new Error(`the tool ${name} answered instead of failing: ${JSON.stringify(output)}`)),
      onFailure: (error): Effect.Effect<ToolFailure> => Effect.succeed({tool: name, message: error.message}),
    }),
  )

export const session: (input?: CreateInput) => Effect.Effect<EngineSession, never, Instance.Services> = Effect.fn(
  'PluginEngine.session',
)(function* (input: CreateInput = {}) {
  const sessions = yield* Session.Service
  const location = yield* Location.Service
  const created = yield* sessions.create({...input, location: {directory: location.directory}}).pipe(Effect.orDie)
  return {
    id: created.id,
    tool: (name: string) => ({
      call: (toolInput: unknown = {}) => callTool(created.id, name, toolInput),
      failure: (toolInput: unknown = {}) => failedTool(name, callTool(created.id, name, toolInput)),
    }),
  }
})

export const call: (
  rpcId: string,
  method: string,
  input?: unknown,
) => Effect.Effect<unknown, Rpc.Failure, Instance.Services> = Effect.fn('PluginEngine.rpc')(function* (
  rpcId: string,
  method: string,
  input?: unknown,
) {
  yield* Plugin.awaitActivation
  const rpc = yield* Rpc.Service
  return yield* rpc.call(rpcId, method, input)
})

export const failure = (
  rpcId: string,
  method: string,
  input?: unknown,
): Effect.Effect<Rpc.Failure, never, Instance.Services> =>
  call(rpcId, method, input).pipe(
    Effect.matchEffect({
      onSuccess: (output) =>
        Effect.die(new Error(`the rpc ${rpcId}.${method} answered instead of failing: ${JSON.stringify(output)}`)),
      onFailure: (error) => Effect.succeed(error),
    }),
  )

export const write: (
  path: string,
  content: string,
) => Effect.Effect<string, PlatformError.PlatformError, Instance.Services> = Effect.fn('PluginEngine.write')(function* (
  path: string,
  content: string,
) {
  const files = yield* FileSystem.FileSystem
  const location = yield* Location.Service
  const target = join(location.directory, path)
  yield* files.makeDirectory(dirname(target), {recursive: true})
  yield* files.writeFileString(target, content)
  return target
})

const isMarker = (value: unknown) => value === Instructions.unavailable || value === Instructions.removed

export const skills: () => Effect.Effect<string, never, Instance.Services> = Effect.fn('PluginEngine.skills')(
  function* () {
    yield* Plugin.awaitActivation
    const sources = yield* (yield* SkillInstructions.Service).load([])
    const read = yield* Instructions.read(sources).pipe(Effect.orDie)
    const values = Object.fromEntries(read.flatMap(({key, value}) => (isMarker(value) ? [] : [[key, value]])))
    return Instructions.join(Instructions.renderInitial(sources, values))
  },
)

export const events = (type: `rpc.${string}`): Stream.Stream<Event.Payload, never, Instance.Services> =>
  Stream.unwrap(Bus.Service.use((bus) => Effect.succeed(bus.subscribe(Rpc.eventDefinition(type)))))

export const tools: () => Effect.Effect<readonly string[], never, Instance.Services> = Effect.fn('PluginEngine.tools')(
  function* () {
    yield* Plugin.awaitActivation
    const registered = yield* (yield* Tool.Service).list()
    return registered.map((tool) => tool.id)
  },
)
