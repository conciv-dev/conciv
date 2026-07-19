const HIDDEN_PAUSE_MS = 30_000

export type VisibilityPauser = {
  onVisibilityChange(): void
  dispose(): void
}

export function createVisibilityPauser(opts: {
  isHidden: () => boolean
  pause: () => void
  resume: () => void
}): VisibilityPauser {
  let timer: ReturnType<typeof setTimeout> | undefined
  let paused = false
  return {
    onVisibilityChange() {
      if (opts.isHidden()) {
        timer = setTimeout(() => {
          paused = true
          opts.pause()
        }, HIDDEN_PAUSE_MS)
        return
      }
      if (timer) clearTimeout(timer)
      if (!paused) return
      paused = false
      opts.resume()
    },
    dispose() {
      if (timer) clearTimeout(timer)
    },
  }
}
