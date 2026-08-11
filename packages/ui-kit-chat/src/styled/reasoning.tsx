import {type JSX} from 'solid-js'
import {CollapsibleCard} from '../tools/styled/collapsible-card.js'
import {createAutoCollapse} from '../primitives/util/create-auto-collapse.js'
import {useOptionalThreadViewport} from '../primitives/thread/viewport-context.js'
import {SHIMMER} from './shimmer.js'

export type ReasoningProps = {text: string; streaming?: boolean; defaultOpen?: boolean}

export function ReasoningText(props: {text: string}): JSX.Element {
  return <div class="text-[color:var(--chat-text)] leading-[1.45] whitespace-pre-wrap">{props.text}</div>
}

export function Reasoning(props: ReasoningProps): JSX.Element {
  const viewport = useOptionalThreadViewport()
  const collapse = createAutoCollapse({
    streaming: () => Boolean(props.streaming),
    defaultOpen: props.defaultOpen,
    atBottom: viewport ? () => viewport.isAtBottom() : undefined,
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
      <ReasoningText text={props.text} />
    </CollapsibleCard>
  )
}
