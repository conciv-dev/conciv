import type {Permission} from '../../../src/schema/permission.js'
import {Tool} from '../../../src/core/tool.js'
import {Effect} from 'effect'

export const toolDefinitions = (registry: Tool.Interface, permissions?: Permission.Ruleset) =>
  registry.snapshot(permissions).pipe(Effect.map((toolSet) => toolSet.definitions))

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
