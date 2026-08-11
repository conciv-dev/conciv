import {z} from 'zod'
import {createMemo, For, Match, Show, Switch, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {
  Code,
  Compass,
  ListChecks,
  MousePointerClick,
  Palette,
  Pointer,
  Sparkles,
  SquareCheck,
  TextCursorInput,
  type LucideIcon,
} from 'lucide-solid'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {useToolCtx, type PageSessionRenderProps} from '@conciv/ui-kit-chat'
import type {ToolViewMeta} from '@conciv/protocol/tool-view-types'
import {
  CardShell,
  Chip,
  clip,
  ErrorBlock,
  parseResultPayload,
  SHIMMER,
  StatusVisual,
  type ToolStatus,
} from '@conciv/ui-kit-chat/tools'
import {PAGE_ACT_TOOL_NAMES} from '../../shared/defs.js'
import {cardErrorMessage, mutatingBadge} from './shared.js'
import {pageSessionSteps, type PageSessionStep} from './session-steps.js'

const SESSION_LABEL = {running: 'Editing the page', done: 'Edited the page'}

const SESSION_META: ToolViewMeta = {
  summary: 'the AI drove the live page',
  category: 'act',
  icon: 'pointer',
  label: SESSION_LABEL,
  mutating: true,
  mirrors: false,
}

const ACTION_FORMAT = new Intl.NumberFormat()
const ACTION_PLURAL = new Intl.PluralRules('en')

const GERUNDS: Record<string, string> = {fill: 'Filling', check: 'Checking', select: 'Selecting', click: 'Clicking'}

const VERB_ICONS: Record<string, LucideIcon> = {
  fill: TextCursorInput,
  click: MousePointerClick,
  check: SquareCheck,
  uncheck: SquareCheck,
  select: ListChecks,
  css: Palette,
  eval: Code,
  effect: Sparkles,
  route: Compass,
}

const HEAD = 'flex flex-1 items-center gap-2 min-w-0 ps-4 h-9'
const HEAD_DOTS = 'flex gap-2 flex-none'
const HEAD_DOT = 'size-2.5 rounded-full'
const HEAD_TITLE =
  'shrink min-w-0 truncate whitespace-nowrap text-[length:var(--chat-text-md)] [color:var(--chat-text)]'
const HEAD_COUNT =
  'hidden @[22rem]:inline flex-none whitespace-nowrap [font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)] tabular-nums'
const HEAD_SPACER = 'flex-1 min-w-0 flex self-stretch my-1.5'
const HEAD_URL =
  'hidden @[26rem]:inline-flex anim-combo items-center flex-1 min-w-0 [font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)] [background:var(--chat-fill)] [box-shadow:inset_0_0_0_1px_var(--chat-line-soft)] rounded-[var(--chat-radius-pill)] px-3'
const HEAD_LIVE =
  'flex-none inline-flex items-center gap-1.5 [font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)] [color:var(--chat-accent)]'
const HEAD_LIVE_TEXT = 'hidden @[18rem]:inline'
const HEAD_BADGE =
  'hidden @[20rem]:inline flex-none whitespace-nowrap [font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)]'

const RAIL =
  'm-0 p-0 list-none flex flex-col w-full rounded-[var(--chat-radius-sm)] [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)] overflow-hidden'
const ROW =
  'group px-2.5 py-1.5 flex gap-2.5 items-center min-w-0 [&:not(:first-child)]:[border-top:1px_solid_var(--chat-line-soft)] [transition:background_140ms_var(--chat-ease)] hover:[background:var(--chat-fill)]'
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
  'flex-none size-5.5 inline-flex items-center justify-center rounded-md [border:1px_solid_var(--chat-line)] text-[length:var(--chat-text-xs)] [font-family:var(--chat-mono)] tabular-nums [color:var(--chat-text-3)]'
const ROW_GLYPH_DONE = `${ROW_GLYPH} [border:1px_solid_var(--chat-success)]`
const ROW_GLYPH_ERROR = `${ROW_GLYPH} [border:1px_solid_var(--chat-danger-line)]`
const ROW_GLYPH_ACTIVE = `${ROW_GLYPH} [border:1px_solid_color-mix(in_srgb,var(--chat-accent)_50%,transparent)]`
const ROW_VERB =
  'flex-none w-6 @[22rem]:w-16 inline-flex items-center gap-1 overflow-hidden [font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)] [transition:color_140ms_var(--chat-ease)]'
const ROW_VERB_NEUTRAL = `${ROW_VERB} [color:var(--chat-text-3)] group-hover:[color:var(--chat-text-2)]`
const ROW_VERB_DONE = `${ROW_VERB} [color:var(--chat-success)]`
const ROW_VERB_ERROR = `${ROW_VERB} [color:var(--chat-danger)]`
const ROW_VERB_LABEL = 'sr-only @[22rem]:not-sr-only @[22rem]:truncate'
const ROW_TARGET = 'flex-1 min-w-0 truncate text-[length:var(--chat-text-sm)] [color:var(--chat-text)]'
const ROW_TARGET_ERROR = 'flex-1 min-w-0 truncate text-[length:var(--chat-text-sm)] [color:var(--chat-danger)]'
const ROW_TARGET_ABORTED = 'flex-1 min-w-0 truncate text-[length:var(--chat-text-sm)] [color:var(--chat-text-3)]'
const ROW_TARGET_ACTIVE = `flex-1 min-w-0 truncate text-[length:var(--chat-text-sm)] ${SHIMMER}`
const ROW_VALUE = 'hidden @[24rem]:inline-flex anim-combo flex-none max-w-40 leading-none'

const RoutePayload = z.looseObject({href: z.string()})

function actionsLabel(count: number): string {
  return `${ACTION_FORMAT.format(count)} ${ACTION_PLURAL.select(count) === 'one' ? 'action' : 'actions'}`
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
): string {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]
    if (part === undefined || part.name !== 'page.route') continue
    const payload = RoutePayload.safeParse(parseResultPayload(resultFor(part.id)))
    if (payload.success) return displayLocation(payload.data.href)
  }
  if (typeof location === 'undefined') return 'live page'
  return `${location.host}${location.pathname}`
}

