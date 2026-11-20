import {beforeEach} from 'vitest'

type PageErrorSource = {watch: () => Promise<void>; read: () => Promise<string[]>}

export function providePageErrors(source: PageErrorSource): void {
  beforeEach(async (context) => {
    await source.watch()
    context.pageErrors = source.read
  })
}
