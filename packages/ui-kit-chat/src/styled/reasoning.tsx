import {createSignal, type JSX} from 'solid-js'
import {CollapsibleCard} from '../tools/styled/collapsible-card.js'
import {SHIMMER} from './shimmer.js'

export type ReasoningProps = {text: string; streaming?: boolean; defaultOpen?: boolean}

export function ReasoningText(props: {text: string}): JSX.Element {
  return <div class="text-[color:var(--chat-text)] leading-[1.45] whitespace-pre-wrap">{props.text}</div>
}

export function Reasoning(props: ReasoningProps): JSX.Element {
  const [userOpen, setUserOpen] = createSignal<boolean | undefined>(props.defaultOpen)
  const open = () => userOpen() ?? Boolean(props.streaming)
  return (
    <CollapsibleCard
      open={open()}
      onOpenChange={setUserOpen}
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
