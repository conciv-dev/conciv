import {Show, splitProps, type JSX} from 'solid-js'
import {Field} from '@ark-ui/solid/field'
import {Fieldset} from '@ark-ui/solid/fieldset'
import CircleAlert from 'lucide-solid/icons/circle-alert'

const ROOT = 'flex min-w-0 m-0 p-0 [border:none] font-chat'
const LAYOUT = {
  row: 'flex-row items-start justify-between gap-4',
  stack: 'flex-col gap-2',
}
const HEAD = 'flex flex-col gap-0.5 flex-1 min-w-0'
const LABEL =
  'inline-flex items-center gap-2 p-0 text-[0.8125rem] leading-snug font-medium text-chat-text-hi data-[disabled]:text-chat-text-2'
const HELP = 'text-[0.75rem] leading-snug text-chat-text-2'
const ERROR = 'flex items-start gap-1.5 text-[0.75rem] leading-snug text-chat-danger'
const ICON = 'size-3.5 shrink-0 mt-px'
const CONTROL = {
  row: 'flex shrink-0 justify-end',
  stack: 'flex flex-col min-w-0',
}

type FieldShellProps = {
  label: string
  description?: JSX.Element
  error?: string
  layout?: 'row' | 'stack'
  disabled?: boolean
  class?: string
  children: JSX.Element
} & ({group?: false; readOnly?: boolean; required?: boolean} | {group: true; readOnly?: never; required?: never})

export function FieldShell(props: FieldShellProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    'label',
    'description',
    'error',
    'layout',
    'group',
    'disabled',
    'readOnly',
    'required',
    'class',
    'children',
  ])
  const layout = () => local.layout ?? 'stack'
  const rootClass = () => `${ROOT}  ${LAYOUT[layout()]}  ${local.class ?? ''}`
  const errorBody = (): JSX.Element => (
    <>
      <CircleAlert class={ICON} aria-hidden="true" />
      <span>{local.error}</span>
    </>
  )
  const body = (parts: {label: JSX.Element; helper: JSX.Element; error: JSX.Element}): JSX.Element => (
    <>
      <div class={HEAD}>
        {parts.label}
        {parts.helper}
        <Show when={layout() === 'row'}>{parts.error}</Show>
      </div>
      <div class={CONTROL[layout()]}>{local.children}</div>
      <Show when={layout() === 'stack'}>{parts.error}</Show>
    </>
  )
  return (
    <Show
      when={local.group}
      fallback={
        <Field.Root
          {...rest}
          class={rootClass()}
          invalid={Boolean(local.error)}
          disabled={local.disabled}
          readOnly={local.readOnly}
          required={local.required}
        >
          {body({
            label: <Field.Label class={LABEL}>{local.label}</Field.Label>,
            helper: (
              <Show when={local.description}>
                <Field.HelperText class={HELP}>{local.description}</Field.HelperText>
              </Show>
            ),
            error: <Field.ErrorText class={ERROR}>{errorBody()}</Field.ErrorText>,
          })}
        </Field.Root>
      }
    >
      <Fieldset.Root {...rest} class={rootClass()} invalid={Boolean(local.error)} disabled={local.disabled}>
        {body({
          label: <Fieldset.Legend class={LABEL}>{local.label}</Fieldset.Legend>,
          helper: (
            <Show when={local.description}>
              <Fieldset.HelperText class={HELP}>{local.description}</Fieldset.HelperText>
            </Show>
          ),
          error: <Fieldset.ErrorText class={ERROR}>{errorBody()}</Fieldset.ErrorText>,
        })}
      </Fieldset.Root>
    </Show>
  )
}

export const FieldPrimitive = Field
