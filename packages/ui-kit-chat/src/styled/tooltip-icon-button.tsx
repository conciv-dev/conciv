import {splitProps, type JSX} from 'solid-js'
import {Tooltip} from '@mandarax/ui-kit-system'

// The most-reused atom: an icon button with a real Tooltip (no native title=, D4). Neutral-token
// styled; 44px hit area via padding (the glyph stays its own size, polished in Phase 8).
const BUTTON =
  'inline-flex items-center justify-center size-9 rounded-[var(--chat-radius-md)] [background:transparent] text-[color:var(--chat-text-2)] cursor-pointer [transition:background_140ms_var(--chat-ease),color_140ms_var(--chat-ease)] hover:text-[color:var(--chat-text-hi)] hover:[background:var(--chat-fill-strong)] focus-visible:[outline:0.125rem_solid_var(--chat-accent)] focus-visible:[outline-offset:0.125rem] disabled:opacity-50 disabled:cursor-not-allowed'

export type TooltipIconButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  tooltip: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export function TooltipIconButton(props: TooltipIconButtonProps): JSX.Element {
  const [local, rest] = splitProps(props, ['tooltip', 'side', 'class'])
  return (
    <Tooltip.Root positioning={{strategy: 'fixed', placement: local.side ?? 'top', gutter: 6}}>
      <Tooltip.Trigger type="button" class={`${BUTTON}  ${local.class ?? ''}`} {...rest} aria-label={local.tooltip} />
      <Tooltip.Positioner>
        <Tooltip.Content>{local.tooltip}</Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  )
}
