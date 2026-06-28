import {createSignal, type JSX} from 'solid-js'
import {CollapsibleCard} from './collapsible-card.js'
import {SHIMMER} from './shimmer.js'

export type ReasoningProps = {text: string; streaming?: boolean; defaultOpen?: boolean}

// Reasoning / chain-of-thought ghost text in a collapsible card. While streaming the label shimmers;
// once settled it collapses to a quiet "Reasoning" summary. Controlled like ChainOfThought: forced open
// while streaming, then collapses on settle unless the user had opened it themselves.
export function Reasoning(props: ReasoningProps): JSX.Element {
  const [userOpen, setUserOpen] = createSignal(props.defaultOpen ?? false)
  const open = () => userOpen() || (props.streaming ?? false)
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
      <div class="text-[color:var(--chat-text)] leading-[1.45] whitespace-pre-wrap">{props.text}</div>
    </CollapsibleCard>
  )
}
