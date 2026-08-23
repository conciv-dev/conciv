import type {JSX} from 'solid-js'
import type {ToolCardEntry, ToolCardProps, ToolViewCtx, ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {INERT_TOOL_CTX, Trace, ToolTraceRow, type TraceItem} from '@conciv/ui-kit-chat/tools'
import * as toolClients from './client.js'

type ToolCallPart = ToolCardProps['part']
type ToolResultPart = NonNullable<ToolCardProps['result']>

export const TRACE_FRAME_CLASS =
  'p-4 max-w-[30rem] w-full [background:var(--chat-panel)] [font-family:var(--chat-font)]'

const clients = Object.values(toolClients)

const traceTools: ToolCardEntry[] = clients.flatMap((client) => {
  const card = client.__render
  return card ? [{names: [client.name], render: card.render, hasEmbeddedBody: card.hasEmbeddedBody}] : []
})

function toolMeta(name: string): ToolViewMeta | undefined {
  const meta = clients.find((client) => client.name === name)?.meta
  if (!meta) return undefined
  return {...meta, summary: meta.summary, mutating: meta.mutating ?? false, mirrors: false}
}

const traceCtx: ToolViewCtx = {...INERT_TOOL_CTX, catalog: {loaded: () => true, meta: toolMeta}}

export function traceRow(part: ToolCallPart, result: ToolResultPart | undefined): TraceItem {
  return {
    key: part.id,
    render: (branch) => (
      <ToolTraceRow part={part} result={result} ctx={traceCtx} tools={() => traceTools} ring={branch.ring} />
    ),
  }
}

export function traceFrame(summary: string, items: TraceItem[]): JSX.Element {
  return (
    <div class={TRACE_FRAME_CLASS}>
      <Trace summary={summary} compactLine={summary} items={items} defaultOpen />
    </div>
  )
}
