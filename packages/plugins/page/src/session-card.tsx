import {z} from 'zod'
import {createMemo, Index, Match, Show, Switch, useContext, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import {
  pageSessionCallParts,
  pageSessionThinkingParts,
  MorphLabel,
  ReasoningText,
  type GroupRenderProps,
} from '@conciv/ui-kit-chat'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {StatusDot, TruncatedText} from '@conciv/ui-kit-system'
import {
  CARD_HEADLINE_TEXT,
  CardHeadline,
  Chip,
  CodeBlock,
  CollapsibleSection,
  ErrorBlock,
  parseInput,
  parseResultPayload,
  SHIMMER,
  SUNKEN_SURFACE,
  StatusVisual,
  ToolCard,
  toolIconRender,
  type ToolStatus,
  clip,
} from '@conciv/ui-kit-chat/tools'
import {
  PAGE_ACT_TOOL_NAMES,
  PAGE_TOOL_PREFIX,
  pageOperation,
  pageToolMeta,
  pageVerbGerund,
  pageVerbOfTool,
} from './rpc.js'
import {cardErrorMessage, countLabel, mutatingBadge, toolInput} from './shared.js'
import {CaptureContext, SessionCaptures} from './captures.js'
import type {ToolCaptureView} from '@conciv/protocol/element-capture-types'

const SESSION_LABEL = {
  edit: {running: 'Editing the page', done: 'Edited the page'},
  script: {running: 'Running script on the page', done: 'Ran script on the page'},
}

const SESSION_META: ToolViewMeta = {
  summary: 'the AI drove the live page',
  category: 'act',
  icon: 'pointer',
  label: SESSION_LABEL.edit,
  mutating: true,
}

const HEAD = 'flex flex-1 items-center gap-2 min-w-0 ps-4 h-9'
const HEAD_DOTS = 'flex gap-2 flex-none'
const HEAD_TITLE = `flex-1 min-w-[9ch] text-[length:var(--chat-text-md)] [color:var(--chat-text)] ${CARD_HEADLINE_TEXT}`
const HEAD_COUNT = `hidden @sm:inline flex-none min-w-[9ch] text-end whitespace-nowrap [font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)] text-chat-text-3 tabular-nums ${CARD_HEADLINE_TEXT}`
const HEAD_SPACER = 'flex-1 min-w-0 flex self-stretch my-1.5'
const HEAD_URL = 'hidden @md:inline-flex anim-combo flex-1'
const HEAD_STATE =
  'hidden @xs:grid flex-none min-w-[9ch] justify-items-end whitespace-nowrap [font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)]'
const HEAD_STATE_LIVE = '[color:var(--chat-accent)]'
const HEAD_STATE_SETTLED = 'text-chat-text-3'
const ACTING_LABEL = 'acting'

const RAIL = `m-0 p-0 list-none grid grid-cols-[auto_minmax(5rem,max-content)_1fr_minmax(0,max-content)] gap-x-2.5 w-full ${SUNKEN_SURFACE} overflow-hidden`
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
const ROW_TARGET_ACTIVE = `flex-1 min-w-0 truncate text-[length:var(--chat-text-sm)] ${SHIMMER}`
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
  parts: ReadonlyArray<ToolCallPart>,
  resultFor: (toolCallId: string) => ToolResultPart | undefined,
  streaming: boolean,
): string | undefined {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]
    if (part === undefined || part.name !== `${PAGE_TOOL_PREFIX}route`) continue
    const payload = RoutePayload.safeParse(parseResultPayload(resultFor(part.id)))
    if (payload.success) return displayLocation(payload.data.href)
  }
  if (!streaming) return undefined
  if (typeof location === 'undefined') return 'live page'
  return `${location.host}${location.pathname}`
}

const ScriptInput = z.looseObject({typescriptCode: z.string()})

