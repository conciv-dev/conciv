import {createSignal, Show, type JSX, type ParentProps} from 'solid-js'
import {Brain, ChevronDown} from 'lucide-solid'
import {Collapsible} from '@mandarax/ui-kit-system'
import {SHIMMER} from './shimmer.js'
import {FOCUS} from './classes.js'

export type ChainOfThoughtProps = ParentProps<{streaming?: boolean; durationMs?: number}>

const TRIGGER = `group flex items-center gap-2.5 w-full px-3.5 py-2 text-[length:var(--chat-text-lg)] font-medium text-[color:var(--chat-text)] cursor-pointer select-none [background:var(--chat-fill)] [border:1px_solid_var(--chat-line)] rounded-[var(--chat-radius-md)] [transition:background_140ms_var(--chat-ease)] hover:[background:var(--chat-fill-strong)] ${FOCUS}`
// lucide chevron rotates around its own center (clean), unlike a text glyph: down when open, right when closed.
const CHEVRON =
  'ml-auto shrink-0 text-[color:var(--chat-text-3)] [transition:transform_150ms_var(--chat-ease)] group-data-[state=closed]:-rotate-90 group-data-[state=open]:rotate-0'
// The timeline node: a small ringed circle holding the step's icon, sat on the connecting rail line.
const NODE =
  'shrink-0 size-[1.375rem] flex items-center justify-center rounded-full [background:var(--chat-bg)] [border:1px_solid_var(--chat-line)] text-[color:var(--chat-text-3)]'
const LINE = 'w-px flex-1 [background:var(--chat-line)]'
// The node sits in a row whose height is built from the SAME values as a step card's header — its
// `py-2` (= 1rem total) plus one text-md line (1lh at text-md) — and the node is centered in it. So
// the node's center equals the card header's center by construction (no guessed offset). mt-px covers
// the card's 1px top border.
const NODE_ROW = 'flex items-center shrink-0 mt-px text-[length:var(--chat-text-md)] [height:calc(1lh_+_1rem)]'

// One step on the rail: an icon node (centered on the step's header line) + the connecting line below
// it (except the last), then the step content (a Reasoning card, a tool card, …).
function Step(props: {icon: JSX.Element; last?: boolean; children: JSX.Element}): JSX.Element {
  return (
    <div class="flex gap-2.5">
      <div class="flex flex-col items-center self-stretch">
        <div class={NODE_ROW}>
          <span class={NODE}>{props.icon}</span>
        </div>
        <Show when={!props.last}>
          <span aria-hidden="true" class={LINE} />
        </Show>
      </div>
      <div class="pb-3 flex-1 min-w-0">{props.children}</div>
    </div>
  )
}

// The reasoning/tool chain of one answer, as a collapsible timeline (D9 process/answer rhythm). Open
// while streaming (the "Working…" label shimmers); collapses to a quiet "Chain of Thought" summary.
function Root(props: ChainOfThoughtProps): JSX.Element {
  const [userOpen, setUserOpen] = createSignal(false)
  const open = () => userOpen() || (props.streaming ?? false)
  return (
    <Collapsible.Root open={open()} onOpenChange={(details) => setUserOpen(details.open)}>
      <div class="flex flex-col gap-2 min-w-0 w-full">
        <Collapsible.Trigger class={TRIGGER}>
          <Brain size={16} class="text-[color:var(--chat-text-2)] shrink-0" />
          <span class={props.streaming ? SHIMMER : ''}>{props.streaming ? 'Working…' : 'Chain of Thought'}</span>
          <ChevronDown size={16} class={CHEVRON} aria-hidden="true" />
        </Collapsible.Trigger>
        <Collapsible.Content>
          <div class="flex flex-col">{props.children}</div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  )
}

export const ChainOfThought = Object.assign(Root, {Step})
