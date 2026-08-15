import {z} from 'zod'
import type {RpcTransportPreference} from '@conciv/contract'
import type {TriggerPosition} from '@conciv/protocol/config-types'

export type Launcher = 'native' | 'mascot' | false

export type ThemeSettings = {accent?: string; hue?: number}

export type ConcivSettings = {
  modal: {enabled: boolean; position: TriggerPosition}
  quickTerminal: {enabled: boolean; hotkeys: string[]}
  defaultOpen: boolean
  launcher: Launcher
  transport: RpcTransportPreference
  theme: ThemeSettings
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

function launcherOf(launcher: unknown): Launcher {
  if (launcher === false) return false
  if (launcher === 'native') return 'native'
  return 'mascot'
}

function hotkeysOf(quickTerminal: unknown): string[] {
  if (!isRecord(quickTerminal)) return DEFAULT_HOTKEYS
  const hotkey = quickTerminal.hotkey
  if (Array.isArray(hotkey)) return hotkey.map(String)
  return hotkey ? [String(hotkey)] : DEFAULT_HOTKEYS
}

const TransportSchema = z.enum(['auto', 'websocket', 'fetch']).default('auto').catch('auto')

function transportOf(transport: unknown): RpcTransportPreference {
  return TransportSchema.parse(transport)
}

const CSS_ACCENT_PATTERN =
  /^(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:rgb|rgba|hsl|hsla|oklch|oklab|color)\([0-9a-z%.,/ -]+\))$/i

const AccentSchema = z.string().regex(CSS_ACCENT_PATTERN).optional().catch(undefined)
const HueSchema = z.number().finite().min(0).max(360).optional().catch(undefined)

function themeOf(theme: unknown): ThemeSettings {
  if (!isRecord(theme)) return {accent: undefined, hue: undefined}
  return {
    accent: AccentSchema.parse(theme.accent),
    hue: HueSchema.parse(theme.hue),
  }
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
    launcher: launcherOf(cfg.launcher),
    transport: transportOf(cfg.transport),
    theme: themeOf(cfg.theme),
  }
}
