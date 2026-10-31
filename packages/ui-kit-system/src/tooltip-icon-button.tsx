import {Show, splitProps, type JSX} from 'solid-js'
import {Tooltip} from './tooltip.js'

export type TooltipIconButtonVariant = 'ghost' | 'solid'
export type TooltipIconButtonSide = 'top' | 'bottom' | 'left' | 'right'

const BASE =
  'inline-flex items-center justify-center cursor-pointer trans-btn focus-ring disabled:opacity-50 disabled:cursor-not-allowed active:not-disabled:[transform:scale(0.97)]'

const VARIANT: Record<TooltipIconButtonVariant, string> = {
  ghost: 'rounded-chat-surface-md bg-transparent text-chat-text-2 hover:text-chat-text hover:bg-chat-fill-strong',
  solid: 'rounded-chat-surface-md bg-chat-accent text-chat-on-accent hover:bg-chat-accent-hi',
}

const KEYCAP =
  'ms-[7px] inline-flex items-center h-[1.55em] px-[0.45em] rounded-[0.4em] text-[0.86em] font-medium tabular-nums tracking-[0.02em] [color:color-mix(in_oklch,currentColor_72%,transparent)] [background:color-mix(in_oklch,currentColor_9%,transparent)] [box-shadow:inset_0_-1px_0_color-mix(in_oklch,currentColor_12%,transparent)]'

function TooltipLabel(props: {tooltip: string; shortcut: string | undefined}): JSX.Element {
  return (
    <>
      {props.tooltip}
      <Show when={props.shortcut}>{(shortcut) => <kbd class={KEYCAP}>{shortcut()}</kbd>}</Show>
    </>
  )
}

function iconButtonClass(variant: TooltipIconButtonVariant | undefined, size: string | undefined): string {
  return `${BASE}  ${VARIANT[variant ?? 'ghost']}  ${size ?? 'size-9'}`
}

export type TooltipIconButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  tooltip: string
  shortcut?: string
  side?: TooltipIconButtonSide
  variant?: TooltipIconButtonVariant
}

export function TooltipIconButton(props: TooltipIconButtonProps): JSX.Element {
  const [local, rest] = splitProps(props, ['tooltip', 'shortcut', 'side', 'variant', 'class'])
  return (
    <Tooltip.Root positioning={{strategy: 'fixed', placement: local.side ?? 'top', gutter: 6}}>
      <Tooltip.Trigger
        type="button"
        class={iconButtonClass(local.variant, local.class)}
        {...rest}
        aria-label={local.tooltip}
      />
      <Tooltip.Positioner>
        <Tooltip.Content>
          <TooltipLabel tooltip={local.tooltip} shortcut={local.shortcut} />
        </Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  )
}

export type TooltipIconButtonSlotProps = {
  tooltip: string
  shortcut?: string
  side?: TooltipIconButtonSide
  variant?: TooltipIconButtonVariant
  class?: string
  wrapperClass?: string
  children: (buttonProps: () => JSX.ButtonHTMLAttributes<HTMLButtonElement>) => JSX.Element
}

export function TooltipIconButtonSlot(props: TooltipIconButtonSlotProps): JSX.Element {
  const [local] = splitProps(props, ['tooltip', 'shortcut', 'side', 'variant', 'class', 'wrapperClass', 'children'])
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
                class={`inline-flex ${local.wrapperClass ?? ''}`}
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
        <Tooltip.Content>
          <TooltipLabel tooltip={local.tooltip} shortcut={local.shortcut} />
        </Tooltip.Content>
      </Tooltip.Positioner>
    </Tooltip.Root>
  )
}
