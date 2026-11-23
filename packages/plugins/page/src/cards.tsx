import type {ToolComponent, ToolProps} from '@conciv/plugin/experimental'
import {PAGE_SESSION_GROUP_KEY, type AttachmentCardSlot, type GroupEntry} from '@conciv/ui-kit-chat'
import {GRAB_MIME} from '@conciv/grab/grab-attachment'
import {GrabCard} from './grab-card.js'
import {PageSessionCard} from './session-card.js'
import {PAGE_TOOL_PREFIX, pageOperation, pageVerbOfTool} from './rpc.js'
import {Show, type JSX, For, Match, Switch} from 'solid-js'
import {DANGER_TEXT_CLASS, JsonTree, SUNKEN_SURFACE, ResultImage, CodeBlock, Chip} from '@conciv/ui-kit-chat/tools'
import {
  ELEMENT_TARGET_KEYS,
  PageTool,
  elementTarget,
  LIST_ROW_CLASS,
  QUIET_TEXT_CLASS,
  countLabel,
  outputPayload,
  ChipRow,
  outputChips,
  outputImageUrl,
  pageTitle,
} from './shared.js'
import {z} from 'zod'
import {StatusDot, type StatusDotTone, TruncatedText} from '@conciv/ui-kit-system'
import type {TrackReport} from './react.js'
import {RawFrameSchema} from '@conciv/contract'
import type {buildSnapshot} from './snapshot.js'
import {html} from 'js-beautify'

function pageNames(verbs: string[]): string[] {
  return verbs.map((verb) => `${PAGE_TOOL_PREFIX}${verb}`)
}

export const pageToolCards: ReadonlyArray<{card: ToolComponent; tools: string[]}> = [
  {card: ReadValueCard, tools: pageNames(['route', 'exists', 'screenshot', 'hmr', 'text', 'value', 'attr'])},
  {card: ConsoleCard, tools: pageNames(['console'])},
  {card: ReadBulkCard, tools: pageNames(['dom', 'query', 'snapshot'])},
  {card: ReactCard, tools: pageNames(['locate', 'inspect', 'override', 'tree', 'find', 'track'])},
  {card: EffectCard, tools: pageNames(['effect'])},
  {
    card: ActCard,
    tools: pageNames([
      'wait',
      'reload',
      'click',
      'hover',
      'scroll',
      'submit',
      'fill',
      'select',
      'check',
      'uncheck',
      'press',
      'queue',
    ]),
  },
  {
    card: EditLiveCard,
    tools: pageNames([
      'setattr',
      'removeattr',
      'addclass',
      'removeclass',
      'setstyle',
      'settext',
      'sethtml',
      'remove',
      'insert',
      'css',
      'eval',
    ]),
  },
]

export const pageSessionEntry: GroupEntry = {key: PAGE_SESSION_GROUP_KEY, render: PageSessionCard}

export const pageAttachmentCards: AttachmentCardSlot[] = [{mime: GRAB_MIME, render: GrabCard}]

export function ActCard(props: ToolProps): JSX.Element {
  return <PageTool {...props} subtitle={elementTarget(props.input)} skip={ELEMENT_TARGET_KEYS} hasContent={false} />
}

const ConsolePayload = pageOperation('console').output

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {hour: '2-digit', minute: '2-digit', second: '2-digit'})

const CONSOLE_LIST = `m-0 p-0 list-none block w-full max-h-[13.75rem] overflow-auto text-[length:var(--chat-text-xs)] ${SUNKEN_SURFACE}`
const LEVEL = 'text-[length:var(--chat-text-xs)] flex-none w-10 uppercase [font-family:var(--chat-mono)]'
const LEVEL_QUIET = `${LEVEL} text-chat-text-3`
const LEVEL_DANGER = `${LEVEL} text-chat-danger`
const TIME = 'text-[length:var(--chat-text-xs)] flex-none text-chat-text-3 [font-family:var(--chat-mono)] tabular-nums'
const TEXT =
  'text-[length:var(--chat-text-sm)] flex-1 min-w-0 whitespace-pre-wrap [color:var(--chat-text)] [font-family:var(--chat-mono)] [overflow-wrap:anywhere]'
const TEXT_DANGER = `${DANGER_TEXT_CLASS} flex-1 min-w-0 [overflow-wrap:anywhere]`

const ERROR_LEVELS: ReadonlySet<string> = new Set(['error', 'uncaught', 'unhandled'])

type ConsoleLine = z.output<typeof ConsolePayload>['entries'][number]

function readLines(payload: unknown): readonly ConsoleLine[] | undefined {
  const parsed = ConsolePayload.safeParse(payload)
  return parsed.success ? parsed.data.entries : undefined
}

function lineLabel(count: number): string {
  return countLabel(count, 'line', 'lines')
}

function isErrorLevel(level: string): boolean {
  return ERROR_LEVELS.has(level)
}

function pickTextClass(level: string): string {
  return isErrorLevel(level) ? TEXT_DANGER : TEXT
}

function pickLevelClass(level: string): string {
  return isErrorLevel(level) ? LEVEL_DANGER : LEVEL_QUIET
}

