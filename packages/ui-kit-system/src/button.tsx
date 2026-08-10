import {splitProps, type JSX} from 'solid-js'
import {cva} from 'class-variance-authority'

export type ButtonVariant =
  | 'solid'
  | 'ghost'
  | 'outline'
  | 'danger'
  | 'accent-soft'
  | 'outline-danger'
  | 'panel'
  | 'link'
  | 'plain'
export type ButtonSize = 'sm' | 'md' | 'icon' | 'bare' | 'none'

const button = cva(
  'inline-flex items-center justify-center gap-1.5 font-pw cursor-pointer trans-btn focus-ring [border-width:1px] [border-style:solid] disabled:opacity-50 disabled:cursor-not-allowed active:not-disabled:[transform:scale(0.97)]',
  {
    variants: {
      variant: {
        solid: 'border-transparent bg-pw-accent text-pw-on-accent hover:bg-pw-accent-hi',
        ghost: 'border-transparent bg-transparent text-pw-text-2 hover:text-pw-text hover:bg-pw-fill-strong',
        outline: 'border-pw-line bg-pw-fill text-pw-text hover:bg-pw-fill-strong',
        danger: 'border-transparent bg-pw-danger text-pw-on-accent hover:opacity-90',
        'accent-soft': 'border-pw-accent-line bg-pw-accent-08 text-pw-text hover:bg-pw-accent-20',
        'outline-danger':
          'border-pw-line-2 bg-transparent text-pw-text hover:border-pw-danger hover:text-pw-danger hover:bg-transparent',
        panel: 'border-pw-line bg-pw-panel text-pw-text hover:bg-pw-fill-strong',
        link: 'border-transparent bg-transparent text-pw-accent-link underline underline-offset-2 hover:text-pw-accent-hi',
        plain: 'border-transparent bg-transparent',
      },
      size: {
        sm: 'text-[0.6875rem] rounded-pw-sm py-0.5 px-2',
        md: 'text-[0.8125rem] rounded-pw-md py-2 px-3',
        icon: 'rounded-pw-md size-9.5',
        bare: 'text-[0.75rem] p-0',
        none: '',
      },
    },
    defaultVariants: {variant: 'solid', size: 'md'},
  },
)

export function Button(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & {variant?: ButtonVariant; size?: ButtonSize},
): JSX.Element {
  const [local, rest] = splitProps(props, ['variant', 'size', 'class', 'type'])
  return (
    <button
      type={local.type ?? 'button'}
      class={`${button({variant: local.variant ?? 'solid', size: local.size ?? 'md'})}  ${local.class ?? ''}`}
      {...rest}
    />
  )
}
