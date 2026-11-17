export type ReplayStep<Result> = {elementId: string; write: () => Result}

export type ReplayHandle<Result> = {skip: () => void; done: Promise<Result[]>}

export function replayDraft<Result>(steps: ReplayStep<Result>[]): ReplayHandle<Result> {
  const perStep = Math.max(60, Math.min(3000 / Math.max(steps.length, 1), 400))
  let skipped = false
  const written: Result[] = []
  const done = new Promise<Result[]>((resolve) => {
    const run = (index: number): void => {
      if (skipped || index >= steps.length) {
        steps.slice(index).forEach((step) => written.push(step.write()))
        resolve(written)
        return
      }
      const step = steps[index]
      if (!step) {
        resolve(written)
        return
      }
      written.push(step.write())
      setTimeout(() => run(index + 1), perStep)
    }
    run(0)
  })
  return {skip: () => (skipped = true), done}
}
