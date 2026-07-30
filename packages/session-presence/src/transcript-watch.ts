export type TranscriptStat = {mtimeMs: number; size: number}

const DEFAULT_INTERVAL_MS = 400

export function makeTranscriptWatch(deps: {
  keys(): string[]
  stat(key: string): Promise<TranscriptStat | null>
  onChange(key: string): void
  intervalMs?: number
}): {start(): () => void} {
  const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS
  return {
    start() {
      const seen = new Map<string, string>()
      const state = {running: false}
      const sweep = async (): Promise<void> => {
        for (const key of deps.keys()) {
          const stat = await deps.stat(key).catch((): null => null)
          if (!stat) continue
          const fingerprint = `${stat.mtimeMs}:${stat.size}`
          const previous = seen.get(key)
          seen.set(key, fingerprint)
          if (previous !== undefined && previous !== fingerprint) deps.onChange(key)
        }
      }
      const tick = async (): Promise<void> => {
        if (state.running) return
        state.running = true
        try {
          await sweep()
        } finally {
          state.running = false
        }
      }
      const timer = setInterval(() => void tick(), intervalMs)
      timer.unref?.()
      return () => clearInterval(timer)
    },
  }
}
