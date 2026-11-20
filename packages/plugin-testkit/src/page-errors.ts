import {afterEach, beforeEach} from 'vitest'

type PageErrorSource = {watch: () => Promise<void>; read: () => Promise<string[]>}

export function failOnUnreadPageErrors(source: PageErrorSource): void {
  const seen = {count: 0}
  beforeEach(async (context) => {
    await source.watch()
    seen.count = 0
    context.pageErrors = async () => {
      const errors = await source.read()
      seen.count = errors.length
      return errors
    }
  })
  afterEach(async () => {
    const unread = (await source.read()).slice(seen.count)
    if (unread.length > 0)
      throw new Error(`the page logged errors the test never read with pageErrors():\n${unread.join('\n')}`)
  })
}
