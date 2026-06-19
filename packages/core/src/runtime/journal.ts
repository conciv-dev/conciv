// Append-only log of mutating page actions, living in the dev-server process so it
// outlives page reloads (unlike the live DOM edits). The agent reads it via
// `mandarax tools page changes` and maps each entry to a real source edit. ts is injected to
// keep this pure/testable.
export type ChangeEntry = {
  seq: number
  ts: number
  verb: string
  ref?: string
  selector?: string
  args: Record<string, unknown>
}

export type Journal = {
  append: (e: Omit<ChangeEntry, 'seq' | 'ts'>, ts: number) => ChangeEntry
  list: () => ChangeEntry[]
  clear: () => void
}

export function makeJournal(): Journal {
  const entries: ChangeEntry[] = []
  const state = {seq: 0}

  function append(e: Omit<ChangeEntry, 'seq' | 'ts'>, ts: number): ChangeEntry {
    state.seq += 1
    const entry: ChangeEntry = {seq: state.seq, ts, verb: e.verb, ref: e.ref, selector: e.selector, args: e.args}
    entries.push(entry)
    return entry
  }
  function list(): ChangeEntry[] {
    return entries.map((e) => ({...e}))
  }
  function clear(): void {
    entries.length = 0
  }
  return {append, list, clear}
}
