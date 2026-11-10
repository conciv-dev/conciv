import {createEffect, mergeProps, onCleanup, onMount, Show, splitProps, type JSX} from 'solid-js'
import {Field} from '@ark-ui/solid/field'
import {applyAutosize, observeAutosize} from './autosize.js'

const ROOT = 'flex flex-col gap-1'
const LABEL = 'text-[0.75rem] text-chat-text-2 font-chat'
const INPUT = {
  filled:
    'w-full font-chat text-[0.8125rem] rounded-chat-surface-md bg-chat-fill text-chat-text [border:1px_solid_var(--chat-line)] py-2 px-3 focus-ring placeholder:text-chat-text-3',
  outline:
    'w-full h-8 font-chat text-[0.8125rem] rounded-chat-surface-sm bg-chat-panel text-chat-text [border:1px_solid_var(--chat-line)] px-2.5 focus-ring placeholder:text-chat-text-3',
}

export function TextField(
  props: JSX.InputHTMLAttributes<HTMLInputElement> & {label?: string; variant?: keyof typeof INPUT},
): JSX.Element {
  const [local, rest] = splitProps(props, ['label', 'class', 'variant'])
  return (
    <Field.Root class={`${ROOT}  ${local.class ?? ''}`}>
      <Show when={local.label}>
        <Field.Label class={LABEL}>{local.label}</Field.Label>
      </Show>
      <Field.Input class={INPUT[local.variant ?? 'filled']} {...rest} />
    </Field.Root>
  )
}

const TEXTAREA =
  'w-full resize-none font-chat text-[0.8125rem] rounded-chat-surface-md bg-chat-fill text-chat-text [border:1px_solid_var(--chat-line)] py-2 px-3 focus-ring placeholder:text-chat-text-3'

const TEXTAREA_BARE =
  'w-full resize-none [background:transparent] [border:none] [font:inherit] focus-visible:outline-none'

export type TextAreaProps = Omit<JSX.TextareaHTMLAttributes<HTMLTextAreaElement>, 'style'> & {
  minRows?: number
  maxRows?: number
  onHeightChange?: (height: number) => void
  unstyled?: boolean
}

export function TextArea(props: TextAreaProps): JSX.Element {
  const merged = mergeProps({minRows: 1, maxRows: 5}, props)
  const [local, rest] = splitProps(merged, [
    'class',
    'minRows',
    'maxRows',
    'onHeightChange',
    'onInput',
    'value',
    'ref',
    'unstyled',
  ])
  let el: HTMLTextAreaElement | undefined
  let lastHeight = 0
  const grow = () => {
    if (!el) return
    const height = applyAutosize(el, local.minRows, local.maxRows)
    if (height === lastHeight) return
    lastHeight = height
    local.onHeightChange?.(height)
  }
  onMount(() => {
    grow()
    if (el) onCleanup(observeAutosize(el, grow))
  })
  createEffect(() => {
    void local.value
    grow()
  })
  return (
    <textarea
      ref={(node) => {
        el = node
        const forwardRef = local.ref
        if (typeof forwardRef === 'function') forwardRef(node)
      }}
      rows={local.minRows}
      class={`${local.unstyled ? TEXTAREA_BARE : TEXTAREA}  ${local.class ?? ''}`}
      value={local.value}
      onInput={(event) => {
        grow()
        if (typeof local.onInput === 'function') local.onInput(event)
      }}
      {...rest}
    />
  )
}
