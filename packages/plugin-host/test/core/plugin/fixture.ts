import {randomUUID} from 'node:crypto'
import path from 'node:path'
import {NodeFileSystem} from '@effect/platform-node'
import {Context, Effect, Layer} from 'effect'
import type {SessionInfo} from '@conciv/plugin'
import {Agent} from '../../../src/core/agent.js'
import {App} from '../../../src/core/app.js'
import {Bus} from '../../../src/core/bus.js'
import {ConfigPluginSource} from '../../../src/core/config/plugin/source.js'
import {Watcher} from '../../../src/core/filesystem/watcher.js'
import {KV} from '../../../src/core/kv.js'
import {Location} from '../../../src/core/location.js'
import {ManagedPolicy} from '../../../src/core/managed-policy.js'
import {Model} from '../../../src/core/model.js'
import {Permission} from '../../../src/core/permission.js'
import {PermissionSaved} from '../../../src/core/permission/saved.js'
import {Plugin} from '../../../src/core/plugin.js'
import {PluginHooks} from '../../../src/core/plugin/hooks.js'
import {InstancePlugins} from '../../../src/core/plugin/instance.js'
import {PluginSupervisor} from '../../../src/core/plugin/supervisor.js'
import {PluginUpdate} from '../../../src/core/plugin/update.js'
import {BundlerSource, ExtensionSlugs, HarnessSource, ServersSource} from '../../../src/core/plugin/host.js'
import {Rpc} from '../../../src/core/rpc.js'
import {Session} from '../../../src/core/session.js'
import {SessionErrors} from '../../../src/core/session/error.js'
import {InstructionEntry} from '../../../src/core/session/instruction-entry.js'
import {Skill} from '../../../src/core/skill.js'
import {Image} from '../../../src/core/image.js'
import {Tool} from '../../../src/core/tool.js'
import {InstructionEntry as InstructionEntrySchema} from '../../../src/schema/instruction-entry.js'
import {ProjectId} from '../../../src/schema/project-id.js'
import type {ConfigPlugin} from '../../../src/schema/config/plugin.js'
import {AbsolutePath} from '../../../src/schema/schema.js'
import {Session as SessionSchema} from '../../../src/schema/session.js'
import {EffectFlock} from '../../../src/util/effect-flock.js'
import {FSUtil} from '../../../src/util/fs-util.js'
import {Global} from '../../../src/util/global.js'
import {Npm} from '../../../src/util/npm.js'
import {databaseLayer} from '../fixture/permission'
import {tmpdirScoped} from '../fixture/tmpdir'

const locationLayer = (directory: AbsolutePath) =>
  Layer.succeed(
    Location.Service,
    Location.Service.of({
      directory,
      project: {id: ProjectId.global, directory, canonical: directory},
    }),
  )

export const temporaryGlobalLayer = Layer.unwrap(
  tmpdirScoped().pipe(
    Effect.map((temporary) =>
      Global.layerWith({cache: path.join(temporary.path, 'cache'), state: path.join(temporary.path, 'state')}),
    ),
  ),
)

const sessionLayer = (directory: AbsolutePath) =>
  Layer.sync(Session.Service, () => {
    const sessions = new Map<SessionInfo['id'], SessionInfo>()
    const find = (sessionId: SessionInfo['id']) =>
      Effect.suspend(() => {
        const session = sessions.get(sessionId)
        if (session) return Effect.succeed(session)
        return Effect.fail(SessionErrors.makeNotFoundError({sessionId}))
      })
    const change = (sessionId: SessionInfo['id'], update: Partial<SessionInfo>) =>
      find(sessionId).pipe(
        Effect.map((session) => {
          sessions.set(sessionId, {...session, ...update, time: {...session.time, updated: Date.now()}})
        }),
      )
    return Session.Service.of({
      list: (input) =>
        Effect.suspend(() => {
          if (input?.cursor !== undefined) return Effect.fail(SessionErrors.makeInvalidListCursorError())
          const search = input?.search
          const matching = Array.from(sessions.values()).filter(
            (session) => search === undefined || (session.title ?? '').includes(search),
          )
          return Effect.succeed({data: matching.slice(0, input?.limit ?? matching.length), cursor: {}})
        }),
      create: (input) =>
        Effect.gen(function* () {
          const sessionId = SessionSchema.Id.make(input.id ?? `conciv_${randomUUID()}`)
          const recorded = sessions.get(sessionId)
          if (recorded) return recorded
          const parent = input.parentId ? yield* find(SessionSchema.Id.make(input.parentId)) : undefined
          const created = Date.now()
          const session: SessionInfo = {
            id: sessionId,
            parentId: parent?.id,
            projectId: undefined,
            agent: input.agent ?? undefined,
            model: input.model ?? undefined,
            cost: 0,
            tokens: {input: 0, output: 0, reasoning: 0, cache: {read: 0, write: 0}},
            time: {created, updated: created},
            title: input.title ?? undefined,
            metadata: input.metadata ?? parent?.metadata,
            permissions: input.permissions ?? parent?.permissions,
            location: parent?.location ?? {directory: input.location?.directory ?? directory},
          }
          sessions.set(sessionId, session)
          return session
        }),
      get: find,
      remove: (sessionId) => find(sessionId).pipe(Effect.map(() => void sessions.delete(sessionId))),
      switchAgent: (input) => change(input.sessionId, {agent: input.agent}),
      switchModel: (input) => change(input.sessionId, {model: input.model}),
      rename: (input) => change(input.sessionId, {title: input.title}),
      setMetadata: (input) => change(input.sessionId, {metadata: input.metadata}),
      setPermissions: (input) => change(input.sessionId, {permissions: input.permissions}),
      compact: (input) =>
        find(input.sessionId).pipe(
          Effect.map(() => ({
            id: input.id,
            sessionId: input.sessionId,
            time: {created: Date.now()},
            type: 'compaction' as const,
            payload: {},
            delivery: input.delivery,
          })),
        ),
      wait: (sessionId) => find(sessionId).pipe(Effect.asVoid),
      interrupt: () => Effect.succeed(false),
    })
  })

