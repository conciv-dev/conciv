import type {TriggerPosition} from '@aidx/protocol/config-types'

// Resolved widget settings the shell renders from. Pure-derived from the pw-widget meta blob.
export type WidgetSettings = {
  modal: {enabled: boolean; position: TriggerPosition}
  quickTerminal: {enabled: boolean; hotkeys: string[]}
}

const DEFAULT_HOTKEYS = ['Mod+`']
const DEFAULT_POSITION: TriggerPosition = 'bottom-right'

// Parse the pw-widget meta JSON into settings. Both layouts default ON; `false` disables each.
// Malformed/missing input falls back to the defaults. Pure (no DOM) so it unit-tests without jsdom.
export function parseWidgetSettings(raw: string): WidgetSettings {
  let cfg: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(raw || '{}')
    if (parsed && typeof parsed === 'object') cfg = parsed as Record<string, unknown>
  } catch {
    // malformed JSON → defaults
  }
  const m = cfg.modal
  const qt = cfg.quickTerminal
  const hotkey = qt && typeof qt === 'object' ? (qt as {hotkey?: unknown}).hotkey : undefined
  const hotkeys = Array.isArray(hotkey)
    ? hotkey.map(String)
    : hotkey
      ? [String(hotkey)]
      : DEFAULT_HOTKEYS
  const position =
    m && typeof m === 'object' && (m as {position?: TriggerPosition}).position
      ? ((m as {position: TriggerPosition}).position)
      : DEFAULT_POSITION
  return {
    modal: {enabled: m !== false, position},
    quickTerminal: {enabled: qt !== false, hotkeys},
  }
}
