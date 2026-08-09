export const TESTKIT_DEADLINE_MS = 20_000

export function deadline<Result>(label: string, budgetMs: number, work: PromiseLike<Result>): Promise<Result> {
  return new Promise<Result>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} exceeded ${budgetMs}ms`)), budgetMs)
    Promise.resolve(work).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
