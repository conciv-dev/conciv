import {z} from 'zod'
import {createMemo, Index, Match, Show, Switch, useContext, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import type {InternalUi, ToolProps, ToolStatus} from '@internal/plugin'
import {
  PAGE_ACT_TOOL_NAMES,
  PAGE_TOOL_PREFIX,
  pageOperation,
  pageVerbOfTool,
  type ToolCaptureView,
} from '@conciv/plugin-page/rpc'
import {
  cardErrorMessage,
  countLabel,
  mutatingBadge,
  pageStepView,
  pageVerbGerund,
  toolInput,
  usePageUi,
} from './shared.js'
import {CaptureContext, SessionCaptures} from './captures.js'

const SESSION_LABEL = {
  edit: {running: 'Editing the page', done: 'Edited the page'},
  script: {running: 'Running script on the page', done: 'Ran script on the page'},
}

const SESSION_SUMMARY = 'the AI drove the live page'

const HEAD = 'flex flex-1 items-center gap-2 min-w-0 ps-4 h-9'
const HEAD_DOTS = 'flex gap-2 flex-none'
const HEAD_TITLE = 'flex-1 min-w-[9ch] text-[length:var(--chat-text-md)] [color:var(--chat-text)]'
const HEAD_COUNT =
  'hidden @sm:inline flex-none min-w-[9ch] text-end whitespace-nowrap [font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)] text-chat-text-3 tabular-nums'
const HEAD_SPACER = 'flex-1 min-w-0 flex self-stretch my-1.5'
const HEAD_URL = 'hidden @md:inline-flex anim-combo flex-1'
const HEAD_STATE =
  'hidden @xs:grid flex-none min-w-[9ch] justify-items-end whitespace-nowrap [font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)]'
const HEAD_STATE_LIVE = '[color:var(--chat-accent)]'
const HEAD_STATE_SETTLED = 'text-chat-text-3'
const ACTING_LABEL = 'acting'

const RAIL =
  'm-0 p-0 list-none grid grid-cols-[auto_minmax(5rem,max-content)_1fr_minmax(0,max-content)] gap-x-2.5 w-full overflow-hidden'
const ROW =
  'group px-2.5 py-1.5 grid grid-cols-subgrid col-span-4 items-center min-w-0 [&:not(:first-child)]:[border-top:1px_solid_var(--chat-line-soft)] [transition:background_140ms_var(--chat-ease)] hover:[background:var(--chat-fill)]'
const ROW_ENTRANCE = '[[data-state=open]_&]:anim-msg animate-fill-backwards'
const ROW_DELAYS = [
  'animate-delay-[0ms]',
  'animate-delay-[25ms]',
  'animate-delay-[50ms]',
  'animate-delay-[75ms]',
  'animate-delay-[100ms]',
  'animate-delay-[125ms]',
  'animate-delay-[150ms]',
  'animate-delay-[175ms]',
] as const
const ROW_GLYPH =
  'flex-none size-5.5 inline-flex items-center justify-center rounded-md [border:1px_solid_var(--chat-line)] text-[length:var(--chat-text-xs)] [font-family:var(--chat-mono)] tabular-nums text-chat-text-3'
const ROW_GLYPH_DONE = `${ROW_GLYPH} [border:1px_solid_var(--chat-success)]`
const ROW_GLYPH_ERROR = `${ROW_GLYPH} [border:1px_solid_var(--chat-danger-line)]`
const ROW_GLYPH_ACTIVE = `${ROW_GLYPH} [border:1px_solid_color-mix(in_srgb,var(--chat-accent)_50%,transparent)]`
const ROW_VERB =
  'inline-flex items-center gap-1 [font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)] [transition:color_140ms_var(--chat-ease)]'
const ROW_VERB_NEUTRAL = `${ROW_VERB} text-chat-text-3 group-hover:text-chat-text-2`
const ROW_VERB_DONE = `${ROW_VERB} [color:var(--chat-success)]`
const ROW_VERB_ERROR = `${ROW_VERB} [color:var(--chat-danger)]`
const ROW_VERB_LABEL = 'min-w-0 truncate whitespace-nowrap'
const ROW_TARGET = 'flex-1 min-w-0 truncate text-[length:var(--chat-text-sm)] [color:var(--chat-text)]'
const ROW_TARGET_ERROR = 'flex-1 min-w-0 truncate text-[length:var(--chat-text-sm)] [color:var(--chat-danger)]'
const ROW_TARGET_ABORTED = 'flex-1 min-w-0 truncate text-[length:var(--chat-text-sm)] text-chat-text-3'
const ROW_TARGET_ACTIVE = 'flex-1 min-w-0 truncate text-[length:var(--chat-text-sm)]'
const ROW_VALUE = 'hidden @sm:inline-flex anim-combo min-w-0 leading-none'

const RoutePayload = pageOperation('route').output.pick({href: true})

function actionsLabel(count: number): string {
  return countLabel(count, 'action', 'actions')
}

function displayLocation(href: string): string {
  try {
    const parsed = new URL(href)
    return `${parsed.host}${parsed.pathname}`
  } catch {
    return href
  }
}

function sessionLocation(
  ui: InternalUi,
  parts: ReadonlyArray<ToolCallPart>,
  resultFor: (toolCallId: string) => ToolResultPart | undefined,
  streaming: boolean,
): string | undefined {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]
    if (part === undefined || part.name !== `${PAGE_TOOL_PREFIX}route`) continue
    const payload = RoutePayload.safeParse(ui.parseResultPayload(resultFor(part.id)))
    if (payload.success) return displayLocation(payload.data.href)
  }
  if (!streaming) return undefined
  if (typeof location === 'undefined') return 'live page'
  return `${location.host}${location.pathname}`
}

