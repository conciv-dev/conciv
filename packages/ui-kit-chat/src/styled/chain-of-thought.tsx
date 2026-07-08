import {createEffect, createSignal, onCleanup, Show, type JSX, type ParentProps} from 'solid-js'
import {Brain, ChevronDown} from 'lucide-solid'
import {Collapsible} from '@conciv/ui-kit-system'
import {
  ChainOfThought as ChainOfThoughtPrimitive,
  useChainOfThought,
} from '../primitives/chain-of-thought/chain-of-thought.js'
import {useOptionalThreadViewport} from '../primitives/thread/viewport-context.js'
import {SHIMMER} from './shimmer.js'
import {FOCUS} from './classes.js'

export type ChainOfThoughtProps = ParentProps<{
  streaming?: boolean
  pinnedOpen?: boolean
  durationMs?: number
  settleDelayMs?: number
}>

const TRIGGER = `group flex items-center gap-2 w-full px-3 py-2 text-[length:var(--chat-text-md)] text-[color:var(--chat-text-2)] cursor-pointer select-none [background:var(--chat-fill)] [border:1px_solid_var(--chat-line)] rounded-[var(--chat-radius-md)] [transition:background_140ms_var(--chat-ease)] hover:[background:var(--chat-fill-strong)] ${FOCUS}`

const CHEVRON =
  'ml-auto shrink-0 text-[color:var(--chat-text-3)] [transition:rotate_150ms_var(--chat-ease)] group-data-[state=closed]:-rotate-90 group-data-[state=open]:rotate-0'

const NODE =
  'shrink-0 size-[1.375rem] flex items-center justify-center rounded-full [background:var(--chat-bg)] [border:1px_solid_var(--chat-line)] text-[color:var(--chat-text-3)]'
const LINE = 'w-px flex-1 [background:var(--chat-line)]'

const NODE_ROW = 'flex items-center shrink-0 mt-px text-[length:var(--chat-text-md)] [height:calc(1lh_+_1rem)]'

const PREVIEW =
  'max-h-64 overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]'

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

function Shell(props: ParentProps): JSX.Element {
  const chain = useChainOfThought()
  const viewport = useOptionalThreadViewport()
  const [scroller, setScroller] = createSignal<HTMLDivElement>()
  const [inner, setInner] = createSignal<HTMLDivElement>()
  createEffect(() => {
    if (!chain.preview()) return
    const scrollElement = scroller()
    const innerElement = inner()
    if (!scrollElement || !innerElement) return
    const pinToBottom = () => {
      scrollElement.scrollTop = scrollElement.scrollHeight
    }
    pinToBottom()
    const observer = new ResizeObserver(pinToBottom)
    observer.observe(innerElement)
    onCleanup(() => observer.disconnect())
  })
  return (
    <Collapsible.Root
      open={chain.open()}
      onOpenChange={(details) => {
        viewport?.holdPosition()
        chain.setOpen(details.open)
      }}
    >
      <div class="flex flex-col gap-2 min-w-0 w-full">
        <Collapsible.Trigger class={TRIGGER}>
          <Brain size={14} class="text-[color:var(--chat-text-3)] shrink-0" />
          <span class={chain.streaming() ? SHIMMER : ''}>{chain.streaming() ? 'Working…' : 'Chain of Thought'}</span>
          <ChevronDown size={14} class={CHEVRON} aria-hidden="true" />
        </Collapsible.Trigger>
        <Collapsible.Content>
          <div ref={setScroller} class={chain.preview() ? PREVIEW : ''}>
            <div ref={setInner} class="flex flex-col">
              {props.children}
            </div>
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  )
}

function Root(props: ChainOfThoughtProps): JSX.Element {
  return (
    <ChainOfThoughtPrimitive.Root
      streaming={props.streaming}
      pinnedOpen={props.pinnedOpen}
      settleDelayMs={props.settleDelayMs}
    >
      <Shell>{props.children}</Shell>
    </ChainOfThoughtPrimitive.Root>
  )
}

export const ChainOfThought = Object.assign(Root, {Step})
