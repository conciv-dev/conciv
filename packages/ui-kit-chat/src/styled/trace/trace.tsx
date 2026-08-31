import {createMemo, createSignal, For, Show, splitProps, type JSX} from 'solid-js'
import {Collapsible, TruncatedText} from '@conciv/ui-kit-system'
import {createSettleFold} from '../../primitives/util/create-settle-fold.js'
import {FOCUS_INSET} from '../classes.js'
import {TRACE_HOVER_INDENT, TRACE_LINE, TRACE_MICROLABEL} from './trace-row.js'
import {TraceRail} from './rail.js'

export type TraceBranch = {readonly ring: boolean}

export type TraceItem = {key: string; live?: boolean; render: (branch: TraceBranch) => JSX.Element}

const HEADER_ITEM = 'min-w-0 w-full pb-px'
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
  folded?: boolean
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}): JSX.Element {
  const [local] = splitProps(props, [
    'summary',
    'compactLine',
    'items',
    'label',
    'folded',
    'defaultOpen',
    'open',
    'onOpenChange',
  ])
  const [rootEl, setRootEl] = createSignal<HTMLElement>()
  const [headerEl, setHeaderEl] = createSignal<HTMLElement>()
  const [listEl, setListEl] = createSignal<HTMLUListElement>()
  const fold = createSettleFold({
    revealed: () => true,
    folded: () => local.folded ?? false,
    defaultOpen: local.defaultOpen,
  })
  const open = () => local.open ?? fold.open()
  const change = (next: boolean) => {
    fold.setOpen(next)
    local.onOpenChange?.(next)
  }
  const lastLiveKey = createMemo(() => local.items.findLast((entry) => entry.live)?.key)
  const branchFor = (item: TraceItem): TraceBranch => ({
    get ring() {
      return item.key === lastLiveKey()
    },
  })
  return (
    <Collapsible.Root
      open={open()}
      onOpenChange={(details) => change(details.open)}
      ref={setRootEl}
      class="mt-1 min-w-0 w-full relative"
    >
      <TraceRail root={rootEl} header={headerEl} list={listEl} liveKey={lastLiveKey} open={open} />
      <div ref={setHeaderEl} class={HEADER_ITEM}>
        <Collapsible.Trigger class={HEADER_ROW}>
          <Show
            when={open()}
            fallback={
              <>
                <TruncatedText class={COMPACT_LINE} text={local.compactLine} />
                <span class={TOGGLE}>Show trace</span>
              </>
            }
          >
            <span class={HEADER_LABEL}>Trace</span>
            <TruncatedText class={SUMMARY} text={local.summary} />
            <span class={TOGGLE}>Hide trace</span>
          </Show>
        </Collapsible.Trigger>
      </div>
      <Collapsible.Content>
        <ul ref={setListEl} class={ROWS} aria-label={local.label ?? 'Execution trace'}>
          <For each={local.items}>{(item) => item.render(branchFor(item))}</For>
        </ul>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
