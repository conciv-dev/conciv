import {Match, Show, Switch, children, createUniqueId, splitProps, useContext, type JSX} from 'solid-js'
import {Button, FieldPrimitive as Field, Loader} from '@conciv/ui-kit-system'
import Lock from 'lucide-solid/icons/lock'
import {useFieldContext} from './form-context.js'
import {SettingNote} from './setting-note.js'

export const MICRO =
  'm-0 font-chat-mono text-[0.59375rem] leading-[1.2] font-normal uppercase tracking-[0.14em] text-chat-dim whitespace-nowrap'
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
const BADGE =
  'min-w-0 truncate ms-0.5 py-px px-1.25 rounded-[var(--chat-radius-chip)] [border:1px_solid_var(--chat-line-2)] font-chat-mono text-[0.5625rem] font-normal uppercase tracking-[0.1em] text-chat-text-2'
const ROW = 'flex items-center gap-3 min-h-11.5 py-2.5 px-3'
const STACK = 'flex flex-col gap-2.5 p-3'
const TEXT = 'flex flex-1 min-w-0 flex-col gap-0.5'
export const NOTE_TEXT = 'font-chat-mono text-[0.65625rem] text-chat-dim'
export const LOCK = `inline-flex items-center gap-1.25 ${NOTE_TEXT}`
const HEADLINE = 'flex min-w-0 items-baseline gap-x-2'
const NOTE = `flex-1 min-w-0 truncate ${NOTE_TEXT}`
const ERROR = 'text-[0.75rem] leading-[1.35] text-chat-danger'
const SECTION = `${CARD} overflow-hidden`
const SECTION_DANGER = '[border-color:color-mix(in_oklch,var(--chat-danger)_35%,transparent)]'
const SECTION_HEAD = 'flex items-start gap-2.5 pt-3 px-3 pb-2.5'
const SECTION_TEXT = 'flex flex-1 min-w-0 flex-col gap-0.5'
const SECTION_TITLE =
  'flex items-center gap-1.75 m-0 font-chat-display text-[0.84375rem] font-semibold text-chat-text-hi'
const SECTION_DESCRIPTION = 'm-0 text-[0.71875rem] leading-[1.35] text-chat-text-2'
const HEADER = 'flex h-13 shrink-0 items-center gap-1.5 px-2 [border-block-end:1px_solid_var(--chat-line-soft)]'
const HEADER_TEXT = 'flex flex-1 min-w-0 flex-col gap-0.5'
const HEADER_TITLE = 'm-0 font-chat-display text-[0.9375rem] font-semibold text-chat-text-hi leading-[1.25]'

type SettingsHeaderProps = {
  title: JSX.Element
  description?: JSX.Element
  leading?: JSX.Element
  actions?: JSX.Element
}

export function SettingsHeader(props: SettingsHeaderProps): JSX.Element {
  const description = children(() => props.description)
  return (
    <header class={HEADER}>
      {props.leading}
      <div class={HEADER_TEXT}>
        <h2 class={HEADER_TITLE}>{props.title}</h2>
        <Show when={description()}>
          <p class={SECTION_DESCRIPTION}>{description()}</p>
        </Show>
      </div>
      {props.actions}
    </header>
  )
}

type GroupProps = {
  title?: JSX.Element
  description?: string
  action?: JSX.Element
  danger?: boolean
  keys?: readonly string[]
  children: JSX.Element
  footer?: JSX.Element
}

export function Group(props: GroupProps): JSX.Element {
  const titleId = createUniqueId()
  const readNote = useContext(SettingNote)
  const note = () => props.keys?.map((key) => readNote(key)).find((text) => text !== undefined)
  return (
    <section
      class={`${SECTION} ${props.danger ? SECTION_DANGER : ''}`}
      aria-labelledby={props.title === undefined ? undefined : titleId}
    >
      <Show when={props.title !== undefined}>
        <div class={SECTION_HEAD}>
          <div class={SECTION_TEXT}>
            <span class={HEADLINE}>
              <h3 id={titleId} class={`${SECTION_TITLE} ${props.danger ? '!text-chat-danger' : ''}`}>
                {props.title}
              </h3>
              <Show when={note()}>
                <span class={NOTE} title={note()}>
                  {note()}
                </span>
              </Show>
            </span>
            <Show when={props.description}>
              <p class={SECTION_DESCRIPTION}>{props.description}</p>
            </Show>
          </div>
          {props.action}
        </div>
      </Show>
      {props.children}
      {props.footer}
    </section>
  )
}

type RowTextProps = {label: JSX.Element; hint?: JSX.Element; lock?: string; note?: string; error?: string}

function RowText(props: RowTextProps): JSX.Element {
  return (
    <span class={TEXT}>
      <span class={HEADLINE}>
        <Field.Label class={LABEL}>{props.label}</Field.Label>
        <Show when={props.note}>
          <span class={NOTE} title={props.note}>
            {props.note}
          </span>
        </Show>
      </span>
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
  const readNote = useContext(SettingNote)
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
      <RowText label={local.label} hint={local.hint} lock={local.lock} note={readNote(field().name)} error={error()} />
      {local.children}
    </Field.Root>
  )
}

type ActionRowProps = {
  label: JSX.Element
  hint?: JSX.Element
  id?: string
  leading?: JSX.Element
  children: JSX.Element
}

export function ActionRow(props: ActionRowProps): JSX.Element {
  const hint = children(() => props.hint)
  return (
    <div class={ROW} data-action={props.id}>
      {props.leading}
      <span class={TEXT}>
        <span class={LABEL}>{props.label}</span>
        <Show when={hint()}>
          <span class={HINT}>{hint()}</span>
        </Show>
      </span>
      {props.children}
    </div>
  )
}

export function Badge(props: {children: JSX.Element}): JSX.Element {
  return <span class={BADGE}>{props.children}</span>
}

const FAILED = 'flex flex-col items-start gap-2 text-[0.8125rem] text-chat-text-2'

type SettingsLoadProps = {status: 'pending' | 'error' | 'success'; retry: () => void; children: JSX.Element}

export function SettingsLoad(props: SettingsLoadProps): JSX.Element {
  return (
    <Switch>
      <Match when={props.status === 'success'}>{props.children}</Match>
      <Match when={props.status === 'error'}>
        <div class={FAILED} role="alert">
          <p class="m-0">Your conciv settings could not be loaded.</p>
          <Button variant="outline" size="sm" onClick={() => props.retry()}>
            Retry
          </Button>
        </div>
      </Match>
      <Match when={props.status === 'pending'}>
        <Loader.Root class="py-6 text-chat-text-2" translations={{value: () => 'Loading settings'}}>
          <Loader.Indicator />
          <Loader.Text>
            <Loader.Label>Loading settings…</Loader.Label>
          </Loader.Text>
        </Loader.Root>
      </Match>
    </Switch>
  )
}
