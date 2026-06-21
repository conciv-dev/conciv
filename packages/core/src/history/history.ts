export type HistoryDescriptor = {label: string; inverse: () => Promise<void>}
export type HistoryEntry = {sessionId: string; label: string; inverse: () => Promise<void>}

function carriesHistory(value: unknown): value is {__history: HistoryDescriptor} {
  return typeof value === 'object' && value !== null && '__history' in value
}

export function takeHistory(result: unknown, sessionId: string, history: History): unknown {
  if (!carriesHistory(result)) return result
  const {__history, ...rest} = result
  history.record({sessionId, label: __history.label, inverse: __history.inverse})
  return rest
}

export type History = {
  record: (entry: HistoryEntry) => void
  undo: (sessionId: string) => Promise<{label: string} | null>
  redo: (sessionId: string) => Promise<{label: string} | null>
}

const DEFAULT_LIMIT = 200

export function createHistory(opts?: {limit?: number}): History {
  const limit = opts?.limit ?? DEFAULT_LIMIT
  const undoStacks = new Map<string, HistoryEntry[]>()
  const redoStacks = new Map<string, HistoryEntry[]>()
  const stackOf = (stacks: Map<string, HistoryEntry[]>, sessionId: string): HistoryEntry[] => {
    const existing = stacks.get(sessionId)
    if (existing) return existing
    const created: HistoryEntry[] = []
    stacks.set(sessionId, created)
    return created
  }
  const move = async (
    from: Map<string, HistoryEntry[]>,
    to: Map<string, HistoryEntry[]>,
    sessionId: string,
  ): Promise<{label: string} | null> => {
    const entry = stackOf(from, sessionId).pop()
    if (!entry) return null
    await entry.inverse()
    stackOf(to, sessionId).push(entry)
    return {label: entry.label}
  }
  return {
    record: (entry) => {
      const undo = stackOf(undoStacks, entry.sessionId)
      undo.push(entry)
      if (undo.length > limit) undo.shift()
      redoStacks.set(entry.sessionId, [])
    },
    undo: (sessionId) => move(undoStacks, redoStacks, sessionId),
    redo: (sessionId) => move(redoStacks, undoStacks, sessionId),
  }
}
