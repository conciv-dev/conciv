export const DEADLINE_MS = 10_000

const entries = new Set<{readonly label: string; readonly since: number}>()

export function track(label: string): () => void {
  const entry = {label, since: Date.now()}
  entries.add(entry)
  return () => {
    entries.delete(entry)
  }
}

export function pending(now: number = Date.now()): {label: string; ms: number}[] {
  return Array.from(entries, (entry) => ({label: entry.label, ms: now - entry.since}))
}

export function install(deadline: number = DEADLINE_MS): () => void {
  let started = false
  const expire = () => {
    setTimeout(
      () => exit(report(`shutdown did not finish within ${formatDuration(deadline)}`, pending())),
      deadline,
    ).unref()
  }
  const onSignal = (signal: NodeJS.Signals) => {
    if (started) {
      exit(report(`received ${signal} again during shutdown`, pending()))
      return
    }
    started = true
    expire()
  }
  const onInterrupt = (signal: NodeJS.Signals) => {
    if (started) onSignal(signal)
    else process.kill(process.pid, 'SIGTERM')
  }
  const onHangup = () => process.kill(process.pid, 'SIGTERM')
  const hangup = process.stdin.isTTY || process.stdout.isTTY
  const off = () => {
    process.off('SIGTERM', onSignal)
    process.off('SIGINT', onInterrupt)
    process.off('SIGHUP', onHangup)
  }
  process.on('SIGTERM', onSignal)
  process.on('SIGINT', onInterrupt)
  if (hangup) process.on('SIGHUP', onHangup)
  return () => {
    if (!started) off()
  }
}

function exit(text: string): void {
  process.stderr.write(text, () => process.exit(1))
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${ms / 1000}s`
}

function report(reason: string, items: {label: string; ms: number}[]): string {
  const lines = items.map((item) => `  ${(item.ms / 1000).toFixed(1)}s  ${item.label}`)
  return [
    `${reason}; exiting. Still pending:`,
    ...(lines.length > 0 ? lines : ['  nothing tracked; the stuck close is outside the conciv engine stop']),
    '',
  ].join('\n')
}
