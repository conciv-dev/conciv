export type DialLog = {
  note(harnessSessionId: string): void
  seen(harnessSessionId: string): boolean
}

export const DIAL_TTL_MS = 60_000

export const DIAL_MAX_ENTRIES = 512

export function makeDialLog(now: () => number = Date.now): DialLog {
  const dialed = new Map<string, number>()
  const forgetExpired = (at: number): void => {
    for (const [id, dialedAt] of dialed) {
      if (at - dialedAt >= DIAL_TTL_MS) dialed.delete(id)
    }
  }
  const evictOldest = (): void => {
    for (const id of dialed.keys()) {
      if (dialed.size <= DIAL_MAX_ENTRIES) return
      dialed.delete(id)
    }
  }
  return {
    note: (harnessSessionId) => {
      if (!harnessSessionId) return
      const at = now()
      forgetExpired(at)
      dialed.delete(harnessSessionId)
      dialed.set(harnessSessionId, at)
      evictOldest()
    },
    seen: (harnessSessionId) => {
      const dialedAt = dialed.get(harnessSessionId)
      return dialedAt !== undefined && now() - dialedAt < DIAL_TTL_MS
    },
  }
}
