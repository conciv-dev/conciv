import * as Plugin from '@conciv/plugin/effect/plugin'
import {Location} from '../../../src/core/location.js'
import {Project} from '../../../src/schema/project.js'
import {AbsolutePath} from '@conciv/plugin/schema/schema'
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
      synthetic: undefined,
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
  }
}

function events(source: () => EventSource) {
  const subscribe = (input?: {readonly types?: ReadonlyArray<string>}): EventSource =>
    source().pipe(Stream.filter((event) => !input?.types?.length || input.types.includes(event.type)))
  return subscribe as Plugin.Context['event']['subscribe']
}
