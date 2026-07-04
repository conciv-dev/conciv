export type PaneSnapshot = {
  draft: string
  selectionStart: number
  selectionEnd: number
  focused: boolean
  grabTexts: string[]
  dividers: {id: number; afterCount: number; kind: 'new' | 'compact'}[]
  scrollTop: number | null
}

export type ShellSnapshot = {layer: 'modal' | 'quick' | null; paneIds: string[]}

const PANE_KEY_PREFIX = 'conciv-pane:'
const SHELL_KEY = 'conciv-shell'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

function parseDivider(value: unknown): {id: number; afterCount: number; kind: 'new' | 'compact'} | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'number') return null
  if (typeof value.afterCount !== 'number') return null
  if (value.kind !== 'new' && value.kind !== 'compact') return null
  return {id: value.id, afterCount: value.afterCount, kind: value.kind}
}

function parseDividers(value: unknown): {id: number; afterCount: number; kind: 'new' | 'compact'}[] | null {
  if (!Array.isArray(value)) return null
  const parsed = value.map(parseDivider)
  if (parsed.some((entry) => entry === null)) return null
  return parsed.filter((entry): entry is {id: number; afterCount: number; kind: 'new' | 'compact'} => entry !== null)
}

function parsePaneSnapshot(raw: string): PaneSnapshot | null {
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed)) return null
  if (typeof parsed.draft !== 'string') return null
  if (typeof parsed.selectionStart !== 'number') return null
  if (typeof parsed.selectionEnd !== 'number') return null
  if (typeof parsed.focused !== 'boolean') return null
  if (!isStringArray(parsed.grabTexts)) return null
  const dividers = parseDividers(parsed.dividers)
  if (dividers === null) return null
  if (parsed.scrollTop !== null && typeof parsed.scrollTop !== 'number') return null
  return {
    draft: parsed.draft,
    selectionStart: parsed.selectionStart,
    selectionEnd: parsed.selectionEnd,
    focused: parsed.focused,
    grabTexts: parsed.grabTexts,
    dividers,
    scrollTop: parsed.scrollTop,
  }
}

function parseShellSnapshot(raw: string): ShellSnapshot | null {
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed)) return null
  if (parsed.layer !== null && parsed.layer !== 'modal' && parsed.layer !== 'quick') return null
  if (!isStringArray(parsed.paneIds)) return null
  return {layer: parsed.layer, paneIds: parsed.paneIds}
}

export function readPaneSnapshot(sessionId: string): PaneSnapshot | null {
  try {
    const raw = sessionStorage.getItem(`${PANE_KEY_PREFIX}${sessionId}`)
    if (raw === null) return null
    return parsePaneSnapshot(raw)
  } catch {
    return null
  }
}

export function writePaneSnapshot(sessionId: string, snapshot: PaneSnapshot): void {
  try {
    sessionStorage.setItem(`${PANE_KEY_PREFIX}${sessionId}`, JSON.stringify(snapshot))
  } catch {}
}

export function clearPaneSnapshot(sessionId: string): void {
  try {
    sessionStorage.removeItem(`${PANE_KEY_PREFIX}${sessionId}`)
  } catch {}
}

export function readShellSnapshot(): ShellSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SHELL_KEY)
    if (raw === null) return null
    return parseShellSnapshot(raw)
  } catch {
    return null
  }
}

export function writeShellSnapshot(snapshot: ShellSnapshot): void {
  try {
    sessionStorage.setItem(SHELL_KEY, JSON.stringify(snapshot))
  } catch {}
}
