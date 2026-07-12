import {splitProps, type JSX} from 'solid-js'
import {Tooltip} from './tooltip.js'

export type TooltipIconButtonVariant = 'ghost' | 'solid'

const BASE =
  'inline-flex items-center justify-center cursor-pointer trans-btn focus-ring disabled:opacity-50 disabled:cursor-not-allowed active:not-disabled:[transform:scale(0.97)]'

const VARIANT: Record<TooltipIconButtonVariant, string> = {
  ghost: 'rounded-pw-md bg-transparent text-pw-text-2 hover:text-pw-text hover:bg-pw-fill-strong',
  solid: 'rounded-pw-md bg-pw-accent text-pw-on-accent hover:bg-pw-accent-hi',
}

export type TooltipIconButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  tooltip: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  variant?: TooltipIconButtonVariant
}

export function TooltipIconButton(props: TooltipIconButtonProps): JSX.Element {
  const [local, rest] = splitProps(props, ['tooltip', 'side', 'variant', 'class'])
  return (
    <Tooltip.Root positioning={{strategy: 'fixed', placement: local.side ?? 'top', gutter: 6}}>
      <Tooltip.Trigger
        type="button"
        class={`${BASE}  ${VARIANT[local.variant ?? 'ghost']}  ${local.class ?? 'size-9'}`}
        {...rest}
        aria-label={local.tooltip}
      />
      <Tooltip.Positioner>
        <Tooltip.Content>{local.tooltip}</Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  )
}
