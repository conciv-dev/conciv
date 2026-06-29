import {Show, type JSX, type ParentProps} from 'solid-js'
import {Brain, ChevronDown} from 'lucide-solid'
import {Collapsible} from '@mandarax/ui-kit-system'
import {
  ChainOfThought as ChainOfThoughtPrimitive,
  useChainOfThought,
} from '../primitives/chain-of-thought/chain-of-thought.js'
import {SHIMMER} from './shimmer.js'
import {FOCUS} from './classes.js'

export type ChainOfThoughtProps = ParentProps<{streaming?: boolean; durationMs?: number}>

const TRIGGER = `group flex items-center gap-2.5 w-full px-3.5 py-2 text-[length:var(--chat-text-lg)] font-medium text-[color:var(--chat-text)] cursor-pointer select-none [background:var(--chat-fill)] [border:1px_solid_var(--chat-line)] rounded-[var(--chat-radius-md)] [transition:background_140ms_var(--chat-ease)] hover:[background:var(--chat-fill-strong)] ${FOCUS}`
// lucide chevron rotates around its own center (clean), unlike a text glyph: down when open, right when closed.
const CHEVRON =
  'ml-auto shrink-0 text-[color:var(--chat-text-3)] [transition:rotate_150ms_var(--chat-ease)] group-data-[state=closed]:-rotate-90 group-data-[state=open]:rotate-0'
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
// it (except the last), then the step content (a Reasoning card, a tool card, …). Presentational only.
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

// Binds the headless open-while-streaming state to the kit's Collapsible (the one disclosure
// mechanism, D3). Open while streaming (the "Working…" label shimmers); collapses to a quiet summary.
function Shell(props: ParentProps): JSX.Element {
  const chain = useChainOfThought()
  return (
    <Collapsible.Root open={chain.open()} onOpenChange={(details) => chain.setOpen(details.open)}>
      <div class="flex flex-col gap-2 min-w-0 w-full">
        <Collapsible.Trigger class={TRIGGER}>
          <Brain size={16} class="text-[color:var(--chat-text-2)] shrink-0" />
          <span class={chain.streaming() ? SHIMMER : ''}>{chain.streaming() ? 'Working…' : 'Chain of Thought'}</span>
          <ChevronDown size={16} class={CHEVRON} aria-hidden="true" />
        </Collapsible.Trigger>
        <Collapsible.Content>
          <div class="flex flex-col">{props.children}</div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  )
}

// The reasoning/tool chain of one answer, as a collapsible timeline (D9 process/answer rhythm).
function Root(props: ChainOfThoughtProps): JSX.Element {
  return (
    <ChainOfThoughtPrimitive.Root streaming={props.streaming}>
      <Shell>{props.children}</Shell>
    </ChainOfThoughtPrimitive.Root>
  )
}

export const ChainOfThought = Object.assign(Root, {Step})
