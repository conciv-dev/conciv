import {createMemo, For, Match, Show, Switch, type Accessor, type JSX} from 'solid-js'
import {z} from 'zod'
import {Collapsible, TruncatedText} from '@conciv/ui-kit-system'
import {
  BLOCK,
  FOLD_ROW,
  FOLD_SLOT,
  FoldIndicator,
  TRACE_HOVER_INDENT,
  TRACE_LINE,
  TraceMark,
  TraceRing,
} from '../../styled/trace/trace-row.js'
import {TraceBodyFrame} from '../../styled/trace/output-block.js'
import {SHIMMER} from '../../styled/shimmer.js'
import {formatDuration} from '../primitives/tool-util.js'
import type {ToolRowMark} from '../primitives/tool-row.js'
import {useToolCallDuration, useToolCallTag} from './card-chrome.js'
import {Chip} from './chip.js'
import {ShapedText} from './shaped-content.js'

export type TriggerTitle = {
  title: string
  titleClass?: string
  subtitle?: string
  subtitleClass?: string
  args?: string[]
  argsClass?: string
  action?: JSX.Element
}

export interface BasicToolProps {
  trigger: TriggerTitle | JSX.Element | ((open: Accessor<boolean>) => JSX.Element)
  children?: JSX.Element
  hasContent?: boolean
  status?: string
  hideDetails?: boolean
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  forceOpen?: boolean
  allowOpenWhilePending?: boolean
  defer?: boolean
  locked?: boolean
  rail?: boolean
  onTriggerClick?: JSX.EventHandlerUnion<HTMLElement, MouseEvent>
  onTriggerKeyDown?: JSX.EventHandlerUnion<HTMLElement, KeyboardEvent>
  compact?: boolean
  action?: JSX.Element
}

const ROW = `${TRACE_LINE} ${TRACE_HOVER_INDENT} ${FOLD_ROW}`
const TITLE = 'flex-none min-w-0 max-w-full truncate text-chat-sm leading-none [font-family:var(--chat-mono)]'
const TITLE_TONE = 'text-chat-target'
const SUBTITLE = 'flex-1 min-w-0 truncate text-chat-sm leading-none [font-family:var(--chat-mono)] text-chat-text-2'
const ARG =
  'flex-none min-w-0 max-w-1/3 truncate text-chat-xs leading-none [font-family:var(--chat-mono)] text-chat-dim'
const DURATION = 'flex-none ms-auto text-chat-xs leading-none [font-family:var(--chat-mono)] text-chat-dim'
const ACTION = 'flex-none inline-flex items-center'

function isTriggerTitle(value: unknown): value is TriggerTitle {
  return !(value instanceof Node) && z.object({title: z.string()}).safeParse(value).success
}

function statusMark(status: string | undefined): ToolRowMark {
  if (status === 'error') return 'fail'
  if (status === 'pending') return 'run'
  return 'pass'
}

