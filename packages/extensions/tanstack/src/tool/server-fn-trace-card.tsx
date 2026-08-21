import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {Chip, parseResultPayload} from '@conciv/ui-kit-chat/tools'
import {CardNote, CardRow, CardRows, InspectionCard} from './card-shared.js'

type TraceRow = {name: string; file: string | null; durationMs: number; status: string}

const TraceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    durationMs: z.number(),
    status: z.string(),
  })
  .loose()

const FunctionSchema = z.object({id: z.string(), file: z.string().nullish()}).loose()

const PayloadSchema = z.object({
  traces: z.array(TraceSchema),
  functions: z.array(FunctionSchema),
})

function parsePayload(result: ToolCardProps['result']): TraceRow[] | null {
  const parsed = PayloadSchema.safeParse(parseResultPayload(result))
  if (!parsed.success) return null
  const fileById = new Map(parsed.data.functions.map((fn) => [fn.id, fn.file ?? null]))
  return parsed.data.traces.map((trace) => ({
    name: trace.name,
    file: fileById.get(trace.id) ?? null,
    durationMs: trace.durationMs,
    status: trace.status,
  }))
}

export function ServerFnTraceCard(props: ToolCardProps): JSX.Element {
  const traces = () => parsePayload(props.result)
  const summary = () => {
    const list = traces()
    if (!list) return ''
    if (list.length === 0) return 'no calls'
    return `${list.length} ${list.length === 1 ? 'call' : 'calls'}`
  }
  return (
    <InspectionCard {...props} summary={summary()}>
      <Show when={traces()?.length} fallback={<CardNote>No server-fn calls</CardNote>}>
        <CardRows>
          <For each={traces()}>
            {(trace) => (
              <CardRow>
                <span
                  aria-hidden="true"
                  class={`rounded-full shrink-0 h-1.5 w-1.5 ${trace.status === 'error' ? 'bg-chat-danger' : 'bg-chat-success'}`}
                />
                <span class="text-chat-text-2 min-w-0 truncate">{trace.name}</span>
                <Show when={trace.file}>
                  {(file) => <span class="text-chat-text-3 min-w-0 truncate">{file()}</span>}
                </Show>
                <span class="text-chat-text-3 ml-auto shrink-0 tabular-nums">{trace.durationMs}ms</span>
                <Chip kind="pill" value={trace.status} tone={trace.status === 'error' ? 'danger' : undefined} />
              </CardRow>
            )}
          </For>
        </CardRows>
      </Show>
    </InspectionCard>
  )
}
