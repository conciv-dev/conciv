import {createSignal, untrack, type JSX} from 'solid-js'
import {CollapsibleCard} from '../tools/styled/collapsible-card.js'
import {createSettleFold} from '../primitives/util/create-settle-fold.js'
import {createStickToBottom} from '@conciv/solid-stick-to-bottom'
import {SHIMMER} from './shimmer.js'

export type ReasoningProps = {
  text: string
  streaming?: boolean
  defaultOpen?: boolean
  grow?: boolean
}

const PREVIEW =
  'max-h-64 overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]'

export function ReasoningText(props: {text: string}): JSX.Element {
  return <div class="text-chat-text leading-[1.45] whitespace-pre-wrap">{props.text}</div>
}

export function Reasoning(props: ReasoningProps): JSX.Element {
  const bornStreaming = untrack(() => Boolean(props.streaming))
  const collapse = createSettleFold({
    revealed: () => bornStreaming || Boolean(props.streaming),
    defaultOpen: props.defaultOpen,
  })
  const [scroller, setScroller] = createSignal<HTMLDivElement>()
  const capped = () => !props.grow
  createStickToBottom(scroller, {
    initial: 'instant',
    follow: () => capped() && Boolean(props.streaming),
  })
  return (
    <CollapsibleCard
      open={collapse.open()}
      onOpenChange={collapse.setOpen}
      header={
        <span class={props.streaming ? SHIMMER : 'text-chat-text-2'}>
          {props.streaming ? 'Thinking…' : 'Reasoning'}
        </span>
      }
    >
      <div ref={setScroller} class={capped() ? PREVIEW : ''}>
        <ReasoningText text={props.text} />
      </div>
    </CollapsibleCard>
  )
}
