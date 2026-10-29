import type {JSX} from 'solid-js'

const HEADLINE = 'flex items-baseline gap-2 min-w-0'

export const CARD_HEADLINE_TEXT = 'leading-[var(--chat-trace-gutter)]'

export function CardHeadline(props: {class?: string; children: JSX.Element}): JSX.Element {
  return <span class={`${HEADLINE}  ${props.class ?? ''}`}>{props.children}</span>
}
