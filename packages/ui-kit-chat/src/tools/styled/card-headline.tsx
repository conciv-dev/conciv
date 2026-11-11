import {splitProps, type JSX} from 'solid-js'

const HEADLINE = 'flex items-baseline gap-2 min-w-0'

export const CARD_HEADLINE_TEXT = 'leading-[var(--chat-trace-gutter)]'

export function CardHeadline(props: {class?: string; children: JSX.Element}): JSX.Element {
  const [local, rest] = splitProps(props, ['class', 'children'])
  return (
    <span {...rest} class={`${HEADLINE}  ${local.class ?? ''}`}>
      {local.children}
    </span>
  )
}
