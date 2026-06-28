import {splitProps, type JSX} from 'solid-js'
import {Collapsible} from '@mandarax/ui-kit-system'

// The single disclosure mechanism for every styled card (ui-kit Collapsible → one animation path,
// D3). Neutral-token styled. The chevron rotates via data-state; the body animates via the kit's
// collapse keyframes (never a CSS transition — Zag tracks animationend).
export type CollapsibleCardProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
  class?: string
}

const CARD =
  'w-full min-w-0 rounded-[var(--chat-radius-md)] [border:1px_solid_var(--chat-line)] [background:var(--chat-fill)] overflow-hidden'
const TRIGGER =
  'w-full flex items-center gap-2 px-2.5 py-1.5 text-[0.75rem] text-[color:var(--chat-text-2)] cursor-pointer select-none [background:transparent] hover:[background:var(--chat-fill-strong)] focus-visible:[outline:0.125rem_solid_var(--chat-accent)] [outline-offset:-2px]'
const BODY = 'px-2.5 pb-2 text-[0.6875rem] text-[color:var(--chat-text-2)]'

export function CollapsibleCard(
  props: CollapsibleCardProps & {header: JSX.Element; children: JSX.Element},
): JSX.Element {
  const [local] = splitProps(props, ['open', 'onOpenChange', 'defaultOpen', 'class', 'header', 'children'])
  return (
    <Collapsible.Root
      open={local.open}
      defaultOpen={local.defaultOpen}
      onOpenChange={(details) => local.onOpenChange?.(details.open)}
    >
      <div class={`${CARD}  ${local.class ?? ''}`}>
        <Collapsible.Trigger class={TRIGGER}>{local.header}</Collapsible.Trigger>
        <Collapsible.Content>
          <div class={BODY}>{local.children}</div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  )
}
