export type DialLog = {
  note(harnessSessionId: string): void
  seen(harnessSessionId: string): boolean
}

export function makeDialLog(): DialLog {
  const dialed = new Set<string>()
  return {
    note: (harnessSessionId) => {
      if (harnessSessionId) dialed.add(harnessSessionId)
    },
    seen: (harnessSessionId) => dialed.has(harnessSessionId),
  }
}
