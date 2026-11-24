import {beforeEach} from 'vitest'

declare module 'vitest' {
  interface TestContext {
    pageErrors: () => Promise<string[]>
  }
}

type PageErrorSource = {watch: () => Promise<void>; read: () => Promise<string[]>}

export function providePageErrors(source: PageErrorSource): void {
  beforeEach(async ({task}) => {
    await source.watch()
    task.context.pageErrors = source.read
  })
}
