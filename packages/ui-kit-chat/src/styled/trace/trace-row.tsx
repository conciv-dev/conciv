import {createMemo, Show, splitProps, type JSX} from 'solid-js'
import ChevronDown from 'lucide-solid/icons/chevron-down'
import {Collapsible, TruncatedText} from '@conciv/ui-kit-system'
import type {ToolRowMark, ToolRowProjection} from '../../tools/primitives/tool-row.js'
import {FOCUS_INSET} from '../classes.js'
import {OUTCOME_TONE} from '../../tools/primitives/tool-presentation.js'

export const TRACE_MICROLABEL =
  'uppercase text-chat-micro leading-none tracking-widest [font-family:var(--chat-mono)] flex-none'
export const TRACE_LINE = 'relative flex items-center gap-2 min-w-0 h-[var(--chat-trace-gutter)]'
export const TRACE_INDENT = 'ps-[var(--chat-trace-gutter)]'
export const TRACE_HOVER_INDENT = 'ps-[var(--chat-trace-gutter)] pe-2'

const ROW = `${TRACE_LINE} ${TRACE_HOVER_INDENT}`
const FOLD_ROW = `group/row w-full text-start cursor-pointer rounded-[var(--chat-radius-sm)] [background:transparent] trans-bg motion-reduce:[transition:none] hover:[background:var(--chat-fill)] disabled:cursor-default disabled:hover:[background:transparent] ${FOCUS_INSET}`
const MARK = 'select-none flex-none w-chat-mark text-center text-chat-xs leading-none [font-family:var(--chat-mono)]'
const LABEL = `${TRACE_MICROLABEL} min-w-10 text-chat-microlabel`
const RUN_LABEL = `${TRACE_MICROLABEL} min-w-10 text-chat-accent`
const TARGET = 'flex-1 min-w-0 truncate text-chat-sm leading-none [font-family:var(--chat-mono)] text-chat-target'
const RUN_TEXT = 'flex-1 min-w-0 truncate text-chat-md leading-none [font-family:var(--chat-font)] text-chat-text-2'
const META = 'flex-none min-w-0 max-w-1/2 truncate text-chat-xs leading-none [font-family:var(--chat-mono)]'
const BLOCK = `flex flex-col gap-1 min-w-0 py-1 ${TRACE_INDENT}`
const ROW_ITEM = 'relative list-none min-w-0'
const FOLD_SLOT = 'flex-none inline-flex w-3 justify-center'
const FOLD = `${FOLD_SLOT} text-chat-affordance opacity-0 group-hover/row:opacity-70 group-focus-visible/row:opacity-100 data-[state=closed]:opacity-70 data-[state=closed]:-rotate-90 trans-op-rotate motion-reduce:[transition:none]`

const RING =
  'relative flex-none inline-flex items-center justify-center size-chat-mark rounded-full [border:1.5px_solid_var(--chat-accent)]'
const RING_DOT =
  'size-chat-mark-dot rounded-full [background:var(--chat-accent)] [box-shadow:0_0_4px_var(--chat-accent)] anim-run-ring'
const NOTE_GLYPH = `${MARK} text-chat-dim`

type MarkFace = {glyph: string; label: string; tone: string}

const SETTLED_FACES: Record<Exclude<ToolRowMark, 'run'>, MarkFace> = {
  pass: {glyph: '✓', label: 'succeeded', tone: 'text-chat-success'},
  warn: {glyph: '✓', label: 'completed with warnings', tone: 'text-chat-warn'},
  fail: {glyph: '✕', label: 'failed', tone: OUTCOME_TONE.error.text},
  denied: {glyph: '⊘', label: 'denied', tone: OUTCOME_TONE.denied.text},
  cancelled: {glyph: '⊘', label: 'cancelled', tone: OUTCOME_TONE.cancelled.text},
}

const PENDING_FACE: MarkFace = {glyph: '·', label: 'pending', tone: 'text-chat-dim'}

function markFace(mark: ToolRowMark): MarkFace {
  if (mark === 'run') return PENDING_FACE
  return SETTLED_FACES[mark]
}

const ADDED_COUNT = /^\+(\d+)/

