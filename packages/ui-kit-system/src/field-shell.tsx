import {Show, splitProps, type JSX} from 'solid-js'
import {Field} from '@ark-ui/solid/field'
import {Fieldset} from '@ark-ui/solid/fieldset'
import CircleAlert from 'lucide-solid/icons/circle-alert'
import Lock from 'lucide-solid/icons/lock'
import RotateCcw from 'lucide-solid/icons/rotate-ccw'
import {Button} from './button.js'

const ROOT = 'flex min-w-0 m-0 p-0 [border:none] font-chat'
const LAYOUT = {
  row: 'flex-row items-start justify-between gap-4',
  stack: 'flex-col gap-2',
}
const HEAD = 'flex flex-col gap-0.5 flex-1 min-w-0'
const LABEL =
  'inline-flex items-center gap-2 p-0 text-[0.8125rem] leading-snug font-medium text-chat-text-hi data-[disabled]:text-chat-text-2'
const CHANGED = 'size-1.5 shrink-0 rounded-chat-pill bg-chat-accent'
const HELP = 'flex flex-col gap-1 text-[0.75rem] leading-snug text-chat-text-2'
const LOCK = 'inline-flex items-center gap-1.5 font-chat-mono text-[0.6875rem] text-chat-text-3'
const ERROR = 'flex items-start gap-1.5 text-[0.75rem] leading-snug text-chat-danger'
const ICON = 'size-3.5 shrink-0 mt-px'
const RESET = 'self-start gap-1 min-h-6 text-chat-text-3 hover:text-chat-text-hi'
const CONTROL = {
  row: 'flex shrink-0 justify-end',
  stack: 'flex flex-col min-w-0',
}
const FOCUS_TARGETS = [
  'input[type=radio]:checked',
  '[role=radio][aria-checked=true]',
  'input:not([type=hidden]):not([hidden]):not(:disabled), textarea, [role=slider]',
  'button:not(:disabled), [tabindex="0"]',
]

type FieldShellProps = {
  label: string
  description?: JSX.Element
  error?: string
  layout?: 'row' | 'stack'
  group?: boolean
  changed?: boolean
  onReset?: () => void
  locked?: string
  disabled?: boolean
  required?: boolean
  class?: string
  children: JSX.Element
}

export function FieldShell(props: FieldShellProps): JSX.Element {
  const [local] = splitProps(props, [
    'label',
    'description',
    'error',
    'layout',
    'group',
    'changed',
    'onReset',
    'locked',
    'disabled',
    'required',
    'class',
    'children',
  ])
  let control: HTMLDivElement | undefined
  const layout = () => local.layout ?? 'stack'
  const rootClass = () => `${ROOT}  ${LAYOUT[layout()]}  ${local.class ?? ''}`
  const showReset = () => Boolean(local.changed && local.onReset && !local.locked && !local.disabled)
  const reset = () => {
    local.onReset?.()
    const target = FOCUS_TARGETS.map((selector) => control?.querySelector<HTMLElement>(selector)).find(Boolean)
    target?.focus()
  }
  const helper = (): JSX.Element => (
    <>
      <Show when={local.description}>{(description) => <span>{description()}</span>}</Show>
      <Show when={local.locked}>
        {(reason) => (
          <span class={LOCK}>
            <Lock class="shrink-0 size-3" aria-hidden="true" />
            {reason()}
          </span>
        )}
      </Show>
    </>
  )
  const hasHelper = () => Boolean(local.description || local.locked)
  const errorBody = (): JSX.Element => (
    <>
      <CircleAlert class={ICON} aria-hidden="true" />
      <span>{local.error}</span>
    </>
  )
  const resetButton = (): JSX.Element => (
    <Show when={showReset()}>
      <Button variant="ghost" size="sm" class={RESET} onClick={reset}>
        <RotateCcw class="size-3" aria-hidden="true" />
        Reset to default
      </Button>
    </Show>
  )
  const changedMark = (): JSX.Element => (
    <Show when={local.changed}>
      <span class={CHANGED} aria-hidden="true" />
    </Show>
  )
  const body = (parts: {label: JSX.Element; helper: JSX.Element; error: JSX.Element}): JSX.Element => (
    <>
      <div class={HEAD}>
        {parts.label}
        {parts.helper}
        <Show when={layout() === 'row'}>
          {parts.error}
          {resetButton()}
        </Show>
      </div>
      <div
        ref={(element) => {
          control = element
        }}
        class={CONTROL[layout()]}
      >
        {local.children}
      </div>
      <Show when={layout() === 'stack'}>
        {parts.error}
        {resetButton()}
      </Show>
    </>
  )
  return (
    <Show
      when={local.group}
      fallback={
        <Field.Root
          class={rootClass()}
          invalid={Boolean(local.error)}
          disabled={local.disabled}
          readOnly={Boolean(local.locked)}
          required={local.required}
        >
          {body({
            label: (
              <span class="inline-flex gap-2 items-center">
                <Field.Label class={LABEL}>{local.label}</Field.Label>
                {changedMark()}
              </span>
            ),
            helper: (
              <Show when={hasHelper()}>
                <Field.HelperText class={HELP}>{helper()}</Field.HelperText>
              </Show>
            ),
            error: <Field.ErrorText class={ERROR}>{errorBody()}</Field.ErrorText>,
          })}
        </Field.Root>
      }
    >
      <Fieldset.Root class={rootClass()} invalid={Boolean(local.error)} disabled={local.disabled}>
        {body({
          label: (
            <span class="inline-flex gap-2 items-center">
              <Fieldset.Legend class={LABEL}>{local.label}</Fieldset.Legend>
              {changedMark()}
            </span>
          ),
          helper: (
            <Show when={hasHelper()}>
              <Fieldset.HelperText class={HELP}>{helper()}</Fieldset.HelperText>
            </Show>
          ),
          error: <Fieldset.ErrorText class={ERROR}>{errorBody()}</Fieldset.ErrorText>,
        })}
      </Fieldset.Root>
    </Show>
  )
}