const ScriptInput = z.looseObject({typescriptCode: z.string()})

function sessionScripts(ui: InternalUi, parts: ReadonlyArray<ToolCallPart>): string[] {
  return parts.flatMap((part) => {
    if (PAGE_ACT_TOOL_NAMES.has(part.name) || part.name.startsWith(PAGE_TOOL_PREFIX)) return []
    const input = ui.parseInput(ScriptInput, part)
    return input ? [input.typescriptCode] : []
  })
}

function contextLabel(thinkingCount: number, scriptCount: number): string {
  if (thinkingCount > 0 && scriptCount > 0) return 'Reasoning · script'
  if (thinkingCount > 0) return 'Reasoning'
  return 'Script'
}

function sessionErrorMessage(
  ui: InternalUi,
  parts: ReadonlyArray<ToolCallPart>,
  resultFor: (toolCallId: string) => ToolResultPart | undefined,
): string | undefined {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]
    if (part === undefined) continue
    const message = cardErrorMessage(ui, resultFor(part.id))
    if (message !== undefined) return message
  }
  return undefined
}

function sessionStatus(steps: ReadonlyArray<PageSessionStep>, streaming: boolean, errored: boolean): ToolStatus {
  if (streaming) return 'running'
  return errored || steps.some((step) => step.state === 'error') ? 'error' : 'complete'
}

function activeSentence(step: PageSessionStep): string {
  const target = step.namedTarget ? `“${step.target}”` : step.target
  return `${pageVerbGerund(step.verb)} ${target}…`
}

function rowGlyphClass(state: PageSessionStep['state'], streaming: boolean): string {
  if (state === 'error') return ROW_GLYPH_ERROR
  if (state === 'streaming') return ROW_GLYPH_ACTIVE
  return streaming ? ROW_GLYPH_DONE : ROW_GLYPH
}

function rowClass(index: number): string {
  const delay = ROW_DELAYS[Math.min(index, ROW_DELAYS.length - 1)] ?? ''
  return `${ROW} ${ROW_ENTRANCE} ${delay}`
}

