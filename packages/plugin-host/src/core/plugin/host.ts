export * as PluginHost from './host.js'

import {mkdirSync} from 'node:fs'
import path from 'node:path'
import * as Plugin from '../../plugin/effect/plugin.js'
import {EventManifest} from '../../schema/event-manifest.js'
import type {Event} from '../../schema/event.js'
import {App} from '../app.js'
import {Context, Effect, Schema, Stream} from 'effect'
import type {BundlerDomain, HarnessDomain, Servers} from '@conciv/plugin'
import {Agent} from '../agent.js'
import {Bus} from '../bus.js'
import {KV} from '../kv.js'
import {Location} from '../location.js'
import {Model} from '../model.js'
import {Session} from '../session.js'
import {InstructionEntry} from '../session/instruction-entry.js'
import {Rpc} from '../rpc.js'
import type {DeepMutable} from '../schema.js'
import {Skill} from '../skill.js'
import {Tool} from '../tool.js'
import {Permission} from '../permission.js'
import {PluginHooks} from './hooks.js'
import {Global} from '../../util/global.js'
import type {Interface} from '../plugin.js'

const mutable = <T>(value: T) => value as DeepMutable<T>
type RpcEvent = Event.Payload & {
  readonly type: `rpc.${string}`
  readonly location: Location.Ref
  readonly data: Readonly<Record<string, unknown>>
}
const isRpcType = (type: string): type is RpcEvent['type'] => type.startsWith('rpc.')
const isRpcEvent = (event: Event.Payload): event is RpcEvent => isRpcType(event.type)
const isPublicEvent = (event: Event.Payload): event is EventManifest.ServerEvent | RpcEvent =>
  EventManifest.isServer(event) || isRpcEvent(event)

export const ServersSource = Context.Service<Servers>('@conciv/ServersSource')
export const HarnessSource = Context.Service<HarnessDomain>('@conciv/HarnessSource')
export const BundlerSource = Context.Service<BundlerDomain | undefined>('@conciv/BundlerSource')
export const ExtensionSlugs = Context.Service<ReadonlyArray<string>>('@conciv/ExtensionSlugs')