const modelLayer = Layer.succeed(
  Model.Service,
  Model.Service.of({
    available: () => Effect.succeed([]),
    default: () => Effect.succeed(undefined),
  }),
)

const instructionEntryLayer = Layer.sync(InstructionEntry.Service, () => {
  const entries = new Map<SessionSchema.Id, Map<InstructionEntry.Key, InstructionEntry.Info['value']>>()
  return InstructionEntry.Service.of({
    list: (sessionId) => Effect.sync(() => Array.from(entries.get(sessionId) ?? [], ([key, value]) => ({key, value}))),
    put: (input) =>
      Effect.suspend(() => {
        const actualBytes = Buffer.byteLength(JSON.stringify(input.value))
        if (actualBytes > InstructionEntrySchema.MaxValueBytes)
          return Effect.fail(
            InstructionEntrySchema.makeValueTooLargeError({
              actualBytes,
              maxBytes: InstructionEntrySchema.MaxValueBytes,
              message: `Instruction entry value is ${actualBytes} bytes; the limit is ${InstructionEntrySchema.MaxValueBytes}`,
            }),
          )
        const session = entries.get(input.sessionId) ?? new Map()
        session.set(input.key, input.value)
        entries.set(input.sessionId, session)
        return Effect.void
      }),
    remove: (input) => Effect.sync(() => void entries.get(input.sessionId)?.delete(input.key)),
  })
})

const permissionSessionsLayer = Layer.effect(
  Permission.PermissionSessions,
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    return Permission.PermissionSessions.of({
      get: (sessionId) =>
        sessions.get(sessionId).pipe(
          Effect.map((session) => ({
            agent: session.agent === undefined ? undefined : Agent.Id.make(session.agent),
            permissions: session.permissions,
          })),
          Effect.catchTag('Session.NotFoundError', () => Effect.succeed(undefined)),
        ),
    })
  }),
)

const sourcesLayer = Layer.mergeAll(
  Layer.succeed(App.Service, App.make()),
  Layer.succeed(ServersSource, {list: () => [], get: () => undefined}),
  Layer.succeed(HarnessSource, {
    get: () => ({id: 'fixture'}),
    resumeToken: () => Promise.resolve(null),
    recordToken: () => Promise.resolve(),
    mcpUrl: undefined,
  }),
  Layer.succeed(BundlerSource, undefined),
  Layer.succeed(ExtensionSlugs, []),
  Layer.succeed(ManagedPolicy.ConfiguredPolicies, []),
  Layer.succeed(ConfigPluginSource.ConfiguredPlugins, []),
)

const watcherLayer = Layer.effect(Watcher.Service, Effect.service(Watcher.Service)).pipe(
  Layer.provide(Watcher.testLayer),
)

const pluginLayer = (directory: AbsolutePath) =>
  Plugin.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(Permission.layer, Tool.layer)),
    Layer.provideMerge(
      Layer.mergeAll(
        Agent.layer,
        Skill.layer,
        Rpc.layer,
        KV.layer,
        PermissionSaved.layer,
        PluginHooks.layer,
        Image.layer,
        permissionSessionsLayer,
      ),
    ),
    Layer.provideMerge(
      Layer.mergeAll(
        locationLayer(directory),
        sessionLayer(directory),
        modelLayer,
        instructionEntryLayer,
        sourcesLayer,
      ),
    ),
  )

export const npmLayer = Npm.layer.pipe(Layer.provide(EffectFlock.layer))

export const sharedLayer = FSUtil.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(databaseLayer, temporaryGlobalLayer, NodeFileSystem.layer)),
)

export const PluginTestLayer = pluginLayer(AbsolutePath.make('/project')).pipe(
  Layer.provideMerge(Layer.mergeAll(Bus.layer, watcherLayer, npmLayer)),
  Layer.provideMerge(sharedLayer),
)

export const supervisorLayer = (
  directory: string,
  options: {
    readonly plugins?: InstancePlugins.List
    readonly configured?: readonly ConfigPlugin.Plugin[]
    readonly source?: Layer.Layer<Context.Service.Identifier<typeof ConfigPluginSource.Service>>
  } = {},
) =>
  PluginSupervisor.layer.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        InstancePlugins.bound(options.plugins ?? []),
        PluginUpdate.layer,
        options.source ??
          ConfigPluginSource.layer.pipe(
            Layer.provide(Layer.succeed(ConfigPluginSource.ConfiguredPlugins, options.configured ?? [])),
          ),
      ),
    ),
    Layer.provideMerge(pluginLayer(AbsolutePath.make(directory))),
    Layer.fresh,
  )