function StepGlyph(props: {step: PageSessionStep; ordinal: number; streaming: boolean}): JSX.Element {
  const ui = usePageUi()
  return (
    <span class={rowGlyphClass(props.step.state, props.streaming)}>
      <Switch fallback={<>{props.ordinal}</>}>
        <Match when={props.step.state === 'error'}>
          <ui.StatusVisual status="error" form="icon" />
        </Match>
        <Match when={props.step.state === 'streaming'}>
          <ui.StatusVisual status="running" form="icon" />
        </Match>
        <Match when={props.streaming}>
          <ui.StatusVisual status="complete" form="icon" />
        </Match>
      </Switch>
    </span>
  )
}

function rowVerbClass(state: PageSessionStep['state'], streaming: boolean): string {
  if (state === 'error') return ROW_VERB_ERROR
  if (state === 'complete' && streaming) return ROW_VERB_DONE
  return ROW_VERB_NEUTRAL
}

function rowTargetClass(ui: InternalUi, state: PageSessionStep['state']): string {
  if (state === 'error') return ROW_TARGET_ERROR
  if (state === 'streaming') return `${ROW_TARGET_ACTIVE} ${ui.SHIMMER}`
  if (state === 'aborted') return ROW_TARGET_ABORTED
  return ROW_TARGET
}

function stepLabel(step: PageSessionStep, view: ReturnType<typeof pageStepView>): string {
  if (view === undefined) return step.verb
  return step.state === 'complete' ? view.label.done : view.label.running
}

function StepRow(props: {step: PageSessionStep; index: number; streaming: boolean}): JSX.Element {
  const ui = usePageUi()
  const view = () => pageStepView(props.step.verb)
  return (
    <li class={rowClass(props.index)}>
      <StepGlyph step={props.step} ordinal={props.index + 1} streaming={props.streaming} />
      <span class={rowVerbClass(props.step.state, props.streaming)}>
        <span class="inline-flex shrink-0" aria-hidden="true">
          <Dynamic component={view()?.icon ?? ui.GENERIC_TOOL_ICON} size={12} />
        </span>
        <span class={ROW_VERB_LABEL}>{stepLabel(props.step, view())}</span>
      </span>
      <ui.TruncatedText
        class={rowTargetClass(ui, props.step.state)}
        text={props.step.state === 'streaming' ? activeSentence(props.step) : props.step.target}
      />
      <Show when={props.step.value}>
        {(value) => <ui.KitChip kind="pill" tone="accent" compact value={`“${value()}”`} class={ROW_VALUE} />}
      </Show>
    </li>
  )
}

function SessionHeader(props: {
  title: string
  count: string
  url?: string
  streaming: boolean
  status: ToolStatus
}): JSX.Element {
  const ui = usePageUi()
  return (
    <span class={HEAD}>
      <span class={HEAD_DOTS} aria-hidden="true">
        <ui.StatusDot tone="danger" />
        <ui.StatusDot tone="warning" />
        <ui.StatusDot tone="success" />
      </span>
      <ui.CardHeadline class="flex-1">
        <ui.MorphLabel text={props.title} boxClass={`${HEAD_TITLE} ${ui.CARD_HEADLINE_TEXT}`} />
        <span class={`${HEAD_COUNT}  ${ui.CARD_HEADLINE_TEXT}`}>{props.count}</span>
      </ui.CardHeadline>
      <span class={HEAD_SPACER}>
        <Show when={props.url}>{(url) => <ui.KitChip kind="pill" value={url()} class={HEAD_URL} />}</Show>
      </span>
      <ui.MorphLabel
        text={props.streaming ? ACTING_LABEL : (mutatingBadge(true) ?? '')}
        boxClass={HEAD_STATE}
        class={props.streaming ? HEAD_STATE_LIVE : HEAD_STATE_SETTLED}
      />
      <ui.StatusVisual status={props.status} form="dot" />
    </span>
  )
}

