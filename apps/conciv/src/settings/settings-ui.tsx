import {Show, createUniqueId, splitProps, type JSX} from 'solid-js'
import {FieldPrimitive as Field} from '@conciv/ui-kit-system'
import Lock from 'lucide-solid/icons/lock'
import {useFieldContext} from './form-context.js'

export const MICRO =
  'm-0 [font-family:var(--chat-mono)] text-[0.59375rem] leading-[1.2] font-normal uppercase tracking-[0.14em] text-chat-dim whitespace-nowrap'
const CARD =
  'flex flex-col rounded-chat-surface-md [border:1px_solid_var(--chat-line)] bg-chat-fill-soft [&>*+*]:[border-block-start:1px_solid_var(--chat-line-soft)]'
const LABEL = 'flex items-center gap-2 text-[0.8125rem] font-medium text-chat-text-hi'
const HINT = 'text-[0.75rem] leading-[1.35] text-chat-text-2'
export const TEXT_LINK =
  'p-0 bg-transparent [border:none] font-chat text-[0.6875rem] text-chat-dim underline underline-offset-2 cursor-pointer focus-ring hover:text-chat-text-hi'
const BUTTON =
  'inline-flex shrink-0 items-center gap-1.5 h-7 px-2.5 rounded-[var(--chat-radius-sm)] bg-transparent [border:1px_solid_var(--chat-line-2)] font-chat text-[0.75rem] text-chat-text cursor-pointer focus-ring trans-bg hover:bg-chat-fill-strong disabled:opacity-50 disabled:cursor-not-allowed'
export const BUTTON_WARN = `${BUTTON} [border-color:color-mix(in_oklch,var(--chat-warn)_42%,transparent)] !text-chat-warn hover:!bg-[color-mix(in_oklch,var(--chat-warn)_10%,transparent)]`
export const BUTTON_DANGER_FILL = `${BUTTON} !bg-chat-danger [border-color:var(--chat-danger)] !text-chat-on-accent`
const ROW = 'flex items-center gap-3 min-h-11.5 py-2.5 px-3'
const STACK = 'flex flex-col gap-2.5 p-3'
const TEXT = 'flex flex-1 min-w-0 flex-col gap-0.5'
const LOCK = 'inline-flex items-center gap-1.25 [font-family:var(--chat-mono)] text-[0.65625rem] text-chat-dim'
const ERROR = 'text-[0.75rem] leading-[1.35] text-chat-danger'
const SECTION = `${CARD} overflow-hidden anim-rise`
const SECTION_DANGER = '[border-color:color-mix(in_oklch,var(--chat-danger)_35%,transparent)]'
const SECTION_HEAD = 'flex items-start gap-2.5 pt-3 px-3 pb-2.5'
const SECTION_TEXT = 'flex flex-1 min-w-0 flex-col gap-0.5'
const SECTION_TITLE =
  'flex items-center gap-1.75 m-0 [font-family:var(--chat-font-display)] text-[0.84375rem] font-semibold text-chat-text-hi'
const SECTION_DESCRIPTION = 'm-0 text-[0.71875rem] leading-[1.35] text-chat-text-2'

type GroupProps = {
  title: JSX.Element
  description?: string
  action?: JSX.Element
  danger?: boolean
  children: JSX.Element
}

export function Group(props: GroupProps): JSX.Element {
  const titleId = createUniqueId()
  return (
    <section class={`${SECTION} ${props.danger ? SECTION_DANGER : ''}`} aria-labelledby={titleId}>
      <div class={SECTION_HEAD}>
        <div class={SECTION_TEXT}>
          <h3 id={titleId} class={`${SECTION_TITLE} ${props.danger ? '!text-chat-danger' : ''}`}>
            {props.title}
          </h3>
          <Show when={props.description}>
            <p class={SECTION_DESCRIPTION}>{props.description}</p>
          </Show>
        </div>
        {props.action}
      </div>
      {props.children}
    </section>
  )
}

type RowTextProps = {label: JSX.Element; hint?: JSX.Element; lock?: string; error?: string}

function RowText(props: RowTextProps): JSX.Element {
  return (
    <span class={TEXT}>
      <Field.Label class={LABEL}>{props.label}</Field.Label>
      <Show when={props.hint}>
        <Field.HelperText class={HINT}>{props.hint}</Field.HelperText>
      </Show>
      <Show when={props.lock}>
        {(reason) => (
          <span class={LOCK}>
            <Lock class="size-2.75 shrink-0" aria-hidden="true" />
            {reason()}
          </span>
        )}
      </Show>
      <Field.ErrorText class={ERROR}>{props.error}</Field.ErrorText>
    </span>
  )
}

type SettingRowProps = {
  label: string
  hint?: JSX.Element
  lock?: string
  layout?: 'row' | 'stack'
  children: JSX.Element
}

export function SettingRow(props: SettingRowProps): JSX.Element {
  const [local] = splitProps(props, ['label', 'hint', 'lock', 'layout', 'children'])
  const field = useFieldContext<unknown>()
  const error = () => {
    const first = field().state.meta.errors.at(0)
    return first === undefined || first === null ? undefined : String(first)
  }
  return (
    <Field.Root
      class={local.layout === 'stack' ? STACK : ROW}
      invalid={error() !== undefined}
      readOnly={Boolean(local.lock)}
    >
      <RowText label={local.label} hint={local.hint} lock={local.lock} error={error()} />
      {local.children}
    </Field.Root>
  )
}

type ActionRowProps = {label: JSX.Element; hint?: string; children: JSX.Element}

export function ActionRow(props: ActionRowProps): JSX.Element {
  return (
    <div class={ROW}>
      <span class={TEXT}>
        <span class={LABEL}>{props.label}</span>
        <Show when={props.hint}>
          <span class={HINT}>{props.hint}</span>
        </Show>
      </span>
      {props.children}
    </div>
  )
}
