const MARKER = /\u001b\[\?2026([hl])/g
const CARRY_MAX = 16
const ANSI_SEQUENCE = /\u001b\[[0-9;?]*[a-zA-Z]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b./g
const SGR = /^\u001b\[[0-9;]*m$/

export type FrameInjector = {
  feed(chunk: string): void
  inject(text: string): void
  pending(): number
}

function sanitizeInjection(text: string): string {
  return text.replaceAll(ANSI_SEQUENCE, (sequence) => (SGR.test(sequence) ? sequence : ''))
}

export function createFrameInjector(write: (chunk: string) => void): FrameInjector {
  const state = {carry: '', inFrame: false, queue: [] as string[]}

  const flush = (): void => {
    for (const text of state.queue.splice(0)) write(`\r\n${text}\r\n`)
  }

  const feed = (chunk: string): void => {
    write(chunk)
    const text = state.carry + chunk
    const cursor = {end: 0}
    for (const match of text.matchAll(MARKER)) {
      state.inFrame = match[1] === 'h'
      cursor.end = match.index + match[0].length
    }
    const rest = text.slice(cursor.end)
    const tail = rest.lastIndexOf('\u001b')
    state.carry = tail >= 0 && rest.length - tail <= CARRY_MAX ? rest.slice(tail) : ''
    if (!state.inFrame) flush()
  }

  const inject = (text: string): void => {
    state.queue.push(sanitizeInjection(text))
    if (!state.inFrame) flush()
  }

  return {feed, inject, pending: () => state.queue.length}
}
