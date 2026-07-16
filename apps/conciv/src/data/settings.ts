import {z} from 'zod'
import type {TriggerPosition} from '@conciv/protocol/config-types'

export type ConcivSettings = {
  modal: {enabled: boolean; position: TriggerPosition}
  quickTerminal: {enabled: boolean; hotkeys: string[]}
  defaultOpen: boolean
}

const DEFAULT_HOTKEYS = ['Mod+`']
const DEFAULT_POSITION: TriggerPosition = 'bottom-right'

const PositionSchema = z.enum(['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function positionOf(modal: unknown): TriggerPosition {
  if (!isRecord(modal)) return DEFAULT_POSITION
  const parsed = PositionSchema.safeParse(modal.position)
  return parsed.success ? parsed.data : DEFAULT_POSITION
}

function hotkeysOf(quickTerminal: unknown): string[] {
  if (!isRecord(quickTerminal)) return DEFAULT_HOTKEYS
  const hotkey = quickTerminal.hotkey
  if (Array.isArray(hotkey)) return hotkey.map(String)
  return hotkey ? [String(hotkey)] : DEFAULT_HOTKEYS
}

function configOf(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw || '{}')
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function parseConcivSettings(raw: string): ConcivSettings {
  const cfg = configOf(raw)
  const modal = cfg.modal
  const quickTerminal = cfg.quickTerminal
  return {
    modal: {enabled: modal !== false, position: positionOf(modal)},
    quickTerminal: {enabled: quickTerminal !== false, hotkeys: hotkeysOf(quickTerminal)},
    defaultOpen: cfg.defaultOpen === true,
  }
}
