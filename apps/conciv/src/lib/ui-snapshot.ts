export type PaneSnapshot = {
  selectionStart: number
  selectionEnd: number
  focused: boolean
  scrollTop: number | null
}

const PANE_KEY_PREFIX = 'conciv-pane:'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parsePaneSnapshot(raw: string): PaneSnapshot | null {
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed)) return null
  if (typeof parsed.selectionStart !== 'number') return null
  if (typeof parsed.selectionEnd !== 'number') return null
  if (typeof parsed.focused !== 'boolean') return null
  if (parsed.scrollTop !== null && typeof parsed.scrollTop !== 'number') return null
  return {
    selectionStart: parsed.selectionStart,
    selectionEnd: parsed.selectionEnd,
    focused: parsed.focused,
    scrollTop: parsed.scrollTop,
  }
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
  } catch {
    return
  }
}

export function clearPaneSnapshot(sessionId: string): void {
  try {
    sessionStorage.removeItem(`${PANE_KEY_PREFIX}${sessionId}`)
  } catch {
    return
  }
}
