export type ConsoleEntry = {level: string; ts: number; text: string}

const CONSOLE_CAP = 200

const FORWARD_MARKER = /\[vite\] \(client\)|\[Server\]/

export function startConsoleBuffer(): {buf: ConsoleEntry[]; dispose: () => void} {
  const buf: ConsoleEntry[] = []
  const push = (level: string, args: unknown[]): string => {
    const text = args.map((a) => String(a)).join(' ')
    buf.push({level, ts: Date.now(), text})
    if (buf.length > CONSOLE_CAP) buf.shift()
    return text
  }
  const originals = (['log', 'info', 'warn', 'error'] as const).map((level) => {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      const text = push(level, args)
      if (!FORWARD_MARKER.test(text)) original(...args)
    }
    return {level, original}
  })
  const onError = (e: ErrorEvent): void => {
    push('error', [e.message])
  }
  const onRejection = (e: PromiseRejectionEvent): void => {
    push('error', [String(e.reason)])
  }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return {
    buf,
    dispose: () => {
      for (const {level, original} of originals) console[level] = original
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    },
  }
}