const ToolCallShape = z.looseObject({type: z.literal('tool-call'), id: z.string(), name: z.string()})

const ToolResultShape = z.looseObject({type: z.literal('tool-result'), toolCallId: z.string()})

const ThinkingShape = z.looseObject({type: z.literal('thinking'), content: z.string()})

const SessionMetadata = z.looseObject({
  parts: z.array(z.unknown()).catch([]),
  results: z.array(z.unknown()).catch([]),
  folded: z.boolean().catch(false),
})

function isToolCall(value: unknown): value is ToolCallPart {
  return ToolCallShape.safeParse(value).success
}

function isToolResult(value: unknown): value is ToolResultPart {
  return ToolResultShape.safeParse(value).success
}

function thinkingText(value: unknown): string[] {
  const thinking = ThinkingShape.safeParse(value)
  return thinking.success && thinking.data.content.trim().length > 0 ? [thinking.data.content] : []
}

export function PageSessionCard(props: ToolProps): JSX.Element {
  return (
    <SessionCaptures sessionID={props.sessionID}>
      <SessionCard {...props} />
    </SessionCaptures>
  )
}

export function SessionCard(props: ToolProps): JSX.Element {
  const ui = usePageUi()
  const captureFor = useContext(CaptureContext)
  const metadata = createMemo(() => SessionMetadata.parse(props.metadata))
  const parts = createMemo(() => metadata().parts.filter(isToolCall))
  const results = createMemo(() => metadata().results.filter(isToolResult))
  const thinking = createMemo(() => metadata().parts.flatMap(thinkingText))
  const resultFor = (toolCallId: string): ToolResultPart | undefined =>
    results().find((result) => result.toolCallId === toolCallId)
  const streaming = () => props.status === 'running'
  const steps = createMemo(() => pageSessionSteps(ui, parts(), resultFor, captureFor, PAGE_ACT_TOOL_NAMES, streaming()))
  const errorMessage = () => sessionErrorMessage(ui, parts(), resultFor)
  const status = () => sessionStatus(steps(), streaming(), errorMessage() !== undefined)
  const title = () => {
    const labels = pageSessionScripted(steps()) ? SESSION_LABEL.script : SESSION_LABEL.edit
    return streaming() ? labels.running : labels.done
  }
  const scripts = createMemo(() => sessionScripts(ui, parts()))
  return (
    <Show when={steps().length > 0 ? parts()[0] : undefined}>
      {(anchor) => (
        <ui.ToolCard
          title={title()}
          titleTooltip={SESSION_SUMMARY}
          part={anchor()}
          result={resultFor(anchor().id)}
          status={status()}
          autoOpen
          folded={metadata().folded}
          flushHeader
          class="@container"
          header={
            <SessionHeader
              title={title()}
              count={actionsLabel(steps().length)}
              url={sessionLocation(ui, parts(), resultFor, streaming())}
              streaming={streaming()}
              status={status()}
            />
          }
        >
          <div class="flex flex-col gap-1.5">
            <ul class={`${RAIL}  ${ui.SUNKEN_SURFACE}`}>
              <Index each={steps()}>
                {(step, index) => <StepRow step={step()} index={index} streaming={streaming()} />}
              </Index>
            </ul>
            <Show when={thinking().length > 0 || scripts().length > 0}>
              <ui.CollapsibleSection header={<span>{contextLabel(thinking().length, scripts().length)}</span>}>
                <div class="flex flex-col gap-2 min-w-0">
                  <Index each={thinking()}>{(text) => <ui.ReasoningText text={text()} />}</Index>
                  <Index each={scripts()}>
                    {(script) => <ui.CodeBlock file={{name: 'session.ts', lang: 'ts', contents: script()}} />}
                  </Index>
                </div>
              </ui.CollapsibleSection>
            </Show>
            <Show when={errorMessage()}>{(message) => <ui.ErrorMessage message={message()} />}</Show>
          </div>
        </ui.ToolCard>
      )}
    </Show>
  )
}