function sessionScripts(parts: ReadonlyArray<ToolCallPart>): string[] {
  return parts.flatMap((part) => {
    if (PAGE_ACT_TOOL_NAMES.has(part.name) || part.name.startsWith(PAGE_TOOL_PREFIX)) return []
    const input = parseInput(ScriptInput, part)
    return input ? [input.typescriptCode] : []
  })
}

function contextLabel(thinkingCount: number, scriptCount: number): string {
  if (thinkingCount > 0 && scriptCount > 0) return 'Reasoning · script'
  if (thinkingCount > 0) return 'Reasoning'
  return 'Script'
}

function sessionErrorMessage(
  parts: ReadonlyArray<ToolCallPart>,
  resultFor: (toolCallId: string) => ToolResultPart | undefined,
): string | undefined {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]
    if (part === undefined) continue
    const message = cardErrorMessage(resultFor(part.id))
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
  return (
    <span class={rowGlyphClass(props.step.state, props.streaming)}>
      <Switch fallback={<>{props.ordinal}</>}>
        <Match when={props.step.state === 'error'}>
          <StatusVisual status="error" form="icon" />
        </Match>
        <Match when={props.step.state === 'streaming'}>
          <StatusVisual status="running" form="icon" />
        </Match>
        <Match when={props.streaming}>
          <StatusVisual status="complete" form="icon" />
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

function rowTargetClass(state: PageSessionStep['state']): string {
  if (state === 'error') return ROW_TARGET_ERROR
  if (state === 'streaming') return ROW_TARGET_ACTIVE
  if (state === 'aborted') return ROW_TARGET_ABORTED
  return ROW_TARGET
}

function stepLabel(step: PageSessionStep, view: ToolViewMeta | undefined): string {
  if (view?.label === undefined) return step.verb
  return step.state === 'complete' ? view.label.done : view.label.running
}

function StepRow(props: {step: PageSessionStep; index: number; streaming: boolean}): JSX.Element {
  const view = () => pageToolMeta(`${PAGE_TOOL_PREFIX}${props.step.verb}`)
  return (
    <li class={rowClass(props.index)}>
      <StepGlyph step={props.step} ordinal={props.index + 1} streaming={props.streaming} />
      <span class={rowVerbClass(props.step.state, props.streaming)}>
        <span class="inline-flex shrink-0" aria-hidden="true">
          <Dynamic component={toolIconRender(view()?.icon)} size={12} />
        </span>
        <span class={ROW_VERB_LABEL}>{stepLabel(props.step, view())}</span>
      </span>
      <TruncatedText
        class={rowTargetClass(props.step.state)}
        text={props.step.state === 'streaming' ? activeSentence(props.step) : props.step.target}
      />
      <Show when={props.step.value}>
        {(value) => <Chip kind="pill" tone="accent" compact value={`“${value()}”`} class={ROW_VALUE} />}
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
  return (
    <span class={HEAD}>
      <span class={HEAD_DOTS} aria-hidden="true">
        <StatusDot tone="danger" />
        <StatusDot tone="warn" />
        <StatusDot tone="success" />
      </span>
      <CardHeadline class="flex-1">
        <MorphLabel text={props.title} boxClass={HEAD_TITLE} />
        <span class={HEAD_COUNT}>{props.count}</span>
      </CardHeadline>
      <span class={HEAD_SPACER}>
        <Show when={props.url}>{(url) => <Chip kind="pill" value={url()} class={HEAD_URL} />}</Show>
      </span>
      <MorphLabel
        text={props.streaming ? ACTING_LABEL : (mutatingBadge(SESSION_META) ?? '')}
        boxClass={HEAD_STATE}
        class={props.streaming ? HEAD_STATE_LIVE : HEAD_STATE_SETTLED}
      />
      <StatusVisual status={props.status} form="dot" />
    </span>
  )
}

export function PageSessionCard(props: GroupRenderProps): JSX.Element {
  return (
    <SessionCaptures sessionID={props.sessionID}>
      <SessionCard {...props} />
    </SessionCaptures>
  )
}

export function SessionCard(props: GroupRenderProps): JSX.Element {
  const captureFor = useContext(CaptureContext)
  const parts = createMemo(() => pageSessionCallParts(props.parts(), props.node.indices))
  const thinking = createMemo(() => pageSessionThinkingParts(props.parts(), props.node.indices))
  const steps = createMemo(() =>
    pageSessionSteps(parts(), props.resultFor, captureFor, PAGE_ACT_TOOL_NAMES, props.streaming),
  )
  const errorMessage = () => sessionErrorMessage(parts(), props.resultFor)
  const status = () => sessionStatus(steps(), props.streaming, errorMessage() !== undefined)
  const title = () => {
    const labels = pageSessionScripted(steps()) ? SESSION_LABEL.script : SESSION_LABEL.edit
    return props.streaming ? labels.running : labels.done
  }
  const scripts = createMemo(() => sessionScripts(parts()))
  return (
    <Show when={steps().length > 0 ? parts()[0] : undefined}>
      {(anchor) => (
        <ToolCard
          title={title()}
          titleTooltip={SESSION_META.summary}
          part={anchor()}
          result={props.resultFor(anchor().id)}
          status={status()}
          autoOpen
          folded={props.folded}
          flushHeader
          class="@container"
          header={
            <SessionHeader
              title={title()}
              count={actionsLabel(steps().length)}
              url={sessionLocation(parts(), props.resultFor, props.streaming)}
              streaming={props.streaming}
              status={status()}
            />
          }
        >
          <div class="flex flex-col gap-1.5">
            <ul class={RAIL}>
              <Index each={steps()}>
                {(step, index) => <StepRow step={step()} index={index} streaming={props.streaming} />}
              </Index>
            </ul>
            <Show when={thinking().length > 0 || scripts().length > 0}>
              <CollapsibleSection header={<span>{contextLabel(thinking().length, scripts().length)}</span>}>
                <div class="flex flex-col gap-2 min-w-0">
                  <Index each={thinking()}>{(part) => <ReasoningText text={part().content} />}</Index>
                  <Index each={scripts()}>
                    {(script) => <CodeBlock file={{name: 'session.ts', lang: 'ts', contents: script()}} />}
                  </Index>
                </div>
              </CollapsibleSection>
            </Show>
            <Show when={errorMessage()}>{(message) => <ErrorBlock message={message()} />}</Show>
          </div>
        </ToolCard>
      )}
    </Show>
  )
}

export type PageSessionStep = {
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

function codeTargetLine(verb: string, input: Record<string, unknown>): string | undefined {
  const codeKey = CODE_TARGET_KEYS[verb]
  if (codeKey === undefined) return undefined
  const source = nonEmpty(input[codeKey])
  if (source === undefined) return undefined
  const line = firstMeaningfulLine(source)
  return line === undefined ? undefined : clip(line)
}

function stepTarget(
  verb: string,
  input: Record<string, unknown>,
  capture: ToolCaptureView | undefined,
): {target: string; namedTarget: boolean} {
  const codeLine = codeTargetLine(verb, input)
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
  verb: string,
  input: Record<string, unknown>,
  capture: ToolCaptureView | undefined,
): string | undefined {
  const codeKey = CODE_INPUT_KEYS[verb]
  if (codeKey !== undefined) {
    const source = nonEmpty(input[codeKey])
    if (source === undefined) return undefined
    return clip(firstMeaningfulLine(source) ?? source)
  }
  return nonEmpty(input.value) ?? descriptorField(capture, 'value')
}

function stepState(result: ToolResultPart | undefined, streaming: boolean): PageSessionStep['state'] {
  if (result?.state === 'error') return 'error'
  if (result?.state === 'complete') return 'complete'
  return streaming ? 'streaming' : 'aborted'
}

export function pageSessionSteps(
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
      const input = toolInput(part)
      const capture = captureFor(part.id)
      return {
        verb,
        ...stepTarget(verb, input, capture),
        value: stepValue(verb, input, capture),
        state: stepState(resultFor(part.id), streaming),
      }
    })
}