function metaTone(mark: ToolRowMark, meta: string): string {
  if (mark === 'fail') return OUTCOME_TONE.error.text
  if (mark === 'denied' || mark === 'cancelled') return OUTCOME_TONE[mark].text
  const added = ADDED_COUNT.exec(meta)
  if (added && Number(added[1]) > 0) return 'text-chat-success'
  return 'text-chat-dim'
}

export function TraceMark(props: {mark: ToolRowMark}): JSX.Element {
  const face = createMemo(() => markFace(props.mark))
  return (
    <span role="img" aria-label={face().label} class={`${MARK}  ${face().tone}`}>
      {face().glyph}
    </span>
  )
}

export function TraceRing(): JSX.Element {
  return (
    <span role="img" aria-label="running" class={RING}>
      <span class={RING_DOT} aria-hidden="true" />
    </span>
  )
}

function FoldIndicator(): JSX.Element {
  return (
    <Collapsible.Indicator class={FOLD}>
      <ChevronDown class="size-3" aria-hidden="true" />
    </Collapsible.Indicator>
  )
}

export function TraceFoldableRow(props: {
  line: () => JSX.Element
  ring?: boolean
  body?: () => JSX.Element
  foldable?: boolean
}): JSX.Element {
  const [local] = splitProps(props, ['line', 'ring', 'body', 'foldable'])
  const foldable = () => local.foldable ?? local.body !== undefined
  return (
    <li class={ROW_ITEM} data-trace-live={local.ring ? '' : undefined}>
      <Collapsible.Root defaultOpen disabled={!foldable()} class="min-w-0 w-full">
        <Collapsible.Trigger disabled={!foldable()} class={`${ROW}  ${FOLD_ROW}`}>
          {local.line()}
          <Show when={foldable()} fallback={<span aria-hidden="true" class={FOLD_SLOT} />}>
            <FoldIndicator />
          </Show>
        </Collapsible.Trigger>
        <Collapsible.Content>
          <Show when={local.body}>{(body) => <div class={BLOCK}>{body()()}</div>}</Show>
        </Collapsible.Content>
      </Collapsible.Root>
    </li>
  )
}

export function TraceRunRow(props: {
  label: string
  text: string
  meta?: string
  live?: boolean
  ring?: boolean
  body?: () => JSX.Element
  foldable?: boolean
}): JSX.Element {
  const [local] = splitProps(props, ['label', 'text', 'meta', 'live', 'ring', 'body', 'foldable'])
  const line = (): JSX.Element => (
    <>
      <Show
        when={local.live ?? true}
        fallback={
          <span class={NOTE_GLYPH} aria-hidden="true">
            ·
          </span>
        }
      >
        <TraceRing />
      </Show>
      <span class={RUN_LABEL}>{local.label}</span>
      <TruncatedText class={RUN_TEXT} text={local.text} />
      <Show when={local.meta}>{(meta) => <TruncatedText class={`${META} text-chat-dim`} text={meta()} />}</Show>
    </>
  )
  return <TraceFoldableRow line={line} ring={local.ring} body={local.body} foldable={local.foldable} />
}

export function TraceToolRow(props: {
  projection: ToolRowProjection
  ring?: boolean
  body?: () => JSX.Element
  foldable?: boolean
}): JSX.Element {
  const [local] = splitProps(props, ['projection', 'ring', 'body', 'foldable'])
  const running = createMemo(() => local.projection.mark === 'run' && (local.ring ?? true))
  const body = () => local.projection.block ?? local.body
  const labelClass = createMemo(() => (running() ? RUN_LABEL : LABEL))
  const metaClass = createMemo(() => `${META}  ${metaTone(local.projection.mark, local.projection.meta ?? '')}`)
  const line = (): JSX.Element => (
    <>
      <Show when={running()} fallback={<TraceMark mark={local.projection.mark} />}>
        <TraceRing />
      </Show>
      <span class={labelClass()}>{local.projection.label}</span>
      <TruncatedText class={TARGET} text={local.projection.target} />
      <Show when={local.projection.meta}>{(meta) => <TruncatedText class={metaClass()} text={meta()} />}</Show>
    </>
  )
  return <TraceFoldableRow line={line} ring={local.ring} body={body()} foldable={local.foldable} />
}
