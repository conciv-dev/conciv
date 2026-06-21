import type {Component} from 'solid-js'
import type {z} from 'zod'
import {defineTool, type ToolDefinition} from '@mandarax/extensions'
import type {ToolCardProps} from './types.js'

type Result = NonNullable<ToolCardProps['result']>

// Wrap a card component as a render-only ToolDefinition matched by name(s). renderShell:'self'; renderCall
// is the pending view (no result), renderResult the settled one. Host seams + part ride ctx.
export function cardTool<S extends z.ZodObject<z.ZodRawShape>>(def: {
  name: string
  names?: string[]
  label?: string
  parameters: S
  Card: Component<ToolCardProps>
}): ToolDefinition<S, Result> {
  const {Card} = def
  return defineTool({
    name: def.name,
    names: def.names ?? [def.name],
    label: def.label ?? def.name,
    description: '',
    parameters: def.parameters,
    renderShell: 'self',
    renderCall: (_args, ctx) => <Card part={ctx.part} result={undefined} ctx={ctx} durationMs={ctx.durationMs} />,
    renderResult: (result, _options, ctx) => (
      <Card part={ctx.part} result={result} ctx={ctx} durationMs={ctx.durationMs} />
    ),
  })
}