function sessionErrorMessage(
  parts: ReadonlyArray<ToolCallPart>,
  resultFor: (toolCallId: string) => ToolResultPart | undefined,
): string | undefined {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]
    if (part === undefined) continue
    const result = resultFor(part.id)
    if (result === undefined) continue
    return cardErrorMessage(result)
  }
  return undefined
}

function sessionStatus(steps: ReadonlyArray<PageSessionStep>, streaming: boolean): ToolStatus {
  if (streaming) return 'running'
  return steps.some((step) => step.state === 'error') ? 'error' : 'complete'
}

function activeSentence(step: PageSessionStep): string {
  const verb = GERUNDS[step.verb] ?? step.verb
  const target = step.namedTarget ? `“${step.target}”` : step.target
  return `${verb} ${target}…`
}

function rowGlyphClass(state: PageSessionStep['state'], streaming: boolean): string {
  if (state === 'error') return ROW_GLYPH_ERROR
  if (state === 'streaming') return ROW_GLYPH_ACTIVE
  return streaming ? ROW_GLYPH_DONE : ROW_GLYPH
}

function rowClass(index: number, streaming: boolean): string {
  if (streaming) return ROW
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

function StepRow(props: {step: PageSessionStep; index: number; streaming: boolean}): JSX.Element {
  return (
    <li class={rowClass(props.index, props.streaming)}>
      <StepGlyph step={props.step} ordinal={props.index + 1} streaming={props.streaming} />
      <span class={rowVerbClass(props.step.state, props.streaming)}>
        <Dynamic component={VERB_ICONS[props.step.verb] ?? Pointer} size={12} aria-hidden="true" class="shrink-0" />
        <span class={ROW_VERB_LABEL}>{props.step.verb}</span>
      </span>
      <span class={rowTargetClass(props.step.state)}>
        {props.step.state === 'streaming' ? activeSentence(props.step) : props.step.target}
      </span>
      <Show when={props.step.value}>
        {(value) => <Chip kind="pill" tone="accent" value={`“${clip(value())}”`} class={ROW_VALUE} />}
      </Show>
    </li>
  )
}

function SessionHeader(props: {
  title: string
  count: string
  url: string
  streaming: boolean
  status: ToolStatus
}): JSX.Element {
  return (
    <span class={HEAD}>
      <span class={HEAD_DOTS} aria-hidden="true">
        <span class={`${HEAD_DOT} bg-pw-danger`} />
        <span class={`${HEAD_DOT} bg-pw-warn`} />
        <span class={`${HEAD_DOT} bg-pw-success`} />
      </span>
      <span class={HEAD_TITLE}>{props.title}</span>
      <span class={HEAD_COUNT}>{props.count}</span>
      <span class={HEAD_SPACER}>
        <span class={HEAD_URL}>
          <span class="truncate">{props.url}</span>
        </span>
      </span>
      <Show when={props.streaming} fallback={<span class={HEAD_BADGE}>{mutatingBadge(SESSION_META)}</span>}>
        <span class={HEAD_LIVE}>
          <StatusVisual status="running" form="dot" />
          <span class={HEAD_LIVE_TEXT}>acting</span>
        </span>
      </Show>
      <StatusVisual status={props.status} form="dot" />
    </span>
  )
}

export function SessionCard(props: PageSessionRenderProps): JSX.Element {
  const ctx = useToolCtx()
  const captureFor = (toolCallId: string) => ctx.captureFor?.(toolCallId)
  const steps = createMemo(() =>
    pageSessionSteps(props.parts, props.resultFor, captureFor, PAGE_ACT_TOOL_NAMES, props.streaming),
  )
  const status = () => sessionStatus(steps(), props.streaming)
  const title = () => (props.streaming ? SESSION_LABEL.running : SESSION_LABEL.done)
  const errorMessage = () => sessionErrorMessage(props.parts, props.resultFor)
  return (
    <Show when={props.parts[0]}>
      {(anchor) => (
        <CardShell
          meta={SESSION_META}
          title={title()}
          part={anchor()}
          result={props.resultFor(anchor().id)}
          status={status()}
          defaultOpen={props.streaming}
          flushHeader
          class="@container"
          header={
            <SessionHeader
              title={title()}
              count={actionsLabel(steps().length)}
              url={sessionLocation(props.parts, props.resultFor)}
              streaming={props.streaming}
              status={status()}
            />
          }
        >
          <div class="flex flex-col gap-1.5">
            <ul class={RAIL}>
              <For each={steps()}>
                {(step, index) => <StepRow step={step} index={index()} streaming={props.streaming} />}
              </For>
            </ul>
            <Show when={errorMessage()}>{(message) => <ErrorBlock message={message()} />}</Show>
          </div>
        </CardShell>
      )}
    </Show>
  )
}
