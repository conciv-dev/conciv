export type ReplayStep = {elementId: string; x: number; y: number; write: () => void}

export type ReplayHandle = {skip: () => void; done: Promise<void>}

export function replayDraft(steps: ReplayStep[], moveCursor: (x: number, y: number) => void): ReplayHandle {
  const perStep = Math.max(60, Math.min(3000 / Math.max(steps.length, 1), 400))
  let skipped = false
  const done = new Promise<void>((resolve) => {
    const run = (index: number): void => {
      if (skipped || index >= steps.length) {
        steps.slice(index).forEach((step) => step.write())
        resolve()
        return
      }
      const step = steps[index]
      if (!step) {
        resolve()
        return
      }
      moveCursor(step.x, step.y)
      step.write()
      setTimeout(() => run(index + 1), perStep)
    }
    run(0)
  })
  return {skip: () => (skipped = true), done}
}
