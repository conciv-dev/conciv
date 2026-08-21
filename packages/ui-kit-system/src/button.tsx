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
  'inline-flex items-center justify-center gap-1.5 cursor-pointer trans-btn [border-width:1px] [border-style:solid] disabled:opacity-50 disabled:cursor-not-allowed active:not-disabled:[transform:scale(0.97)]',
  {
    variants: {
      variant: {
        solid: 'border-transparent bg-chat-accent text-chat-on-accent hover:bg-chat-accent-hi',
        ghost: 'border-transparent bg-transparent text-chat-text-2 hover:text-chat-text hover:bg-chat-fill-strong',
        outline: 'border-chat-line bg-chat-fill text-chat-text hover:bg-chat-fill-strong',
        danger: 'border-transparent bg-chat-danger text-chat-on-accent hover:opacity-90',
        'accent-soft': 'border-chat-accent-line bg-chat-accent-08 text-chat-text hover:bg-chat-accent-20',
        'outline-danger':
          'border-chat-line-2 bg-transparent text-chat-text hover:border-chat-danger hover:text-chat-danger hover:bg-transparent',
        panel: 'border-chat-line bg-chat-panel text-chat-text hover:bg-chat-fill-strong',
        link: 'border-transparent bg-transparent text-chat-accent-link underline underline-offset-2 hover:text-chat-accent-hi',
        plain: 'border-transparent bg-transparent',
      },
      size: {
        sm: 'font-chat focus-ring text-[0.6875rem] rounded-chat-surface-sm py-0.5 px-2',
        md: 'font-chat focus-ring text-[0.8125rem] rounded-chat-surface-md py-2 px-3',
        icon: 'font-chat focus-ring rounded-chat-surface-md size-9.5',
        bare: 'font-chat focus-ring text-[0.75rem] p-0',
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
      class={button({variant: local.variant, size: local.size, class: local.class})}
      {...rest}
    />
  )
}
