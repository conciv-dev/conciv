import {Agent} from '../../../src/core/agent.js'
import type {Permission} from '../../../src/core/permission.js'
import {SessionMessage} from '../../../src/schema/session-message.js'
import {Tool} from '../../../src/core/tool.js'
import type {Context} from '../../../src/plugin/effect/plugin.js'
import {Effect, type Scope} from 'effect'
import {host} from '../plugin/host'

export const toolIdentity = {
  agent: Agent.Id.make('build'),
  messageId: SessionMessage.Id.make('msg_tool_test'),
}

export const toolDefinitions = (registry: Tool.Interface, permissions?: Permission.Ruleset) =>
  registry.snapshot(permissions).pipe(Effect.map((toolSet) => toolSet.definitions))

export const registerToolPlugin = <R>(
  plugin: {
    readonly id: string
    readonly effect: (context: Context) => Effect.Effect<void, never, R>
  },
  overrides: Parameters<typeof host>[0] = {},
  hook?: Context['tool']['hook'],
): Effect.Effect<void, never, R | Tool.Interface | Scope.Scope> =>
  Effect.gen(function* () {
    const tools = yield* Tool.Service
    const context = host({
      ...overrides,
      session: {
        ...overrides.session,
        hook: overrides.session?.hook ?? (() => Effect.succeed({dispose: Effect.void})),
      },
      tool: {
        transform: tools.transform,
        reload: tools.reload,
        list: tools.list,
        hook: hook ?? (() => Effect.die('registerToolPlugin does not support tool hooks')),
      },
    })
    yield* plugin.effect(context)
  })

export interface ToolExecution {
  readonly status: 'completed' | 'error'
  readonly output?: any
  readonly content?: ReadonlyArray<Tool.Content>
  readonly metadata?: Tool.Metadata
  readonly error?: Tool.Error
}

export const executeTool = (
  registry: Tool.Interface,
  input: Parameters<Tool.Snapshot['execute']>[0],
): Effect.Effect<ToolExecution> =>
  registry.snapshot().pipe(
    Effect.flatMap((tools) => tools.execute(input)),
    Effect.map((result) => ({status: 'completed' as const, ...result}) satisfies ToolExecution),
    Effect.catchTag('Tool.Error', (error) => Effect.succeed({status: 'error' as const, error} satisfies ToolExecution)),
  )
