import {createMemo, createUniqueId, For, Show, splitProps, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {useFieldContext} from '@ark-ui/solid/field'
import {Toggle} from '@ark-ui/solid/toggle'
import {
  createHotkeyRecorder,
  detectPlatform,
  formatForDisplay,
  LINUX_MODIFIER_LABELS,
  MAC_MODIFIER_LABELS,
  MAC_MODIFIER_SYMBOLS,
  normalizeHotkey,
  parseHotkey,
  WINDOWS_MODIFIER_LABELS,
  type CanonicalModifier,
} from '@tanstack/solid-hotkeys'
import TriangleAlert from 'lucide-solid/icons/triangle-alert'
import X from 'lucide-solid/icons/x'
import {Button} from './button.js'
import {TooltipIconButton} from './tooltip-icon-button.js'

const ROW = 'flex items-center gap-2'
const KEYS = 'flex items-center gap-1'
const KBD =
  'inline-grid place-items-center min-w-5.5 h-5.5 px-1.5 rounded-[0.25rem] bg-chat-fill font-chat-mono text-[0.6875rem] text-chat-text-hi [border:1px_solid_var(--chat-line-2)] [border-block-end-width:2px]'
const EMPTY = 'text-[0.75rem] text-chat-text-3'
const PANEL =
  'flex flex-col gap-2.5 p-3 rounded-chat-surface-md [border:1px_solid_var(--chat-accent)] bg-chat-accent-08 anim-pop'
const CAPTURE =
  'grid place-items-center min-h-10 px-2 rounded-chat-surface-sm [border:1px_dashed_var(--chat-line-2)] font-chat-mono text-[0.75rem] text-chat-text-hi focus-ring'
const MODIFIERS = 'flex items-center gap-1'
const MODIFIER =
  'inline-grid place-items-center min-w-8 h-7 px-2 rounded-chat-surface-sm bg-transparent [border:1px_solid_var(--chat-line-2)] font-chat-mono text-[0.6875rem] text-chat-text-2 cursor-pointer trans-cbb focus-ring data-[state=on]:bg-chat-accent data-[state=on]:border-chat-accent data-[state=on]:text-chat-on-accent'
const WARNING = 'flex items-start gap-1.5 text-[0.75rem] leading-snug text-chat-warn'
const ACTIONS = 'flex items-center justify-end gap-1.5'

const MODIFIER_ORDER: CanonicalModifier[] = ['Meta', 'Control', 'Alt', 'Shift']
const MODIFIER_FLAG: Record<CanonicalModifier, 'meta' | 'ctrl' | 'alt' | 'shift'> = {
  Meta: 'meta',
  Control: 'ctrl',
  Alt: 'alt',
  Shift: 'shift',
}

type HotkeyRecorderProps = {
  value: string | null
  onValueChange?: (value: string | null) => void
  conflict?: (hotkey: string) => string | undefined
  disabled?: boolean
  readOnly?: boolean
}

export function HotkeyRecorder(props: HotkeyRecorderProps): JSX.Element {
  const [local] = splitProps(props, ['value', 'onValueChange', 'conflict', 'disabled', 'readOnly'])
  const field = useFieldContext()
  const platform = detectPlatform()
  const recordTextId = createUniqueId()
  const [state, setState] = createStore<{draft: string | null}>({draft: null})
  let changeButton: HTMLButtonElement | undefined
  let capture: HTMLDivElement | undefined
  const returnFocus = () => changeButton?.focus()
  const recorder = createHotkeyRecorder({
    recordBy: 'key',
    onRecord: (hotkey) => setState('draft', hotkey),
    onCancel: returnFocus,
    onClear: () => {
      local.onValueChange?.(null)
      returnFocus()
    },
  })
  const editable = () => !(local.disabled ?? field?.().disabled) && !(local.readOnly ?? field?.().readOnly)
  const editing = () => recorder.isRecording() || state.draft !== null
  const parsedDraft = createMemo(() => (state.draft === null ? undefined : parseHotkey(state.draft)))
  const warning = () => (state.draft === null ? undefined : local.conflict?.(state.draft))
  const modifierLabel = (modifier: CanonicalModifier): string =>
    platform === 'mac'
      ? MAC_MODIFIER_SYMBOLS[modifier]
      : (platform === 'windows' ? WINDOWS_MODIFIER_LABELS : LINUX_MODIFIER_LABELS)[modifier]
  const modifierName = (modifier: CanonicalModifier): string =>
    platform === 'mac'
      ? MAC_MODIFIER_LABELS[modifier]
      : (platform === 'windows' ? WINDOWS_MODIFIER_LABELS : LINUX_MODIFIER_LABELS)[modifier]
  const start = () => {
    setState('draft', null)
    recorder.startRecording()
    capture?.focus()
  }
  const finish = (value: string | null | undefined) => {
    recorder.stopRecording()
    setState('draft', null)
    if (value !== undefined) local.onValueChange?.(value)
    returnFocus()
  }
  const toggle = (modifier: CanonicalModifier) => {
    const parsed = parsedDraft()
    if (!parsed) return
    const flag = MODIFIER_FLAG[modifier]
    const flags = {ctrl: parsed.ctrl, alt: parsed.alt, shift: parsed.shift, meta: parsed.meta, [flag]: !parsed[flag]}
    const chord = parsed.code === undefined ? {key: parsed.key, ...flags} : {code: parsed.code, ...flags}
    setState('draft', normalizeHotkey(chord))
  }
  return (
    <div class="flex flex-col gap-2 min-w-0">
      <div class={ROW}>
        <Show when={local.value} fallback={<span class={EMPTY}>Not set</span>}>
          {(value) => <Keys hotkey={value()} />}
        </Show>
        <Show when={editable()}>
          <Button
            ref={(element) => {
              changeButton = element
            }}
            variant="outline"
            size="sm"
            class="min-h-7"
            id={field?.().ids.control}
            aria-labelledby={field ? `${recordTextId} ${field().ids.label}` : undefined}
            aria-describedby={field?.().ariaDescribedby}
            aria-expanded={editing()}
            onClick={start}
          >
            <span id={recordTextId}>{local.value ? 'Change' : 'Record'}</span>
          </Button>
          <Show when={local.value}>
            <TooltipIconButton tooltip="Clear shortcut" class="size-7" onClick={() => local.onValueChange?.(null)}>
              <X class="size-3.5" aria-hidden="true" />
            </TooltipIconButton>
          </Show>
        </Show>
      </div>
      <Show when={editing()}>
        <div class={PANEL}>
          <div
            ref={(element) => {
              capture = element
            }}
            tabindex="-1"
            class={CAPTURE}
            aria-live="polite"
          >
            <Show when={state.draft} fallback={<span class="text-chat-text-2">Press a shortcut. Esc cancels.</span>}>
              {(draft) => <Keys hotkey={draft()} />}
            </Show>
          </div>
          <Show when={parsedDraft()}>
            {(parsed) => (
              <div class={MODIFIERS} role="group" aria-label="Modifiers">
                <For each={MODIFIER_ORDER}>
                  {(modifier) => (
                    <Toggle.Root
                      class={MODIFIER}
                      pressed={parsed()[MODIFIER_FLAG[modifier]]}
                      onPressedChange={() => toggle(modifier)}
                      aria-label={modifierName(modifier)}
                    >
                      {modifierLabel(modifier)}
                    </Toggle.Root>
                  )}
                </For>
              </div>
            )}
          </Show>
          <Show when={warning()}>
            {(message) => (
              <p class={WARNING} role="status">
                <TriangleAlert class="mt-px shrink-0 size-3.5" aria-hidden="true" />
                <span>{message()}</span>
              </p>
            )}
          </Show>
          <div class={ACTIONS}>
            <Button variant="ghost" size="sm" class="min-h-7" onClick={() => finish(undefined)}>
              Cancel
            </Button>
            <Button size="sm" class="min-h-7" disabled={state.draft === null} onClick={() => finish(state.draft)}>
              Save
            </Button>
          </div>
        </div>
      </Show>
    </div>
  )
}

function Keys(props: {hotkey: string}): JSX.Element {
  const parts = () => formatForDisplay(props.hotkey, {parts: true})
  return (
    <span class={KEYS}>
      <span class="sr-only">{formatForDisplay(props.hotkey, {useSymbols: false})}</span>
      <For each={parts()}>
        {(part) => (
          <kbd class={KBD} aria-hidden="true">
            {part}
          </kbd>
        )}
      </For>
    </span>
  )
}