export const make = Effect.fn('PluginHost.make')(function* (plugin: Pick<Interface, 'list'>, pluginId: string) {
  const app = yield* App.Service
  const agents = yield* Agent.Service
  const models = yield* Model.Service
  const bus = yield* Bus.Service
  const kv = yield* KV.Service
  const location = yield* Location.Service
  const rpc = yield* Rpc.Service
  const skill = yield* Skill.Service
  const tools = yield* Tool.Service
  const permission = yield* Permission.Service
  const hooks = yield* PluginHooks.Service
  const sessions = yield* Session.Service
  const instructionEntries = yield* InstructionEntry.Service
  const servers = yield* ServersSource
  const harness = yield* HarnessSource
  const bundler = yield* BundlerSource
  const extensionSlugs = yield* ExtensionSlugs
  const global = yield* Global.Service
  const locationInfo = (current: Location.Interface = location) =>
    Location.Info.make({
      directory: current.directory,
      workspaceId: current.workspaceId,
      project: current.project,
    })
  const response = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.map((data) => ({location: locationInfo(), data})))

  const sessionPermission = (input: Parameters<Plugin.Context['permission']['get']>[0]) =>
    permission
      .get(input.requestId)
      .pipe(
        Effect.flatMap((request) =>
          request?.sessionId === input.sessionId
            ? Effect.succeed(request)
            : Effect.fail(new Error(`Permission request not found: ${input.requestId}`)),
        ),
      )

  const register: Plugin.Context['rpc']['register'] = (definition, handlers) =>
    extensionSlugs.includes(definition.id)
      ? Effect.fail(
          new Error(
            `Plugin ${pluginId} cannot register RPC ${definition.id}: the extension ${definition.id} is mounted`,
          ),
        )
      : rpc.register(definition, handlers)

  const context: Plugin.Context = {
    app,
    location: locationInfo(),
    options: {},
    rpc: Object.assign(rpc.client, {register}),
    agent: {
      transform: (callback) =>
        agents.transform((editor) => {
          callback({
            list: editor.list,
            get: (id) => editor.get(Agent.Id.make(id)),
            default: (id) => editor.default(id === undefined ? undefined : Agent.Id.make(id)),
            update: (id, update) => editor.update(Agent.Id.make(id), update),
            remove: (id) => editor.remove(Agent.Id.make(id)),
          })
        }),
    },
    model: {
      list: (input) => response(models.available(input?.types)),
      default: () => response(models.default()),
    },
    event: {
      subscribe: ((input?: {readonly types?: ReadonlyArray<string>}) => {
        if (!input?.types?.length) return bus.subscribe().pipe(Stream.filter(isPublicEvent))
        const unknown = new Array<string>()
        const [first, ...rest] = input.types.flatMap((type) => {
          if (isRpcType(type)) return [Rpc.eventDefinition(type)]
          const definition = EventManifest.Server.get(type)
          if (!definition) unknown.push(type)
          return definition ? [definition] : []
        })
        const events = first ? bus.subscribe([first, ...rest]) : Stream.never
        if (unknown.length === 0) return events
        return Stream.unwrap(
          Effect.logWarning('ignoring unknown event types', {pluginId, types: unknown}).pipe(Effect.as(events)),
        )
      }) as Plugin.Context['event']['subscribe'],
    },
    experimental: {
      generate: undefined,
    },
    permission: {
      hook: (name, callback) => hooks.register('permission', name, callback),
      list: (input) => permission.forSession(input.sessionId),
      get: sessionPermission,
      reply: (input) =>
        sessionPermission(input).pipe(
          Effect.andThen(() =>
            permission.reply({requestId: input.requestId, reply: input.decision, message: input.message}),
          ),
        ),
      assert: (input) =>
        permission.assert(input).pipe(
          Effect.catchTags({
            'Permission.BlockedError': (error) => Effect.fail(Tool.makeError({message: error.message, error})),
            'Permission.CorrectedError': (error) => Effect.fail(Tool.makeError({message: error.feedback, error})),
            'Session.NotFoundError': (error) =>
              Effect.fail(Tool.makeError({message: `Session not found: ${error.sessionId}`, error})),
          }),
        ),
    },
    plugin: {
      list: () => response(plugin.list()),
    },
    skill: {
      list: () => response(skill.list()),
      reload: skill.reload,
      transform: (callback) =>
        skill.transform((editor) => {
          callback({
            list: () => mutable(editor.list()),
            get: editor.get,
            add: (value) => editor.add(Schema.decodeUnknownSync(Skill.Info)(value)),
            update: editor.update,
            remove: editor.remove,
          })
        }),
    },
    storage: storage(kv, pluginId, global.state),
    tool: {
      transform: tools.transform,
      reload: tools.reload,
      list: tools.list,
      hook: (name, callback) => hooks.register('tool', name, callback),
    },
    session: {
      hook: (name, callback) => hooks.register('session', name, callback),
      list: sessions.list,
      create: (input) =>
        sessions.create({
          id: input?.id,
          title: input?.title,
          agent: input?.agent,
          model: input?.model,
          metadata: input?.metadata,
          permissions: input?.permissions,
          ...(input?.parentId === undefined
            ? {
                location: Location.Ref.make({directory: location.directory, workspaceId: location.workspaceId}),
              }
            : {parentId: input.parentId}),
        }),
      get: (input) => sessions.get(input.sessionId),
      remove: (input) => sessions.remove(input.sessionId),
      switchAgent: sessions.switchAgent,
      switchModel: sessions.switchModel,
      generate: undefined,
      command: undefined,
      compact: sessions.compact,
      update: Effect.fn(function* (input) {
        yield* sessions.get(input.sessionId)
        if (input.title !== undefined) yield* sessions.rename({sessionId: input.sessionId, title: input.title})
        if (input.metadata !== undefined)
          yield* sessions.setMetadata({sessionId: input.sessionId, metadata: input.metadata})
        if (input.permissions !== undefined)
          yield* sessions.setPermissions({sessionId: input.sessionId, permissions: input.permissions})
      }),
      synthetic: undefined,
      interrupt: (input) =>
        sessions.interrupt(input.sessionId, {resume: input.resume}).pipe(Effect.map((interrupted) => ({interrupted}))),
      wait: (input) => sessions.wait(input.sessionId),
      instructions: {
        entry: {
          list: Effect.fn(function* (input) {
            yield* sessions.get(input.sessionId)
            return yield* instructionEntries.list(input.sessionId)
          }),
          put: Effect.fn(function* (input) {
            const key = yield* Schema.decodeUnknownEffect(InstructionEntry.Key)(input.key)
            yield* sessions.get(input.sessionId)
            yield* instructionEntries.put({...input, key})
          }),
          remove: Effect.fn(function* (input) {
            const key = yield* Schema.decodeUnknownEffect(InstructionEntry.Key)(input.key)
            yield* sessions.get(input.sessionId)
            yield* instructionEntries.remove({...input, key})
          }),
        },
      },
    },
    servers,
    harness,
    bundler,
  }
  return context
})

export function storage(kv: KV.Interface, pluginId: string, stateRoot: string): Plugin.Context['storage'] {
  const encoded = pluginId
    .split('')
    .map((value) => value.charCodeAt(0).toString(16).padStart(4, '0'))
    .join('')
  const namespace = `plugin:${encoded}:`
  const directory = path.join(stateRoot, 'plugin-storage', encoded)
  let made = false
  return {
    get directory() {
      if (made) return directory
      mkdirSync(directory, {recursive: true})
      made = true
      return directory
    },
    get: (key) => kv.get(namespace + key),
    set: (key, value) => kv.set(namespace + key, value),
    remove: (key) => kv.remove(namespace + key),
    scan: (options) =>
      kv
        .scan({
          prefix: namespace + options.prefix,
          after: options.after === undefined ? undefined : namespace + options.after,
          limit: options.limit,
        })
        .pipe(
          Effect.map((result) => {
            const entries = result.entries.map((entry) => ({
              key: entry.key.slice(namespace.length),
              value: entry.value,
            }))
            if (result.next === undefined) return {entries}
            return {entries, next: result.next.slice(namespace.length)}
          }),
        ),
  }
}