export function ConsoleCard(props: ToolProps): JSX.Element {
  const payload = () => outputPayload(props.output)
  const lines = () => readLines(payload())
  const failed = () => (lines() ?? []).some((entry) => isErrorLevel(entry.level))
  return (
    <PageTool {...props} failed={failed()} hasContent={payload() !== undefined}>
      <div class="flex flex-col gap-1.5">
        <Switch>
          <Match when={lines()}>
            {(entries) => (
              <Show
                when={entries().length > 0}
                fallback={<p class={QUIET_TEXT_CLASS}>the page logged nothing to the console</p>}
              >
                <p class="m-0">
                  <PageValueChip value={lineLabel(entries().length)} />
                </p>
                <ul class={CONSOLE_LIST}>
                  <For each={entries()}>
                    {(entry) => (
                      <li class={LIST_ROW_CLASS}>
                        <span class={TIME}>{TIME_FORMAT.format(entry.ts)}</span>
                        <span class={pickLevelClass(entry.level)}>{entry.level}</span>
                        <span class={pickTextClass(entry.level)}>{entry.text}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
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

const [SingleEffect, EffectList] = pageOperation('effect').output.options

const EFFECT_NAME_KEYS = new Set(['effect'])

const EFFECT_LIST = 'm-0 p-0 list-none flex flex-col gap-1.5'
const ROW = 'text-[length:var(--chat-text-sm)] m-0 flex gap-2 items-center'
const EFFECT_NAME = '[color:var(--chat-text)] [font-family:var(--chat-mono)] min-w-0 [overflow-wrap:anywhere]'
const DESCRIPTION = 'text-[length:var(--chat-text-xs)] flex-1 min-w-0 text-chat-text-3'
const STATE = 'text-[length:var(--chat-text-xs)] flex-none text-chat-text-2'

type EffectRow = {name: string; description: string | undefined; enabled: boolean}

function pickTone(enabled: boolean): StatusDotTone {
  return enabled ? 'success' : 'idle'
}

function stateLabel(enabled: boolean): string {
  return enabled ? 'on' : 'off'
}

function readRows(payload: unknown): readonly EffectRow[] | undefined {
  const single = SingleEffect.safeParse(payload)
  if (single.success) return [{name: single.data.effect, description: undefined, enabled: single.data.enabled}]
  const list = EffectList.safeParse(payload)
  if (!list.success) return undefined
  return list.data.effects.map((effect) => ({
    name: effect.name,
    description: effect.description,
    enabled: effect.enabled,
  }))
}

function EffectRowView(props: {row: EffectRow}): JSX.Element {
  return (
    <p class={ROW}>
      <StatusDot tone={pickTone(props.row.enabled)} />
      <span class={EFFECT_NAME}>{props.row.name}</span>
      <Show when={props.row.description}>{(description) => <span class={DESCRIPTION}>{description()}</span>}</Show>
      <span class={STATE}>{stateLabel(props.row.enabled)}</span>
    </p>
  )
}

export function EffectCard(props: ToolProps): JSX.Element {
  const payload = () => outputPayload(props.output)
  const rows = () => readRows(payload())
  const skip = () => (rows() === undefined ? undefined : EFFECT_NAME_KEYS)
  return (
    <PageTool {...props} skip={skip()} hasContent={payload() !== undefined}>
      <div class="flex flex-col gap-1.5">
        <Switch>
          <Match when={rows()}>
            {(list) => (
              <Show when={list().length > 0} fallback={<p class={QUIET_TEXT_CLASS}>the page registered no effects</p>}>
                <ul class={EFFECT_LIST}>
                  <For each={list()}>
                    {(row) => (
                      <li>
                        <EffectRowView row={row} />
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
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

const SourcePayload = pageOperation('locate').output.extend({frames: z.array(RawFrameSchema).optional()})

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

const HtmlPayload = pageOperation('dom').output

const NodesPayload = z.looseObject({
  nodes: z.array(
    z.looseObject({
      ref: z.string().optional(),
      role: z.string().optional(),
      name: z.string().optional(),
      value: z.string().optional(),
      state: z.array(z.string()).optional(),
    }),
  ),
})

const MatchesPayload = pageOperation('query').output

function matchLabel(count: number): string {
  return countLabel(count, 'match', 'matches')
}

function readHtml(payload: unknown): string | undefined {
  const parsed = HtmlPayload.safeParse(payload)
  return parsed.success ? parsed.data.html : undefined
}

function readNodes(payload: unknown): readonly A11yNode[] | undefined {
  const parsed = NodesPayload.safeParse(payload)
  return parsed.success ? parsed.data.nodes : undefined
}

function readMatches(payload: unknown): {count: number; elements: readonly unknown[]} | undefined {
  const parsed = MatchesPayload.safeParse(payload)
  return parsed.success ? parsed.data : undefined
}

export function ReadBulkCard(props: ToolProps): JSX.Element {
  const payload = () => outputPayload(props.output)
  const markup = () => readHtml(payload())
  const nodes = () => readNodes(payload())
  const matches = () => readMatches(payload())
  return (
    <PageTool
      {...props}
      subtitle={elementTarget(props.input)}
      skip={ELEMENT_TARGET_KEYS}
      hasContent={payload() !== undefined}
    >
      <div class="flex flex-col gap-1.5">
        <Switch>
          <Match when={markup() !== undefined}>
            <Show when={markup()} fallback={<p class={QUIET_TEXT_CLASS}>the element has no markup</p>}>
              {(value) => <PageHtmlBlock markup={value()} />}
            </Show>
          </Match>
          <Match when={nodes()}>
            {(list) => (
              <Show
                when={list().length > 0}
                fallback={<p class={QUIET_TEXT_CLASS}>the snapshot found no accessible nodes</p>}
              >
                <A11yNodeList nodes={list()} />
              </Show>
            )}
          </Match>
          <Match when={matches()}>
            {(found) => (
              <>
                <p class="m-0">
                  <PageValueChip value={matchLabel(found().count)} />
                </p>
                <Show when={found().elements.length > 0}>
                  <JsonTree data={found().elements} />
                </Show>
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

function payloadIsStructured(payload: unknown): boolean {
  return typeof payload === 'object' && payload !== null
}

export function ReadValueCard(props: ToolProps): JSX.Element {
  const payload = () => outputPayload(props.output)
  const nested = () => payloadIsStructured(payload())
  const values = () => outputChips(props.output)
  const imageUrl = () => outputImageUrl(props.output)
  return (
    <PageTool
      {...props}
      subtitle={elementTarget(props.input)}
      skip={ELEMENT_TARGET_KEYS}
      hasContent={imageUrl() !== undefined || nested() || values().length > 0}
    >
      <div class="flex flex-col gap-1.5">
        <Switch>
          <Match when={imageUrl()}>{(url) => <ResultImage src={url()} alt={pageTitle(props.tool, false)} />}</Match>
          <Match when={nested()}>
            <JsonTree data={payload()} />
          </Match>
          <Match when={values().length > 0}>
            <ChipRow chips={values()} />
          </Match>
        </Switch>
      </div>
    </PageTool>
  )
}

const CODE_VERBS = new Set(['eval', 'css'])

const CODE_INPUT_KEYS = new Set(['code', 'text'])

function codeLanguage(verb: string): string {
  return verb === 'css' ? 'css' : 'javascript'
}

function codeFileName(verb: string): string {
  return verb === 'css' ? 'style.css' : 'script.js'
}

function codeContents(input: Record<string, unknown>): string {
  const value = input.code ?? input.text
  return typeof value === 'string' ? value : ''
}

export function EditLiveCard(props: ToolProps): JSX.Element {
  const verb = () => pageVerbOfTool(props.tool)
  const isCode = () => CODE_VERBS.has(verb())
  return (
    <PageTool {...props} skip={isCode() ? CODE_INPUT_KEYS : undefined} hasContent={isCode()}>
      <Show when={isCode()}>
        <CodeBlock
          file={{
            name: codeFileName(verb()),
            lang: codeLanguage(verb()),
            contents: codeContents(props.input),
          }}
        />
      </Show>
    </PageTool>
  )
}

const HTML_CLASS = 'max-w-full'
const A11Y_LIST = `m-0 p-0 list-none max-h-[13.75rem] w-full ${SUNKEN_SURFACE} overflow-auto`
const LIST_ITEM = `text-[length:var(--chat-text-xs)] ${LIST_ROW_CLASS}`
const ROLE =
  'text-[length:var(--chat-text-xs)] flex-none [color:var(--chat-accent-link)] [font-family:var(--chat-mono)]'
const A11Y_NAME = 'flex-1 min-w-0 whitespace-nowrap text-ellipsis [color:var(--chat-text)] overflow-hidden'
const REF = 'text-[length:var(--chat-text-xs)] flex-none text-chat-text-3 [font-family:var(--chat-mono)]'

export type A11yNode = Partial<ReturnType<typeof buildSnapshot>[number]>

export function A11yNodeList(props: {nodes: readonly A11yNode[]}): JSX.Element {
  return (
    <ul class={A11Y_LIST}>
      <For each={props.nodes}>
        {(node) => (
          <li class={LIST_ITEM}>
            <Show when={node.role}>
              <span class={ROLE}>{node.role}</span>
            </Show>
            <Show when={node.name}>{(name) => <TruncatedText class={A11Y_NAME} text={name()} />}</Show>
            <Show when={node.ref}>
              <span class={REF}>{node.ref}</span>
            </Show>
          </li>
        )}
      </For>
    </ul>
  )
}

export function PageHtmlBlock(props: {markup: string}): JSX.Element {
  return (
    <CodeBlock
      class={HTML_CLASS}
      maxHeight="log"
      chrome="file"
      file={{name: 'page.html', lang: 'html', contents: formatHtml(props.markup)}}
    />
  )
}

export function PageValueChip(props: {value: string}): JSX.Element {
  return <Chip kind="pill" tone="accent" value={props.value} />
}

export function formatHtml(src: string): string {
  try {
    return html(src, {indent_size: 2, wrap_line_length: 0, preserve_newlines: false})
  } catch {
    return src
  }
}
