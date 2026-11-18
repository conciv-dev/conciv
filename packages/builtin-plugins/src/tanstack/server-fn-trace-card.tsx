import {For, Show, type JSX} from 'solid-js'
import {z} from 'zod'
import {ServerFnTraces} from '@conciv/plugin-tanstack/rpc'
import {keyBy} from 'es-toolkit'
import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import {StatusDot, TruncatedText} from '@conciv/ui-kit-system'
import {Chip} from '@conciv/ui-kit-chat/tools'
import {CardNote, CardRow, CardRows, InspectionCard, parseOutput} from './card-shared.js'
import {countLabel} from '../page/cards/shared.js'

type TraceRow = {name: string; file: string | null; durationMs: number; status: string}

const TraceSchema = ServerFnTraces.shape.traces.element
  .pick({id: true, name: true, durationMs: true, status: true})
  .loose()

const FunctionSchema = ServerFnTraces.shape.functions.element.pick({id: true, file: true}).partial({file: true}).loose()

const PayloadSchema = ServerFnTraces.extend({
  traces: z.array(TraceSchema),
  functions: z.array(FunctionSchema),
})

function parsePayload(result: string | undefined): TraceRow[] | null {
  const parsed = PayloadSchema.safeParse(parseOutput(result))
  if (!parsed.success) return null
  const functionById = keyBy(parsed.data.functions, (serverFunction) => serverFunction.id)
  return parsed.data.traces.map((trace) => ({
    name: trace.name,
    file: functionById[trace.id]?.file ?? null,
    durationMs: trace.durationMs,
    status: trace.status,
  }))
}

function ServerFnTraceCard(props: ToolProps): JSX.Element {
  const traces = () => parsePayload(props.output)
  const summary = () => {
    const list = traces()
    if (!list) return ''
    if (list.length === 0) return 'no calls'
    return countLabel(list.length, 'call', 'calls')
  }
  return (
    <InspectionCard {...props} summary={summary()} hasContent={true}>
      <Show when={traces()?.length} fallback={<CardNote>No server-fn calls</CardNote>}>
        <CardRows>
          <For each={traces()}>
            {(trace) => (
              <CardRow>
                <StatusDot tone={trace.status === 'error' ? 'danger' : 'success'} />
                <TruncatedText class="text-chat-text-2 min-w-0" text={trace.name} />
                <Show when={trace.file}>
                  {(file) => <TruncatedText class="text-chat-text-3 min-w-0" text={file()} />}
                </Show>
                <span class="text-chat-text-3 ms-auto shrink-0 tabular-nums">{trace.durationMs}ms</span>
                <Chip kind="pill" value={trace.status} tone={trace.status === 'error' ? 'danger' : undefined} />
              </CardRow>
            )}
          </For>
        </CardRows>
      </Show>
    </InspectionCard>
  )
}

export const serverFnTraceCard: ToolComponent = ServerFnTraceCard
