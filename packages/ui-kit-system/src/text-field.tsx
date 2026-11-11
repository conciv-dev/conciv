import {createEffect, mergeProps, onCleanup, onMount, Show, splitProps, type JSX} from 'solid-js'
import {Field, useFieldContext} from '@ark-ui/solid/field'
import {applyAutosize, observeAutosize} from './autosize.js'
import {INPUT_FRAME} from './input-frame.js'

const ROOT = 'flex flex-col gap-1'
const LABEL = 'text-[0.75rem] text-chat-text-2 font-chat'
const INPUT =
  'flex-1 w-full min-w-0 bg-transparent [border:none] px-2.5 text-inherit [font:inherit] focus-visible:outline-none placeholder:text-chat-text-3 read-only:cursor-default'
const VARIANT = {
  filled: {frame: INPUT_FRAME, input: 'py-2'},
  outline: {
    input: 'py-0',
    frame:
      'flex items-stretch min-w-0 h-8 rounded-chat-surface-sm bg-chat-panel text-chat-text font-chat text-[0.8125rem] leading-5 [border:1px_solid_var(--chat-line)] trans-composer has-[input:focus-visible]:border-chat-accent has-[input:focus-visible]:[outline:0.125rem_solid_var(--chat-accent)] [outline-offset:0.125rem] has-[[aria-invalid=true]]:border-chat-danger has-[input:disabled]:opacity-50 has-[[readonly]]:bg-chat-fill-soft has-[[readonly]]:text-chat-text-2',
  },
}
const MONO = 'font-chat-mono text-[0.75rem]'
const ADDON =
  'flex items-center gap-1.5 shrink-0 px-2.5 text-chat-text-3 font-chat-mono text-[0.75rem] whitespace-nowrap [border-inline-end:1px_solid_var(--chat-line-soft)]'
const SUFFIX =
  'flex items-center gap-1.5 shrink-0 px-2.5 text-chat-text-3 font-chat-mono text-[0.75rem] whitespace-nowrap'
const END = 'flex items-center shrink-0 [border-inline-start:1px_solid_var(--chat-line-soft)]'

type TextFieldProps = JSX.InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  addonStart?: JSX.Element
  addonEnd?: JSX.Element
  action?: JSX.Element
  mono?: boolean
  variant?: keyof typeof VARIANT
}

export function TextField(props: TextFieldProps): JSX.Element {
  const [local, rest] = splitProps(props, ['label', 'class', 'addonStart', 'addonEnd', 'action', 'mono', 'variant'])
  const field = useFieldContext()
  const variant = () => VARIANT[local.variant ?? 'filled']
  const frame = (): JSX.Element => (
    <div class={variant().frame}>
      <Show when={local.addonStart}>{(addon) => <span class={ADDON}>{addon()}</span>}</Show>
      <Field.Input class={`${INPUT}  ${variant().input}  ${local.mono ? MONO : ''}`} {...rest} />
      <Show when={local.addonEnd}>{(addon) => <span class={SUFFIX}>{addon()}</span>}</Show>
      <Show when={local.action}>{(action) => <span class={END}>{action()}</span>}</Show>
    </div>
  )
  return (
    <Show when={!field} fallback={<div class={`min-w-0 ${local.class ?? ''}`}>{frame()}</div>}>
      <Field.Root class={`${ROOT}  ${local.class ?? ''}`}>
        <Show when={local.label}>
          <Field.Label class={LABEL}>{local.label}</Field.Label>
        </Show>
        {frame()}
      </Field.Root>
    </Show>
  )
}

const TEXTAREA =
  'w-full resize-none font-chat text-[0.8125rem] leading-[1.45] rounded-chat-surface-md bg-chat-sunken text-chat-text-hi [border:1px_solid_var(--chat-line-2)] py-2 px-2.5 trans-composer focus-ring focus-visible:border-chat-accent aria-[invalid=true]:border-chat-danger read-only:bg-chat-fill-soft read-only:text-chat-text-2 disabled:opacity-50 placeholder:text-chat-text-3'

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
  const field = useFieldContext()
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
      {...field?.().getTextareaProps()}
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
