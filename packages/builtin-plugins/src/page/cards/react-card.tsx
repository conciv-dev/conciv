import {Match, Show, Switch, type JSX} from 'solid-js'
import {z} from 'zod'
import type {trackReport} from '@conciv/page'
import {RawFrameSchema} from '@conciv/contract'
import type {ToolProps} from '@conciv/plugin/experimental'
import {JsonTree} from '@conciv/ui-kit-chat/tools'
import {
  ChipRow,
  ELEMENT_TARGET_KEYS,
  PageTool,
  QUIET_TEXT_CLASS,
  countLabel,
  elementTarget,
  outputPayload,
} from './shared.js'
import {pageOperation} from './page-tool-names.js'

const SourcePayload = pageOperation('locate').output.extend({frames: z.array(RawFrameSchema).optional()})

type TrackReport = ReturnType<typeof trackReport>

const TrackPayload: z.ZodType<Pick<TrackReport, 'components' | 'note'>> = z.looseObject({
  components: z.array(z.object({component: z.string(), renders: z.number(), lastReason: z.string()})),
  note: z.string().optional(),
})

const HEADLINE = 'text-[length:var(--chat-text-sm)] m-0 flex flex-wrap gap-x-2 gap-y-0.5 items-baseline'
const COMPONENT_NAME = '[color:var(--chat-text-hi)] [font-family:var(--chat-mono)] min-w-0 [overflow-wrap:anywhere]'
const SOURCE_LOCATION =
  'text-[length:var(--chat-text-xs)] text-chat-text-3 [font-family:var(--chat-mono)] min-w-0 [overflow-wrap:anywhere]'

function renderLabel(renders: number): string {
  return countLabel(renders, 'render', 'renders')
}

function locationLabel(file: string, line: number | undefined): string {
  return line === undefined ? file : `${file}:${line}`
}

function frameLocation(frame: {fileName?: string; line?: number} | undefined): string | undefined {
  if (frame?.fileName === undefined) return undefined
  return locationLabel(frame.fileName, frame.line)
}

function readSource(payload: unknown): {component: string | undefined; location: string | undefined} {
  const parsed = SourcePayload.safeParse(payload)
  if (!parsed.success) return {component: undefined, location: undefined}
  const attribute = parsed.data.source
  const frame = parsed.data.frames?.[0]
  return {
    component: parsed.data.component ?? frame?.fn,
    location: attribute ? locationLabel(attribute.file, attribute.line) : frameLocation(frame),
  }
}

type TrackReportView = {
  components: ReadonlyArray<{component: string; renders: number}>
  note: string | undefined
}

function renderChips(report: TrackReportView): Array<{name: string; value: string}> {
  return report.components.map((entry) => ({name: entry.component, value: renderLabel(entry.renders)}))
}

function readTrack(payload: unknown): TrackReportView | undefined {
  const parsed = TrackPayload.safeParse(payload)
  if (!parsed.success) return undefined
  return {components: parsed.data.components, note: parsed.data.note}
}

export function ReactCard(props: ToolProps): JSX.Element {
  const payload = () => outputPayload(props.output)
  const descriptor = () => readSource(payload())
  const track = () => readTrack(payload())
  return (
    <PageTool
      {...props}
      subtitle={elementTarget(props.input)}
      skip={ELEMENT_TARGET_KEYS}
      hasContent={payload() !== undefined}
    >
      <div class="flex flex-col gap-1.5">
        <Show when={descriptor().component !== undefined || descriptor().location !== undefined}>
          <p class={HEADLINE}>
            <Show when={descriptor().component}>{(name) => <span class={COMPONENT_NAME}>{name()}</span>}</Show>
            <Show when={descriptor().location}>{(location) => <span class={SOURCE_LOCATION}>{location()}</span>}</Show>
          </p>
        </Show>
        <Switch>
          <Match when={track()}>
            {(report) => (
              <>
                <Show
                  when={report().components.length > 0}
                  fallback={<p class={QUIET_TEXT_CLASS}>no re-renders were recorded</p>}
                >
                  <ChipRow chips={renderChips(report())} />
                </Show>
                <Show when={report().note}>{(note) => <p class={QUIET_TEXT_CLASS}>{note()}</p>}</Show>
              </>
            )}
          </Match>
          <Match when={payload() !== undefined}>
            <JsonTree data={payload()} />
          </Match>
        </Switch>
      </div>
    </PageTool>
  )
}
