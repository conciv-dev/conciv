import {For, Show, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import type {AnyFieldApi} from '@tanstack/solid-form'
import {createHotkeyRecorder, formatForDisplay, normalizeHotkey} from '@tanstack/solid-hotkeys'
import Lock from 'lucide-solid/icons/lock'
import TriangleAlert from 'lucide-solid/icons/triangle-alert'
import X from 'lucide-solid/icons/x'
import {usePreferences} from '../app/context.js'
import type {Preferences, ShortcutCommand} from './preferences-schema.js'

export type ShortcutEntry = {command: ShortcutCommand; label: string}

const ROW =
  'flex items-center gap-2.5 min-h-10.5 py-1.5 pe-2 ps-3 data-[recording]:bg-chat-accent-08 data-[recording]:[box-shadow:inset_2px_0_0_var(--chat-accent)]'
const NAME =
  'flex flex-1 min-w-0 flex-col items-start gap-0.5 p-0 bg-transparent [border:none] font-chat text-[0.8125rem] text-start text-chat-text-hi cursor-pointer focus-ring rounded-[var(--chat-radius-chip)] disabled:cursor-default'
const RECORDING = '[font-family:var(--chat-mono)] text-[0.6875rem] text-chat-accent whitespace-nowrap'
const KEYS = 'flex items-center gap-0.75'
const KBD =
  'inline-grid place-items-center min-w-4.5 h-5 px-1.25 rounded-[var(--chat-radius-chip)] [border:1px_solid_var(--chat-line-2)] [border-block-end-width:2px] bg-chat-fill-soft [font-family:var(--chat-mono)] text-[0.65625rem] text-chat-text'
const NONE = 'text-[0.75rem] text-chat-dim whitespace-nowrap'
const CLEAR =
  'grid place-items-center size-5.5 shrink-0 rounded-[var(--chat-radius-sm)] bg-transparent [border:none] text-chat-text-2 cursor-pointer focus-ring trans-bg hover:bg-chat-fill-strong hover:text-chat-text-hi'
const LOCK = 'inline-flex items-center gap-1.25 [font-family:var(--chat-mono)] text-[0.65625rem] text-chat-dim'
const WARN =
  'flex items-start gap-2 py-2 px-3 bg-[color-mix(in_oklch,var(--chat-warn)_7%,transparent)] text-[0.75rem] leading-[1.4] text-chat-warn'
const WARN_ACTION =
  'p-0 bg-transparent [border:none] font-chat text-[0.75rem] text-chat-text-hi underline underline-offset-2 cursor-pointer focus-ring'

function Keys(props: {hotkey: string}): JSX.Element {
  return (
    <span class={KEYS}>
      <span class="sr-only">{formatForDisplay(props.hotkey, {useSymbols: false})}</span>
      <For each={formatForDisplay(props.hotkey, {parts: true})}>
        {(part) => (
          <kbd class={KBD} aria-hidden="true">
            {part}
          </kbd>
        )}
      </For>
    </span>
  )
}

type ShortcutRowProps = {
  entry: ShortcutEntry
  entries: readonly ShortcutEntry[]
  field: AnyFieldApi
}

function overridesOf(field: AnyFieldApi): Preferences['commandShortcuts'] {
  const value: unknown = field.state.value
  if (typeof value !== 'object' || value === null) return {}
  return value
}

function ShortcutRow(props: ShortcutRowProps): JSX.Element {
  const preferences = usePreferences()
  const [state, setState] = createStore<{draft: string | null}>({draft: null})
  let name: HTMLButtonElement | undefined
  const lock = () => preferences.shortcutLock(props.entry.command)
  const hotkey = () => preferences.shortcut(props.entry.command).at(0)
  const clashWith = (candidate: string) => {
    const wanted = normalizeHotkey(candidate)
    return props.entries.find(
      (other) =>
        other.command !== props.entry.command &&
        preferences.shortcut(other.command).some((binding) => normalizeHotkey(binding) === wanted),
    )
  }
  const save = (value: string | null, moveFrom?: ShortcutEntry) => {
    const next = {...overridesOf(props.field), [props.entry.command]: value === null ? [] : [value]}
    props.field.handleChange(moveFrom ? {...next, [moveFrom.command]: []} : next)
    setState('draft', null)
    name?.focus()
  }
  const recorder = createHotkeyRecorder({
    recordBy: 'key',
    onRecord: (recorded) => {
      if (clashWith(recorded)) setState('draft', recorded)
      else save(recorded)
    },
    onCancel: () => setState('draft', null),
    onClear: () => save(null),
  })
  const recording = () => recorder.isRecording() || state.draft !== null
  const clash = () => (state.draft === null ? undefined : clashWith(state.draft))
  const cancel = () => {
    recorder.cancelRecording()
    setState('draft', null)
    name?.focus()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (!recording() || event.key !== 'Escape') return
    event.stopPropagation()
    cancel()
  }
  return (
    <>
      <div class={ROW} data-recording={recording() ? '' : undefined} onKeyDown={onKeyDown}>
        <button
          ref={(element) => {
            name = element
          }}
          type="button"
          class={NAME}
          disabled={Boolean(lock())}
          aria-pressed={recording()}
          aria-description={recording() ? 'Press keys, Esc to cancel' : 'Press to record a new shortcut'}
          onClick={() => (recording() ? cancel() : recorder.startRecording())}
        >
          {props.entry.label}
          <Show when={lock()}>
            {(reason) => (
              <span class={LOCK}>
                <Lock class="size-2.75 shrink-0" aria-hidden="true" />
                {reason()}
              </span>
            )}
          </Show>
        </button>
        <Show
          when={!recording()}
          fallback={
            <Show when={state.draft} fallback={<span class={RECORDING}>Press keys, Esc to cancel</span>}>
              {(draft) => <Keys hotkey={draft()} />}
            </Show>
          }
        >
          <Show when={hotkey()} fallback={<span class={NONE}>Add shortcut</span>}>
            {(value) => (
              <>
                <Keys hotkey={value()} />
                <Show when={!lock()}>
                  <button
                    type="button"
                    class={CLEAR}
                    aria-label={`Clear ${props.entry.label}`}
                    onClick={() => save(null)}
                  >
                    <X class="size-3" aria-hidden="true" />
                  </button>
                </Show>
              </>
            )}
          </Show>
        </Show>
      </div>
      <Show when={clash()}>
        {(other) => (
          <div class={WARN} role="status" onKeyDown={onKeyDown}>
            <TriangleAlert class="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span class="flex-1">
              {formatForDisplay(state.draft ?? '')} is also <b class="font-medium text-chat-text-hi">{other().label}</b>
              <Show
                when={!preferences.shortcutLock(other().command)}
                fallback=", set by this project, so it cannot move. Pick other keys."
              >
                . Saving moves it here.{' '}
                <button type="button" class={WARN_ACTION} onClick={() => save(state.draft, other())}>
                  Save
                </button>
              </Show>
            </span>
          </div>
        )}
      </Show>
    </>
  )
}

type ShortcutsListProps = {entries: readonly ShortcutEntry[]; all: readonly ShortcutEntry[]; field: AnyFieldApi}

export function ShortcutsList(props: ShortcutsListProps): JSX.Element {
  return (
    <For each={props.entries}>{(entry) => <ShortcutRow entry={entry} entries={props.all} field={props.field} />}</For>
  )
}
