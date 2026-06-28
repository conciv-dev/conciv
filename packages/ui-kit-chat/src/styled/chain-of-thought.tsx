import {type JSX, type ParentProps} from 'solid-js'
import {ChainOfThought as Primitive} from '../primitives/chain-of-thought/chain-of-thought.js'

export type ChainOfThoughtProps = ParentProps<{streaming?: boolean; durationMs?: number}>

const SHIMMER =
  '[background:linear-gradient(90deg,var(--chat-text-3),var(--chat-text),var(--chat-text-3))] [background-size:200%_100%] [background-clip:text] [-webkit-background-clip:text] [color:transparent] [animation:pw-think-shimmer_2s_linear_infinite]'
const TRIGGER =
  'flex items-center gap-1.5 text-[0.6875rem] text-[color:var(--chat-text-3)] cursor-pointer select-none [background:transparent]'

// Groups the consecutive thinking + tool parts of one answer into a single collapsible chain (D9
// process/answer rhythm). Shimmers while streaming, collapses to a quiet summary once settled.
export function ChainOfThought(props: ChainOfThoughtProps): JSX.Element {
  return (
    <Primitive.Root streaming={props.streaming} class="flex flex-col gap-1 min-w-0 w-full">
      <Primitive.AccordionTrigger class={TRIGGER}>
        <span class={props.streaming ? SHIMMER : ''}>{props.streaming ? 'Working…' : 'Steps'}</span>
        <span aria-hidden="true">›</span>
      </Primitive.AccordionTrigger>
      <Primitive.Parts class="pl-1 flex flex-col gap-1.5">{props.children}</Primitive.Parts>
    </Primitive.Root>
  )
}
