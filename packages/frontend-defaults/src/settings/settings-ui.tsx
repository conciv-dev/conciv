import {Match, Show, Switch, splitProps, useContext, type JSX} from 'solid-js'
import {Button, FieldPrimitive as Field, Loader} from '@conciv/ui-kit-system'
import Lock from 'lucide-solid/icons/lock'
import {useFieldContext} from './form-context.js'
import {SettingNote} from './setting-note.js'
import {HEADLINE, HINT, LABEL, ROW, TEXT} from '@internal/frontend-app-api/plugin/settings-layout'

export const MICRO =
  'm-0 font-chat-mono text-[0.59375rem] leading-[1.2] font-normal uppercase tracking-[0.14em] text-chat-dim whitespace-nowrap'
const BUTTON =
  'inline-flex shrink-0 items-center gap-1.5 h-7 px-2.5 rounded-chat-sm bg-transparent [border:1px_solid_var(--chat-line-2)] font-chat text-[0.75rem] text-chat-text cursor-pointer focus-ring trans-bg hover:bg-chat-fill-strong disabled:opacity-50 disabled:cursor-not-allowed'
export const BUTTON_WARN = `${BUTTON} [border-color:color-mix(in_oklch,var(--chat-warn)_42%,transparent)] !text-chat-warn hover:!bg-[color-mix(in_oklch,var(--chat-warn)_10%,transparent)]`
export const BUTTON_DANGER_FILL = `${BUTTON} !bg-chat-danger [border-color:var(--chat-danger)] !text-chat-on-accent`
const BADGE =
  'min-w-0 truncate ms-0.5 py-px px-1.25 rounded-[var(--chat-radius-chip)] [border:1px_solid_var(--chat-line-2)] font-chat-mono text-[0.5625rem] font-normal uppercase tracking-[0.1em] text-chat-text-2'
const STACK = 'flex flex-col gap-2.5 p-3'
export const NOTE_TEXT = 'font-chat-mono text-[0.65625rem] text-chat-dim'
export const LOCK = `inline-flex items-center gap-1.25 ${NOTE_TEXT}`
const NOTE = `flex-1 min-w-0 truncate ${NOTE_TEXT}`
const ERROR = 'text-[0.75rem] leading-[1.35] text-chat-danger'

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
