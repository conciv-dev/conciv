import {splitProps, type JSX} from 'solid-js'
import {cva} from 'class-variance-authority'
import {Button} from '@conciv/ui-kit-system'
import {FOCUS} from '../../styled/classes.js'

const actionButton = cva(
  `flex-none inline-flex items-center gap-1 rounded-[var(--chat-radius-sm)] py-1 px-2.5 font-semibold text-[length:var(--chat-text-sm)] leading-none ${FOCUS}`,
  {
    variants: {
      intent: {
        neutral:
          '[background:var(--chat-fill)] [border-color:var(--chat-line)] text-chat-text-2 hover:[background:var(--chat-fill-strong)]',
        deny: '[background:var(--chat-fill)] [border-color:var(--chat-line)] text-chat-text-2 hover:[background:var(--chat-fill-strong)] hover:text-chat-danger',
        allow:
          '[background:var(--chat-accent)] [border-color:var(--chat-accent)] text-chat-on-accent hover:[background:var(--chat-accent-hi)]',
      },
    },
    defaultVariants: {intent: 'neutral'},
  },
)

export function ActionRow(props: {children: JSX.Element; class?: string}): JSX.Element {
  const [local] = splitProps(props, ['children', 'class'])
  return <div class={`flex flex-wrap gap-2 items-center ${local.class ?? ''}`}>{local.children}</div>
}

export function ActionButton(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & {intent?: 'allow' | 'deny' | 'neutral'},
): JSX.Element {
  const [local, rest] = splitProps(props, ['intent', 'class'])
  return (
    <Button
      variant="plain"
      size="none"
      class={`${actionButton({intent: local.intent ?? 'neutral'})}  ${local.class ?? ''}`}
      {...rest}
    />
  )
}
