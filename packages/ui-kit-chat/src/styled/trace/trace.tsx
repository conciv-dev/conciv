import {createSignal, For, Show, splitProps, type JSX} from 'solid-js'
import {Collapsible} from '@conciv/ui-kit-system'
import {createAutoCollapse} from '../../primitives/util/create-auto-collapse.js'
import {FOCUS_INSET} from '../classes.js'
import {TraceConnector, TRACE_HOVER_INDENT, TRACE_LINE} from './connector.js'
import {TRACE_MICROLABEL} from './trace-row.js'
import {TraceRail} from './rail.js'

export type TraceBranch = {readonly last: boolean; readonly ring: boolean}

export type TraceItem = {key: string; live?: boolean; render: (branch: TraceBranch) => JSX.Element}

const HEADER_ITEM = 'relative min-w-0 w-full pb-px'
const HEADER_ROW = `group w-full ${TRACE_LINE} ${TRACE_HOVER_INDENT} text-start cursor-pointer select-none [background:transparent] rounded-[var(--chat-radius-sm)] [transition:background-color_120ms_var(--chat-ease)] motion-reduce:[transition:none] hover:[background:var(--chat-fill)] ${FOCUS_INSET}`
const HEADER_LABEL = `${TRACE_MICROLABEL} text-chat-microlabel`
const SUMMARY = 'flex-1 min-w-0 truncate text-[12.5px] leading-none [font-family:var(--chat-font)] text-chat-summary'
const COMPACT_LINE = 'flex-1 min-w-0 truncate text-[11px] leading-none [font-family:var(--chat-mono)] text-chat-text-3'
const TOGGLE =
  'flex-none text-[11.5px] leading-none [font-family:var(--chat-font)] text-chat-dim group-hover:text-chat-affordance [transition:color_120ms_var(--chat-ease)] motion-reduce:[transition:none]'
const ROWS = 'relative flex flex-col min-w-0 p-0 m-0 list-none'

export function Trace(props: {
  summary: string
  compactLine: string
  items: TraceItem[]
  label?: string
  streaming?: boolean
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}): JSX.Element {
  const [local] = splitProps(props, [
    'summary',
    'compactLine',
    'items',
    'label',
    'streaming',
    'defaultOpen',
    'open',
    'onOpenChange',
  ])
  const [listEl, setListEl] = createSignal<HTMLUListElement>()
  const auto = createAutoCollapse({streaming: () => local.streaming ?? false, defaultOpen: local.defaultOpen})
  const open = () => local.open ?? auto.open()
  const change = (next: boolean) => {
    auto.setOpen(next)
    local.onOpenChange?.(next)
  }
  const lastKey = () => local.items[local.items.length - 1]?.key
  const lastLiveKey = () => local.items.findLast((entry) => entry.live)?.key
  const branchFor = (item: TraceItem): TraceBranch => ({
    get last() {
      return item.key === lastKey()
    },
    get ring() {
      return item.key === lastLiveKey()
    },
  })
  return (
    <Collapsible.Root open={open()} onOpenChange={(details) => change(details.open)} class="min-w-0 w-full mt-1">
      <div class={HEADER_ITEM}>
        <TraceConnector joint={open() ? 'junction' : 'corner'} />
        <Collapsible.Trigger class={HEADER_ROW}>
          <Show
            when={open()}
            fallback={
              <>
                <span class={COMPACT_LINE}>{local.compactLine}</span>
                <span class={TOGGLE}>Show trace</span>
              </>
            }
          >
            <span class={HEADER_LABEL}>Trace</span>
            <span class={SUMMARY}>{local.summary}</span>
            <span class={TOGGLE}>Hide trace</span>
          </Show>
        </Collapsible.Trigger>
      </div>
      <Collapsible.Content>
        <div class="relative">
          <ul ref={setListEl} class={ROWS} aria-label={local.label ?? 'Execution trace'}>
            <For each={local.items}>{(item) => item.render(branchFor(item))}</For>
          </ul>
          <TraceRail list={listEl} liveKey={lastLiveKey} />
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
