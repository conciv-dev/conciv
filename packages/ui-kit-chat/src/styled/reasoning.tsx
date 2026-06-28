import {type JSX} from 'solid-js'
import {CollapsibleCard} from './collapsible-card.js'

export type ReasoningProps = {text: string; streaming?: boolean; defaultOpen?: boolean}

const SHIMMER =
  '[background:linear-gradient(90deg,var(--chat-text-3),var(--chat-text),var(--chat-text-3))] [background-size:200%_100%] [background-clip:text] [-webkit-background-clip:text] [color:transparent] [animation:pw-think-shimmer_2s_linear_infinite]'

// Reasoning / chain-of-thought ghost text in a collapsible card. While streaming the label shimmers;
// once settled it collapses to a quiet "Reasoning" summary.
export function Reasoning(props: ReasoningProps): JSX.Element {
  return (
    <CollapsibleCard
      defaultOpen={props.defaultOpen ?? props.streaming}
      header={
        <span class={props.streaming ? SHIMMER : 'text-[color:var(--chat-text-3)]'}>
          {props.streaming ? 'Thinking…' : 'Reasoning'}
        </span>
      }
    >
      <div class="text-[color:var(--chat-text-2)] leading-[1.45] whitespace-pre-wrap">{props.text}</div>
    </CollapsibleCard>
  )
}
