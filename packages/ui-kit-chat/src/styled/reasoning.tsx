import {createSignal, type JSX} from 'solid-js'
import {createSettled} from '../behaviors/create-settled.js'
import {CollapsibleCard} from './collapsible-card.js'
import {SHIMMER} from './shimmer.js'

export type ReasoningProps = {text: string; streaming?: boolean; defaultOpen?: boolean; settleDelayMs?: number}

export function Reasoning(props: ReasoningProps): JSX.Element {
  const [userOpen, setUserOpen] = createSignal<boolean | undefined>(props.defaultOpen)
  const settled = createSettled(() => props.streaming ?? false, props.settleDelayMs)
  const open = () => userOpen() ?? (Boolean(props.streaming) || !settled())
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
