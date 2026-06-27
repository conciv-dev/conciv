import {Show, splitProps, type JSX} from 'solid-js'
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
