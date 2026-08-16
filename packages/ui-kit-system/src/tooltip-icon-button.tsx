import {splitProps, type JSX} from 'solid-js'
import {Tooltip} from './tooltip.js'

export type TooltipIconButtonVariant = 'ghost' | 'solid'
export type TooltipIconButtonSide = 'top' | 'bottom' | 'left' | 'right'

const BASE =
  'inline-flex items-center justify-center cursor-pointer trans-btn focus-ring disabled:opacity-50 disabled:cursor-not-allowed active:not-disabled:[transform:scale(0.97)]'

const VARIANT: Record<TooltipIconButtonVariant, string> = {
  ghost: 'rounded-pw-md bg-transparent text-pw-text-2 hover:text-pw-text hover:bg-pw-fill-strong',
  solid: 'rounded-pw-md bg-pw-accent text-pw-on-accent hover:bg-pw-accent-hi',
}

function iconButtonClass(variant: TooltipIconButtonVariant | undefined, size: string | undefined): string {
  return `${BASE}  ${VARIANT[variant ?? 'ghost']}  ${size ?? 'size-9'}`
}

export type TooltipIconButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  tooltip: string
  side?: TooltipIconButtonSide
  variant?: TooltipIconButtonVariant
}

export function TooltipIconButton(props: TooltipIconButtonProps): JSX.Element {
  const [local, rest] = splitProps(props, ['tooltip', 'side', 'variant', 'class'])
  return (
    <Tooltip.Root positioning={{strategy: 'fixed', placement: local.side ?? 'top', gutter: 6}}>
      <Tooltip.Trigger
        type="button"
        class={iconButtonClass(local.variant, local.class)}
        {...rest}
        aria-label={local.tooltip}
      />
      <Tooltip.Positioner>
        <Tooltip.Content>{local.tooltip}</Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  )
}

export type TooltipIconButtonSlotProps = {
  tooltip: string
  side?: TooltipIconButtonSide
  variant?: TooltipIconButtonVariant
  class?: string
  wrapperClass?: string
  children: (buttonProps: () => JSX.ButtonHTMLAttributes<HTMLButtonElement>) => JSX.Element
}

export function TooltipIconButtonSlot(props: TooltipIconButtonSlotProps): JSX.Element {
  const [local] = splitProps(props, ['tooltip', 'side', 'variant', 'class', 'wrapperClass', 'children'])
  const buttonProps = (describedBy: string | undefined): JSX.ButtonHTMLAttributes<HTMLButtonElement> => ({
    type: 'button',
    class: iconButtonClass(local.variant, local.class),
    'aria-label': local.tooltip,
    'aria-describedby': describedBy,
  })
  return (
    <Tooltip.Root positioning={{strategy: 'fixed', placement: local.side ?? 'top', gutter: 6}}>
      <Tooltip.Context>
        {(api) => (
          <Tooltip.Trigger
            asChild={(triggerProps) => (
              <span
                {...triggerProps()}
                class={`inline-flex  ${local.wrapperClass ?? ''}`}
                onFocusIn={(event) => event.target.matches(':focus-visible') && api().setOpen(true)}
                onFocusOut={() => api().setOpen(false)}
              >
                {local.children(() => buttonProps(triggerProps()['aria-describedby']))}
              </span>
            )}
          />
        )}
      </Tooltip.Context>
      <Tooltip.Positioner>
        <Tooltip.Content>{local.tooltip}</Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  )
}
