import {Match, Show, Switch, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {CardShell, DANGER_TEXT_CLASS, JsonTree, cardHeader, detailChips} from '@conciv/ui-kit-chat/tools'
import {
  ChipRow,
  ELEMENT_TARGET_KEYS,
  QUIET_TEXT_CLASS,
  cardErrorMessage,
  cardPayload,
  elementTargetValue,
  mutatingBadge,
  toolInput,
} from './shared.js'

const SourcePayload = z.looseObject({
  component: z.string().nullish(),
  source: z.looseObject({file: z.string(), line: z.number().optional()}).nullish(),
  frames: z
    .array(z.looseObject({fileName: z.string().optional(), line: z.number().optional(), fn: z.string().optional()}))
    .optional(),
})

const TrackPayload = z.looseObject({
  components: z.array(z.looseObject({component: z.string(), renders: z.number(), lastReason: z.string().optional()})),
  note: z.string().optional(),
})

const RENDER_FORMAT = new Intl.NumberFormat()
const RENDER_PLURAL = new Intl.PluralRules('en')

const HEADLINE = 'text-[length:var(--chat-text-sm)] m-0 flex flex-wrap gap-x-2 gap-y-0.5 items-baseline'
const COMPONENT_NAME = '[color:var(--chat-text-hi)] [font-family:var(--chat-mono)] min-w-0 [overflow-wrap:anywhere]'
const SOURCE_LOCATION =
  'text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)] [font-family:var(--chat-mono)] min-w-0 [overflow-wrap:anywhere]'

function renderLabel(renders: number): string {
  return `${RENDER_FORMAT.format(renders)} ${RENDER_PLURAL.select(renders) === 'one' ? 'render' : 'renders'}`
}

function locationLabel(file: string, line: number | undefined): string {
  return line === undefined ? file : `${file}:${line}`
}

function frameLocation(frame: {fileName?: string; line?: number} | undefined): string | undefined {
  if (frame?.fileName === undefined) return undefined
  return locationLabel(frame.fileName, frame.line)
}

function sourceOf(payload: unknown): {component: string | undefined; location: string | undefined} {
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

function trackOf(payload: unknown): TrackReportView | undefined {
  const parsed = TrackPayload.safeParse(payload)
  if (!parsed.success) return undefined
  return {components: parsed.data.components, note: parsed.data.note}
}

export function ReactCard(props: ToolCardProps): JSX.Element {
  const {meta, title} = cardHeader(props)
  const input = () => toolInput(props.part)
  const element = () => elementTargetValue(input())
  const chips = () => detailChips(meta(), input(), ELEMENT_TARGET_KEYS)
  const payload = () => cardPayload(props.result)
  const descriptor = () => sourceOf(payload())
  const track = () => trackOf(payload())
  const errorMessage = () => cardErrorMessage(props.result)
  return (
    <CardShell
      meta={meta()}
      title={title()}
      metaBadge={mutatingBadge(meta())}
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
    >
      <div class="flex flex-col gap-1.5">
        <Show when={descriptor().component !== undefined || descriptor().location !== undefined}>
          <p class={HEADLINE}>
            <Show when={descriptor().component}>{(name) => <span class={COMPONENT_NAME}>{name()}</span>}</Show>
            <Show when={descriptor().location}>{(location) => <span class={SOURCE_LOCATION}>{location()}</span>}</Show>
          </p>
        </Show>
        <ChipRow element={element()} chips={chips()} />
        <Switch>
          <Match when={errorMessage()}>{(message) => <p class={DANGER_TEXT_CLASS}>{message()}</p>}</Match>
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
    </CardShell>
  )
}