export function BasicTool(props: BasicToolProps): JSX.Element {
  const pending = () => props.status === 'streaming' || props.status === 'running'
  const hasChildren = () => props.hasContent ?? props.children !== undefined
  const canToggle = () => !props.locked && (!pending() || (props.allowOpenWhilePending ?? false))
  const open = (): boolean => {
    if (props.forceOpen) return true
    if (!canToggle() && !props.locked) return false
    return props.open ?? props.defaultOpen ?? false
  }
  const controlled = () => props.forceOpen === true || props.open !== undefined || !canToggle()
  const duration = useToolCallDuration()
  const tag = useToolCallTag()
  const durationText = () => (pending() ? undefined : formatDuration(duration()))
  const triggerContent = createMemo(() => {
    const value = props.trigger
    return typeof value === 'function' ? value(open) : value
  })
  const triggerTitle = createMemo(() => {
    const value = triggerContent()
    return isTriggerTitle(value) ? value : undefined
  })
  const triggerElement = (): JSX.Element => {
    const value = triggerContent()
    return isTriggerTitle(value) ? undefined : value
  }
  const showToggle = () => hasChildren() && !props.hideDetails && canToggle()
  return (
    <Collapsible.Root
      open={controlled() ? open() : undefined}
      defaultOpen={props.defaultOpen}
      onOpenChange={(details) => props.onOpenChange?.(details.open)}
      disabled={!showToggle()}
      class="min-w-0 w-full"
      data-compact={props.compact ? 'true' : undefined}
      data-rail={props.rail === false ? 'false' : undefined}
    >
      <Collapsible.Trigger
        disabled={!showToggle()}
        class={ROW}
        onClick={props.onTriggerClick}
        onKeyDown={props.onTriggerKeyDown}
      >
        <Show when={pending()} fallback={<TraceMark mark={statusMark(props.status)} />}>
          <TraceRing />
        </Show>
        <Switch>
          <Match when={triggerTitle()}>
            {(title) => (
              <>
                <span class={`${TITLE}  ${title().titleClass ?? TITLE_TONE}  ${pending() ? SHIMMER : ''}`}>
                  {title().title}
                </span>
                <Show when={!pending() || title().subtitle || title().args?.length}>
                  <Show when={title().subtitle}>
                    {(subtitle) => (
                      <TruncatedText class={`${SUBTITLE}  ${title().subtitleClass ?? ''}`} text={subtitle()} />
                    )}
                  </Show>
                  <For each={title().args}>
                    {(arg) => <span class={`${ARG}  ${title().argsClass ?? ''}`}>{arg}</span>}
                  </For>
                </Show>
                <Show when={!pending() && title().action}>
                  <span class={ACTION}>{title().action}</span>
                </Show>
              </>
            )}
          </Match>
          <Match when={true}>{triggerElement()}</Match>
        </Switch>
        <Show when={tag()}>{(value) => <Chip kind="pill" compact value={value()} />}</Show>
        <Show when={durationText()}>{(text) => <span class={DURATION}>{text()}</span>}</Show>
        {showToggle() ? <FoldIndicator /> : <span aria-hidden="true" class={FOLD_SLOT} />}
      </Collapsible.Trigger>
      <Show when={props.action}>{(action) => <span class={ACTION}>{action()}</span>}</Show>
      <Show when={hasChildren() && !props.hideDetails}>
        <Collapsible.Content>
          <div class={BLOCK}>
            <TraceBodyFrame tone={props.status === 'error' ? 'error' : 'normal'}>{props.children}</TraceBodyFrame>
          </div>
        </Collapsible.Content>
      </Show>
    </Collapsible.Root>
  )
}

type GenericToolInput = Record<string, unknown>

const LABEL_KEYS = ['description', 'query', 'url', 'path', 'pattern', 'name']

const LabelValue = z.string().min(1)

const ArgValue = z.union([z.string(), z.number(), z.boolean()])

function label(input: GenericToolInput | undefined): string | undefined {
  return LABEL_KEYS.flatMap((key) => {
    const parsed = LabelValue.safeParse(input?.[key])
    return parsed.success ? [parsed.data] : []
  })[0]
}

function args(input: GenericToolInput | undefined): string[] {
  if (!input) return []
  return Object.entries(input)
    .filter(([key]) => !LABEL_KEYS.includes(key))
    .flatMap(([key, value]) => {
      const parsed = ArgValue.safeParse(value)
      return parsed.success ? [`${key}=${String(parsed.data)}`] : []
    })
    .slice(0, 3)
}

export function GenericTool(props: {
  tool: string
  status?: string
  hideDetails?: boolean
  input?: GenericToolInput
  output?: string
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}): JSX.Element {
  return (
    <BasicTool
      status={props.status}
      trigger={{title: `Called ${props.tool}`, subtitle: label(props.input), args: args(props.input)}}
      hideDetails={props.hideDetails}
      hasContent={Boolean(props.output)}
      defaultOpen={props.defaultOpen}
      open={props.open}
      onOpenChange={props.onOpenChange}
    >
      <Show when={props.output}>{(output) => <ShapedText name="result" text={output()} />}</Show>
    </BasicTool>
  )
}
