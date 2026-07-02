import {createEffect, onMount, Show, splitProps, type JSX} from 'solid-js'
import {Field} from '@ark-ui/solid/field'

const ROOT = 'flex flex-col gap-1'
const LABEL = 'text-[0.75rem] text-pw-text-2 font-pw'
const INPUT =
  'w-full font-pw text-[0.8125rem] rounded-pw-md bg-pw-fill text-pw-text [border:1px_solid_var(--pw-line)] py-2 px-3 focus-ring placeholder:text-pw-text-3'

export function TextField(props: JSX.InputHTMLAttributes<HTMLInputElement> & {label?: string}): JSX.Element {
  const [local, rest] = splitProps(props, ['label', 'class'])
  return (
    <Field.Root class={`${ROOT}  ${local.class ?? ''}`}>
      <Show when={local.label}>
        <Field.Label class={LABEL}>{local.label}</Field.Label>
      </Show>
      <Field.Input class={INPUT} {...rest} />
    </Field.Root>
  )
}

const TEXTAREA =
  'w-full resize-none font-pw text-[0.8125rem] rounded-pw-md bg-pw-fill text-pw-text [border:1px_solid_var(--pw-line)] py-2 px-3 focus-ring placeholder:text-pw-text-3'

const TEXTAREA_BARE =
  'w-full resize-none [background:transparent] [border:none] [font:inherit] focus-visible:outline-none'

export type TextAreaProps = Omit<JSX.TextareaHTMLAttributes<HTMLTextAreaElement>, 'style'> & {
  minRows?: number
  maxRows?: number
  onHeightChange?: (height: number) => void
  unstyled?: boolean
}

function rowsToPx(el: HTMLTextAreaElement, rows: number): number {
  const styles = getComputedStyle(el)
  const lineHeight = Number.parseFloat(styles.lineHeight) || 20
  const vertical =
    Number.parseFloat(styles.paddingTop) +
    Number.parseFloat(styles.paddingBottom) +
    Number.parseFloat(styles.borderTopWidth) +
    Number.parseFloat(styles.borderBottomWidth)
  return rows * lineHeight + vertical
}

export function TextArea(props: TextAreaProps): JSX.Element {
  const [local, rest] = splitProps(props, [
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
  const grow = () => {
    if (!el) return
    const max = rowsToPx(el, local.maxRows ?? 5)
    const min = rowsToPx(el, local.minRows ?? 1)
    el.style.height = 'auto'
    const next = Math.max(min, Math.min(el.scrollHeight, max))
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
    local.onHeightChange?.(next)
  }
  onMount(grow)
  createEffect(() => {
    void local.value
    grow()
  })
  const forwardRef = local.ref
  return (
    <textarea
      ref={(node) => {
        el = node
        if (typeof forwardRef === 'function') forwardRef(node)
      }}
      rows={local.minRows ?? 1}
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
