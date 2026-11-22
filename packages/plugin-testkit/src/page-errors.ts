import {beforeEach} from 'vitest'

type PageErrorSource = {watch: () => Promise<void>; read: () => Promise<string[]>}

export function providePageErrors(source: PageErrorSource): void {
  beforeEach(async ({task}) => {
    await source.watch()
    task.context.pageErrors = source.read
  })
}
