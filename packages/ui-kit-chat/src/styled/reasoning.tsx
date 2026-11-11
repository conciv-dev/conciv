import {splitProps, untrack, type JSX} from 'solid-js'
import {CollapsibleCard} from '../tools/styled/collapsible-card.js'
import {createSettleFold} from '../primitives/util/create-settle-fold.js'
import {SHIMMER} from './shimmer.js'

export type ReasoningProps = {
  text: string
  streaming?: boolean
  defaultOpen?: boolean
  grow?: boolean
}

const PREVIEW =
  'max-h-64 overflow-y-auto flex flex-col-reverse [mask-image:linear-gradient(to_bottom,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]'

export function ReasoningText(props: {text: string}): JSX.Element {
  const [local, rest] = splitProps(props, ['text'])
  return (
    <div {...rest} class="text-chat-text leading-[1.45] whitespace-pre-wrap">
      {local.text}
    </div>
  )
}

export function Reasoning(props: ReasoningProps): JSX.Element {
  const [, rest] = splitProps(props, ['text', 'streaming', 'defaultOpen', 'grow'])
  const bornStreaming = untrack(() => Boolean(props.streaming))
  const collapse = createSettleFold({
    revealed: () => bornStreaming || Boolean(props.streaming),
    defaultOpen: props.defaultOpen,
  })
  const capped = () => !props.grow
  return (
    <CollapsibleCard
      {...rest}
      open={collapse.open()}
      onOpenChange={collapse.setOpen}
      header={
        <span class={props.streaming ? SHIMMER : 'text-chat-text-2'}>
          {props.streaming ? 'Thinking…' : 'Reasoning'}
        </span>
      }
    >
      <div class={capped() ? PREVIEW : ''}>
        <ReasoningText text={props.text} />
      </div>
    </CollapsibleCard>
  )
}
