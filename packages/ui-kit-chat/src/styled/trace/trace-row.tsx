import {Show, splitProps, type JSX} from 'solid-js'
import ChevronDown from 'lucide-solid/icons/chevron-down'
import {Collapsible} from '@conciv/ui-kit-system'
import type {ToolRowMark, ToolRowProjection} from '../../tools/primitives/tool-row.js'
import {FOCUS_INSET} from '../classes.js'
import {TRACE_HOVER_INDENT, TRACE_INDENT, TRACE_LINE} from './connector.js'

export const TRACE_MICROLABEL =
  'uppercase text-[length:var(--chat-text-micro)] leading-none tracking-[0.13em] [font-family:var(--chat-mono)] flex-none'

const ROW = `${TRACE_LINE} ${TRACE_HOVER_INDENT}`
const FOLD_ROW = `group/row w-full text-start cursor-pointer rounded-[var(--chat-radius-sm)] [background:transparent] [transition:background-color_120ms_var(--chat-ease)] motion-reduce:[transition:none] hover:[background:var(--chat-fill)] ${FOCUS_INSET}`
const MARK = 'select-none flex-none w-[9px] text-center text-[11px] leading-none [font-family:var(--chat-mono)]'
const LABEL = `${TRACE_MICROLABEL} min-w-[38px] text-chat-microlabel`
const RUN_LABEL = `${TRACE_MICROLABEL} min-w-[38px] text-chat-accent`
const TARGET = 'flex-1 min-w-0 truncate text-[12px] leading-none [font-family:var(--chat-mono)] text-chat-target'
const RUN_TEXT = 'flex-1 min-w-0 truncate text-[12.5px] leading-none [font-family:var(--chat-font)] text-chat-text-2'
const META = 'flex-none min-w-0 max-w-[50%] truncate text-[11px] leading-none [font-family:var(--chat-mono)]'
const BLOCK = `flex flex-col gap-1 min-w-0 pt-[3px] pb-[5px] ${TRACE_INDENT}`
const ROW_ITEM = 'relative list-none min-w-0 pb-px'
const FOLD_SLOT = 'flex-none inline-flex w-3 justify-center'
const FOLD = `${FOLD_SLOT} text-chat-affordance opacity-0 group-hover/row:opacity-70 group-focus-visible/row:opacity-100 data-[state=closed]:opacity-70 data-[state=closed]:-rotate-90 [transition:opacity_110ms_var(--chat-ease),rotate_150ms_var(--chat-ease)] motion-reduce:[transition:none]`

const RING =
  'relative flex-none inline-flex items-center justify-center size-[9px] rounded-full [border:1.5px_solid_var(--chat-accent)]'
const RING_DOT =
  'size-[3px] rounded-full [background:var(--chat-accent)] [box-shadow:0_0_4px_var(--chat-accent)] anim-run-ring'
const NOTE_GLYPH = `${MARK} text-chat-dim`

type MarkFace = {glyph: string; label: string; tone: string}

const SETTLED_FACES: Record<Exclude<ToolRowMark, 'run'>, MarkFace> = {
  pass: {glyph: '✓', label: 'succeeded', tone: 'text-chat-success'},
  warn: {glyph: '✓', label: 'completed with warnings', tone: 'text-chat-warn'},
  fail: {glyph: '✕', label: 'failed', tone: 'text-chat-danger'},
}

const PENDING_FACE: MarkFace = {glyph: '·', label: 'pending', tone: 'text-chat-dim'}

function markFace(mark: ToolRowMark): MarkFace {
  if (mark === 'run') return PENDING_FACE
  return SETTLED_FACES[mark]
}

const ADDED_COUNT = /^\+(\d+)/

function metaTone(mark: ToolRowMark, meta: string): string {
  if (mark === 'fail') return 'text-chat-danger'
  const added = ADDED_COUNT.exec(meta)
  if (added && Number(added[1]) > 0) return 'text-chat-success'
  return 'text-chat-dim'
}

export function TraceMark(props: {mark: ToolRowMark}): JSX.Element {
  const face = () => markFace(props.mark)
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
      <ChevronDown size={12} aria-hidden="true" />
    </Collapsible.Indicator>
  )
}

export function TraceFoldableRow(props: {
  line: () => JSX.Element
  last: boolean
  ring?: boolean
  body?: () => JSX.Element
}): JSX.Element {
  const [local] = splitProps(props, ['line', 'last', 'ring', 'body'])
  return (
    <li class={ROW_ITEM} data-trace-live={local.ring ? '' : undefined}>
      <Show
        when={local.body}
        fallback={
          <div class={ROW}>
            {local.line()}
            <span aria-hidden="true" class={FOLD_SLOT} />
          </div>
        }
      >
        {(body) => (
          <Collapsible.Root defaultOpen class="min-w-0 w-full">
            <Collapsible.Trigger class={`${ROW}  ${FOLD_ROW}`}>
              {local.line()}
              <FoldIndicator />
            </Collapsible.Trigger>
            <Collapsible.Content>
              <div class={BLOCK}>{body()()}</div>
            </Collapsible.Content>
          </Collapsible.Root>
        )}
      </Show>
    </li>
  )
}

export function TraceRunRow(props: {
  label: string
  text: string
  meta?: string
  last?: boolean
  live?: boolean
  ring?: boolean
  body?: () => JSX.Element
}): JSX.Element {
  const [local] = splitProps(props, ['label', 'text', 'meta', 'last', 'live', 'ring', 'body'])
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
      <span class={RUN_TEXT}>{local.text}</span>
      <Show when={local.meta}>{(meta) => <span class={`${META} text-chat-dim`}>{meta()}</span>}</Show>
    </>
  )
  return <TraceFoldableRow line={line} last={local.last ?? false} ring={local.ring} body={local.body} />
}

export function TraceToolRow(props: {
  projection: ToolRowProjection
  last?: boolean
  ring?: boolean
  body?: () => JSX.Element
}): JSX.Element {
  const [local] = splitProps(props, ['projection', 'last', 'ring', 'body'])
  const asRunRow = () => local.projection.mark === 'run' && (local.ring ?? true)
  const body = () => local.projection.block ?? local.body
  const line = (): JSX.Element => (
    <>
      <TraceMark mark={local.projection.mark} />
      <span class={LABEL}>{local.projection.label}</span>
      <span class={TARGET}>{local.projection.target}</span>
      <Show when={local.projection.meta}>
        {(meta) => <span class={`${META}  ${metaTone(local.projection.mark, meta())}`}>{meta()}</span>}
      </Show>
    </>
  )
  return (
    <Show
      when={!asRunRow()}
      fallback={
        <TraceRunRow
          label={local.projection.label}
          text={local.projection.target}
          meta={local.projection.meta}
          last={local.last ?? false}
          ring={local.ring}
          body={body()}
        />
      }
    >
      <TraceFoldableRow line={line} last={local.last ?? false} ring={local.ring} body={body()} />
    </Show>
  )
}
