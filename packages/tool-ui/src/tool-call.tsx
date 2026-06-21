import type {JSX} from 'solid-js'
import type {ToolDefinition} from '@mandarax/extensions'
import type {ToolCardProps, ToolRenderContext} from './types.js'
import {ApprovalBar} from './approval-bar.js'
import {GenericCard} from './cards/generic.js'
import {parseInput} from './util.js'

export type ToolCallCardProps = ToolCardProps & {tools?: () => ToolDefinition[]}

function matches(tool: ToolDefinition, name: string): boolean {
  return (tool.names ?? [tool.name]).includes(name)
}

function renderContext(props: ToolCallCardProps, tool: ToolDefinition): ToolRenderContext<Record<string, unknown>> {
  return {
    ...props.ctx,
    args: parseInput(tool.parameters, props.part) ?? {},
    part: props.part,
    toolCallId: props.part.id,
    durationMs: props.durationMs,
    expanded: true,
    isPartial: !props.result,
    isError: props.result?.state === 'error',
  }
}

// Match a tool-call part by name/names (extension tools first, overriding built-ins): renderCall while
// running, renderResult once output lands, else the generic card. ApprovalBar renders below.
export function ToolCallCard(props: ToolCallCardProps): JSX.Element {
  const tool = (): ToolDefinition | undefined => props.tools?.().find((t) => matches(t, props.part.name))
  const body = (): JSX.Element => {
    const t = tool()
    if (!t) return <GenericCard part={props.part} result={props.result} ctx={props.ctx} durationMs={props.durationMs} />
    const ctx = renderContext(props, t)
    const result = props.result
    return result
      ? t.renderResult?.(result, {expanded: ctx.expanded, isPartial: false}, ctx)
      : t.renderCall?.(ctx.args, ctx)
  }
  return (
    <>
      {body()}
      <ApprovalBar part={props.part} ctx={props.ctx} />
    </>
  )
}
