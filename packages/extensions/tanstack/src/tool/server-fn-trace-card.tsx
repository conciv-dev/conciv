import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {ServerCog} from 'lucide-solid'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {parseResultPayload} from '@conciv/ui-kit-chat'
import {ToolChip} from '@conciv/ui-kit-chat-tools'
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

function parsePayload(props: ToolCardProps): TraceRow[] | null {
  const parsed = PayloadSchema.safeParse(parseResultPayload(props.result))
  if (!parsed.success) return null
  const fileById = new Map(parsed.data.functions.map((fn) => [fn.id, fn.file ?? null]))
  return parsed.data.traces.map((trace) => ({
    name: trace.name,
    file: fileById.get(trace.id) ?? null,
    durationMs: trace.durationMs,
    status: trace.status,
  }))
}

function TraceIcon(): JSX.Element {
  return <ServerCog size={14} />
}

export function ServerFnTraceCard(props: ToolCardProps): JSX.Element {
  const traces = () => parsePayload(props)
  const summary = () => {
    const list = traces()
    if (!list) return ''
    if (list.length === 0) return 'no calls'
    return `${list.length} ${list.length === 1 ? 'call' : 'calls'}`
  }
  return (
    <InspectionCard card={props} Icon={TraceIcon} summary={summary()}>
      <Show when={traces()?.length} fallback={<CardNote>No server-fn calls</CardNote>}>
        <CardRows>
          <For each={traces()}>
            {(trace) => (
              <CardRow>
                <span class="min-w-0 truncate [color:var(--chat-text-2)]">{trace.name}</span>
                <Show when={trace.file}>
                  {(file) => <span class="min-w-0 truncate [color:var(--chat-text-3)]">{file()}</span>}
                </Show>
                <span class="ml-auto shrink-0 [color:var(--chat-text-3)]">{trace.durationMs}ms</span>
                <ToolChip name={trace.status} tone={trace.status === 'error' ? 'bad' : undefined} />
              </CardRow>
            )}
          </For>
        </CardRows>
      </Show>
    </InspectionCard>
  )
}
