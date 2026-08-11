import {createSignal, type JSX} from 'solid-js'
import {CollapsibleCard} from '../tools/styled/collapsible-card.js'
import {createAutoCollapse} from '../primitives/util/create-auto-collapse.js'
import {createStickToBottom} from '../behaviors/stick-to-bottom.js'
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
  return <div class="text-[color:var(--chat-text)] leading-[1.45] whitespace-pre-wrap">{props.text}</div>
}

export function Reasoning(props: ReasoningProps): JSX.Element {
  const collapse = createAutoCollapse({streaming: () => Boolean(props.streaming), defaultOpen: props.defaultOpen})
  const [scroller, setScroller] = createSignal<HTMLDivElement>()
  const capped = () => collapse.isAutoOpen() && !props.grow
  createStickToBottom(scroller, {
    initial: 'instant',
    follow: () => capped() && Boolean(props.streaming),
  })
  return (
    <CollapsibleCard
      open={collapse.open()}
      onOpenChange={collapse.setOpen}
      header={
        <span class={props.streaming ? SHIMMER : 'text-[color:var(--chat-text-2)]'}>
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