type PageSessionStep = {
  verb: string
  target: string
  namedTarget: boolean
  value?: string
  state: 'streaming' | 'complete' | 'error' | 'aborted'
}

const FIXED_TARGETS: Record<string, string> = {css: 'stylesheet', eval: 'script', effect: 'effect'}

const SCRIPT_VERBS = new Set(['eval', 'css', 'effect'])

const CODE_TARGET_KEYS: Record<string, string> = {eval: 'code'}

const CODE_INPUT_KEYS: Record<string, string> = {css: 'text'}

function firstMeaningfulLine(text: string): string | undefined {
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length > 0) return trimmed
  }
  return undefined
}

export function pageSessionScripted(steps: ReadonlyArray<PageSessionStep>): boolean {
  return steps.length > 0 && steps.every((step) => SCRIPT_VERBS.has(step.verb))
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function descriptorField(capture: ToolCaptureView | undefined, field: 'accessibleName' | 'value'): string | undefined {
  return nonEmpty(capture?.after?.descriptor[field]) ?? nonEmpty(capture?.before?.descriptor[field])
}

function codeTargetLine(ui: InternalUi, verb: string, input: Record<string, unknown>): string | undefined {
  const codeKey = CODE_TARGET_KEYS[verb]
  if (codeKey === undefined) return undefined
  const source = nonEmpty(input[codeKey])
  if (source === undefined) return undefined
  const line = firstMeaningfulLine(source)
  return line === undefined ? undefined : ui.clip(line)
}

function stepTarget(
  ui: InternalUi,
  verb: string,
  input: Record<string, unknown>,
  capture: ToolCaptureView | undefined,
): {target: string; namedTarget: boolean} {
  const codeLine = codeTargetLine(ui, verb, input)
  if (codeLine !== undefined) return {target: codeLine, namedTarget: false}
  const fixed = FIXED_TARGETS[verb]
  if (fixed !== undefined) return {target: fixed, namedTarget: false}
  const named = descriptorField(capture, 'accessibleName')
  if (named !== undefined) return {target: named, namedTarget: true}
  const located = nonEmpty(input.selector) ?? nonEmpty(input.ref)
  if (located !== undefined) return {target: located, namedTarget: false}
  const componentName = nonEmpty(input.name)
  if (componentName !== undefined) return {target: componentName, namedTarget: true}
  return {target: 'page', namedTarget: false}
}

function stepValue(
  ui: InternalUi,
  verb: string,
  input: Record<string, unknown>,
  capture: ToolCaptureView | undefined,
): string | undefined {
  const codeKey = CODE_INPUT_KEYS[verb]
  if (codeKey !== undefined) {
    const source = nonEmpty(input[codeKey])
    if (source === undefined) return undefined
    return ui.clip(firstMeaningfulLine(source) ?? source)
  }
  return nonEmpty(input.value) ?? descriptorField(capture, 'value')
}

function stepState(result: ToolResultPart | undefined, streaming: boolean): PageSessionStep['state'] {
  if (result?.state === 'error') return 'error'
  if (result?.state === 'complete') return 'complete'
  return streaming ? 'streaming' : 'aborted'
}

export function pageSessionSteps(
  ui: InternalUi,
  parts: ReadonlyArray<ToolCallPart>,
  resultFor: (toolCallId: string) => ToolResultPart | undefined,
  captureFor: (toolCallId: string) => ToolCaptureView | undefined,
  actNames: ReadonlySet<string>,
  streaming: boolean,
): PageSessionStep[] {
  return parts
    .filter((part) => actNames.has(part.name))
    .map((part) => {
      const verb = pageVerbOfTool(part.name)
      const input = toolInput(ui, part)
      const capture = captureFor(part.id)
      return {
        verb,
        ...stepTarget(ui, verb, input, capture),
        value: stepValue(ui, verb, input, capture),
        state: stepState(resultFor(part.id), streaming),
      }
    })
}
