import {splitProps, type JSX} from 'solid-js'

export type ButtonVariant = 'solid' | 'ghost' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'icon'

const BASE =
  'inline-flex items-center justify-center gap-1.5 font-pw cursor-pointer trans-btn focus-ring [border:1px_solid_transparent] disabled:opacity-50 disabled:cursor-not-allowed'

const VARIANT: Record<ButtonVariant, string> = {
  solid: 'bg-pw-accent text-pw-on-accent hover:bg-pw-accent-hi',
  ghost: 'bg-transparent text-pw-text-2 hover:text-pw-text hover:bg-pw-fill-strong',
  outline: 'bg-pw-fill text-pw-text [border-color:var(--pw-line)] hover:bg-pw-fill-strong',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'text-[0.6875rem] rounded-pw-sm py-0.5 px-2',
  md: 'text-[0.8125rem] rounded-pw-md py-2 px-3',
  icon: 'rounded-pw-md size-9.5',
}

export function Button(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & {variant?: ButtonVariant; size?: ButtonSize},
): JSX.Element {
  const [local, rest] = splitProps(props, ['variant', 'size', 'class', 'type'])
  return (
    <button
      type={local.type ?? 'button'}
      class={`${BASE}  ${VARIANT[local.variant ?? 'solid']}  ${SIZE[local.size ?? 'md']}  ${local.class ?? ''}`}
      {...rest}
    />
  )
}
