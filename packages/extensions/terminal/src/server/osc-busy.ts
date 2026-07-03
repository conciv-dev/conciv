const SEQUENCE = /\u001b\]9;4;(\d+)[^\u0007\u001b]*(?:\u0007|\u001b\\)/g
const CARRY_MAX = 64

export type OscBusyTracker = {
  feed(chunk: string): void
  busy(): boolean
  seen(): boolean
  onChange(cb: (busy: boolean) => void): void
}

export function createOscBusyTracker(): OscBusyTracker {
  const state = {carry: '', busy: false, seen: false}
  const listeners: ((busy: boolean) => void)[] = []

  const set = (busy: boolean): void => {
    state.seen = true
    if (busy === state.busy) return
    state.busy = busy
    for (const cb of listeners) cb(busy)
  }

  const feed = (chunk: string): void => {
    const text = state.carry + chunk
    const cursor = {end: 0}
    for (const match of text.matchAll(SEQUENCE)) {
      set(match[1] !== '0')
      cursor.end = match.index + match[0].length
    }
    const rest = text.slice(cursor.end)
    const tail = rest.lastIndexOf('\u001b')
    state.carry = tail >= 0 && rest.length - tail <= CARRY_MAX ? rest.slice(tail) : ''
  }

  return {
    feed,
    busy: () => state.busy,
    seen: () => state.seen,
    onChange: (cb) => listeners.push(cb),
  }
}
