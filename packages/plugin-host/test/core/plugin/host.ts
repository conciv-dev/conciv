import * as Plugin from '../../../src/plugin/effect/plugin.js'
import {Agent} from '../../../src/core/agent.js'
import {Location} from '../../../src/core/location.js'
import {Model} from '../../../src/core/model.js'
import {Project} from '../../../src/schema/project.js'
import {AbsolutePath} from '../../../src/schema/schema.js'
import {Effect, Stream} from 'effect'

type EventSource = ReturnType<Plugin.Context['event']['subscribe']>
type Overrides = Partial<Omit<Plugin.Context, 'options' | 'session' | 'event'>> & {
  readonly session?: Partial<Plugin.Context['session']>
  readonly event?: {readonly subscribe: () => EventSource}
}
export function host(overrides: Overrides = {}): Plugin.Context {
  return {
    app: overrides.app ?? {name: 'test', version: 'test', channel: 'test'},
    location:
      overrides.location ??
      Location.Info.make({
        directory: AbsolutePath.make('/workspace'),
        project: {
          id: Project.Id.global,
          directory: AbsolutePath.make('/workspace'),
          canonical: AbsolutePath.make('/workspace'),
        },
      }),
    options: {},
    rpc:
      overrides.rpc ??
      Object.assign(
        () => {
          throw new Error('unused rpc.client')
        },
        {register: () => Effect.die('unused rpc.register')},
      ),
    agent: overrides.agent ?? {
      transform: () => Effect.die('unused agent.transform'),
    },
    model: overrides.model ?? {
      list: () => Effect.die('unused model.list'),
      default: () => Effect.die('unused model.default'),
    },
    event: {subscribe: events(overrides.event?.subscribe ?? (() => Stream.empty))},
    experimental: overrides.experimental ?? {
      generate: undefined,
    },
    permission: overrides.permission ?? {
      hook: () => Effect.die('unused permission.hook'),
      list: () => Effect.die('unused permission.list'),
      get: () => Effect.die('unused permission.get'),
      reply: () => Effect.die('unused permission.reply'),
      assert: () => Effect.die('unused permission.assert'),
    },
    plugin: overrides.plugin ?? {
      list: () => Effect.die('unused plugin.list'),
    },
    skill: overrides.skill ?? {
      list: () => Effect.die('unused skill.list'),
      transform: () => Effect.die('unused skill.transform'),
      reload: () => Effect.die('unused skill.reload'),
    },
    storage: overrides.storage ?? {
      get: () => Effect.die('unused storage.get'),
      set: () => Effect.die('unused storage.set'),
      remove: () => Effect.die('unused storage.remove'),
      scan: () => Effect.die('unused storage.scan'),
      get directory(): string {
        throw new Error('unused storage.directory')
      },
    },
    tool: overrides.tool ?? {
      transform: () => Effect.die('unused tool.transform'),
      reload: () => Effect.die('unused tool.reload'),
      list: () => Effect.die('unused tool.list'),
      hook: () => Effect.die('unused tool.hook'),
    },
    session: {
      hook: overrides.session?.hook ?? (() => Effect.die('unused session.hook')),
      list: overrides.session?.list ?? (() => Effect.die('unused session.list')),
      create: overrides.session?.create ?? (() => Effect.die('unused session.create')),
      get: overrides.session?.get ?? (() => Effect.die('unused session.get')),
      remove: overrides.session?.remove ?? (() => Effect.die('unused session.remove')),
      switchAgent: overrides.session?.switchAgent ?? (() => Effect.die('unused session.switchAgent')),
      switchModel: overrides.session?.switchModel ?? (() => Effect.die('unused session.switchModel')),
      generate: undefined,
      command: undefined,
      compact: overrides.session?.compact ?? (() => Effect.die('unused session.compact')),
      update: overrides.session?.update ?? (() => Effect.die('unused session.update')),
      synthetic: overrides.session?.synthetic ?? (() => Effect.die('unused session.synthetic')),
      interrupt: overrides.session?.interrupt ?? (() => Effect.die('unused session.interrupt')),
      wait: overrides.session?.wait ?? (() => Effect.die('unused session.wait')),
      instructions: overrides.session?.instructions ?? {
        entry: {
          list: () => Effect.die('unused session.instructions.entry.list'),
          put: () => Effect.die('unused session.instructions.entry.put'),
          remove: () => Effect.die('unused session.instructions.entry.remove'),
        },
      },
    },
    servers: overrides.servers ?? {
      list: () => {
        throw new Error('unused servers.list')
      },
      get: () => {
        throw new Error('unused servers.get')
      },
    },
    harness: overrides.harness ?? {
      get: () => {
        throw new Error('unused harness.get')
      },
      resumeToken: () => {
        throw new Error('unused harness.resumeToken')
      },
      recordToken: () => {
        throw new Error('unused harness.recordToken')
      },
      mcpUrl: undefined,
    },
    bundler: overrides.bundler,
  }
}

export function agentHost(agent: Agent.Interface): Plugin.Context['agent'] {
  return {
    transform: (callback) =>
      agent.transform((editor) =>
        callback({
          list: () => editor.list().map(agentInfo),
          get: (id) => {
            const value = editor.get(Agent.Id.make(id))
            return value && agentInfo(value)
          },
          default: (id) => editor.default(id === undefined ? undefined : Agent.Id.make(id)),
          update: (id, update) =>
            editor.update(Agent.Id.make(id), (value) => {
              const current = agentInfo(value)
              update(current)
              Object.assign(value, current, {id: Agent.Id.make(current.id)})
            }),
          remove: (id) => editor.remove(Agent.Id.make(id)),
        }),
      ),
  }
}

export function modelHost(models: Model.Interface): Plugin.Context['model'] {
  return {
    list: () => models.available().pipe(Effect.map(located)),
    default: () => models.default().pipe(Effect.map(located)),
  }
}

function agentInfo(value: Agent.Info) {
  return {
    ...value,
    model: value.model && {...value.model},
    request: {
      settings: {...value.request.settings},
      headers: {...value.request.headers},
      body: {...value.request.body},
    },
    permissions: value.permissions.map((permission) => ({...permission})),
  }
}

function located<A>(data: A) {
  return {
    location: Location.Info.make({
      directory: AbsolutePath.make('/'),
      project: {
        id: Project.Id.make('test'),
        directory: AbsolutePath.make('/'),
        canonical: AbsolutePath.make('/'),
      },
    }),
    data,
  }
}

function events(source: () => EventSource) {
  const subscribe = (input?: {readonly types?: ReadonlyArray<string>}): EventSource =>
    source().pipe(Stream.filter((event) => !input?.types?.length || input.types.includes(event.type)))
  return subscribe as Plugin.Context['event']['subscribe']
}
